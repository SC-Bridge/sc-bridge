import { Hono } from "hono";
import { z } from "zod";
import type { HonoEnv } from "../lib/types";
import { getAuthUser } from "../lib/types";
import { validate } from "../lib/validation";
import {
  ACCOUNT_COLORS,
  ACCOUNTS_QUERY,
  accountName,
  resolveAccountId,
  selectAccountIds,
} from "../lib/rsi-accounts";

/**
 * /api/hangar-cleanup — backend for the Hangar Cleanup page (staging-only;
 * index.ts 404s it in production). GET returns the user's synced hangar in one
 * payload (the frontend does all the melt / insurance / CCU / IAE analysis);
 * the mutations store the user's decisions. User data — never cached.
 */

const DECISIONS = ["keep", "melt", "melt-ig", "iae", "iae-remelt", "ins", "review", "gift"] as const;

const ACCOUNT_NOT_FOUND = "RSI account not found";

const CentsOrNull = z.number().int().min(0).nullable();

const RsiPledgeIdParam = z.object({
  rsiPledgeId: z.coerce.number().int().positive({ message: "Invalid pledge ID" }),
});
const VehicleIdParam = z.object({
  vehicleId: z.coerce.number().int().positive({ message: "Invalid vehicle ID" }),
});

const AccountId = z.number().int().positive();
const AccountQuery = z.object({ account: z.string().max(20).optional() });

const DecisionBody = z.object({
  decision: z.enum(DECISIONS).nullable().optional(),
  buy_ingame: z.boolean().optional(),
  iae_price_cents: CentsOrNull.optional(),
  // Only meaningful with decision 'gift'; any other decision clears it.
  gift_to_account_id: AccountId.nullable().optional(),
});
// Bulk: one decision for many pledges (the ledger's "apply to all shown").
const BULK_MAX = 2000;
const BulkDecisionBody = z.object({
  rsi_pledge_ids: z.array(z.number().int().positive()).min(1).max(BULK_MAX),
  decision: z.enum(DECISIONS).nullable(),
  gift_to_account_id: AccountId.nullable().optional(),
});
const BuyBody = z.object({
  rsi_account_id: AccountId.optional(),
  price_cents: CentsOrNull.optional(),
  // Melt straight after buying, so the ship sits in Buy Back Pledges.
  remelt: z.boolean().optional(),
});
const StateBody = z.object({
  rsi_account_id: AccountId.optional(),
  credit_override_cents: CentsOrNull.optional(),
  done_steps: z.array(z.string().max(100)).max(500).optional(),
});

