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

/** Leading stack quantity on a reward entry, e.g. "20x " in "20x Rifle Battery". */
const REWARD_QUANTITY_PREFIX = /^\d+x\s+/;

/**
 * Split a contract's reward_text into reward item display names.
 *
 * The contracts extractor writes reward_text as the rewarded items' game
 * display names joined with ", ", stacked items prefixed with "<n>x ". Those
 * names are the same localised names loot_map.name carries, so an exact name
 * match links a reward to its loot item. Item names never contain ", "
 * (currency rewards such as "15,000 aUEC" have no space after the comma).
 */
export function parseRewardItemNames(rewardText: string | null | undefined): string[] {
  if (!rewardText) return [];
  const names: string[] = [];
  for (const part of rewardText.split(", ")) {
    const name = part.trim().replace(REWARD_QUANTITY_PREFIX, "");
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * Armour set slugs a reward covers, most rewarded pieces first (ties keep
 * reward order). `setSlugByItemName` maps loot item name → set slug for the
 * armour pieces among the rewards; non-armour rewards are simply absent.
 */
export function rankRewardSets(
  itemNames: string[],
  setSlugByItemName: Map<string, string>,
): string[] {
  const counts = new Map<string, number>();
  for (const name of itemNames) {
    const slug = setSlugByItemName.get(name);
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([slug]) => slug);
}
