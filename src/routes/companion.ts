import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../lib/types";
import { validate } from "../lib/validation";
import { logEvent } from "../lib/logger";
import { buildBridgeStatements } from "../lib/accountant/companion-bridge";

const companion = new Hono<HonoEnv>();

// --- Schemas ---

const CompanionEventSchema = z.object({
  type: z.string().min(1).max(100),
  source: z.enum(["log"]),
  timestamp: z.string().max(50),
  data: z.record(z.string().max(200), z.string().max(1000)).default({}),
});

const EventBatchSchema = z.object({
  events: z.array(CompanionEventSchema).min(1).max(500),
});

const HeartbeatSchema = z.object({
  player_handle: z.string().max(100).optional(),
  current_ship: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  jurisdiction: z.string().max(200).optional(),
  event_count: z.coerce.number().int().min(0).optional(),
  companion_version: z.string().max(20).optional(),
});

// --- Event routing: type → structured table ---

type EventData = Record<string, string>;

function routeToStructuredTable(
  db: D1Database,
  userId: string,
  type: string,
  data: EventData,
  eventAt: string,
): D1PreparedStatement | null {
  switch (type) {
    // --- Session ---
    case "player_login":
      return db
        .prepare(
          `INSERT INTO companion_sessions (user_id, player_handle, started_at)
           VALUES (?, ?, ?)`,
        )
        .bind(userId, data.handle ?? null, eventAt);

    case "server_joined":
      // Update the most recent open session with shard info
      return db
        .prepare(
          `UPDATE companion_sessions SET shard = ?
           WHERE id = (SELECT id FROM companion_sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1)`,
        )
        .bind(data.shard ?? null, userId);

    // --- Ships ---
    case "ship_boarded":
      return db
        .prepare(
          `INSERT INTO companion_ship_events (user_id, event_type, ship_name, owner_handle, event_at)
           VALUES (?, 'boarded', ?, ?, ?)`,
        )
        .bind(userId, data.ship ?? null, data.owner ?? null, eventAt);

    case "ship_exited":
      return db
        .prepare(
          `INSERT INTO companion_ship_events (user_id, event_type, ship_name, owner_handle, event_at)
           VALUES (?, 'exited', ?, ?, ?)`,
        )
        .bind(userId, data.ship ?? null, data.owner ?? null, eventAt);

    case "insurance_claim":
      return db
        .prepare(
          `INSERT INTO companion_ship_events (user_id, event_type, request_id, event_at)
           VALUES (?, 'insurance_claim', ?, ?)`,
        )
        .bind(userId, data.request_id ?? null, eventAt);

    case "insurance_claim_complete":
      return db
        .prepare(
          `INSERT INTO companion_ship_events (user_id, event_type, status, event_at)
           VALUES (?, 'claim_complete', ?, ?)`,
        )
        .bind(userId, data.result ?? null, eventAt);

    case "vehicle_impounded":
      return db
        .prepare(
          `INSERT INTO companion_ship_events (user_id, event_type, reason, event_at)
           VALUES (?, 'impounded', ?, ?)`,
        )
        .bind(userId, data.reason ?? null, eventAt);

    case "hangar_ready":
      return db
        .prepare(
          `INSERT INTO companion_ship_events (user_id, event_type, event_at)
           VALUES (?, 'hangar_ready', ?)`,
        )
        .bind(userId, eventAt);

    case "ship_list_fetched":
      return db
        .prepare(
          `INSERT INTO companion_ship_events (user_id, event_type, ship_count, event_at)
           VALUES (?, 'list_fetched', ?, ?)`,
        )
        .bind(userId, data.count ? parseInt(data.count, 10) : null, eventAt);

    case "ships_loaded":
      return db
        .prepare(
          `INSERT INTO companion_ship_events (user_id, event_type, ship_count, event_at)
           VALUES (?, 'loaded', ?, ?)`,
        )
        .bind(userId, data.count ? parseInt(data.count, 10) : null, eventAt);

    case "entitlement_reconciliation":
      return db
        .prepare(
          `INSERT INTO companion_ship_events (user_id, event_type, details, status, phase, event_at)
           VALUES (?, 'reconciliation', ?, ?, ?, ?)`,
        )
        .bind(userId, data.details ?? null, data.status ?? null, data.phase ?? null, eventAt);

    // --- Missions ---
    case "contract_accepted":
      return db
        .prepare(
          `INSERT INTO companion_mission_events (user_id, event_type, mission_name, event_at)
           VALUES (?, 'accepted', ?, ?)`,
        )
        .bind(userId, data.name ?? null, eventAt);

    case "contract_completed":
      return db
        .prepare(
          `INSERT INTO companion_mission_events (user_id, event_type, mission_name, event_at)
           VALUES (?, 'completed', ?, ?)`,
        )
        .bind(userId, data.name ?? null, eventAt);

    case "contract_failed":
      return db
        .prepare(
          `INSERT INTO companion_mission_events (user_id, event_type, mission_name, event_at)
           VALUES (?, 'failed', ?, ?)`,
        )
        .bind(userId, data.name ?? null, eventAt);

    case "contract_available":
      return db
        .prepare(
          `INSERT INTO companion_mission_events (user_id, event_type, mission_name, event_at)
           VALUES (?, 'available', ?, ?)`,
        )
        .bind(userId, data.name ?? null, eventAt);

    case "mission_ended":
      return db
        .prepare(
          `INSERT INTO companion_mission_events (user_id, event_type, mission_id, state, event_at)
           VALUES (?, 'ended', ?, ?, ?)`,
        )
        .bind(userId, data.mission_id ?? null, data.state ?? null, eventAt);

    case "end_mission":
      return db
        .prepare(
          `INSERT INTO companion_mission_events (user_id, event_type, mission_id, player_handle, completion_type, reason, event_at)
           VALUES (?, 'end_mission', ?, ?, ?, ?, ?)`,
        )
        .bind(
          userId,
          data.mission_id ?? null,
          data.player ?? null,
          data.completion_type ?? null,
          data.reason ?? null,
          eventAt,
        );

    case "new_objective":
      return db
        .prepare(
          `INSERT INTO companion_mission_events (user_id, event_type, mission_name, event_at)
           VALUES (?, 'new_objective', ?, ?)`,
        )
        .bind(userId, data.name ?? null, eventAt);

    // --- Location ---
    case "location_change":
      return db
        .prepare(
          `INSERT INTO companion_location_events (user_id, event_type, location, player_handle, event_at)
           VALUES (?, 'location_change', ?, ?, ?)`,
        )
        .bind(userId, data.location ?? null, data.player ?? null, eventAt);

    case "jurisdiction_entered":
      return db
        .prepare(
          `INSERT INTO companion_location_events (user_id, event_type, jurisdiction, event_at)
           VALUES (?, 'jurisdiction_entered', ?, ?)`,
        )
        .bind(userId, data.jurisdiction ?? null, eventAt);

    case "armistice_entered":
      return db
        .prepare(
          `INSERT INTO companion_location_events (user_id, event_type, event_at)
           VALUES (?, 'armistice_entered', ?)`,
        )
        .bind(userId, eventAt);

    case "armistice_exited":
      return db
        .prepare(
          `INSERT INTO companion_location_events (user_id, event_type, event_at)
           VALUES (?, 'armistice_exited', ?)`,
        )
        .bind(userId, eventAt);

    case "monitored_space_entered":
      return db
        .prepare(
          `INSERT INTO companion_location_events (user_id, event_type, event_at)
           VALUES (?, 'monitored_entered', ?)`,
        )
        .bind(userId, eventAt);

    case "monitored_space_exited":
      return db
        .prepare(
          `INSERT INTO companion_location_events (user_id, event_type, event_at)
           VALUES (?, 'monitored_exited', ?)`,
        )
        .bind(userId, eventAt);

    // --- Quantum Travel ---
    case "qt_target_selected":
      return db
        .prepare(
          `INSERT INTO companion_travel_events (user_id, event_type, destination, event_at)
           VALUES (?, 'target_selected', ?, ?)`,
        )
        .bind(userId, data.destination ?? null, eventAt);

    case "qt_destination_selected":
      return db
        .prepare(
          `INSERT INTO companion_travel_events (user_id, event_type, destination, event_at)
           VALUES (?, 'destination_selected', ?, ?)`,
        )
        .bind(userId, data.destination ?? null, eventAt);

    case "qt_fuel_requested":
      return db
        .prepare(
          `INSERT INTO companion_travel_events (user_id, event_type, destination, event_at)
           VALUES (?, 'fuel_requested', ?, ?)`,
        )
        .bind(userId, data.destination ?? null, eventAt);

    case "qt_arrived":
      return db
        .prepare(
          `INSERT INTO companion_travel_events (user_id, event_type, event_at)
           VALUES (?, 'arrived', ?)`,
        )
        .bind(userId, eventAt);

    // --- Economy ---
    case "money_sent":
      return db
        .prepare(
          `INSERT INTO companion_economy_events (user_id, event_type, recipient, event_at)
           VALUES (?, 'money_sent', ?, ?)`,
        )
        .bind(userId, data.recipient ?? null, eventAt);

    case "fined":
      return db
        .prepare(
          `INSERT INTO companion_economy_events (user_id, event_type, amount, currency, event_at)
           VALUES (?, 'fined', ?, ?, ?)`,
        )
        .bind(userId, data.amount ? parseInt(data.amount, 10) : null, data.currency ?? "UEC", eventAt);

    case "transaction_complete":
      return db
        .prepare(
          `INSERT INTO companion_economy_events (user_id, event_type, event_at)
           VALUES (?, 'transaction_complete', ?)`,
        )
        .bind(userId, eventAt);

    case "rewards_earned":
      return db
        .prepare(
          `INSERT INTO companion_economy_events (user_id, event_type, reward_count, event_at)
           VALUES (?, 'rewards_earned', ?, ?)`,
        )
        .bind(userId, data.count ? parseInt(data.count, 10) : null, eventAt);

    case "refinery_complete":
      return db
        .prepare(
          `INSERT INTO companion_economy_events (user_id, event_type, location, event_at)
           VALUES (?, 'refinery_complete', ?, ?)`,
        )
        .bind(userId, data.location ?? null, eventAt);

    case "blueprint_received":
      return db
        .prepare(
          `INSERT INTO companion_economy_events (user_id, event_type, item_name, event_at)
           VALUES (?, 'blueprint_received', ?, ?)`,
        )
        .bind(userId, data.name ?? null, eventAt);

    // --- Combat & Health ---
    case "injury":
      return db
        .prepare(
          `INSERT INTO companion_combat_events (user_id, event_type, severity, body_part, tier, event_at)
           VALUES (?, 'injury', ?, ?, ?, ?)`,
        )
        .bind(
          userId,
          data.severity ?? null,
          data.body_part ?? null,
          data.tier ? parseInt(data.tier, 10) : null,
          eventAt,
        );

    case "incapacitated":
      return db
        .prepare(
          `INSERT INTO companion_combat_events (user_id, event_type, event_at)
           VALUES (?, 'incapacitated', ?)`,
        )
        .bind(userId, eventAt);

    case "fatal_collision":
      return db
        .prepare(
          `INSERT INTO companion_combat_events (user_id, event_type, vehicle, zone, event_at)
           VALUES (?, 'fatal_collision', ?, ?, ?)`,
        )
        .bind(userId, data.vehicle ?? null, data.zone ?? null, eventAt);

    case "crimestat_increased":
      return db
        .prepare(
          `INSERT INTO companion_combat_events (user_id, event_type, event_at)
           VALUES (?, 'crimestat_increased', ?)`,
        )
        .bind(userId, eventAt);

    case "emergency_services":
      return db
        .prepare(
          `INSERT INTO companion_combat_events (user_id, event_type, event_at)
           VALUES (?, 'emergency_services', ?)`,
        )
        .bind(userId, eventAt);

    case "crime_committed":
      return db
        .prepare(
          `INSERT INTO companion_combat_events (user_id, event_type, crime, event_at)
           VALUES (?, 'crime_committed', ?, ?)`,
        )
        .bind(userId, data.crime ?? null, eventAt);

    case "actor_death":
      return db
        .prepare(
          `INSERT INTO companion_combat_events (user_id, event_type, actor, zone, event_at)
           VALUES (?, 'actor_death', ?, ?, ?)`,
        )
        .bind(userId, data.actor ?? null, data.zone ?? null, eventAt);

    case "med_bed_heal":
      return db
        .prepare(
          `INSERT INTO companion_combat_events (user_id, event_type, actor, bed_name, vehicle, heal_head, heal_torso, heal_left_arm, heal_right_arm, heal_left_leg, heal_right_leg, event_at)
           VALUES (?, 'med_bed_heal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          userId,
          data.actor ?? null,
          data.bed_name ?? null,
          data.vehicle ?? null,
          data.head === "true" ? 1 : 0,
          data.torso === "true" ? 1 : 0,
          data.left_arm === "true" ? 1 : 0,
          data.right_arm === "true" ? 1 : 0,
          data.left_leg === "true" ? 1 : 0,
          data.right_leg === "true" ? 1 : 0,
          eventAt,
        );

    // --- Missions (additional) ---
    case "contract_shared":
      return db
        .prepare(
          `INSERT INTO companion_mission_events (user_id, event_type, mission_name, event_at)
           VALUES (?, 'shared', ?, ?)`,
        )
        .bind(userId, data.name ?? null, eventAt);

    case "objective_complete":
      return db
        .prepare(
          `INSERT INTO companion_mission_events (user_id, event_type, description, event_at)
           VALUES (?, 'objective_complete', ?, ?)`,
        )
        .bind(userId, data.description ?? null, eventAt);

    case "objective_withdrawn":
      return db
        .prepare(
          `INSERT INTO companion_mission_events (user_id, event_type, description, event_at)
           VALUES (?, 'objective_withdrawn', ?, ?)`,
        )
        .bind(userId, data.description ?? null, eventAt);

    // --- Location (additional) ---
    case "armistice_exiting":
      return db
        .prepare(
          `INSERT INTO companion_location_events (user_id, event_type, event_at)
           VALUES (?, 'armistice_exiting', ?)`,
        )
        .bind(userId, eventAt);

    case "private_property_entered":
      return db
        .prepare(
          `INSERT INTO companion_location_events (user_id, event_type, event_at)
           VALUES (?, 'private_property_entered', ?)`,
        )
        .bind(userId, eventAt);

    case "private_property_exited":
      return db
        .prepare(
          `INSERT INTO companion_location_events (user_id, event_type, event_at)
           VALUES (?, 'private_property_exited', ?)`,
        )
        .bind(userId, eventAt);

    case "restricted_area_warning":
      return db
        .prepare(
          `INSERT INTO companion_location_events (user_id, event_type, event_at)
           VALUES (?, 'restricted_area_warning', ?)`,
        )
        .bind(userId, eventAt);

    case "restricted_area_exited":
      return db
        .prepare(
          `INSERT INTO companion_location_events (user_id, event_type, event_at)
           VALUES (?, 'restricted_area_exited', ?)`,
        )
        .bind(userId, eventAt);

    case "monitored_space_down":
      return db
        .prepare(
          `INSERT INTO companion_location_events (user_id, event_type, event_at)
           VALUES (?, 'monitored_down', ?)`,
        )
        .bind(userId, eventAt);

    case "monitored_space_restored":
      return db
        .prepare(
          `INSERT INTO companion_location_events (user_id, event_type, event_at)
           VALUES (?, 'monitored_restored', ?)`,
        )
        .bind(userId, eventAt);

    // --- Ships (additional) ---
    case "low_fuel":
      return db
        .prepare(
          `INSERT INTO companion_ship_events (user_id, event_type, event_at)
           VALUES (?, 'low_fuel', ?)`,
        )
        .bind(userId, eventAt);

    // --- Social ---
    case "party_member_joined":
      return db
        .prepare(
          `INSERT INTO companion_social_events (user_id, event_type, player_name, event_at)
           VALUES (?, 'member_joined', ?, ?)`,
        )
        .bind(userId, data.player ?? null, eventAt);

    case "party_member_left":
      return db
        .prepare(
          `INSERT INTO companion_social_events (user_id, event_type, player_name, event_at)
           VALUES (?, 'member_left', ?, ?)`,
        )
        .bind(userId, data.player ?? null, eventAt);

    case "party_disbanded":
      return db
        .prepare(
          `INSERT INTO companion_social_events (user_id, event_type, event_at)
           VALUES (?, 'party_disbanded', ?)`,
        )
        .bind(userId, eventAt);

    // --- System ---
    case "journal_entry_added":
      return db
        .prepare(
          `INSERT INTO companion_system_events (user_id, event_type, entry, event_at)
           VALUES (?, 'journal_entry_added', ?, ?)`,
        )
        .bind(userId, data.entry ?? null, eventAt);

    case "player_spawned":
      return db
        .prepare(
          `INSERT INTO companion_system_events (user_id, event_type, event_at)
           VALUES (?, 'player_spawned', ?)`,
        )
        .bind(userId, eventAt);

    default:
      return null; // Unknown event type — stored in raw table only
  }
}

// --- Middleware: require authenticated user ---

companion.use("*", async (c, next) => {
  const user = c.get("user" as never) as { id: string } | undefined;
  if (!user) {
    return c.json({ error: "Authentication required" }, 401);
  }
  return next();
});

// --- Routes ---

/**
 * POST /api/companion/events
 * Receive a batch of game events from the companion app.
 * Events are stored in both the raw companion_events table (audit trail)
 * and routed into domain-specific structured tables for querying.
 */
companion.post("/events", validate("json", EventBatchSchema), async (c) => {
  const user = c.get("user" as never) as { id: string };
  const { events } = c.req.valid("json" as never) as z.infer<typeof EventBatchSchema>;

  const db = c.env.DB;
  const now = new Date().toISOString();

  // Build all statements: raw inserts + structured routing
  const rawStmts = events.map((evt) =>
    db
      .prepare(
        `INSERT INTO companion_events (user_id, type, source, event_timestamp, data_json, received_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(user.id, evt.type, evt.source, evt.timestamp, JSON.stringify(evt.data), now),
  );

  const structuredStmts = events
    .map((evt) => routeToStructuredTable(db, user.id, evt.type, evt.data, evt.timestamp))
    .filter((stmt): stmt is D1PreparedStatement => stmt !== null);

  // Bridge economy events into the accountant ledger (source = 'parsed').
  const bridgeStmts = buildBridgeStatements(db, user.id, events, now);

  // Batch all statements together — raw + structured + ledger bridge
  const allStmts = [...rawStmts, ...structuredStmts, ...bridgeStmts];
  for (let i = 0; i < allStmts.length; i += 100) {
    await db.batch(allStmts.slice(i, i + 100));
  }

  logEvent("companion_events_received", {
    user_id: user.id,
    count: events.length,
    structured: structuredStmts.length,
    bridged: bridgeStmts.length,
    types: [...new Set(events.map((e) => e.type))].join(","),
  });

  return c.json({
    ok: true,
    stored: events.length,
    structured: structuredStmts.length,
    bridged: bridgeStmts.length,
  });
});

/**
 * POST /api/companion/heartbeat
 * Update the user's live game state (shown on profile, org dashboard, etc.)
 */
companion.post("/heartbeat", validate("json", HeartbeatSchema), async (c) => {
  const user = c.get("user" as never) as { id: string };
  const state = c.req.valid("json" as never) as z.infer<typeof HeartbeatSchema>;

  const db = c.env.DB;

  await db
    .prepare(
      `INSERT INTO companion_status (user_id, player_handle, current_ship, location, jurisdiction, event_count, companion_version, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         player_handle = excluded.player_handle,
         current_ship = excluded.current_ship,
         location = excluded.location,
         jurisdiction = excluded.jurisdiction,
         event_count = excluded.event_count,
         companion_version = excluded.companion_version,
         updated_at = excluded.updated_at`,
    )
    .bind(
      user.id,
      state.player_handle ?? null,
      state.current_ship ?? null,
      state.location ?? null,
      state.jurisdiction ?? null,
      state.event_count ?? 0,
      state.companion_version ?? null,
    )
    .run();

  return c.json({ ok: true });
});

/**
 * GET /api/companion/status
 * Get the user's current companion status.
 */
companion.get("/status", async (c) => {
  const user = c.get("user" as never) as { id: string };
  const db = c.env.DB;

  const status = await db
    .prepare("SELECT * FROM companion_status WHERE user_id = ?")
    .bind(user.id)
    .first();

  return c.json({ ok: true, status: status ?? null });
});

/**
 * GET /api/companion/events/summary
 * Get event type counts for the authenticated user.
 */
companion.get("/events/summary", async (c) => {
  const user = c.get("user" as never) as { id: string };
  const db = c.env.DB;

  const rows = await db
    .prepare(
      `SELECT type, COUNT(*) as count, MAX(event_timestamp) as latest
       FROM companion_events
       WHERE user_id = ?
       GROUP BY type
       ORDER BY count DESC`,
    )
    .bind(user.id)
    .all();

  const total = await db
    .prepare("SELECT COUNT(*) as total FROM companion_events WHERE user_id = ?")
    .bind(user.id)
    .first<{ total: number }>();

  return c.json({
    ok: true,
    total: total?.total ?? 0,
    types: rows.results,
  });
});

/**
 * GET /api/companion/events/recent
 * Get recent events for the authenticated user.
 */
companion.get("/events/recent", async (c) => {
  const user = c.get("user" as never) as { id: string };
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
  const db = c.env.DB;

  const rows = await db
    .prepare(
      `SELECT type, source, event_timestamp, data_json
       FROM companion_events
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT ?`,
    )
    .bind(user.id, limit)
    .all();

  return c.json({
    ok: true,
    events: rows.results.map((r: Record<string, unknown>) => ({
      type: r.type,
      source: r.source,
      timestamp: r.event_timestamp,
      data: JSON.parse(r.data_json as string),
    })),
  });
});

export function companionRoutes() {
  return companion;
}
