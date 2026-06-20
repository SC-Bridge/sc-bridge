import { getEffectiveShipLoadout } from "../db/queries";
import type { ToolCall, ToolSpec } from "./llm";

/** The single tool the Fleet Chat exposes: fetch one ship's effective loadout. */
export const GET_SHIP_LOADOUT_TOOL: ToolSpec = {
  name: "get_ship_loadout",
  description:
    "Get the effective loadout of one of the user's fleet ships — every equipped component, each tagged stock, custom, or crafted. Prefer ship_fleet_id (the ship's `id` from the fleet payload). Use ship_name only when you don't have the id. Only call this for ships in the user's fleet.",
  parameters: {
    type: "object",
    properties: {
      ship_fleet_id: { type: "number", description: "The ship's fleet-entry id from the fleet payload (preferred)." },
      ship_name: { type: "string", description: "The ship's name or the user's custom name for it." },
    },
  },
};

/** Resolve a fleet entry id from tool args, scoped to the user. Returns null if unresolved. */
async function resolveFleetEntryId(
  db: D1Database,
  userId: string,
  args: Record<string, unknown>,
): Promise<number | null> {
  const rawId = args.ship_fleet_id;
  const id = typeof rawId === "number" ? rawId : Number(rawId);
  if (Number.isInteger(id) && id > 0) {
    const row = await db
      .prepare("SELECT id FROM user_fleet WHERE id = ? AND user_id = ?")
      .bind(id, userId)
      .first<{ id: number }>();
    if (row) return row.id;
  }

  const name = typeof args.ship_name === "string" ? args.ship_name.trim() : "";
  if (name) {
    const row = await db
      .prepare(
        `SELECT uf.id
           FROM user_fleet uf JOIN vehicles v ON v.id = uf.vehicle_id
          WHERE uf.user_id = ? AND (uf.custom_name LIKE ? OR v.name LIKE ?)
          ORDER BY (uf.custom_name = ? OR v.name = ?) DESC LIMIT 1`,
      )
      .bind(userId, `%${name}%`, `%${name}%`, name, name)
      .first<{ id: number }>();
    if (row) return row.id;
  }
  return null;
}

/**
 * Execute a chat tool call server-side and return a JSON string for the model.
 * Never throws — unknown tools / unresolved ships return a JSON `{error}`.
 */
export async function executeChatTool(db: D1Database, userId: string, call: ToolCall): Promise<string> {
  if (call.name !== "get_ship_loadout") {
    return JSON.stringify({ error: `Unknown tool: ${call.name}` });
  }
  try {
    const fleetId = await resolveFleetEntryId(db, userId, call.arguments || {});
    if (fleetId === null) {
      return JSON.stringify({ error: "That ship isn't in your fleet (or couldn't be matched by name)." });
    }
    const loadout = await getEffectiveShipLoadout(db, userId, fleetId);
    if (!loadout) {
      return JSON.stringify({ error: "That ship isn't in your fleet." });
    }
    return JSON.stringify(loadout);
  } catch {
    return JSON.stringify({ error: "Could not look up that ship's loadout." });
  }
}
