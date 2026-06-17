import { describe, it, expect } from "vitest";
import {
  mapProviderError,
  normalizeModels,
  pickProbeModel,
  fetchModels,
  testConnection,
  FALLBACK_MODELS,
  type FetchFn,
} from "../src/lib/llm";

/**
 * LLM provider abstraction — pure logic + dependency-injected fetch.
 *
 * The vitest-4 worker pool dropped `fetchMock`, so outbound HTTP can't be
 * intercepted at the worker boundary. Following the repo's established
 * pattern (runLocalizationIngest(deps)), all provider logic lives in pure
 * functions and fetch is injected so it can be tested directly.
 */

// Build a Response-like object for an injected fake fetch.
function res(status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() {
      return text;
    },
    async json() {
      return typeof body === "string" ? JSON.parse(body) : body;
    },
  } as unknown as Response;
}

// Route an injected fetch by URL so testConnection's two-step flow
// (list models, then a probe completion) can be driven independently.
function router(routes: {
  models?: Response;
  completion?: Response;
}): FetchFn {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const isCompletion =
      url.includes("chat/completions") ||
      url.includes("generateContent") ||
      url.includes("/v1/messages");
    if (isCompletion) {
      if (!routes.completion) throw new Error(`unexpected completion call: ${url}`);
      return routes.completion;
    }
    if (!routes.models) throw new Error(`unexpected models call: ${url}`);
    return routes.models;
  }) as FetchFn;
}

describe("mapProviderError — turns raw provider failures into safe, specific messages", () => {
  it("openai 401 → invalid key", () => {
    const msg = mapProviderError("openai", 401, JSON.stringify({ error: { code: "invalid_api_key" } }));
    expect(msg).toMatch(/invalid/i);
    expect(msg).toMatch(/key/i);
  });

  it("openai 429 insufficient_quota → no credit (NOT a rate-limit message)", () => {
    const msg = mapProviderError(
      "openai",
      429,
      JSON.stringify({ error: { type: "insufficient_quota", code: "insufficient_quota" } }),
    );
    expect(msg).toMatch(/credit|quota|billing/i);
    expect(msg).not.toMatch(/rate.?limit/i);
  });

  it("openai 429 rate_limit_exceeded → rate limited", () => {
    const msg = mapProviderError("openai", 429, JSON.stringify({ error: { code: "rate_limit_exceeded" } }));
    expect(msg).toMatch(/rate|too many|slow|try again/i);
  });

  it("anthropic 400 'credit balance is too low' → no credit", () => {
    const msg = mapProviderError(
      "anthropic",
      400,
      JSON.stringify({ error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." } }),
    );
    expect(msg).toMatch(/credit|quota|billing/i);
  });

  it("google 400 API_KEY_INVALID → invalid key", () => {
    const msg = mapProviderError(
      "google",
      400,
      JSON.stringify({ error: { status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } }),
    );
    expect(msg).toMatch(/invalid/i);
    expect(msg).toMatch(/key/i);
  });

  it("google 429 RESOURCE_EXHAUSTED → quota", () => {
    const msg = mapProviderError("google", 429, JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }));
    expect(msg).toMatch(/credit|quota|billing/i);
  });

  it("403 → not permitted / access", () => {
    const msg = mapProviderError("openai", 403, "{}");
    expect(msg).toMatch(/permission|allowed|access|region/i);
  });

  it("5xx → provider issue, try again", () => {
    const msg = mapProviderError("openai", 503, "{}");
    expect(msg).toMatch(/unavailable|issue|try again|temporarily/i);
  });
});

describe("normalizeModels — live provider model lists → chat-capable options", () => {
  it("openai: keeps chat models, drops embeddings/whisper/tts/dall-e/moderation", () => {
    const models = normalizeModels("openai", {
      data: [
        { id: "gpt-4o" },
        { id: "gpt-4o-mini" },
        { id: "o3" },
        { id: "text-embedding-3-small" },
        { id: "whisper-1" },
        { id: "tts-1" },
        { id: "dall-e-3" },
        { id: "omni-moderation-latest" },
      ],
    });
    const ids = models.map((m) => m.id);
    expect(ids).toContain("gpt-4o");
    expect(ids).toContain("gpt-4o-mini");
    expect(ids).toContain("o3");
    expect(ids).not.toContain("text-embedding-3-small");
    expect(ids).not.toContain("whisper-1");
    expect(ids).not.toContain("tts-1");
    expect(ids).not.toContain("dall-e-3");
    expect(ids).not.toContain("omni-moderation-latest");
  });

  it("anthropic: uses display_name as the label", () => {
    const models = normalizeModels("anthropic", {
      data: [{ id: "claude-opus-4-6", display_name: "Claude Opus 4.6" }],
    });
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe("claude-opus-4-6");
    expect(models[0].name).toBe("Claude Opus 4.6");
  });

  it("google: keeps only generateContent models, strips 'models/' prefix", () => {
    const models = normalizeModels("google", {
      models: [
        { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedGenerationMethods: ["generateContent"] },
        { name: "models/embedding-001", supportedGenerationMethods: ["embedContent"] },
      ],
    });
    const ids = models.map((m) => m.id);
    expect(ids).toContain("gemini-2.5-pro");
    expect(ids).not.toContain("embedding-001");
  });

  it("garbage / empty input → empty array (never throws)", () => {
    expect(normalizeModels("openai", null)).toEqual([]);
    expect(normalizeModels("openai", {})).toEqual([]);
    expect(normalizeModels("google", { models: "nope" })).toEqual([]);
  });
});

describe("pickProbeModel — chooses a cheap model for the connection probe", () => {
  it("openai: prefers a 'mini' model when present", () => {
    const models = normalizeModels("openai", { data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] });
    expect(pickProbeModel("openai", models)).toBe("gpt-4o-mini");
  });

  it("returns null for an empty list", () => {
    expect(pickProbeModel("openai", [])).toBeNull();
  });
});

describe("fetchModels — live list with static fallback", () => {
  it("returns normalized models on success", async () => {
    const f = router({ models: res(200, { data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }) });
    const models = await fetchModels("openai", "sk-test", f);
    expect(models.map((m) => m.id)).toEqual(["gpt-4o", "gpt-4o-mini"]);
  });

  it("falls back to the static list when the live call fails (dropdown never empty)", async () => {
    const f = router({ models: res(500, "{}") });
    const models = await fetchModels("openai", "sk-test", f);
    expect(models.length).toBeGreaterThan(0);
    expect(models).toEqual(FALLBACK_MODELS.openai);
  });
});

describe("testConnection — model-agnostic key check + tiny probe to catch no-credit", () => {
  it("invalid key (models list 401) → ok:false, invalid-key error, no completion attempted", async () => {
    const f = router({ models: res(401, { error: { code: "invalid_api_key" } }) });
    const result = await testConnection("openai", "sk-bad", f);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.error).toMatch(/invalid/i);
  });

  it("valid key but no credit (probe completion 429 insufficient_quota) → ok:false, credit error", async () => {
    const f = router({
      models: res(200, { data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
      completion: res(429, { error: { code: "insufficient_quota" } }),
    });
    const result = await testConnection("openai", "sk-valid-nocredit", f);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/credit|quota|billing/i);
  });

  it("valid key with credit → ok:true and returns the live model list", async () => {
    const f = router({
      models: res(200, { data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }),
      completion: res(200, { choices: [{ message: { content: "hi" } }] }),
    });
    const result = await testConnection("openai", "sk-good", f);
    expect(result.ok).toBe(true);
    expect(result.models?.length).toBeGreaterThan(0);
  });
});
