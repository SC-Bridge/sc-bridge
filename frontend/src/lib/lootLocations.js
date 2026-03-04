/**
 * Friendly display names for DataCore loot location identifiers.
 * Covers container `location` keys and NPC `faction` values.
 */

// ── Container locations ───────────────────────────────────────────────────────

/** @type {Record<string, string>} */
const CONTAINER_LOCATIONS = {
  // ASD Onyx Facility — many exist across the verse, keep generic
  ASDDelving:                                   'ASD Onyx Facility',
  ASDDelving_ScienceWing:                       'ASD Onyx Facility \u2014 Research Wing',

  // Pyro locations
  AsteroidBase_Pyro_Encounter:                  'Pyro \u2014 Asteroid Base',
  StormBreaker:                                 'Storm Breaker (Pyro)',
  Kaboos:                                       'QV Logistics Station (Pyro)',
  Orbageddon:                                   'Orbageddon (Pyro)',

  // Caves by moon / quality
  Cave_Aberdeen_Poor:                           'Aberdeen \u2014 Cave (Poor)',
  Cave_Aberdeen_Medium:                         'Aberdeen \u2014 Cave (Medium)',
  Cave_Aberdeen_Rich:                           'Aberdeen \u2014 Cave (Rich)',
  Cave_Daymar_Poor:                             'Daymar \u2014 Cave (Poor)',
  Cave_Daymar_Medium:                           'Daymar \u2014 Cave (Medium)',
  Cave_Daymar_Rich:                             'Daymar \u2014 Cave (Rich)',
  Cave_Hurston_Poor:                            'Hurston \u2014 Cave (Poor)',
  Cave_Hurston_Medium:                          'Hurston \u2014 Cave (Medium)',
  Cave_Hurston_Rich:                            'Hurston \u2014 Cave (Rich)',
  Cave_Prison_Harvestables:                     'Prison Caves (Harvestables)',
  Cave_Full_Test:                               'Cave (Test)',
  Caves:                                        'Caves',

  // Occupied caves by biome / system
  'caves/Loot_Caves_Occupied':                  'Occupied Cave',
  'caves/Loot_Caves_Occupied_Acidic':           'Acidic Cave (Occupied)',
  'caves/Loot_Caves_Occupied_Acidic_Pyro':      'Pyro \u2014 Acidic Cave',
  'caves/Loot_Caves_Occupied_Acidic_Stanton':   'Stanton \u2014 Acidic Cave',
  'caves/Loot_Caves_Occupied_Rock':             'Rock Cave (Occupied)',
  'caves/Loot_Caves_Occupied_Rock_Pyro':        'Pyro \u2014 Rock Cave',
  'caves/Loot_Caves_Occupied_Rock_Stanton':     'Stanton \u2014 Rock Cave',
  'caves/Loot_Caves_Occupied_Sand':             'Sand Cave (Occupied)',
  'caves/Loot_Caves_Occupied_Sand_Pyro':        'Pyro \u2014 Sand Cave',
  'caves/Loot_Caves_Occupied_Sand_Stanton':     'Stanton \u2014 Sand Cave',

  // Colonial outposts
  ColonialOutpost:                              'Colonial Outpost',
  ColonialOutpost_Indy:                         'Colonial Outpost (Independent)',
  ColonialOutpost_Indy_Small:                   'Colonial Outpost \u2014 Independent (Small)',
  ColonialOutpost_Indy_Medium:                  'Colonial Outpost \u2014 Independent (Medium)',
  ColonialOutpost_Indy_Large:                   'Colonial Outpost \u2014 Independent (Large)',
  ColonialOutpost_Outlaw:                       'Colonial Outpost (Outlaw)',
  ColonialOutpost_Outlaw_Small:                 'Colonial Outpost \u2014 Outlaw (Small)',
  ColonialOutpost_Outlaw_Medium:                'Colonial Outpost \u2014 Outlaw (Medium)',
  ColonialOutpost_Outlaw_Large:                 'Colonial Outpost \u2014 Outlaw (Large)',

  // Contested zones — Pyro system stations (all have identical loot)
  // GhostArena confirmed via starmap; 1a/1b mapping is high-confidence circumstantial
  ContestedZones:                               'Pyro \u2014 Contested Zones',
  'contestedzones/ContestedZone_1a':            'Checkmate \u2014 Contested Zone (Pyro II)',
  'contestedzones/ContestedZone_1a_RewardRoom_001': 'Checkmate \u2014 Reward Room (Pyro II)',
  'contestedzones/ContestedZone_1b_RewardRoom_002': 'Orbituary \u2014 Reward Room (Pyro III)',
  'contestedzones/GhostArena_01':               'Ruin Station \u2014 Ghost Arena (Pyro VI)',

  // Named locations — add moon/body context
  Covalex:                                      'Covalex Shipping Hub, Daymar',
  Jumptown:                                     'Jumptown, Daymar',
  Junksites:                                    'Junk Sites',
  Kareah:                                       'Security Post Kareah, Cellin',
  FloatingIslands:                              'Floating Islands (Orison)',

  // Distribution centres — many exist, keep generic
  DCDelving:                                    'Distribution Centre',
  // Note: typo "HighSecurtiy" preserved from DataCore source
  DistributionCentres_HighSecurtiy:             'Distribution Centre (High Security)',
  DistributionCentres_LowSecurity:              'Distribution Centre (Low Security)',
  DistributionCentres_MediumSecurity:           'Distribution Centre (Medium Security)',

  // Derelicts
  Derelict:                                     'Derelict',
  Derelict_Small:                               'Derelict (Small)',
  DerelictOutpost:                              'Derelict Outpost',
  SpaceDerelict:                                'Space Derelict',

  // Generic loot types
  Loot_Criminal:                                'Criminal Loot',
  Loot_HighTech:                                'High-Tech Loot',
  Loot_LowTech:                                 'Low-Tech Loot',
  Loot_Military:                                'Military Loot',

  // Loot generation presets
  LootGeneration_SlotPreset:                    'Loot Preset',
  LootGeneration_MultiSlotpreset_Junksite:      'Junk Site (Multi-slot)',
  LootGeneration_MultiSlotpreset_Kareah:        'Kareah (Multi-slot)',
  LootGeneration_MultiSlotpreset_Stations:      'Station (Multi-slot)',

  // Shipping containers
  ShippingContainer:                            'Shipping Container',
  ShippingContainer_Ammo:                       'Shipping Container (Ammo)',
  ShippingContainer_Medical:                    'Shipping Container (Medical)',

  // Stations (generic)
  Station:                                      'Station',
  Station_SmallRoom:                            'Station \u2014 Small Room',
  Station_MediumRoom:                           'Station \u2014 Medium Room',
  Station_LargeRoom:                            'Station \u2014 Large Room',

  // Rund Station (full-featured station archetype)
  Station_Rund:                                 'Rund Station',
  Station_Rund_Entry:                           'Rund Station \u2014 Entry',
  Station_Rund_Corridors:                       'Rund Station \u2014 Corridors',
  Station_Rund_Hangar:                          'Rund Station \u2014 Hangar',
  Station_Rund_Hatches:                         'Rund Station \u2014 Hatches',
  Station_Rund_Habs:                            'Rund Station \u2014 Habitation',
  Station_Rund_Cargo:                           'Rund Station \u2014 Cargo Bay',
  Station_Rund_Clinic:                          'Rund Station \u2014 Clinic',
  Station_Rund_Comms:                           'Rund Station \u2014 Comms',
  Station_Rund_Refinery:                        'Rund Station \u2014 Refinery',
  Station_Rund_Lowerdeck:                       'Rund Station \u2014 Lower Deck',
  Station_Rund_Worker:                          'Rund Station \u2014 Worker Area',

  // Underground facilities
  UGFs:                                         'Underground Facilities',
  TechOutpost:                                  'Tech Outpost',

  // Misc
  FoodandDrink:                                 'Food & Drink',
  Generic:                                      'Generic Container',
}

