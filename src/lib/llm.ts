/**
 * LLM provider abstraction.
 *
 * All provider-specific HTTP and shaping logic lives here so it can be unit
 * tested with an injected `fetch` (the vitest-4 worker pool dropped fetchMock,
 * so outbound HTTP can't be intercepted at the worker boundary — see
 * test/llm.test.ts). Route handlers in routes/analysis.ts stay thin.
 *
 * Design notes:
 * - The connection test is model-agnostic: it validates the key via the
 *   provider's model-LIST endpoint (survives model churn), then runs a 1-token
 *   probe completion against a model picked from the LIVE list to catch the
 *   "valid key, no credit" case (which a free list call cannot detect).
 * - Client-facing error messages are specific but never leak raw provider
 *   detail; the caller logs the raw error server-side.
 */

export type LLMProviderId = "anthropic" | "openai" | "google";

export interface ModelOption {
  id: string;
  name: string;
  description: string;
}

/** A tool the model may call. `parameters` is a JSON Schema object. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A normalized tool-call request emitted by the model. */
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMMessage {
  role: string; // "user" | "assistant" | "tool"
  content: string;
  toolCalls?: ToolCall[]; // assistant turn that requested tool(s)
  toolCallId?: string; // tool-result message: the call it answers
  name?: string; // tool-result message: the tool's name
}

export interface LLMRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: LLMMessage[];
  tools?: ToolSpec[];
}

export type FetchFn = typeof fetch;

export interface RawResult {
  ok: boolean;
  status: number;
  body: string;
}

export interface CompletionResult extends RawResult {
  text: string;
  toolCalls?: ToolCall[];
}

export interface TestConnectionResult {
  ok: boolean;
  status: number;
  message?: string;
  error?: string;
  models?: ModelOption[];
}

// Static fallback so the model dropdown is never empty when a live fetch fails.
export const FALLBACK_MODELS: Record<LLMProviderId, ModelOption[]> = {
  anthropic: [
    { id: "claude-opus-4-6", name: "Claude Opus 4.6", description: "Most capable model for complex analysis" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", description: "Balanced performance and cost" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", description: "Fast and cost-effective" },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o", description: "Versatile and reliable" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and cost-effective" },
  ],
  google: [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Most capable model with 1M context" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast and budget-friendly" },
    { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", description: "Most affordable option" },
  ],
};

export const DEFAULT_MODELS: Record<LLMProviderId, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  google: "gemini-2.5-flash",
};

// --- Error mapping -----------------------------------------------------------

const MSG = {
  invalidKey: "That API key looks invalid or was rejected. Double-check you pasted the full key for this provider.",
  noCredit:
    "The key is valid, but the account has no available credit or quota. Add billing/credit with the provider, then try again.",
  permission:
    "This key isn't allowed to access that model — check the provider project permissions or any region restrictions.",
  rate: "The provider is rate-limiting requests right now. Wait a moment and try again.",
  providerDown: "The provider is temporarily unavailable. Try again shortly.",
  generic: "Connection test failed. Check your API key and try again.",
};

/** Map a raw provider HTTP failure to a safe, specific client message. */
export function mapProviderError(_provider: LLMProviderId, status: number, body: string): string {
  const b = (body || "").toLowerCase();
  const looksQuota =
    /insufficient_quota|credit balance|resource_exhausted|exceeded your current quota|billing/.test(b);
  const looksBadKey = /api[_ ]?key|api_key_invalid|invalid x-api-key|invalid.*key|key.*invalid|authentication/.test(b);

  if (status === 401) return MSG.invalidKey;
  if (status === 403) return MSG.permission;
  if (looksQuota) return MSG.noCredit;
  if (status === 400 && looksBadKey) return MSG.invalidKey;
  if (status === 429) return MSG.rate;
  if (status >= 500) return MSG.providerDown;
  if (status === 404) return MSG.permission;
  return MSG.generic;
}

// --- Model list normalization ------------------------------------------------

const OPENAI_NON_CHAT = /embedding|whisper|tts|audio|moderation|dall-e|image|realtime|transcribe|search|babbage|davinci/;

