import { describe, it, expect } from "vitest";
import { bridgeEconomyEvent } from "../src/lib/accountant/companion-bridge";

const RECEIVED = "2026-06-20T12:00:00Z";

describe("bridgeEconomyEvent", () => {
  it("maps a fine to a signed expense in the Sorting List", () => {
    const draft = bridgeEconomyEvent(
      { type: "fined", timestamp: "2026-06-10T10:00:00Z", data: { amount: "5000", currency: "UEC" } },
      RECEIVED,
    );
    expect(draft).toEqual({
      occurredAt: "2026-06-10T10:00:00.000Z", // normalized to UTC .toISOString()
      amount: -5000,
      category: null,
      tag: null,
      description: "Fine",
      location: null,
      quantity: null,
      pricePerUnit: null,
      sourceRef: "companion:fined:2026-06-10T10:00:00Z", // idempotency key keeps the raw stamp
    });
  });

  it("normalizes an offset timestamp to the UTC Z form (so ORDER BY / cutoffs compare correctly)", () => {
    const draft = bridgeEconomyEvent(
      { type: "fined", timestamp: "2026-07-03T12:00:00+12:00", data: { amount: "100" } },
      RECEIVED,
    );
    // +12:00 noon is 00:00Z the same day — the stored value must be the folded Z string,
    // never the raw offset (raw-string comparisons elsewhere would mis-order it).
    expect(draft?.occurredAt).toBe("2026-07-03T00:00:00.000Z");
  });

  it("maps an enriched purchase to a negative, auto-categorized asset", () => {
    const draft = bridgeEconomyEvent(
      {
        type: "transaction_complete",
        timestamp: "2026-06-10T11:00:00Z",
        data: {
          event_id: "tx-77", amount: "1500000", direction: "buy",
          hint: "ship_purchase", ship: "Cutlass Black", item: "Cutlass Black", location: "New Babbage",
        },
      },
      RECEIVED,
    );
    expect(draft).toMatchObject({
      amount: -1500000,
      category: "assets",
      tag: null,
      description: "Cutlass Black",
      location: "New Babbage",
      sourceRef: "companion:tx-77",
    });
  });

  it("maps an enriched sale to positive trading income", () => {
    const draft = bridgeEconomyEvent(
      {
        type: "transaction_complete",
        timestamp: "2026-06-10T12:00:00Z",
        data: { amount: "20800", direction: "sell", quantity: "400", price_per_unit: "52" },
      },
      RECEIVED,
    );
    expect(draft?.amount).toBe(20800);
    expect(draft?.quantity).toBe(400);
    expect(draft?.pricePerUnit).toBe(52);
  });

  it("skips an economy event that lacks an amount (degraded log)", () => {
    expect(
      bridgeEconomyEvent(
        { type: "rewards_earned", timestamp: "2026-06-10T13:00:00Z", data: { count: "3" } },
        RECEIVED,
      ),
    ).toBeNull();
  });

  it("skips a transaction with an amount but ambiguous direction", () => {
    expect(
      bridgeEconomyEvent(
        { type: "transaction_complete", timestamp: "2026-06-10T13:30:00Z", data: { amount: "100" } },
        RECEIVED,
      ),
    ).toBeNull();
  });

  it("returns null for a non-financial event type", () => {
    expect(
      bridgeEconomyEvent(
        { type: "ship_boarded", timestamp: "2026-06-10T14:00:00Z", data: { ship: "Carrack" } },
        RECEIVED,
      ),
    ).toBeNull();
  });

  it("falls back to receivedAt when the log timestamp is unparseable", () => {
    const draft = bridgeEconomyEvent(
      { type: "fined", timestamp: "garbage", data: { amount: "10" } },
      RECEIVED,
    );
    expect(draft?.occurredAt).toBe(RECEIVED);
  });
});
