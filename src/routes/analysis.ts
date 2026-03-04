import { Hono } from "hono";
import { getAuthUser, type HonoEnv, type UserFleetEntry, type Vehicle, type FleetAnalysis } from "../lib/types";
import { decrypt } from "../lib/crypto";
import { logEvent } from "../lib/logger";
import { ANALYSIS_PROMPT } from "../lib/analysis-prompt";

/**
 * /api/analysis/* — Fleet analysis, LLM analysis
 */
export function analysisRoutes() {
  const routes = new Hono<HonoEnv>();

  // GET /api/analysis — fleet gap analysis, redundancies, insurance summary
  routes.get("/analysis", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const fleetResult = await db
      .prepare(
        `SELECT uf.id, uf.vehicle_id, uf.warbond, uf.is_loaner,
          uf.pledge_id, uf.pledge_name, uf.pledge_cost, uf.pledge_date, uf.custom_name,
          v.name as vehicle_name, v.slug as vehicle_slug, v.focus, v.size_label, v.cargo,
          v.crew_min, v.crew_max, v.pledge_price, v.speed_scm, v.classification,
          m.name as manufacturer_name, m.code as manufacturer_code,
          it.label as insurance_label, it.duration_months, it.is_lifetime,
          ps.key as production_status
        FROM user_fleet uf
        JOIN vehicles v ON v.id = uf.vehicle_id
        LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
        LEFT JOIN insurance_types it ON it.id = uf.insurance_type_id
        LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
        WHERE uf.user_id = ?
        ORDER BY v.name`,
      )
      .bind(userID)
      .all();

    const fleet = fleetResult.results as unknown as UserFleetEntry[];

    const allVehiclesResult = await db
      .prepare(
        `SELECT v.id, v.slug, v.name, v.focus, v.size_label, v.classification,
          ps.key as production_status
        FROM vehicles v
        LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
        ORDER BY v.name`,
      )
      .all();

    const allVehicles = allVehiclesResult.results as unknown as Vehicle[];

    const analysis = analyzeFleet(fleet, allVehicles);
    return c.json(analysis);
  });

  // POST /api/llm/test-connection
  routes.post("/llm/test-connection", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const body = await c.req.json<{ provider?: string; api_key?: string }>().catch((): { provider?: string; api_key?: string } => ({}));

    const provider = body.provider?.trim() || "anthropic";
    if (!PROVIDER_MODELS[provider]) {
      return c.json({ error: `Unsupported provider: ${provider}` }, 400);
    }

    // Use provided API key (first-time setup) or fall back to stored key
    let apiKey = body.api_key?.trim() || null;
    if (!apiKey) {
      apiKey = await getDecryptedAPIKey(db, userID, c.env.ENCRYPTION_KEY);
    }
    if (!apiKey) {
      return c.json({ error: "No API key provided or configured" }, 400);
    }

    const testModel = TEST_MODELS[provider];
    try {
      // Gemini 2.5+ models use "thinking" tokens that count against max_tokens,
      // so we need enough headroom for both thinking and a response.
      await callLLM(provider, apiKey, {
        model: testModel,
        max_tokens: 100,
        messages: [{ role: "user", content: "test" }],
      });
      logEvent("llm_test", { success: true, provider });
      return c.json({ success: true, message: "Connection successful", models: PROVIDER_MODELS[provider] });
    } catch (err) {
      return c.json(
        { error: `Connection failed: ${err instanceof Error ? err.message : String(err)}` },
        500,
      );
    }
  });

  // GET /api/llm/models — list available models for a provider
  routes.get("/llm/models", async (c) => {
    const provider = c.req.query("provider") || "anthropic";
    const models = PROVIDER_MODELS[provider];
    if (!models) {
      return c.json({ error: `Unsupported provider: ${provider}` }, 400);
    }
    return c.json({ models });
  });

  // POST /api/llm/generate-analysis
  routes.post("/llm/generate-analysis", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const config = await db
      .prepare(
        "SELECT provider, encrypted_api_key, model FROM user_llm_configs WHERE user_id = ? LIMIT 1",
      )
      .bind(userID)
      .first<{ provider: string; encrypted_api_key: string; model: string }>();

    if (!config?.encrypted_api_key) {
      return c.json({ error: "No API key configured" }, 400);
    }

    const apiKey = await decryptAPIKey(
      config.encrypted_api_key,
      c.env.ENCRYPTION_KEY,
    );
    if (!apiKey) {
      return c.json({ error: "Failed to decrypt API key" }, 500);
    }

    // Allow model override from request body
    const body = await c.req
      .json<{ model?: string }>()
      .catch(() => ({ model: undefined }));
    const provider = config.provider || "anthropic";
    const defaultModel = c.env.LLM_DEFAULT_MODEL || DEFAULT_MODELS[provider] || "claude-sonnet-4-6";
    const model = body.model || config.model || defaultModel;

    // Get fleet data
    const fleetResult = await db
      .prepare(
        `SELECT uf.id, uf.vehicle_id, uf.warbond, uf.is_loaner,
          uf.pledge_id, uf.pledge_name, uf.pledge_cost, uf.pledge_date, uf.custom_name,
          v.name as vehicle_name, v.slug as vehicle_slug, v.focus, v.size_label, v.cargo,
          v.crew_min, v.crew_max, v.pledge_price, v.speed_scm, v.classification,
          m.name as manufacturer_name, m.code as manufacturer_code,
          it.label as insurance_label, it.duration_months, it.is_lifetime,
          ps.key as production_status
        FROM user_fleet uf
        JOIN vehicles v ON v.id = uf.vehicle_id
        LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
        LEFT JOIN insurance_types it ON it.id = uf.insurance_type_id
        LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
        WHERE uf.user_id = ?
        ORDER BY v.name`,
      )
      .bind(userID)
      .all();

    const fleet = fleetResult.results;
    if (fleet.length === 0) {
      return c.json({ error: "No fleet data to analyze" }, 400);
    }

    try {
      // Strip personal data before sending to LLM — ship characteristics + pricing for analysis
      // pledge_price is needed for budget recommendations; custom_name is personal and excluded
      const sanitizedFleet = fleet.map((entry) => {
        const e = entry as Record<string, unknown>;
        return {
          vehicle_name: e.vehicle_name,
          vehicle_slug: e.vehicle_slug,
          focus: e.focus,
          size_label: e.size_label,
          classification: e.classification,
          cargo: e.cargo,
          crew_min: e.crew_min,
          crew_max: e.crew_max,
          speed_scm: e.speed_scm,
          pledge_price: e.pledge_price,
          manufacturer_name: e.manufacturer_name,
          insurance_label: e.insurance_label,
          is_lifetime: e.is_lifetime,
          production_status: e.production_status,
          warbond: e.warbond,
        };
      });
      const userPrompt = `Fleet data:\n\n${JSON.stringify(sanitizedFleet)}\n\nProvide a comprehensive fleet analysis.`;

      const analysisText = await callLLM(provider, apiKey, {
        model,
        max_tokens: 4000,
        system: ANALYSIS_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });

      if (!analysisText) {
        return c.json({ error: "No response from LLM" }, 500);
      }

      // Save analysis to DB
      await db
        .prepare(
          `INSERT INTO ai_analyses (user_id, created_at, provider, model, vehicle_count, analysis)
          VALUES (?, datetime('now'), ?, ?, ?, ?)`,
        )
        .bind(
          userID,
          provider,
          model,
          fleet.length,
          analysisText,
        )
        .run();

      logEvent("llm_analysis", {
        model,
        vehicle_count: fleet.length,
        provider,
      });

      return c.json({
        analysis: analysisText,
        model,
        vehicle_count: fleet.length,
      });
    } catch (err) {
      return c.json(
        {
          error: `Analysis failed: ${err instanceof Error ? err.message : String(err)}`,
        },
        500,
      );
    }
  });

  // GET /api/llm/latest-analysis
  routes.get("/llm/latest-analysis", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const row = await db
      .prepare(
        "SELECT id, user_id, created_at, provider, model, vehicle_count, analysis FROM ai_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
      )
      .bind(userID)
      .first();

    if (!row) {
      return c.json({ analysis: null });
    }
    return c.json(row);
  });

  // GET /api/llm/analysis-history
  routes.get("/llm/analysis-history", async (c) => {
    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    const result = await db
      .prepare(
        "SELECT id, user_id, created_at, provider, model, vehicle_count, analysis FROM ai_analyses WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
      )
      .bind(userID)
      .all();

    return c.json({ history: result.results });
  });

  // DELETE /api/llm/analysis/:id
  routes.delete("/llm/analysis/:id", async (c) => {
    const id = parseInt(c.req.param("id"), 10);
    if (isNaN(id)) {
      return c.json({ error: "Invalid analysis ID" }, 400);
    }

    const db = c.env.DB;
    const userID = getAuthUser(c).id;

    await db.prepare("DELETE FROM ai_analyses WHERE id = ? AND user_id = ?").bind(id, userID).run();
    return c.json({ success: true });
  });

  return routes;
}