function prettify(id: string): string {
  return id
    .replace(/[-_]/g, " ")
    .replace(/\bgpt\b/gi, "GPT")
    .replace(/\bgemini\b/gi, "Gemini")
    .replace(/\bclaude\b/gi, "Claude")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Turn a provider's raw model-list JSON into chat-capable {id,name,description}. */
export function normalizeModels(provider: LLMProviderId, raw: unknown): ModelOption[] {
  if (!raw || typeof raw !== "object") return [];

  if (provider === "openai") {
    const data = (raw as { data?: unknown }).data;
    if (!Array.isArray(data)) return [];
    return data
      .map((m) => (m && typeof m === "object" ? (m as { id?: string }).id : undefined))
      .filter((id): id is string => typeof id === "string")
      .filter((id) => /^(gpt-|o\d|chatgpt)/i.test(id) && !OPENAI_NON_CHAT.test(id))
      .map((id) => ({ id, name: prettify(id), description: "" }));
  }

  if (provider === "anthropic") {
    const data = (raw as { data?: unknown }).data;
    if (!Array.isArray(data)) return [];
    return data
      .filter((m): m is { id: string; display_name?: string } => !!m && typeof m === "object" && typeof (m as { id?: unknown }).id === "string")
      .map((m) => ({ id: m.id, name: m.display_name || prettify(m.id), description: "" }));
  }

  // google
  const models = (raw as { models?: unknown }).models;
  if (!Array.isArray(models)) return [];
  return models
    .filter(
      (m): m is { name: string; displayName?: string; supportedGenerationMethods?: string[] } =>
        !!m &&
        typeof m === "object" &&
        typeof (m as { name?: unknown }).name === "string" &&
        Array.isArray((m as { supportedGenerationMethods?: unknown }).supportedGenerationMethods) &&
        (m as { supportedGenerationMethods: string[] }).supportedGenerationMethods.includes("generateContent"),
    )
    .map((m) => {
      const id = m.name.replace(/^models\//, "");
      return { id, name: m.displayName || prettify(id), description: "" };
    });
}

/** Pick the cheapest available model for a throwaway probe completion. */
export function pickProbeModel(_provider: LLMProviderId, models: ModelOption[]): string | null {
  if (models.length === 0) return null;
  const cheap = models.find((m) => /mini|lite|flash|haiku|nano|small/i.test(m.id));
  return (cheap || models[0]).id;
}

// --- Provider HTTP -----------------------------------------------------------

function modelsRequest(provider: LLMProviderId, apiKey: string): { url: string; headers: Record<string, string> } {
  switch (provider) {
    case "openai":
      return { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${apiKey}` } };
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/models",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      };
    case "google":
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/models",
        headers: { "x-goog-api-key": apiKey },
      };
  }
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** Call the provider's model-LIST endpoint (model-agnostic key validation). */
export async function listModels(provider: LLMProviderId, apiKey: string, f: FetchFn = fetch): Promise<RawResult> {
  const { url, headers } = modelsRequest(provider, apiKey);
  const resp = await f(url, { method: "GET", headers });
  return { ok: resp.ok, status: resp.status, body: await resp.text() };
}

/** Live model list with static fallback so the dropdown is never empty. */
export async function fetchModels(provider: LLMProviderId, apiKey: string, f: FetchFn = fetch): Promise<ModelOption[]> {
  try {
    const list = await listModels(provider, apiKey, f);
    if (!list.ok) return FALLBACK_MODELS[provider];
    const models = normalizeModels(provider, safeJson(list.body));
    return models.length ? models : FALLBACK_MODELS[provider];
  } catch {
    return FALLBACK_MODELS[provider];
  }
}

/** One chat completion. Returns the raw result (never throws on HTTP errors). */
export async function chatCompletion(
  provider: LLMProviderId,
  apiKey: string,
  req: LLMRequest,
  f: FetchFn = fetch,
): Promise<CompletionResult> {
  let url: string;
  let headers: Record<string, string>;
  let payload: unknown;

  if (provider === "openai") {
    const messages: Array<Record<string, unknown>> = [];
    if (req.system) messages.push({ role: "system", content: req.system });
    for (const m of req.messages) {
      if (m.role === "tool") {
        messages.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
      } else if (m.role === "assistant" && m.toolCalls?.length) {
        messages.push({
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }
    url = "https://api.openai.com/v1/chat/completions";
    headers = { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` };
    payload = {
      model: req.model,
      max_completion_tokens: req.max_tokens,
      messages,
      ...(req.tools?.length
        ? { tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) }
        : {}),
    };
  } else if (provider === "anthropic") {
    const messages = req.messages.map((m) => {
      if (m.role === "tool") {
        return { role: "user", content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }] };
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        return {
          role: "assistant",
          content: [
            ...(m.content ? [{ type: "text", text: m.content }] : []),
            ...m.toolCalls.map((tc) => ({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments })),
          ],
        };
      }
      return { role: m.role, content: m.content };
    });
    url = "https://api.anthropic.com/v1/messages";
    headers = { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    payload = {
      model: req.model,
      max_tokens: req.max_tokens,
      ...(req.system ? { system: req.system } : {}),
      messages,
      ...(req.tools?.length
        ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) }
        : {}),
    };
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent`;
    headers = { "Content-Type": "application/json", "x-goog-api-key": apiKey };
    payload = {
      contents: req.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: req.max_tokens },
      ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    };
  }

  const resp = await f(url, { method: "POST", headers, body: JSON.stringify(payload) });
  const body = await resp.text();
  let text = "";
  let toolCalls: ToolCall[] | undefined;
  if (resp.ok) {
    const data = safeJson(body);
    if (provider === "openai") {
      const msg = (data as { choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> } }> })
        ?.choices?.[0]?.message;
      text = msg?.content || "";
      const tcs = msg?.tool_calls;
      if (Array.isArray(tcs) && tcs.length) {
        toolCalls = tcs.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: (safeJson(tc.function.arguments) as Record<string, unknown>) || {},
        }));
      }
    } else if (provider === "anthropic") {
      const content = (data as {
        content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
      })?.content;
      if (Array.isArray(content)) {
        text = content.filter((b) => b.type === "text").map((b) => b.text || "").join("");
        const tus = content.filter((b) => b.type === "tool_use");
        if (tus.length) {
          toolCalls = tus.map((b) => ({ id: b.id || "", name: b.name || "", arguments: b.input || {} }));
        }
      }
    } else {
      text =
        (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content
          ?.parts?.[0]?.text || "";
    }
  }
  return { ok: resp.ok, status: resp.status, body, text, ...(toolCalls ? { toolCalls } : {}) };
}

/** Chat completion for analysis generation. Throws on HTTP error (raw detail logged by caller). */
export async function callLLM(
  provider: LLMProviderId,
  apiKey: string,
  req: LLMRequest,
  f: FetchFn = fetch,
): Promise<string> {
  const r = await chatCompletion(provider, apiKey, req, f);
  if (!r.ok) throw new Error(`${provider} API error (${r.status}): ${r.body}`);
  return r.text;
}

/**
 * Model-agnostic connection test:
 *   1. list models   → validates key without depending on any specific model
 *   2. probe 1 token → catches "valid key, no credit"
 */
export async function testConnection(
  provider: LLMProviderId,
  apiKey: string,
  f: FetchFn = fetch,
): Promise<TestConnectionResult> {
  const list = await listModels(provider, apiKey, f);
  if (!list.ok) {
    return { ok: false, status: list.status, error: mapProviderError(provider, list.status, list.body) };
  }

  const models = normalizeModels(provider, safeJson(list.body));
  const probe = pickProbeModel(provider, models);

  // Key is valid. If we somehow can't pick a probe model, accept the key
  // (the list call already proved it works) and surface whatever models we have.
  if (!probe) {
    return { ok: true, status: 200, message: "Connection successful", models };
  }

  const comp = await chatCompletion(provider, apiKey, {
    model: probe,
    max_tokens: 1,
    messages: [{ role: "user", content: "hi" }],
  }, f);

  if (!comp.ok) {
    return { ok: false, status: comp.status, error: mapProviderError(provider, comp.status, comp.body) };
  }

  return { ok: true, status: 200, message: "Connection successful", models: models.length ? models : FALLBACK_MODELS[provider] };
}
