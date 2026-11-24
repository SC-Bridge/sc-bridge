import { getEffectiveShipLoadout } from "../db/queries";
import { accountName, listRsiAccounts } from "./rsi-accounts";
import type { FetchFn, ToolCall, ToolSpec } from "./llm";
import { getShipDetailsTool, searchShipsTool } from "./chat-tools/catalogue-ships";
import { getComponentDetailsTool, searchComponentsTool } from "./chat-tools/catalogue-components";
import { getMyItemsTool } from "./chat-tools/my-items";

/** What every chat tool runs with. Personal queries bind userId/scopeIds from here, never from tool args. */
export interface ToolContext {
  db: D1Database;
  userId: string;
  /** The chat's account scope; null = all accounts. */
  scopeIds: number[] | null;
  fetchFn: FetchFn;
}

/**
 * One Fleet Chat tool. `run` returns a JSON-serialisable value (or `{ error }`);
 * a throw is caught by `executeChatTool`.
 */
export interface ChatToolHandler {
  spec: ToolSpec;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

/** Fetch one of the user's fleet ships' effective loadout. */
export const GET_SHIP_LOADOUT_TOOL: ToolSpec = {
  name: "get_ship_loadout",
  description:
    "Get the effective loadout of one of the user's fleet ships — every equipped component, each tagged stock, custom, or crafted. Prefer ship_fleet_id (the ship's `id` from the fleet payload). Use ship_name only when you don't have the id. Only call this for ships in the user's fleet.",
  parameters: {
    type: "object",
    properties: {
      ship_fleet_id: { type: "number", description: "The ship's fleet-entry id from the fleet payload (preferred)." },
      ship_name: { type: "string", description: "The ship's name or the user's custom name for it." },
      account: { type: "string", description: "The account name the ship is on. Use it when the same ship is on several accounts." },
    },
  },
};

/** The SQL fragment (and its bound json) that keeps `uf` rows inside a chat's account scope. */
const SCOPE_SQL = "(? IS NULL OR uf.rsi_account_id IN (SELECT value FROM json_each(?)))";

type FleetResolution = { id: number } | { message: string } | null;

/**
 * Resolve a fleet entry from tool args, scoped to the user and the chat's
 * accounts (`scopeIds`, null = all). `ship_fleet_id` wins. A name is matched
 * against custom and ship names; `account` narrows it by account name
 * (case-insensitive). A name that still matches ships on several accounts
 * returns a message asking which account, never a silent first pick.
 * Returns null when nothing matches.
 */
async function resolveFleetEntry(
  db: D1Database,
  userId: string,
  args: Record<string, unknown>,
  scopeIds: number[] | null,
): Promise<FleetResolution> {
  const scopeJson = scopeIds ? JSON.stringify(scopeIds) : null;

  const rawId = args.ship_fleet_id;
  const id = typeof rawId === "number" ? rawId : Number(rawId);
  if (Number.isInteger(id) && id > 0) {
    const row = await db
      .prepare(`SELECT uf.id FROM user_fleet uf WHERE uf.id = ? AND uf.user_id = ? AND ${SCOPE_SQL}`)
      .bind(id, userId, scopeJson, scopeJson)
      .first<{ id: number }>();
    if (row) return { id: row.id };
  }

  const name = typeof args.ship_name === "string" ? args.ship_name.trim() : "";
  if (!name) return null;

  const accountArg = typeof args.account === "string" ? args.account.trim() : "";
  const accounts = (await listRsiAccounts(db, userId)).filter((a) => !scopeIds || scopeIds.includes(a.id));
  const names = new Map(accounts.map((a) => [a.id, accountName(a)] as const));

  let accountId: number | null = null;
  if (accountArg) {
    const wanted = accountArg.toLowerCase();
    const match = accounts.find((a) => accountName(a).toLowerCase() === wanted);
    if (!match) {
      return { message: `No account named "${accountArg}" in this chat. Valid accounts: ${[...names.values()].join(", ")}.` };
    }
    accountId = match.id;
  }

  const { results } = await db
    .prepare(
      `SELECT uf.id, uf.rsi_account_id, (uf.custom_name = ? OR v.name = ?) AS is_exact
         FROM user_fleet uf JOIN vehicles v ON v.id = uf.vehicle_id
        WHERE uf.user_id = ? AND (uf.custom_name LIKE ? OR v.name LIKE ?) AND ${SCOPE_SQL}
        ORDER BY is_exact DESC, uf.id`,
    )
    .bind(name, name, userId, `%${name}%`, `%${name}%`, scopeJson, scopeJson)
    .all<{ id: number; rsi_account_id: number | null; is_exact: number }>();

  const rows = accountId === null ? results : results.filter((r) => r.rsi_account_id === accountId);
  const exact = rows.filter((r) => r.is_exact);
  const candidates = exact.length > 0 ? exact : rows;
  if (candidates.length === 0) return null;

  const onAccounts = [...new Set(candidates.map((r) => r.rsi_account_id))];
  if (onAccounts.length > 1) {
    const labels = onAccounts.map((aid) => (aid == null ? undefined : names.get(aid))).filter((n): n is string => !!n);
    return { message: `Several ships match "${name}": on ${labels.join(", ")}. Ask which account.` };
  }
  return { id: candidates[0].id };
}

const getShipLoadoutTool: ChatToolHandler = {
  spec: GET_SHIP_LOADOUT_TOOL,
  async run(args, ctx) {
    try {
      const resolved = await resolveFleetEntry(ctx.db, ctx.userId, args, ctx.scopeIds);
      if (resolved === null) {
        return { error: "That ship isn't in your fleet (or couldn't be matched by name)." };
      }
      if ("message" in resolved) return { error: resolved.message };
      const loadout = await getEffectiveShipLoadout(ctx.db, ctx.userId, resolved.id);
      if (!loadout) return { error: "That ship isn't in your fleet." };
      return loadout;
    } catch {
      return { error: "Could not look up that ship's loadout." };
    }
  },
};

/** Every tool the Fleet Chat offers, in the order the model sees them. */
export const CHAT_TOOL_HANDLERS: ChatToolHandler[] = [
  getShipLoadoutTool,
  searchShipsTool,
  getShipDetailsTool,
  searchComponentsTool,
  getComponentDetailsTool,
  getMyItemsTool,
];

export const CHAT_TOOLS: ToolSpec[] = CHAT_TOOL_HANDLERS.map((h) => h.spec);

/**
 * Execute a chat tool call server-side and return a JSON string for the model.
 * Never throws — unknown tools, bad args and failures return a JSON `{error}`.
 */
export async function executeChatTool(
  db: D1Database,
  userId: string,
  call: ToolCall,
  scopeIds: number[] | null = null,
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const handler = CHAT_TOOL_HANDLERS.find((h) => h.spec.name === call.name);
  if (!handler) {
    return JSON.stringify({ error: `Unknown tool: ${call.name}` });
  }
  try {
    const result = await handler.run(call.arguments || {}, { db, userId, scopeIds, fetchFn });
    return JSON.stringify(result);
  } catch {
    return JSON.stringify({ error: `Could not run ${call.name}.` });
  }
}
