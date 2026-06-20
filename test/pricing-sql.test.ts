import { describe, it, expect } from "vitest";
import {
  buyPriceSQL,
  sellPriceSQL,
  priceSourceSQL,
  pricedSQL,
  buyablePricedSQL,
} from "../src/lib/pricing-sql";

describe("pricing-sql fragments", () => {
  it("buyPriceSQL falls back from latest to base", () => {
    expect(buyPriceSQL()).toBe("COALESCE(ti.latest_buy_price, ti.base_buy_price)");
    expect(buyPriceSQL("x")).toBe("COALESCE(x.latest_buy_price, x.base_buy_price)");
  });

  it("sellPriceSQL falls back from latest to base", () => {
    expect(sellPriceSQL()).toBe("COALESCE(ti.latest_sell_price, ti.base_sell_price)");
  });

  it("priceSourceSQL defaults to 'base' when no community source", () => {
    expect(priceSourceSQL()).toBe("COALESCE(ti.latest_source, 'base')");
  });

  it("pricedSQL is true for a buy OR sell price from either tier", () => {
    expect(pricedSQL()).toBe(
      "(COALESCE(ti.latest_buy_price, ti.base_buy_price) > 0 OR COALESCE(ti.latest_sell_price, ti.base_sell_price) > 0)",
    );
  });

  it("buyablePricedSQL is true for a buy price from either tier", () => {
    expect(buyablePricedSQL()).toBe("COALESCE(ti.latest_buy_price, ti.base_buy_price) > 0");
  });
});
