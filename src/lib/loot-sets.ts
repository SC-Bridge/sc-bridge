/**
 * Shared armor set logic — used by backend routes and queries.
 *
 * Ported from frontend/src/pages/LootDB/lootHelpers.js with TypeScript types
 * and slug generation added.
 */
import { slugFromName } from "./slug";

export const PIECE_SUFFIXES = [
  "Sniper Rifle",
  "Assault Rifle",
  "Helmet",
  "Chestplate",
  "Backplate",
  "Core",
  "Arms",
  "Legs",
  "Undersuit",
  "Backpack",
  "Hat",
  "Jacket",
  "Pants",
  "Rifle",
  "Pistol",
  "SMG",
  "Shotgun",
  "LMG",
  "Launcher",
  "Blade",
  "Knife",
  "Carbine",
  "Suit",
  "Gloves",
  "Boots",
  "Vest",
];

export function extractSetName(
  itemName: string,
  manufacturerName?: string | null
): string | null {
  let s = itemName;
  if (manufacturerName && s.startsWith(manufacturerName)) {
    s = s.slice(manufacturerName.length).trim();
  }
  // Try suffix at end first (base pieces: "Geist Armor Arms" → "Geist Armor")
  for (const suffix of PIECE_SUFFIXES) {
    if (s.endsWith(" " + suffix)) {
      s = s.slice(0, -(suffix.length + 1)).trim();
      return s || null;
    }
    if (s === suffix) {
      return null;
    }
  }
  // Try suffix in middle (variant pieces: "Geist Armor Helmet Snow Camo" → "Geist Armor Snow Camo")
  for (const suffix of PIECE_SUFFIXES) {
    const marker = " " + suffix + " ";
    const idx = s.indexOf(marker);
    if (idx !== -1) {
      s = (s.slice(0, idx) + " " + s.slice(idx + marker.length)).trim();
      return s || null;
    }
  }
  return s || null;
}

/** Generate a URL slug from a set name. Manufacturer omitted to avoid inconsistency. */
export function makeSetSlug(setName: string): string {
  return slugFromName(setName);
}

/**
 * Maps contract reward_text values to armor set slugs.
 * Only entries where matching items exist in loot_map are included.
 * Slugs must match what makeSetSlug(extractSetName(...)) produces.
 */
export const ARMOR_SET_REWARD_MAP: Record<string, string> = {
  "Geist Armor Snow Camo Set": "geist-armor-snow-camo",
  "Heavy Utility Suit": "novikov",
  "Battle Armor Set": "microid-battle-suit",
  "Vanduul-style Armor Set": "snarling-vanduul",
  "Irradiated Armor Set": "antium",
  "Molten Armor Set": "strata",
};

/** Reverse map: set slug → list of reward_text values that reference it */
export const SET_SLUG_REWARD_TEXTS: Record<string, string[]> = {};
for (const [text, slug] of Object.entries(ARMOR_SET_REWARD_MAP)) {
  if (!SET_SLUG_REWARD_TEXTS[slug]) SET_SLUG_REWARD_TEXTS[slug] = [];
  SET_SLUG_REWARD_TEXTS[slug].push(text);
}
