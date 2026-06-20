import { classifyEntry } from "./categorize";

/** A raw economy event as delivered to POST /api/companion/events. */
export interface CompanionEvent {
  type: string;
  timestamp: string;
  data: Record<string, string>;
}

/** A ledger row ready to INSERT into accountant_entries (source = 'parsed'). */
export interface LedgerDraft {
  occurredAt: string;
  /** Signed: negative = expense, positive = income. */
  amount: number;
  category: string | null;
  tag: string | null;
  description: string | null;
  location: string | null;
  quantity: number | null;
  pricePerUnit: number | null;
  /** Idempotency key, namespaced "companion:…". */
  sourceRef: string;
}

/** Economy event types that can represent a money movement. */
const FINANCIAL_TYPES = new Set([
  "fined",
  "transaction_complete",
  "money_sent",
  "rewards_earned",
  "refinery_complete",
]);

function parseIntOrNull(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function parseFloatOrNull(v: string | undefined): number | null {
  if (v === undefined) return null;
  const n = Number.parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

/**
 * Stable idempotency key. Prefer the parser-supplied event_id; fall back to a
 * deterministic composite so re-posted batches still dedupe. Namespaced so a
 * bridged row never collides with a direct /api/accountant/ingest source_ref.
 */
function sourceRef(evt: CompanionEvent): string {
  const key = evt.data.event_id ?? `${evt.type}:${evt.timestamp}`;
  return `companion:${key}`;
}

/** ISO occurred_at, falling back to receivedAt when the log timestamp is unparseable. */
function occurredAt(evt: CompanionEvent, receivedAt: string): string {
  return Number.isNaN(Date.parse(evt.timestamp)) ? receivedAt : evt.timestamp;
}

/**
 * Translate one companion economy event into a ledger draft, or null when the
 * event is non-financial or lacks the data needed to post an honest amount.
 *
 * Forward-compatible: reads the enriched fields (amount, direction, hint, ship,
 * quantity, price_per_unit) the fixed game log will carry. While the log is
 * degraded and those fields are absent, ambiguous events return null rather
 * than guessing — nothing corrupts the ledger.
 */
export function bridgeEconomyEvent(evt: CompanionEvent, receivedAt: string): LedgerDraft | null {
  if (!FINANCIAL_TYPES.has(evt.type)) return null;

  const d = evt.data;
  const magnitude = parseIntOrNull(d.amount);

  let amount: number;
  let description: string | null;

  switch (evt.type) {
    case "fined":
      if (magnitude === null) return null;
      amount = -Math.abs(magnitude);
      description = "Fine";
      break;
    case "money_sent":
      if (magnitude === null) return null;
      amount = -Math.abs(magnitude);
      description = d.recipient ? `Sent to ${d.recipient}` : "Money sent";
      break;
    case "rewards_earned":
      if (magnitude === null) return null; // count-only payloads carry no amount → skip
      amount = Math.abs(magnitude);
      description = "Reward";
      break;
    case "refinery_complete":
      if (magnitude === null) return null;
      amount = Math.abs(magnitude);
      description = "Refinery payout";
      break;
    case "transaction_complete":
      if (magnitude === null || (d.direction !== "buy" && d.direction !== "sell")) return null;
      amount = d.direction === "buy" ? -Math.abs(magnitude) : Math.abs(magnitude);
      description = d.item ?? null;
      break;
    default:
      return null;
  }

  const { category, tag } = classifyEntry(d.hint, d.ship);

  return {
    occurredAt: occurredAt(evt, receivedAt),
    amount,
    category,
    tag,
    description,
    location: d.location ?? null,
    quantity: parseFloatOrNull(d.quantity),
    pricePerUnit: parseIntOrNull(d.price_per_unit),
    sourceRef: sourceRef(evt),
  };
}

/** Build INSERT OR IGNORE statements for every event that bridges to a ledger row. */
export function buildBridgeStatements(
  db: D1Database,
  userId: string,
  events: CompanionEvent[],
  receivedAt: string,
): D1PreparedStatement[] {
  const stmts: D1PreparedStatement[] = [];
  for (const evt of events) {
    const draft = bridgeEconomyEvent(evt, receivedAt);
    if (!draft) continue;
    stmts.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO accountant_entries
             (user_id, occurred_at, amount, category, tag, source,
              description, location, quantity, price_per_unit, source_ref)
           VALUES (?, ?, ?, ?, ?, 'parsed', ?, ?, ?, ?, ?)`,
        )
        .bind(
          userId,
          draft.occurredAt,
          draft.amount,
          draft.category,
          draft.tag,
          draft.description,
          draft.location,
          draft.quantity,
          draft.pricePerUnit,
          draft.sourceRef,
        ),
    );
  }
  return stmts;
}
