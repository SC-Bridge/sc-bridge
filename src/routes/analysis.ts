import { Hono } from "hono";
import { getAuthUser, type HonoEnv, type UserFleetEntry, type Vehicle, type FleetAnalysis } from "../lib/types";
import { decrypt } from "../lib/crypto";
import { logEvent } from "../lib/logger";

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

// --- Embedded Analysis Prompt (from prompts/analysis.md) ---
// Workers have no filesystem — prompt is embedded at build time.

const ANALYSIS_PROMPT = `You are an expert Star Citizen fleet analyst. Generate a **structured markdown analysis** following this exact template.

## Output Template

# Fleet Analysis

## Executive Summary
[2-3 sentences: fleet size, primary strengths, critical gap, top recommendation]

---

## 1. Fleet Composition

**Overview**: [1 sentence about overall balance]

| Category | Count | Notable Ships |
|----------|-------|---------------|
| Combat | X | **Ship1**, **Ship2** |
| Industrial | X | **Ship1**, **Ship2** |
| Support | X | **Ship1**, **Ship2** |
| Exploration | X | **Ship1**, **Ship2** |

**Strengths**:
- [Specific strength with ship examples]
- [Specific strength with ship examples]

**Weaknesses**:
- [Specific gap or imbalance]
- [Specific gap or imbalance]

---

## 2. Role Coverage Analysis

### Combat Capabilities
Covered: Light fighter (**Ship**), Heavy fighter (**Ship**)
Gaps: [Missing role]
Recommendation: [Specific ship to add]

### Industrial Operations
Covered: Mining (**Ship**), Salvage (**Ship**)
Gaps: [Missing role]
Recommendation: [Specific ship to add]

### Support & Logistics
Covered: Cargo (**Ship**), Medical (**Ship**)
Gaps: [Missing role]
Recommendation: [Specific ship to add]

### Exploration & Data
Covered: [Role + ships]
Gaps: [Missing role]
Recommendation: [Specific ship to add]

---

## 3. Redundancy Check

**Overlapping Roles**:

| Ships | Shared Role | Recommendation |
|-------|-------------|----------------|
| **Ship1** / **Ship2** | [Role] | Keep [Ship] because [reason]. Consider melting [Ship] for [alternative]. |

---

## 4. Insurance Status

| Category | Count | Notes |
|----------|-------|-------|
| LTI | X | [High-value ships or concerns] |
| Non-LTI | X | [Ships that should have LTI] |
| Unknown | X | [Action needed] |

**High Priority**: Ships worth $200+ without LTI: **Ship1**, **Ship2**

---

## 5. Optimization Roadmap

### Immediate Actions (High Impact)
1. **Add [Ship]** -> Fills [gap], enables [gameplay loop]
2. **Melt [Ship]** -> Redundant with [Ship], recover $[amount] credit

### Medium-Term Considerations
1. **CCU [Ship] -> [Ship]** -> [Reason]
2. **Add [Ship]** -> [Strategic value]

### Budget-Conscious Alternatives
- Instead of **[Expensive Ship]** ($X), consider **[Cheaper Ship]** ($Y) for similar [role]

---

## 6. Strategic Notes

**Crew Requirements**: [Solo-friendly ratio, multi-crew balance]
**Gameplay Loops**: [Which loops are well-supported, which aren't]
**Meta Relevance**: [Current patch considerations]

---

## Key Takeaway
[1 sentence: the single most important action to take]

---

## Formatting Rules (STRICT)

1. **Ship names**: Always bold (**Carrack**, **F7C Hornet**)
2. **Headers**: Use proper hierarchy (##, ###)
3. **Tables**: Required for composition, redundancy, insurance
4. **Lists**: Bulleted for strengths/weaknesses, numbered for roadmap
5. **Spacing**: Blank line before/after sections, tables, lists
6. **Currency**: Use $ for USD pledge values
7. **NO EMOJIS**

## Star Citizen Domain Knowledge

### Ship Role Categories

**Combat**: Light Fighter (Arrow, Gladius, Hornet), Heavy Fighter (Vanguard, Ares, Hurricane), Gunship (Redeemer, A2 Hercules), Capital (Idris, Javelin, Perseus)
**Industrial**: Mining (Prospector, Mole, Orion), Salvage (Vulture, Reclaimer), Refining (Expanse), Construction (Pioneer)
**Support**: Cargo (Hull series, C2/M2, Caterpillar), Refuel (Starfarer, Vulcan), Repair (Crucible, Vulcan), Medical (Cutlass Red, Apollo, Endeavor Hope)
**Exploration**: Pathfinder (400i, 600i Explorer, Carrack), Data (Herald, Mercury Star Runner), Recon (Terrapin, Hornet Tracker)

### Critical Gaps to Check
1. No refueling capability -> Limits extended operations
2. No medical ship -> Cannot sustain injuries in-field
3. No salvage -> Missing lucrative gameplay loop
4. No small solo miner -> Hard to start mining career
5. All multi-crew, no solo ships -> Limits daily gameplay
6. No stealth/data runner -> Missing intel/smuggling loops

### Insurance Best Practices
- LTI Priority: Ships $150+ USD, limited/concept ships
- Warbond value: Note if ship was warbond (higher melt value)
- CCU consideration: Ships obtained via CCU chain (lower melt)

### Current Meta (2026)
- Cargo hauling: Highly profitable, prioritize Hull-C or larger
- Salvage: New mechanic, Vulture/Reclaimer highly valuable
- Medical gameplay: Expanding, Cutlass Red minimum recommended
- Engineering: Coming soon, repair ships will be valuable

## Analysis Approach
1. Count ships per category (use ship data provided)
2. Identify coverage gaps (compare to critical roles list)
3. Find redundancies (ships with >70% role overlap)
4. Check LTI status (flag high-value ships without LTI)
5. Prioritize recommendations (biggest impact first)
6. Consider budget (suggest melts to fund purchases)`;