// ── NPC factions ─────────────────────────────────────────────────────────────

/** @type {Record<string, string>} */
const NPC_FACTIONS = {
  AssociatedScienceandDevelopment: 'Associated Science & Development',
  ContestedZone:                   'Contested Zone',
  Criminal:                        'Criminal',
  KaboosEnemy:                     'Kaboos',
  Ninetails:                       'Nine Tails',
  Pirates:                         'Pirates',
  Pyro_Outlaw:                     'Pyro Outlaw',
  RoughAndReady:                   'Rough & Ready',
  Unknown:                         'Unknown',
  XenoThreat:                      'XenoThreat',
}

// ── Fallback parsers ──────────────────────────────────────────────────────────

/**
 * Convert a CamelCase or underscore identifier to words.
 * @param {string} s
 * @returns {string}
 */
function toWords(s) {
  return s
    .replace(/[_/]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
}

/**
 * Return a human-readable name for a DataCore container location key.
 * Falls back to a best-effort parser for identifiers not in the known list.
 *
 * @param {string|null|undefined} raw
 * @returns {string}
 */
export function friendlyLocation(raw) {
  if (!raw) return '?'
  if (CONTAINER_LOCATIONS[raw]) return CONTAINER_LOCATIONS[raw]

  let s = raw

  // Strip path prefixes
  s = s.replace(/^caves\//, '').replace(/^contestedzones\//, '')

  // Cave with moon + quality → "Moon — Cave (Quality)"
  const caveMatch = s.match(/^Cave_(\w+)_(Poor|Medium|Rich)$/)
  if (caveMatch) return `${caveMatch[1]} \u2014 Cave (${caveMatch[2]})`

  // Occupied cave biome + system → "System — Biome Cave"
  const occMatch = s.match(/^Loot_Caves_Occupied_(\w+)_(\w+)$/)
  if (occMatch) return `${occMatch[2]} \u2014 ${occMatch[1]} Cave`
  const occBiome = s.match(/^Loot_Caves_Occupied_(\w+)$/)
  if (occBiome) return `${occBiome[1]} Cave (Occupied)`
  if (s === 'Loot_Caves_Occupied') return 'Occupied Cave'

  // Colonial outpost with faction + optional size
  const coMatch = s.match(/^ColonialOutpost_(\w+)(?:_(Small|Medium|Large))?$/)
  if (coMatch) {
    const base = `Colonial Outpost (${coMatch[1]})`
    return coMatch[2] ? `Colonial Outpost \u2014 ${coMatch[1]} (${coMatch[2]})` : base
  }

  // Distribution centres
  const dcMatch = s.match(/^DistributionCentres_(\w+)$/)
  if (dcMatch) return `Distribution Centre (${toWords(dcMatch[1])})`

  // Rund station rooms
  const rundMatch = s.match(/^Station_Rund_(\w+)$/)
  if (rundMatch) return `Rund Station \u2014 ${toWords(rundMatch[1])}`

  // Generic station rooms
  const stRoomMatch = s.match(/^Station_(Small|Medium|Large)Room$/)
  if (stRoomMatch) return `Station \u2014 ${stRoomMatch[1]} Room`

  // Loot preset types
  const lootMatch = s.match(/^LootGeneration_MultiSlotpreset_(\w+)$/)
  if (lootMatch) return `${toWords(lootMatch[1])} (Multi-slot)`
  if (s === 'LootGeneration_SlotPreset') return 'Loot Preset'

  // Generic loot categories
  const lootCatMatch = s.match(/^Loot_(\w+)$/)
  if (lootCatMatch) return `${toWords(lootCatMatch[1])} Loot`

  // Shipping containers
  const scMatch = s.match(/^ShippingContainer_(\w+)$/)
  if (scMatch) return `Shipping Container (${toWords(scMatch[1])})`

  // Contested zone areas — fallback for unknown CZ identifiers
  const czRoom = s.match(/^ContestedZone_(\w+?)_RewardRoom_(\d+)$/)
  if (czRoom) return `Pyro \u2014 Contested Zone ${czRoom[1].toUpperCase()} \u2014 Reward Room`
  const czZone = s.match(/^ContestedZone_(\w+)$/)
  if (czZone) return `Pyro \u2014 Contested Zone ${czZone[1].toUpperCase()}`
  if (s === 'ContestedZones') return 'Pyro \u2014 Contested Zones'

  // Ghost arena
  if (s.startsWith('GhostArena')) return 'Ghost Arena'

  // Generic fallback — convert to words
  return toWords(s) || raw
}

/**
 * Return a human-readable name for a DataCore NPC faction key.
 * Falls back to word-splitting for unknown factions.
 *
 * @param {string|null|undefined} raw
 * @returns {string}
 */
export function friendlyFaction(raw) {
  if (!raw) return '?'
  if (NPC_FACTIONS[raw]) return NPC_FACTIONS[raw]
  return toWords(raw) || raw
}

// ── Location grouping ─────────────────────────────────────────────────────────

/**
 * Group keys for container location categories.
 * @typedef {'named'|'cave'|'outpost'|'dc'|'facility'|'contested'|'station'|'derelict'|'generic'} LocationGroup
 */

/**
 * Return the group key for a raw DataCore container location identifier.
 *
 * @param {string|null|undefined} raw
 * @returns {LocationGroup}
 */
export function getLocationGroup(raw) {
  if (!raw) return 'generic'

  // Strip path prefix
  const s = raw.replace(/^caves\//, '').replace(/^contestedzones\//, '')

  if (s.startsWith('Cave_') || s.startsWith('Loot_Caves_') || s === 'Caves') return 'cave'
  if (s.startsWith('ColonialOutpost') || s === 'DerelictOutpost' || s === 'TechOutpost') return 'outpost'
  if (s.startsWith('DistributionCentres_') || s === 'DCDelving') return 'dc'
  if (s === 'ASDDelving' || s.startsWith('ASDDelving_') || s === 'UGFs') return 'facility'
  if (s.startsWith('ContestedZone') || s.startsWith('GhostArena') || s === 'ContestedZones') return 'contested'
  if (s.startsWith('Station_') || s === 'Station') return 'station'
  if (s === 'Derelict' || s === 'Derelict_Small' || s === 'SpaceDerelict') return 'derelict'
  if (
    s === 'Generic' ||
    s.startsWith('ShippingContainer') ||
    s.startsWith('Loot_') ||
    s.startsWith('LootGeneration_') ||
    s === 'FoodandDrink'
  ) return 'generic'

  // Named real-world locations
  return 'named'
}
