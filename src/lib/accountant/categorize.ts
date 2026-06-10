import {
  FUEL_MANUAL_REVIEW_SHIPS,
  type Category,
  type DefaultTagValue,
  type KnownHint,
} from "./constants";

export interface Classification {
  category: Category | null;
  tag: DefaultTagValue | null;
}

/**
 * Auto-categorizer v1 (design §4.2): deterministic hint-driven rules.
 * Anything not confidently classifiable returns category null → Sorting List.
 */
export function classifyEntry(
  hint: string | undefined,
  ship: string | undefined,
): Classification {
  // KnownHint cast ties the case labels to KNOWN_HINTS at compile time —
  // a label outside the const is a TS error (single source of truth).
  switch (hint as KnownHint | undefined) {
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
