import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../lib/types";
import { getAuthUser } from "../lib/types";
import { validate } from "../lib/validation";

/**
 * /api/hangar-cleanup — backend for the Hangar Cleanup page (staging-only;
 * index.ts 404s it in production). GET returns the user's synced hangar in one
 * payload (the frontend does all the melt / insurance / CCU / IAE analysis);
 * the mutations store the user's decisions. User data — never cached.
 */

const DECISIONS = ["keep", "melt", "melt-ig", "iae", "iae-remelt", "ins", "review"] as const;

const CentsOrNull = z.number().int().min(0).nullable();

const RsiPledgeIdParam = z.object({
  rsiPledgeId: z.coerce.number().int().positive({ message: "Invalid pledge ID" }),
});
const VehicleIdParam = z.object({
  vehicleId: z.coerce.number().int().positive({ message: "Invalid vehicle ID" }),
});

const DecisionBody = z.object({
  decision: z.enum(DECISIONS).nullable().optional(),
  buy_ingame: z.boolean().optional(),
  iae_price_cents: CentsOrNull.optional(),
});
// Bulk: one decision for many pledges (the ledger's "apply to all shown").
const BULK_MAX = 2000;
const BulkDecisionBody = z.object({
  rsi_pledge_ids: z.array(z.number().int().positive()).min(1).max(BULK_MAX),
  decision: z.enum(DECISIONS).nullable(),
});
const BuyBody = z.object({
  price_cents: CentsOrNull.optional(),
  // Melt straight after buying, so the ship sits in Buy Back Pledges.
  remelt: z.boolean().optional(),
});
const StateBody = z.object({
  credit_override_cents: CentsOrNull.optional(),
  done_steps: z.array(z.string().max(100)).max(500).optional(),
});

interface PledgeRow {
  id: number;
  rsi_pledge_id: number;
  name: string;
  value_cents: number | null;
  currency: string | null;
  pledge_date: string | null;
  pledge_date_parsed: string | null;
  is_reclaimable: number;
  is_giftable: number;
  is_upgraded: number;
  is_warbond: number | null;
  ccu_from_name: string | null;
  ccu_to_name: string | null;
}
interface ItemRow {
  user_pledge_id: number;
  title: string;
  kind: string | null;
  manufacturer_name: string | null;
  custom_name: string | null;
  duration_months: number | null;
  is_lifetime: number | null;
}
/**
 * Paint names differ between RSI ("Carrack - Polar Paint", "Carrack Paint -
 * Polar") and the game ("Carrack Polar Livery"). Both reduce to "carrack polar".
 */
function paintKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/\b(paint|livery|skin)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface UpgradeRow {
  user_pledge_id: number;
  upgrade_name: string;
  applied_at: string | null;
  new_value_cents: number | null;
}
interface ShipRow {
  rsi_pledge_id: number;
  vehicle_id: number;
  slug: string;
  name: string;
  focus: string | null;
  classification: string | null;
  pledge_price: number | null;
  price_auec: number | null;
  insurance_label: string | null;
  duration_months: number | null;
  is_lifetime: number | null;
  warbond: number | null;
}
interface BuybackRow {
  name: string;
  value_cents: number | null;
  buyback_type: string | null;
  vehicle_name: string | null;
  from_vehicle_name: string | null;
  to_vehicle_name: string | null;
}
interface DecisionRow {
  rsi_pledge_id: number;
  decision: string | null;
  buy_ingame: number;
  iae_price_cents: number | null;
}