interface AccountRow {
  id: number;
  rsi_handle: string | null;
  label: string | null;
  color: string | null;
  is_primary: number;
  store_credit_cents: number | null;
  synced_at: string | null;
}
interface PledgeRow {
  id: number;
  rsi_account_id: number;
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

/** The series half of an RSI paint title: "Hurricane - Polar Paint" and "Spartan Paint - Polar" both give "polar". */
function paintSeriesKey(title: string): string | null {
  const parts = title.split(" - ");
  return parts.length > 1 ? paintKey(parts[parts.length - 1]) || null : null;
}

interface GamePaint {
  key: string;
  description: string | null;
  hinted: boolean;
}

// A series counts as an event series when nearly all of its paints say so.
const SERIES_MIN_PAINTS = 2;
const SERIES_MIN_HINTED = 0.8;

/**
 * The game description that says a synced paint is limited, or undefined.
 * Exact name first. Failing that, the paint's series: RSI and the game name
 * ships differently ("Constellation Mk IV - Polar Paint" vs "Constellation
 * Polar Livery"), but when the other Polar paints were made for an event, so
 * was this one. The closest-named paint of the series supplies the wording.
 */
function limitedPaintNote(title: string, paints: GamePaint[], byKey: Map<string, GamePaint>): string | undefined {
  const key = paintKey(title);
  const exact = byKey.get(key);
  if (exact?.hinted && exact.description) return exact.description;

  const series = paintSeriesKey(title);
  if (!series) return undefined;
  const inSeries = paints.filter((p) => ` ${p.key} `.includes(` ${series} `));
  const hinted = inSeries.filter((p) => p.hinted && p.description);
  if (inSeries.length < SERIES_MIN_PAINTS || hinted.length / inSeries.length < SERIES_MIN_HINTED) return undefined;

  const words = new Set(key.split(" "));
  const shared = (p: GamePaint) => p.key.split(" ").filter((w) => words.has(w)).length;
  let best = hinted[0];
  for (const p of hinted) if (shared(p) > shared(best)) best = p;
  return best.description ?? undefined;
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
  gift_to_account_id: number | null;
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

const GIFT_ERROR = "Pledge cannot be gifted to that account";

/**
 * Whether a pledge may be gifted to `targetId`: it is giftable, the target is
 * one of the user's accounts, and the target is not the pledge's own account.
 */
async function canGift(
  db: D1Database,
  userId: string,
  pledges: Array<{ is_giftable: number; rsi_account_id: number | null }>,
  targetId: number | null | undefined,
): Promise<boolean> {
  if (!targetId) return false;
  const target = await db
    .prepare("SELECT 1 FROM user_rsi_accounts WHERE id = ? AND user_id = ?")
    .bind(targetId, userId)
    .first();
  if (!target) return false;
  return pledges.every((p) => p.is_giftable === 1 && p.rsi_account_id !== targetId);
}

export function hangarCleanupRoutes() {
  const routes = new Hono<HonoEnv>();

  routes.get("/", async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;

    const accountRows = await db
      .prepare(
        `SELECT id, rsi_handle, label, color, is_primary, store_credit_cents, synced_at
         FROM user_rsi_accounts WHERE user_id = ? ORDER BY is_primary DESC, id`,
      )
      .bind(userId)
      .all<AccountRow>();
    const allAccounts = accountRows.results;
    const selectedIds = await selectAccountIds(db, userId, c.req.query("accounts"));
    const selectedJson = JSON.stringify(selectedIds);
    const selected = allAccounts.filter((a) => selectedIds.includes(a.id));
    // Pledge-level tables narrow through the pledge's account.
    const selectedPledgeIds =
      "SELECT id FROM user_pledges WHERE user_id = ? AND rsi_account_id IN (SELECT value FROM json_each(?))";

    // One round trip, one statement per table, every one scoped by user_id and the selected accounts.
    const [syncRes, pledgeRes, itemRes, upgradeRes, shipRes, buybackRes, decisionRes, buyRes, stateRes, paintRes] =
      await db.batch([
        db
          .prepare(
            `SELECT rsi_account_id, MAX(synced_at) AS synced_at FROM user_hangar_syncs
             WHERE user_id = ? AND rsi_account_id IN (SELECT value FROM json_each(?)) GROUP BY rsi_account_id`,
          )
          .bind(userId, selectedJson),
        db
          .prepare(
            `SELECT id, rsi_account_id, rsi_pledge_id, name, value_cents, currency, pledge_date, pledge_date_parsed,
               is_reclaimable, is_giftable, is_upgraded, is_warbond, ccu_from_name, ccu_to_name
             FROM user_pledges WHERE user_id = ? AND rsi_account_id IN (SELECT value FROM json_each(?))
             ORDER BY COALESCE(pledge_date_parsed, '0000-00-00') DESC, id DESC`,
          )
          .bind(userId, selectedJson),
        db
          .prepare(
            `SELECT upi.user_pledge_id, upi.title, upi.kind, upi.manufacturer_name, upi.custom_name,
               it.duration_months, it.is_lifetime
             FROM user_pledge_items upi
             LEFT JOIN insurance_types it ON it.id = upi.insurance_type_id
             WHERE upi.user_id = ? AND upi.user_pledge_id IN (${selectedPledgeIds})
             ORDER BY upi.user_pledge_id, upi.sort_order, upi.id`,
          )
          .bind(userId, userId, selectedJson),
        // sort_order ascending = RSI upgrade-log order = newest first.
        db
          .prepare(
            `SELECT user_pledge_id, upgrade_name, COALESCE(applied_at_parsed, applied_at) AS applied_at, new_value_cents
             FROM user_pledge_upgrades WHERE user_id = ? AND user_pledge_id IN (${selectedPledgeIds})
             ORDER BY user_pledge_id, sort_order, id`,
          )
          .bind(userId, userId, selectedJson),
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
               AND uf.rsi_account_id IN (SELECT value FROM json_each(?))
             ORDER BY uf.id`,
          )
          .bind(userId, selectedJson),
        db
          .prepare(
            `SELECT bb.name, bb.value_cents, bb.buyback_type, v.name AS vehicle_name,
               fv.name AS from_vehicle_name, tv.name AS to_vehicle_name
             FROM user_buyback_pledges bb
             LEFT JOIN vehicles v ON v.id = bb.vehicle_id
             LEFT JOIN vehicles fv ON fv.id = bb.from_vehicle_id
             LEFT JOIN vehicles tv ON tv.id = bb.to_vehicle_id
             WHERE bb.user_id = ? AND bb.rsi_account_id IN (SELECT value FROM json_each(?))
             ORDER BY bb.id`,
          )
          .bind(userId, selectedJson),
        db
          .prepare(
            `SELECT rsi_pledge_id, decision, buy_ingame, iae_price_cents, gift_to_account_id
             FROM user_hangar_cleanup_decisions
             WHERE user_id = ? AND rsi_pledge_id IN (
               SELECT rsi_pledge_id FROM user_pledges
               WHERE user_id = ? AND rsi_account_id IN (SELECT value FROM json_each(?)))`,
          )
          .bind(userId, userId, selectedJson),
        db
          .prepare(
            `SELECT rsi_account_id, vehicle_id, price_cents, remelt FROM user_hangar_cleanup_buys
             WHERE user_id = ? AND rsi_account_id IN (SELECT value FROM json_each(?)) ORDER BY id`,
          )
          .bind(userId, selectedJson),
        db
          .prepare(
            `SELECT rsi_account_id, credit_override_cents, done_steps_json FROM user_hangar_cleanup_state
             WHERE user_id = ? AND rsi_account_id IN (SELECT value FROM json_each(?))`,
          )
          .bind(userId, selectedJson),
        // Every game paint, marked when its description names an event, a year
        // or exclusivity: the only limited-availability signal we hold ("designed
        // for the 2951 IAE"). A broad mark; the page's limitedReason() decides
        // what it means. Unmarked paints are needed to judge a whole series.
        db.prepare(
          `SELECT name, description, CASE WHEN description IS NOT NULL AND (
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
             OR description LIKE '%exclusive%' OR description LIKE '%commemorat%')
           THEN 1 ELSE 0 END AS hinted
           FROM paints WHERE COALESCE(is_deleted, 0) = 0`,
        ),
      ]);

    const gamePaints: GamePaint[] = (
      paintRes.results as Array<{ name: string; description: string | null; hinted: number }>
    ).map((p) => ({ key: paintKey(p.name), description: p.description, hinted: !!p.hinted }));
    const gamePaintByKey = new Map(gamePaints.map((p) => [p.key, p]));

    const pledgeRows = pledgeRes.results as unknown as PledgeRow[];

    const latestSyncByAccount = new Map(
      (syncRes.results as Array<{ rsi_account_id: number; synced_at: string | null }>).map((r) => [
        r.rsi_account_id,
        r.synced_at,
      ]),
    );
    const stateByAccount = new Map(
      (
        stateRes.results as Array<{
          rsi_account_id: number;
          credit_override_cents: number | null;
          done_steps_json: string | null;
        }>
      ).map((r) => [r.rsi_account_id, r]),
    );
    const buysByAccount = new Map<number, Array<{ vehicle_id: number; price_cents: number | null; remelt?: true }>>();
    for (const b of buyRes.results as Array<{
      rsi_account_id: number;
      vehicle_id: number;
      price_cents: number | null;
      remelt: number;
    }>) {
      const list = buysByAccount.get(b.rsi_account_id) ?? [];
      // remelt is only present when set, so plain buys keep their two-key shape.
      list.push({ vehicle_id: b.vehicle_id, price_cents: b.price_cents, ...(b.remelt ? { remelt: true as const } : {}) });
      buysByAccount.set(b.rsi_account_id, list);
    }

    const accounts = selected.map((a) => ({
      id: a.id,
      name: accountName(a),
      color: a.color ?? ACCOUNT_COLORS[0],
      is_primary: !!a.is_primary,
      store_credit_cents: a.store_credit_cents,
      synced_at: a.synced_at ?? latestSyncByAccount.get(a.id) ?? null,
      credit_override_cents: stateByAccount.get(a.id)?.credit_override_cents ?? null,
      done_steps: parseDoneSteps(stateByAccount.get(a.id)?.done_steps_json),
      buys: buysByAccount.get(a.id) ?? [],
    }));
    const first = accounts[0];

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
      rsi_account_id: p.rsi_account_id,
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
        const paintNote = i.kind === "Skin" ? limitedPaintNote(i.title, gamePaints, gamePaintByKey) : undefined;
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
    const decisions: Record<
      string,
      { decision: string | null; buy_ingame: boolean; iae_price_cents: number | null; gift_to_account_id: number | null }
    > = {};
    for (const d of decisionRes.results as unknown as DecisionRow[]) {
      if (!ownedRsiIds.has(d.rsi_pledge_id)) continue;
      decisions[String(d.rsi_pledge_id)] = {
        decision: d.decision,
        buy_ingame: !!d.buy_ingame,
        iae_price_cents: d.iae_price_cents,
        gift_to_account_id: d.gift_to_account_id,
      };
    }

    return c.json({
      accounts,
      all_accounts: allAccounts.map((a) => ({ id: a.id, name: accountName(a), color: a.color ?? ACCOUNT_COLORS[0] })),
      // The first selected account's values, so single-account callers need no change.
      synced_at: first?.synced_at ?? null,
      store_credit_cents: first?.store_credit_cents ?? null,
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
      buys: first?.buys ?? [],
      state: {
        credit_override_cents: first?.credit_override_cents ?? null,
        done_steps: first?.done_steps ?? [],
      },
    });
  });

  // PUT /decisions — set one decision on many pledges. Only `decision` (and the
  // gift target) change; each pledge keeps its buy_ingame / iae_price_cents.
  // Pledges the user does not own are skipped (the INSERT selects from their
  // own user_pledges).
  routes.put("/decisions", validate("json", BulkDecisionBody), async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const { rsi_pledge_ids, decision, gift_to_account_id } = c.req.valid("json");
    const ids = [...new Set(rsi_pledge_ids)];

    let giftTarget: number | null = null;
    if (decision === "gift") {
      const { results } = await db
        .prepare(
          `SELECT is_giftable, rsi_account_id FROM user_pledges
           WHERE user_id = ? AND rsi_pledge_id IN (SELECT value FROM json_each(?))`,
        )
        .bind(userId, JSON.stringify(ids))
        .all<{ is_giftable: number; rsi_account_id: number | null }>();
      if (!(await canGift(db, userId, results, gift_to_account_id))) {
        return c.json({ error: GIFT_ERROR }, 400);
      }
      giftTarget = gift_to_account_id ?? null;
    }

    const upsert = db.prepare(
      `INSERT INTO user_hangar_cleanup_decisions (user_id, rsi_pledge_id, decision, gift_to_account_id)
       SELECT DISTINCT user_id, rsi_pledge_id, ?, ? FROM user_pledges WHERE user_id = ? AND rsi_pledge_id = ?
       ON CONFLICT(user_id, rsi_pledge_id) DO UPDATE SET
         decision = excluded.decision,
         gift_to_account_id = excluded.gift_to_account_id,
         updated_at = datetime('now')`,
    );
    const CHUNK = 50;
    for (let i = 0; i < ids.length; i += CHUNK) {
      await db.batch(ids.slice(i, i + CHUNK).map((id) => upsert.bind(decision, giftTarget, userId, id)));
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
        .prepare("SELECT is_giftable, rsi_account_id FROM user_pledges WHERE user_id = ? AND rsi_pledge_id = ?")
        .bind(userId, rsiPledgeId)
        .first<{ is_giftable: number; rsi_account_id: number | null }>();
      if (!owned) return c.json({ error: "Pledge not found" }, 404);

      const existing = await db
        .prepare(
          `SELECT decision, buy_ingame, iae_price_cents, gift_to_account_id FROM user_hangar_cleanup_decisions
           WHERE user_id = ? AND rsi_pledge_id = ?`,
        )
        .bind(userId, rsiPledgeId)
        .first<{
          decision: string | null;
          buy_ingame: number;
          iae_price_cents: number | null;
          gift_to_account_id: number | null;
        }>();

      const decision = body.decision !== undefined ? body.decision : (existing?.decision ?? null);
      const buyIngame = body.buy_ingame !== undefined ? body.buy_ingame : !!existing?.buy_ingame;
      const iaePrice = body.iae_price_cents !== undefined ? body.iae_price_cents : (existing?.iae_price_cents ?? null);

      // The gift target belongs to a 'gift' decision only; any other decision clears it.
      let giftTarget: number | null = null;
      if (decision === "gift") {
        giftTarget =
          body.gift_to_account_id !== undefined ? body.gift_to_account_id : (existing?.gift_to_account_id ?? null);
        if (!(await canGift(db, userId, [owned], giftTarget))) return c.json({ error: GIFT_ERROR }, 400);
      }

      if (decision === null && !buyIngame && iaePrice === null) {
        await db
          .prepare("DELETE FROM user_hangar_cleanup_decisions WHERE user_id = ? AND rsi_pledge_id = ?")
          .bind(userId, rsiPledgeId)
          .run();
        return c.json({ ok: true });
      }

      await db
        .prepare(
          `INSERT INTO user_hangar_cleanup_decisions
             (user_id, rsi_pledge_id, decision, buy_ingame, iae_price_cents, gift_to_account_id)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, rsi_pledge_id) DO UPDATE SET
             decision = excluded.decision,
             buy_ingame = excluded.buy_ingame,
             iae_price_cents = excluded.iae_price_cents,
             gift_to_account_id = excluded.gift_to_account_id,
             updated_at = datetime('now')`,
        )
        .bind(userId, rsiPledgeId, decision, buyIngame ? 1 : 0, iaePrice, giftTarget)
        .run();
      return c.json({ ok: true });
    },
  );

  // PUT /buys/:vehicleId — add to one account's buy list; price_cents / remelt omitted keep the stored value.
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

      const accountId = await resolveAccountId(db, userId, body.rsi_account_id);
      if (accountId === null) return c.json({ error: ACCOUNT_NOT_FOUND }, 404);
      const priceProvided = body.price_cents !== undefined;
      const remeltProvided = body.remelt !== undefined;
      await db
        .prepare(
          `INSERT INTO user_hangar_cleanup_buys (user_id, rsi_account_id, vehicle_id, price_cents, remelt)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, rsi_account_id, vehicle_id) DO UPDATE SET
             price_cents = CASE WHEN ? THEN excluded.price_cents ELSE user_hangar_cleanup_buys.price_cents END,
             remelt = CASE WHEN ? THEN excluded.remelt ELSE user_hangar_cleanup_buys.remelt END`,
        )
        .bind(
          userId,
          accountId,
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

  // DELETE /buys/:vehicleId?account= — a delete never creates an account: with
  // no ?account= it targets the primary account if one exists.
  routes.delete(
    "/buys/:vehicleId",
    validate("param", VehicleIdParam),
    validate("query", AccountQuery),
    async (c) => {
      const db = c.env.DB;
      const userId = getAuthUser(c).id;
      const { vehicleId } = c.req.valid("param");
      const { account } = c.req.valid("query");

      let accountId: number | null;
      if (account === undefined || account === "") {
        accountId = (await selectAccountIds(db, userId, undefined))[0] ?? null;
        if (accountId === null) return c.json({ ok: true });
      } else {
        accountId = await resolveAccountId(db, userId, account);
        if (accountId === null) return c.json({ error: ACCOUNT_NOT_FOUND }, 404);
      }
      await db
        .prepare("DELETE FROM user_hangar_cleanup_buys WHERE user_id = ? AND rsi_account_id = ? AND vehicle_id = ?")
        .bind(userId, accountId, vehicleId)
        .run();
      return c.json({ ok: true });
    },
  );

  // PUT /state — partial upsert: only keys present in the body change.
  routes.put("/state", validate("json", StateBody), async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const body = c.req.valid("json");
    const creditProvided = body.credit_override_cents !== undefined;
    const stepsProvided = body.done_steps !== undefined;

    const accountId = await resolveAccountId(db, userId, body.rsi_account_id);
    if (accountId === null) return c.json({ error: ACCOUNT_NOT_FOUND }, 404);
    await db
      .prepare(
        `INSERT INTO user_hangar_cleanup_state (user_id, rsi_account_id, credit_override_cents, done_steps_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, rsi_account_id) DO UPDATE SET
           credit_override_cents = CASE WHEN ? THEN excluded.credit_override_cents
                                        ELSE user_hangar_cleanup_state.credit_override_cents END,
           done_steps_json = CASE WHEN ? THEN excluded.done_steps_json
                                  ELSE user_hangar_cleanup_state.done_steps_json END,
           updated_at = datetime('now')`,
      )
      .bind(
        userId,
        accountId,
        creditProvided ? body.credit_override_cents : null,
        stepsProvided ? JSON.stringify(body.done_steps) : null,
        creditProvided ? 1 : 0,
        stepsProvided ? 1 : 0,
      )
      .run();
    return c.json({ ok: true });
  });

  // DELETE /?accounts= — reset the selected accounts' decisions, buys and state
  // (synced data untouched). No param means the primary account; a malformed
  // one is rejected rather than widened to every account.
  routes.delete("/", validate("query", z.object({ accounts: z.string().max(200).optional() })), async (c) => {
    const db = c.env.DB;
    const userId = getAuthUser(c).id;
    const rawAccounts = c.req.valid("query").accounts;
    if (rawAccounts !== undefined && !ACCOUNTS_QUERY.safeParse(rawAccounts).success) {
      return c.json({ error: "Invalid accounts" }, 400);
    }
    const idsJson = JSON.stringify(await selectAccountIds(db, userId, rawAccounts));
    // 'all' also sweeps decisions whose pledge has left the hangar.
    const decisionScope =
      rawAccounts === "all"
        ? db.prepare("DELETE FROM user_hangar_cleanup_decisions WHERE user_id = ?").bind(userId)
        : db
            .prepare(
              `DELETE FROM user_hangar_cleanup_decisions WHERE user_id = ? AND rsi_pledge_id IN (
                 SELECT rsi_pledge_id FROM user_pledges
                 WHERE user_id = ? AND rsi_account_id IN (SELECT value FROM json_each(?)))`,
            )
            .bind(userId, userId, idsJson);
    await db.batch([
      decisionScope,
      db
        .prepare(
          "DELETE FROM user_hangar_cleanup_buys WHERE user_id = ? AND rsi_account_id IN (SELECT value FROM json_each(?))",
        )
        .bind(userId, idsJson),
      db
        .prepare(
          "DELETE FROM user_hangar_cleanup_state WHERE user_id = ? AND rsi_account_id IN (SELECT value FROM json_each(?))",
        )
        .bind(userId, idsJson),
    ]);
    return c.json({ ok: true });
  });

  return routes;
}
