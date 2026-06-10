import { FUEL_MANUAL_REVIEW_SHIPS, type Category } from "./constants";

export interface Classification {
  category: Category | null;
  tag: string | null;
}

/**
 * Auto-categorizer v1 (design §4.2): deterministic hint-driven rules.
 * Anything not confidently classifiable returns category null → Sorting List.
 */
export function classifyEntry(
  hint: string | undefined,
  ship: string | undefined,
): Classification {
  switch (hint) {
    case "ship_purchase":
      return { category: "assets", tag: null };
    case "repair":
      return { category: "running_cost", tag: "ship_consumables" };
    case "fuel": {
      const name = (ship ?? "").toLowerCase();
      const manualReview = FUEL_MANUAL_REVIEW_SHIPS.some((s) => name.includes(s));
      return manualReview
        ? { category: null, tag: null }
        : { category: "running_cost", tag: "ship_consumables" };
    }
    default:
      return { category: null, tag: null };
  }
}