function parseDoneSteps(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function hangarCleanupRoutes() {
  const routes = new Hono<HonoEnv>();

  routes.get("/", async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;

    // One round trip, one statement per table, every one scoped by user_id.
    const [profileRes, syncRes, pledgeRes, itemRes, upgradeRes, shipRes, buybackRes, decisionRes, buyRes, stateRes, paintRes] =
      await db.batch([
        db.prepare("SELECT synced_at, store_credit_cents FROM user_rsi_profiles WHERE user_id = ?").bind(userId),
        db.prepare("SELECT MAX(synced_at) AS synced_at FROM user_hangar_syncs WHERE user_id = ?").bind(userId),
        db
          .prepare(
            `SELECT id, rsi_pledge_id, name, value_cents, currency, pledge_date, pledge_date_parsed,
               is_reclaimable, is_giftable, is_upgraded, is_warbond, ccu_from_name, ccu_to_name
             FROM user_pledges WHERE user_id = ?
             ORDER BY COALESCE(pledge_date_parsed, '0000-00-00') DESC, id DESC`,
          )
          .bind(userId),
        db
          .prepare(
            `SELECT upi.user_pledge_id, upi.title, upi.kind, upi.manufacturer_name, upi.custom_name,
               it.duration_months, it.is_lifetime
             FROM user_pledge_items upi
             LEFT JOIN insurance_types it ON it.id = upi.insurance_type_id
             WHERE upi.user_id = ?
             ORDER BY upi.user_pledge_id, upi.sort_order, upi.id`,
          )
          .bind(userId),
        // sort_order ascending = RSI upgrade-log order = newest first.
        db
          .prepare(
            `SELECT user_pledge_id, upgrade_name, COALESCE(applied_at_parsed, applied_at) AS applied_at, new_value_cents
             FROM user_pledge_upgrades WHERE user_id = ?
             ORDER BY user_pledge_id, sort_order, id`,
          )
          .bind(userId),
        // user_fleet is the only pledge → vehicle link (pledge_id is the RSI id as TEXT).
        db
          .prepare(
            `SELECT CAST(uf.pledge_id AS INTEGER) AS rsi_pledge_id, v.id AS vehicle_id, v.slug, v.name,
               v.focus, v.classification, v.pledge_price, v.price_auec,
               it.label AS insurance_label, it.duration_months, it.is_lifetime, uf.warbond
             FROM user_fleet uf
             JOIN vehicles v ON v.id = uf.vehicle_id
             LEFT JOIN insurance_types it ON it.id = uf.insurance_type_id
             WHERE uf.user_id = ? AND uf.pledge_id IS NOT NULL AND uf.is_loaner = 0
             ORDER BY uf.id`,
          )
          .bind(userId),
        db
          .prepare(
            `SELECT bb.name, bb.value_cents, bb.buyback_type, v.name AS vehicle_name,
               fv.name AS from_vehicle_name, tv.name AS to_vehicle_name
             FROM user_buyback_pledges bb
             LEFT JOIN vehicles v ON v.id = bb.vehicle_id
             LEFT JOIN vehicles fv ON fv.id = bb.from_vehicle_id
             LEFT JOIN vehicles tv ON tv.id = bb.to_vehicle_id
             WHERE bb.user_id = ?
             ORDER BY bb.id`,
          )
          .bind(userId),
        db
          .prepare(
            `SELECT rsi_pledge_id, decision, buy_ingame, iae_price_cents
             FROM user_hangar_cleanup_decisions WHERE user_id = ?`,
          )
          .bind(userId),
        db
          .prepare("SELECT vehicle_id, price_cents, remelt FROM user_hangar_cleanup_buys WHERE user_id = ? ORDER BY id")
          .bind(userId),
        db
          .prepare("SELECT credit_override_cents, done_steps_json FROM user_hangar_cleanup_state WHERE user_id = ?")
          .bind(userId),
        // Game paint descriptions that name an event, a year or exclusivity: the
        // only limited-availability signal we hold ("designed for the 2951 IAE").
        // A broad prefilter; the page's limitedReason() decides what it means.
        db.prepare(
          `SELECT name, description FROM paints
           WHERE COALESCE(is_deleted, 0) = 0 AND description IS NOT NULL AND (
             description GLOB '*29[0-9][0-9]*'
             OR description LIKE '%Best in Show%' OR description LIKE '%Invictus%'
             OR description LIKE '%IAE%' OR description LIKE '%Aerospace Expo%'
             OR description LIKE '%Luminalia%' OR description LIKE '%Foundation Festival%'
             OR description LIKE '%Stella Fortuna%' OR description LIKE '%Red Festival%'
             OR description LIKE '%Lunar New Year%' OR description LIKE '%Coramor%'
             OR description LIKE '%Pirate Week%' OR description LIKE '%Alien Week%'
             OR description LIKE '%Day of the Vara%' OR description LIKE '%CitizenCon%'
             OR description LIKE '%subscriber%' OR description LIKE '%concierge%'
             OR description LIKE '%referral%' OR description LIKE '%limited%edition%'
             OR description LIKE '%exclusive%' OR description LIKE '%commemorat%')`,
        ),
      ]);

    const paintNotes = new Map<string, string>();
    for (const p of paintRes.results as Array<{ name: string; description: string }>) {
      paintNotes.set(paintKey(p.name), p.description);
    }

    const profile = (profileRes.results as Array<{ synced_at: string | null; store_credit_cents: number | null }>)[0];
    const latestSync = (syncRes.results as Array<{ synced_at: string | null }>)[0];
    const pledgeRows = pledgeRes.results as unknown as PledgeRow[];
    const state = (stateRes.results as Array<{ credit_override_cents: number | null; done_steps_json: string | null }>)[0];

    const itemsByPledge = new Map<number, ItemRow[]>();
    for (const row of itemRes.results as unknown as ItemRow[]) {
      const list = itemsByPledge.get(row.user_pledge_id) ?? [];
      list.push(row);
      itemsByPledge.set(row.user_pledge_id, list);
    }
    const upgradesByPledge = new Map<number, UpgradeRow[]>();
    for (const row of upgradeRes.results as unknown as UpgradeRow[]) {
      const list = upgradesByPledge.get(row.user_pledge_id) ?? [];
      list.push(row);
      upgradesByPledge.set(row.user_pledge_id, list);
    }
    const shipsByRsiPledge = new Map<number, ShipRow[]>();
    for (const row of shipRes.results as unknown as ShipRow[]) {
      const list = shipsByRsiPledge.get(row.rsi_pledge_id) ?? [];
      list.push(row);
      shipsByRsiPledge.set(row.rsi_pledge_id, list);
    }

    const pledges = pledgeRows.map((p) => ({
      rsi_pledge_id: p.rsi_pledge_id,
      name: p.name,
      value_cents: p.value_cents ?? 0,
      currency: p.currency,
      date: p.pledge_date_parsed ?? p.pledge_date,
      is_reclaimable: !!p.is_reclaimable,
      is_giftable: !!p.is_giftable,
      is_upgraded: !!p.is_upgraded,
      is_warbond: !!p.is_warbond,
      ccu_from: p.ccu_from_name,
      ccu_to: p.ccu_to_name,
      items: (itemsByPledge.get(p.id) ?? []).map((i) => {
        const isInsurance = i.kind === "Insurance";
        const paintNote = i.kind === "Skin" ? paintNotes.get(paintKey(i.title)) : undefined;
        return {
          title: i.title,
          kind: i.kind,
          manufacturer_name: i.manufacturer_name,
          custom_name: i.custom_name,
          insurance_months: isInsurance ? i.duration_months : null,
          insurance_lifetime: isInsurance && !!i.is_lifetime,
          // Present only on a paint whose game description hints it is limited.
          ...(paintNote ? { paint_description: paintNote } : {}),
        };
      }),
      upgrades: (upgradesByPledge.get(p.id) ?? []).map((u) => ({
        name: u.upgrade_name,
        applied_at: u.applied_at,
        new_value_cents: u.new_value_cents,
      })),
      ships: (shipsByRsiPledge.get(p.rsi_pledge_id) ?? []).map((s) => ({
        vehicle_id: s.vehicle_id,
        slug: s.slug,
        name: s.name,
        focus: s.focus,
        classification: s.classification,
        pledge_price_cents: s.pledge_price === null ? null : Math.round(s.pledge_price * 100),
        price_auec: s.price_auec,
        insurance_label: s.insurance_label,
        insurance_months: s.duration_months,
        insurance_lifetime: !!s.is_lifetime,
        warbond: !!s.warbond,
      })),
    }));

    // Only decisions for pledges still in the hangar — a melted/gifted pledge's
    // saved decision is meaningless (the row is kept in case it comes back).
    const ownedRsiIds = new Set(pledgeRows.map((p) => p.rsi_pledge_id));
    const decisions: Record<string, { decision: string | null; buy_ingame: boolean; iae_price_cents: number | null }> = {};
    for (const d of decisionRes.results as unknown as DecisionRow[]) {
      if (!ownedRsiIds.has(d.rsi_pledge_id)) continue;
      decisions[String(d.rsi_pledge_id)] = {
        decision: d.decision,
        buy_ingame: !!d.buy_ingame,
        iae_price_cents: d.iae_price_cents,
      };
    }

    return c.json({
      synced_at: profile?.synced_at ?? latestSync?.synced_at ?? null,
      store_credit_cents: profile?.store_credit_cents ?? null,
      pledges,
      buybacks: (buybackRes.results as unknown as BuybackRow[]).map((b) => ({
        name: b.name,
        value_cents: b.value_cents,
        buyback_type: b.buyback_type,
        vehicle_name: b.vehicle_name,
        from_vehicle_name: b.from_vehicle_name,
        to_vehicle_name: b.to_vehicle_name,
      })),
      decisions,
      // remelt is only present when set, so plain buys keep their two-key shape.
      buys: (buyRes.results as Array<{ vehicle_id: number; price_cents: number | null; remelt: number }>).map((b) => ({
        vehicle_id: b.vehicle_id,
        price_cents: b.price_cents,
        ...(b.remelt ? { remelt: true } : {}),
      })),
      state: {
        credit_override_cents: state?.credit_override_cents ?? null,
        done_steps: parseDoneSteps(state?.done_steps_json),
      },
    });
  });

  // PUT /decisions — set one decision on many pledges. Only `decision` changes;
  // each pledge keeps its buy_ingame / iae_price_cents. Pledges the user does
  // not own are skipped (the INSERT selects from their own user_pledges).
  routes.put("/decisions", validate("json", BulkDecisionBody), async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const { rsi_pledge_ids, decision } = c.req.valid("json");
    const ids = [...new Set(rsi_pledge_ids)];

    const upsert = db.prepare(
      `INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision)
       SELECT DISTINCT user_id, rsi_pledge_id, ? FROM user_pledges WHERE user_id = ? AND rsi_pledge_id = ?
       ON CONFLICT(user_id, rsi_pledge_id) DO UPDATE SET
         decision = excluded.decision,
         updated_at = datetime('now')`,
    );
    const CHUNK = 50;
    for (let i = 0; i < ids.length; i += CHUNK) {
      await db.batch(ids.slice(i, i + CHUNK).map((id) => upsert.bind(decision, userId, id)));
    }
    if (decision === null) {
      // Same rule as the single-pledge route: a row that says nothing is deleted.
      await db
        .prepare(
          `DELETE FROM user_hangar_cleanup_decisions
           WHERE user_id = ? AND decision IS NULL AND buy_ingame = 0 AND iae_price_cents IS NULL`,
        )
        .bind(userId)
        .run();
    }
    return c.json({ ok: true });
  });

  // PUT /decisions/:rsiPledgeId — partial upsert; an all-empty result deletes the row.
  routes.put(
    "/decisions/:rsiPledgeId",
    validate("param", RsiPledgeIdParam),
    validate("json", DecisionBody),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const { rsiPledgeId } = c.req.valid("param");
      const body = c.req.valid("json");

      const owned = await db
        .prepare("SELECT 1 FROM user_pledges WHERE user_id = ? AND rsi_pledge_id = ?")
        .bind(userId, rsiPledgeId)
        .first();
      if (!owned) return c.json({ error: "Pledge not found" }, 404);

      const existing = await db
        .prepare(
          `SELECT decision, buy_ingame, iae_price_cents FROM user_hangar_cleanup_decisions
           WHERE user_id = ? AND rsi_pledge_id = ?`,
        )
        .bind(userId, rsiPledgeId)
        .first<{ decision: string | null; buy_ingame: number; iae_price_cents: number | null }>();

      const decision = body.decision !== undefined ? body.decision : (existing?.decision ?? null);
      const buyIngame = body.buy_ingame !== undefined ? body.buy_ingame : !!existing?.buy_ingame;
      const iaePrice = body.iae_price_cents !== undefined ? body.iae_price_cents : (existing?.iae_price_cents ?? null);

      if (decision === null && !buyIngame && iaePrice === null) {
        await db
          .prepare("DELETE FROM user_hangar_cleanup_decisions WHERE user_id = ? AND rsi_pledge_id = ?")
          .bind(userId, rsiPledgeId)
          .run();
        return c.json({ ok: true });
      }

      await db
        .prepare(
          `INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision, buy_ingame, iae_price_cents)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, rsi_pledge_id) DO UPDATE SET
             decision = excluded.decision,
             buy_ingame = excluded.buy_ingame,
             iae_price_cents = excluded.iae_price_cents,
             updated_at = datetime('now')`,
        )
        .bind(userId, rsiPledgeId, decision, buyIngame ? 1 : 0, iaePrice)
        .run();
      return c.json({ ok: true });
    },
  );

  // PUT /buys/:vehicleId — add to the buy list; price_cents / remelt omitted keep the stored value.
  routes.put(
    "/buys/:vehicleId",
    validate("param", VehicleIdParam),
    validate("json", BuyBody),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const { vehicleId } = c.req.valid("param");
      const body = c.req.valid("json");

      const vehicle = await db.prepare("SELECT 1 FROM vehicles WHERE id = ?").bind(vehicleId).first();
      if (!vehicle) return c.json({ error: "Vehicle not found" }, 404);

      const priceProvided = body.price_cents !== undefined;
      const remeltProvided = body.remelt !== undefined;
      await db
        .prepare(
          `INSERT INTO user_hangar_cleanup_buys (user_id, vehicle_id, price_cents, remelt)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, vehicle_id) DO UPDATE SET
             price_cents = CASE WHEN ? THEN excluded.price_cents ELSE user_hangar_cleanup_buys.price_cents END,
             remelt = CASE WHEN ? THEN excluded.remelt ELSE user_hangar_cleanup_buys.remelt END`,
        )
        .bind(
          userId,
          vehicleId,
          priceProvided ? body.price_cents : null,
          body.remelt ? 1 : 0,
          priceProvided ? 1 : 0,
          remeltProvided ? 1 : 0,
        )
        .run();
      return c.json({ ok: true });
    },
  );

  routes.delete("/buys/:vehicleId", validate("param", VehicleIdParam), async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const { vehicleId } = c.req.valid("param");
    await db
      .prepare("DELETE FROM user_hangar_cleanup_buys WHERE user_id = ? AND vehicle_id = ?")
      .bind(userId, vehicleId)
      .run();
    return c.json({ ok: true });
  });

  // PUT /state — partial upsert: only keys present in the body change.
  routes.put("/state", validate("json", StateBody), async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const body = c.req.valid("json");
    const creditProvided = body.credit_override_cents !== undefined;
    const stepsProvided = body.done_steps !== undefined;

    await db
      .prepare(
        `INSERT INTO user_hangar_cleanup_state (user_id, credit_override_cents, done_steps_json)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           credit_override_cents = CASE WHEN ? THEN excluded.credit_override_cents
                                        ELSE user_hangar_cleanup_state.credit_override_cents END,
           done_steps_json = CASE WHEN ? THEN excluded.done_steps_json
                                  ELSE user_hangar_cleanup_state.done_steps_json END,
           updated_at = datetime('now')`,
      )
      .bind(
        userId,
        creditProvided ? body.credit_override_cents : null,
        stepsProvided ? JSON.stringify(body.done_steps) : null,
        creditProvided ? 1 : 0,
        stepsProvided ? 1 : 0,
      )
      .run();
    return c.json({ ok: true });
  });

  // DELETE / — reset: the user's decisions, buys and state (synced data untouched).
  routes.delete("/", async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    await db.batch([
      db.prepare("DELETE FROM user_hangar_cleanup_decisions WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM user_hangar_cleanup_buys WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM user_hangar_cleanup_state WHERE user_id = ?").bind(userId),
    ]);
    return c.json({ ok: true });
  });

  return routes;
}