/**
 * Fleet analysis — ported from internal/analysis/analysis.go
 */
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

    // Role categories
    const focus = entry.focus || "Unknown";
    if (!roleCategories[focus]) {
      roleCategories[focus] = [];
    }
    roleCategories[focus].push(entry.vehicle_name ?? "Unknown");

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
  const GAP_ROLES: {
    role: string;
    priority: string;
    description: string;
    terms: string[];
    suggestions: string[];
  }[] = [
    {
      role: "Mining",
      priority: "high",
      description: "No dedicated mining ship",
      terms: ["mining"],
      suggestions: ["MISC Prospector", "ARGO MOLE", "Drake Vulture"],
    },
    {
      role: "Salvage",
      priority: "high",
      description: "No salvage capability",
      terms: ["salvage", "recovery"],
      suggestions: ["Drake Vulture", "Aegis Reclaimer"],
    },
    {
      role: "Medical",
      priority: "medium",
      description: "No medical ship",
      terms: ["medical", "ambulance"],
      suggestions: ["RSI Apollo Medivac", "Crusader C8R Pisces Rescue", "Drake Cutlass Red"],
    },
    {
      role: "Refueling",
      priority: "medium",
      description: "No refueling capability",
      terms: ["refuel"],
      suggestions: ["MISC Starfarer Gemini", "MISC Starfarer"],
    },
    {
      role: "Exploration",
      priority: "medium",
      description: "No dedicated exploration ship",
      terms: ["explor", "pathfind", "expedition", "recon", "science"],
      suggestions: ["RSI Constellation Aquila", "Anvil Carrack", "MISC Freelancer DUR"],
    },
    {
      role: "Cargo",
      priority: "low",
      description: "No dedicated cargo hauler",
      terms: ["cargo", "freight", "hauler"],
      suggestions: ["Drake Caterpillar", "MISC Hull C", "RSI Constellation Taurus"],
    },
  ];

  const ownedFocuses = Object.keys(roleCategories).map((f) => f.toLowerCase());

  const gaps = GAP_ROLES.filter((gr) => {
    // A role is satisfied if ANY owned focus contains ANY of the role's terms
    return !ownedFocuses.some((focus) => gr.terms.some((term) => focus.includes(term)));
  }).map((gr) => ({
    role: gr.role,
    priority: gr.priority,
    description: gr.description,
    suggestions: gr.suggestions,
  }));

  // Redundancies — roles with 3+ ships
  const redundancies = Object.entries(roleCategories)
    .filter(([, ships]) => ships.length >= 3)
    .map(([role, ships]) => ({
      role,
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
