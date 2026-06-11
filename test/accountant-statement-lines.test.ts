import { describe, it, expect } from "vitest";
import { CATEGORIES } from "../src/lib/accountant/constants";
import {
  STATEMENT_LINES,
  PL_EXCLUDED_CATEGORIES,
  classifyPLLine,
} from "../src/lib/accountant/constants";

describe("STATEMENT_LINES — P&L mapping completeness", () => {
  it("every category is either mapped to a P&L line or explicitly excluded (no silent drop)", () => {
    const mappedCategories = new Set<string>();
    for (const line of STATEMENT_LINES) {
      for (const cat of line.categories ?? []) mappedCategories.add(cat);
    }
    for (const cat of CATEGORIES) {
      const covered = mappedCategories.has(cat) || PL_EXCLUDED_CATEGORIES.includes(cat);
      expect(covered, `category '${cat}' is neither mapped nor excluded`).toBe(true);
    }
  });

  it("excludes assets, adjustment-source, loan_principal, loan_repayment from P&L", () => {
    expect(PL_EXCLUDED_CATEGORIES).toContain("assets");
  });

  it("classifies a positive trading entry as Revenue / Trading income", () => {
    const line = classifyPLLine({ category: "trading", amount: 4200, source: "parsed" });
    expect(line?.section).toBe("revenue");
    expect(line?.line).toBe("trading_income");
  });

  it("classifies a positive mission_income entry as Revenue / Mission income (2026-06-11 amendment)", () => {
    const line = classifyPLLine({ category: "mission_income", amount: 5000, source: "parsed" });
    expect(line?.section).toBe("revenue");
    expect(line?.line).toBe("mission_income");
  });

  it("classifies a negative running_cost entry as Expenses / Running cost (per tag)", () => {
    const line = classifyPLLine({ category: "running_cost", amount: -280000, source: "parsed", tag: "ship_consumables" });
    expect(line?.section).toBe("expenses");
    expect(line?.line).toBe("running_cost");
  });

  it("classifies financial/tactical negative as Expenses / Tactical investments", () => {
    const line = classifyPLLine({ category: "financial", amount: -80000, source: "manual", tag: "tactical" });
    expect(line?.section).toBe("expenses");
    expect(line?.line).toBe("tactical");
  });

  it("classifies accrual_tick / loan_fee by sign into interest income vs expense", () => {
    expect(classifyPLLine({ category: "financial", amount: 45000, source: "accrual_tick" })?.line).toBe("interest_income");
    expect(classifyPLLine({ category: "financial", amount: -45000, source: "loan_fee" })?.line).toBe("interest_expense");
  });

  it("returns null for P&L-excluded rows (assets, adjustment, loan_principal, loan_repayment)", () => {
    expect(classifyPLLine({ category: "assets", amount: 1200000, source: "manual" })).toBeNull();
    expect(classifyPLLine({ category: null, amount: 1000, source: "adjustment" })).toBeNull();
    expect(classifyPLLine({ category: "financial", amount: 100000, source: "loan_principal" })).toBeNull();
    expect(classifyPLLine({ category: "financial", amount: -40000, source: "loan_repayment" })).toBeNull();
  });
});
