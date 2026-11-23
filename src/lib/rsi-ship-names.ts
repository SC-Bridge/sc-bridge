/**
 * RSI ship-name aliases: the name RSI uses (store, hangar pledge items) → our
 * vehicles.name, both lowercased. Only for renames the generic slug/name
 * heuristics cannot bridge (e.g. RSI "Ares Ion" vs DB "Ares Star Fighter Ion").
 *
 * Used by the RSI image sync (src/sync/rsi.ts) and the hangar/buyback matcher
 * (findVehicleSlugLocal in src/lib/fleet-import.ts).
 */
export const shipNameMap: Record<string, string> = {
  "600i explorer": "600i", // RSI calls it Explorer; our DB slug is just "600i"
  "a2 hercules": "a2 hercules starlifter",
  "c2 hercules": "c2 hercules starlifter",
  "m2 hercules": "m2 hercules starlifter",
  "ares inferno": "ares star fighter inferno",
  "ares ion": "ares star fighter ion",
  mercury: "mercury star runner",
  m50: "m50 interceptor",
  "85x": "85x limited",
  scythe: "vanduul scythe",
  stinger: "esperia stinger",
  "dragonfly black": "dragonfly",
  "c8r pisces": "c8r pisces rescue",
  "anvil ballista dunestalker": "ballista dunestalker",
  "anvil ballista snowblind": "ballista snowblind",
  "argo mole carbon edition": "mole carbon",
  "argo mole talus edition": "mole talus",
  "caterpillar best in show edition 2949": "caterpillar 2949 best in show edition",
  // DB has "Drake Cutlass 2949 Best In Show Edition" (no "Black" in middle)
  "cutlass black best in show edition 2949": "cutlass 2949 best in show edition",
  "hammerhead best in show edition 2949": "hammerhead 2949 best in show edition",
  "reclaimer best in show edition 2949": "reclaimer 2949 best in show edition",
  "valkyrie liberator edition": "valkyrie liberator",
  "gladius pirate edition": "gladius pirate",
  "caterpillar pirate edition": "caterpillar pirate",
  "f7c-m super hornet heartseeker mk i": "f7c-m hornet heartseeker mk i",
  "f7c-m super hornet heartseeker mk ii": "f7c-m hornet heartseeker mk ii",
  "f7c-m super hornet mk i": "f7c-m super hornet mk i",
  "f7c-m super hornet mk ii": "f7c-m super hornet mk ii",
  "f8c lightning executive edition": "f8c lightning executive edition",
  "constellation phoenix emerald": "constellation phoenix emerald",
  "san\u2019tok.y\u0101i": "san\u2019tok.y\u0101i",
  "carrack expedition w/c8x": "carrack expedition w/c8x",
  "carrack w/c8x": "carrack w/c8x",
  // UTV — RSI lists as just "UTV", DB has "Greycat UTV" (with manufacturer prefix)
  utv: "greycat utv",
};