// --- LLM Helpers ---

const PROVIDER_MODELS: Record<string, Array<{ id: string; name: string; description: string }>> = {
  anthropic: [
    { id: "claude-opus-4-6", name: "Claude Opus 4.6", description: "Most capable model for complex analysis" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", description: "Balanced performance and cost" },
    { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5", description: "Fast and cost-effective" },
  ],
  openai: [
    { id: "gpt-5.2", name: "GPT-5.2", description: "Most capable model for complex analysis" },
    { id: "gpt-4o", name: "GPT-4o", description: "Versatile and reliable" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", description: "Fast and cost-effective" },
  ],
  google: [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", description: "Most capable model with 1M context" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", description: "Fast and budget-friendly" },
    { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", description: "Most affordable option" },
  ],
};

const DEFAULT_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-4o",
  google: "gemini-2.5-flash",
};

const TEST_MODELS: Record<string, string> = {
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  google: "gemini-2.5-flash-lite",
};

async function decryptAPIKey(
  encryptedKey: string,
  encryptionKey?: string,
): Promise<string | null> {
  if (!encryptionKey) {
    // No encryption key — key was stored in plaintext (dev mode only; production blocks this at write time)
    console.warn("[analysis] ENCRYPTION_KEY not set — reading API key as plaintext (dev mode)");
    return encryptedKey;
  }
  try {
    return await decrypt(encryptedKey, encryptionKey);
  } catch {
    return null;
  }
}

async function getDecryptedAPIKey(
  db: D1Database,
  userID: string,
  encryptionKey?: string,
): Promise<string | null> {
  const config = await db
    .prepare(
      "SELECT encrypted_api_key FROM user_llm_configs WHERE user_id = ? LIMIT 1",
    )
    .bind(userID)
    .first<{ encrypted_api_key: string }>();

  if (!config?.encrypted_api_key) return null;
  return decryptAPIKey(config.encrypted_api_key, encryptionKey);
}

interface LLMRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: Array<{ role: string; content: string }>;
}

async function callLLM(
  provider: string,
  apiKey: string,
  request: LLMRequest,
): Promise<string> {
  switch (provider) {
    case "anthropic":
      return callAnthropic(apiKey, request);
    case "openai":
      return callOpenAI(apiKey, request);
    case "google":
      return callGoogle(apiKey, request);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

async function callAnthropic(apiKey: string, body: LLMRequest): Promise<string> {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: body.model,
      max_tokens: body.max_tokens,
      ...(body.system ? { system: body.system } : {}),
      messages: body.messages,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic API error (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as { content: Array<{ type: string; text: string }> };
  return data.content?.[0]?.type === "text" ? data.content[0].text : "";
}

async function callOpenAI(apiKey: string, body: LLMRequest): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (body.system) {
    messages.push({ role: "system", content: body.system });
  }
  messages.push(...body.messages);

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: body.model,
      max_completion_tokens: body.max_tokens,
      messages,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI API error (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as { choices: Array<{ message: { content: string } }> };
  return data.choices?.[0]?.message?.content || "";
}

async function callGoogle(apiKey: string, body: LLMRequest): Promise<string> {
  const contents = body.messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const requestBody: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: body.max_tokens },
  };

  if (body.system) {
    requestBody.systemInstruction = { parts: [{ text: body.system }] };
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${body.model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google API error (${resp.status}): ${text}`);
  }

  const data = (await resp.json()) as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

/**
 * Fleet analysis — ported from internal/analysis/analysis.go
 */
// Map granular vehicle focus values to broad role categories for charts and redundancy.
// Every distinct vehicles.focus value must appear here; unmapped values fall back to the raw focus.
const ROLE_GROUP_MAP: Record<string, string> = {
  // Combat
  "Light Fighter": "Combat",
  "Medium Fighter": "Combat",
  "Heavy Fighter": "Combat",
  "Snub Fighter": "Combat",
  "Bomber": "Combat",
  "Heavy Bomber": "Combat",
  "Stealth Bomber": "Combat",
  "Stealth Fighter": "Combat",
  "Stealth": "Combat",
  "Gunship": "Combat",
  "Heavy Gunship": "Combat",
  "Heavy Gun Ship": "Combat",
  "Assault": "Combat",
  "Patrol": "Combat",
  "Military": "Combat",
  "Anti-Air": "Combat",
  "Anti-aircraft": "Combat",
  // Cargo & Transport
  "Cargo": "Cargo",
  "Freight": "Cargo",
  "Light Freight": "Cargo",
  "Medium Freight": "Cargo",
  "Medium Freighter": "Cargo",
  "Heavy Freight": "Cargo",
  "Cargo Loader": "Cargo",
  "Transport": "Transport",
  "Military Transport": "Transport",
  "Luxury Transport": "Transport",
  "Passenger": "Transport",
  "Dropship": "Transport",
  // Exploration & Science
  "Exploration": "Exploration",
  "Expedition": "Exploration",
  "Pathfinder": "Exploration",
  "Recon": "Exploration",
  "Reconnaissance": "Exploration",
  "Light Science": "Exploration",
  "Medium Data": "Exploration",
  // Industrial
  "Mining": "Mining",
  "Salvage": "Salvage",
  "Light Salvage": "Salvage",
  "Medium Salvage": "Salvage",
  "Heavy Salvage": "Salvage",
  "Recovery": "Salvage",
  "Industrial": "Industrial",
  "Repair": "Support",
  "Heavy Refuelling": "Refueling",
  // Medical
  "Medical": "Medical",
  "Ambulance": "Medical",
  // Support
  "Combat Support": "Support",
  "Interdiction": "Support",
  "Interdictor": "Support",
  "Reporting": "Support",
  // Capital
  "Corvette": "Capital",
  "Destroyer": "Capital",
  "Frigate": "Capital",
  // Lifestyle
  "Racing": "Racing",
  "Touring": "Touring",
  "Luxury": "Touring",
  "Luxury Touring": "Touring",
  // Multi-Role
  "Generalist": "Multi-Role",
  "Starter": "Multi-Role",
};

function getRoleGroup(focus: string): string {
  return ROLE_GROUP_MAP[focus] ?? focus;
}

export function analyzeFleet(fleet: UserFleetEntry[], _allVehicles: Vehicle[]): FleetAnalysis {
  // Overview stats
  let flightReady = 0;
  let inConcept = 0;
  let totalCargo = 0;
  let totalPledgeValue = 0;
  let minCrew = 0;
  let maxCrew = 0;
  let ltiCount = 0;
  let nonLtiCount = 0;

  const sizeDistribution: Record<string, number> = {};
  const roleCategories: Record<string, string[]> = {};
  const focusCategories: Record<string, string[]> = {};
  const ltiShips: Array<{
    ship_name: string;
    custom_name?: string;
    pledge_cost?: string;
    pledge_name?: string;
    pledge_date?: string;
    insurance_label?: string;
    duration_months?: number;
    is_lifetime: boolean;
    warbond: boolean;
  }> = [];
  const nonLtiShips: typeof ltiShips = [];
  const unknownShips: typeof ltiShips = [];

  for (const entry of fleet) {
    // Production status
    if (entry.production_status === "flight_ready") flightReady++;
    if (entry.production_status === "in_concept") inConcept++;

    // Cargo
    totalCargo += entry.cargo ?? 0;
    totalPledgeValue += entry.pledge_price ?? 0;

    // Crew
    minCrew += entry.crew_min ?? 0;
    maxCrew += entry.crew_max ?? 0;

    // Size distribution
    const size = entry.size_label || "Unknown";
    sizeDistribution[size] = (sizeDistribution[size] ?? 0) + 1;

    // Role categories — group granular focus values into broad roles
    const roleGroup = getRoleGroup(entry.focus || "Unknown");
    if (!roleCategories[roleGroup]) {
      roleCategories[roleGroup] = [];
    }
    roleCategories[roleGroup].push(entry.vehicle_name ?? "Unknown");

    // Fine-grained focus tracking for redundancy (e.g. "Light Fighter" not just "Combat")
    const focus = entry.focus || "Unknown";
    if (!focusCategories[focus]) {
      focusCategories[focus] = [];
    }
    focusCategories[focus].push(entry.vehicle_name ?? "Unknown");

    // Insurance
    const insEntry = {
      ship_name: entry.vehicle_name ?? "Unknown",
      custom_name: entry.custom_name,
      pledge_cost: entry.pledge_cost,
      pledge_name: entry.pledge_name,
      pledge_date: entry.pledge_date,
      insurance_label: entry.insurance_label,
      duration_months: entry.duration_months,
      is_lifetime: entry.is_lifetime ?? false,
      warbond: entry.warbond,
    };

    if (entry.is_lifetime) {
      ltiCount++;
      ltiShips.push(insEntry);
    } else if (entry.insurance_label) {
      nonLtiCount++;
      nonLtiShips.push(insEntry);
    } else {
      unknownShips.push(insEntry);
    }
  }

  // Gap analysis — check for missing key roles.
  // Each role maps to multiple search terms that satisfy it, matching against
  // the full range of focus values in the vehicles table (e.g. "Medium Freighter"
  // satisfies Cargo, "Ambulance" satisfies Medical, "Pathfinder" satisfies Exploration).
  // Gap roles match against the broad group names produced by getRoleGroup().
  // If a role group name isn't in roleCategories, it's a gap.
  const GAP_ROLES: {
    role: string;
    priority: string;
    description: string;
    suggestions: string[];
  }[] = [
    {
      role: "Mining",
      priority: "high",
      description: "No dedicated mining ship",
      suggestions: ["MISC Prospector", "ARGO MOLE", "Greycat ROC"],
    },
    {
      role: "Salvage",
      priority: "high",
      description: "No salvage capability",
      suggestions: ["Drake Vulture", "Aegis Reclaimer"],
    },
    {
      role: "Medical",
      priority: "medium",
      description: "No medical ship",
      suggestions: ["RSI Apollo Medivac", "Crusader C8R Pisces Rescue", "Drake Cutlass Red"],
    },
    {
      role: "Refueling",
      priority: "medium",
      description: "No refueling capability",
      suggestions: ["MISC Starfarer Gemini", "MISC Starfarer"],
    },
    {
      role: "Exploration",
      priority: "medium",
      description: "No dedicated exploration ship",
      suggestions: ["RSI Constellation Aquila", "Anvil Carrack", "MISC Freelancer DUR"],
    },
    {
      role: "Cargo",
      priority: "low",
      description: "No dedicated cargo hauler",
      suggestions: ["Drake Caterpillar", "MISC Hull C", "RSI Constellation Taurus"],
    },
  ];

  // Gap analysis compares against the broad role group names (keys of roleCategories),
  // which already match GAP_ROLES.role names thanks to getRoleGroup().
  const ownedRoleGroups = new Set(Object.keys(roleCategories));

  const gaps = GAP_ROLES.filter((gr) => {
    return !ownedRoleGroups.has(gr.role);
  }).map((gr) => ({
    role: gr.role,
    priority: gr.priority,
    description: gr.description,
    suggestions: gr.suggestions,
  }));

  // Redundancies — detect ships with the same granular focus (e.g. "Light Fighter"),
  // not the broad role group (e.g. "Combat"). A Gladius and Perseus are both "Combat"
  // but "Light Fighter" vs "Heavy Gunship" is fleet diversity, not redundancy.
  const redundancies = Object.entries(focusCategories)
    .filter(([, ships]) => ships.length >= 3)
    .map(([focus, ships]) => ({
      role: focus,
      ships,
      notes: `${ships.length} ships in this role`,
    }));

  return {
    overview: {
      total_vehicles: fleet.length,
      flight_ready: flightReady,
      in_concept: inConcept,
      total_cargo: totalCargo,
      total_pledge_value: totalPledgeValue,
      min_crew: minCrew,
      max_crew: maxCrew,
      lti_count: ltiCount,
      non_lti_count: nonLtiCount,
    },
    size_distribution: sizeDistribution,
    role_categories: roleCategories,
    gap_analysis: gaps,
    redundancies,
    insurance_summary: {
      lti_ships: ltiShips,
      non_lti_ships: nonLtiShips,
      unknown_ships: unknownShips,
    },
  };
}
