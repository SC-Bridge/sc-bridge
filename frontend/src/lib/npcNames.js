import { toWords } from './lootLocations'

// ── Difficulty tier labels ──────────────────────────────────────────────────
const DIFFICULTY_TIERS = {
  '01_tutorial': 'Tutorial', '02_veryeasy': 'Very Easy', '03_easy': 'Easy',
  '04_medium': 'Medium', '05_mediumrare': 'Medium-Rare', '06_hard': 'Hard',
  '06_wellDone': 'Well Done', '06_welldone': 'Well Done', '07_hard': 'Hard',
  '07_veryhard': 'Very Hard', '08_veryhard': 'Very Hard', '09_super': 'Super',
  '10_endgame': 'Endgame', '11_endgame_rare': 'Endgame Rare',
}

// ── Abbreviation expansions ─────────────────────────────────────────────────
// Keys are title-case (input is normalized before matching)
const ABBREVIATIONS = {
  // Faction / org codes
  'Adv': 'Advocacy', 'Bhg': 'Bounty Hunters Guild', 'Cfp': 'CFP',
  'Ccc': "CC's Conversions", 'Tdd': 'TDD', 'Asd': 'ASD', 'Atc': 'ATC',
  '9tails': 'Nine Tails', 'Ninetails': 'Nine Tails',
  'Firerat': 'Fire Rat', 'Firerats': 'Fire Rats',
  // Manufacturer codes
  'Ksar': 'Kastak Arms', 'Srvl': 'Survival', 'Qrt': 'Quirinus',
  'Thp': 'Tehachapi', 'Gys': 'Gyson', 'Grin': 'Greycat', 'Cds': 'CDS',
  'Drn': 'Derion', 'Rsi': 'RSI', 'Hdtc': 'Hardin Tactical',
  'Hdh': 'Habidash', 'Eld': 'Escar', 'Alb': 'Alejo Brothers',
  'Dmc': 'DMC', 'Scu': 'SCU', 'Gsb': 'GSB', 'Fio': 'Fiore',
  'Uba': 'UBA', 'Rrs': 'RRS', 'Vlk': 'Vanduul',
  'Ruso': 'Ruso', 'Sasu': 'Sasu', 'Doom': 'Doom',
  // Location names
  'Newbabbage': 'New Babbage', 'Grimhex': 'GrimHEX',
  'Area18': 'Area 18', 'Olisar': 'Port Olisar',
  'Kel To': "Kel-To's", 'Teachs': "Teach's", 'Twyns': "Twyn's",
  'Cov Rep': 'CovRep', 'Cousin Crows': "Cousin Crow's",
  // Compound words
  'Newmedium': 'New Medium', 'Nohelmet': 'No Helmet',
  'Medunit': 'Med Unit', 'Offduty': 'Off-Duty',
  'Roughready': 'Rough & Ready', 'Shatteredblade': 'Shattered Blade',
  'Pyrolight': 'Pyro Light', 'Druglab': 'Drug Lab',
  'Fleetweek': 'Fleet Week', 'Shokeeper': 'Shopkeeper',
  'Shopkeep': 'Shopkeeper', 'Hotdog': 'Hot Dog',
  'Barpatron': 'Bar Patron', 'Rentacop': 'Rent-a-Cop',
  'Blacjac': 'BlacJac',
  // Event / identifier codes
  'Iae': 'IAE', 'Ff': 'FF', 'Lsm': 'LSM', 'Mmhc': 'MMHC',
  'Ftl': 'FTL', 'Mt': 'microTech', 'Mv': 'MV', 'Fl': 'FL',
  'Cvx': 'CVX', 'Fcs': 'FCS', 'Spv': 'SPV', 'Io': 'IO',
  'Atv': 'ATV', 'Weps': 'Weapons',
  // Misc
  'Quasigrazer': 'Quasigrazer',
  // NPC role labels (from EntityClassDefinition actor names)
  'Cqc': 'CQC', 'Npc': 'NPC',
  'Groundcombat': 'Ground Combat',
}

/** Normalize a word to title case: "HELLO" → "Hello", "hello" → "Hello" */
function titleCase(word) {
  if (word.length === 0) return word
  return word[0].toUpperCase() + word.slice(1).toLowerCase()
}

/** Apply abbreviation expansion + title-casing to a display string */
function applyAbbreviations(display) {
  // Title-case each word for consistent abbreviation matching
  display = display.replace(/\b[a-zA-Z][a-zA-Z]*\b/g, w => {
    if (/\d/.test(w)) return w
    return titleCase(w)
  })
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    display = display.replace(new RegExp(`\\b${escaped}\\b`, 'g'), full)
  }
  return display
}

/** Collapse trailing numeric segments: "01 01 01" → remove or show variant */
function collapseNumbers(display) {
  display = display.replace(/(\s\d{2}\w?){2,}$/, (m) => {
    const parts = m.trim().split(/\s+/)
    const last = parts[parts.length - 1]
    return last === '01' ? '' : ` (Variant ${last})`
  })
  // Pull trailing single number as variant: "Agent 01" → "Agent #01"
  display = display.replace(/\s(\d{1,3})$/, ' #$1')
  return display
}

/**
 * Format a loadout name for display.
 * Handles difficulty tiers, gender prefixes, abbreviations, and number collapsing.
 */
export function formatLoadoutName(raw) {
  // Check difficulty tier pattern: "02_veryeasy_01" or "02_veryeasy_01_weps"
  for (const [prefix, label] of Object.entries(DIFFICULTY_TIERS)) {
    if (raw.toLowerCase().startsWith(prefix.toLowerCase())) {
      const rest = raw.slice(prefix.length)
      const variantMatch = rest.match(/^_(\d+)(?:_weps(?:_(\d+))?)?$/)
      if (variantMatch) {
        const variant = variantMatch[1]
        const wepVariant = variantMatch[2]
        if (rest.includes('_weps')) {
          return `${label} #${variant} — Weapons${wepVariant ? ` (${wepVariant})` : ''}`
        }
        return `${label} #${variant}`
      }
      return `${label} ${toWords(rest.replace(/^_/, ''))}`
    }
  }

  // Gender prefix: "m_adv_AgentFlightsuit" → "adv_AgentFlightsuit" + suffix
  let name = raw
  let genderSuffix = ''
  if (/^[mf]_/.test(name)) {
    genderSuffix = name[0] === 'm' ? ' (M)' : ' (F)'
    name = name.slice(2)
  }

  let display = toWords(name)
  display = collapseNumbers(display)
  display = applyAbbreviations(display)

  return display + genderSuffix
}

/**
 * Format an NPC actor name for display in the item detail panel.
 * Handles both loadout names (e.g. "Horizon_Grunt_04") and raw
 * EntityClassDefinition actor names from loot extraction data.
 */
export function formatActorName(actor) {
  if (!actor) return null

  // Strip EntityClassDefinition prefix
  let name = actor.replace(/^EntityClassDefinition\./, '')

  // Strip the SLoadoutAssortment. namespace prefix — loadout names arrive as
  // "SLoadoutAssortment.Criminal_Guard_Pyro_Heavy_Juggernaut"; without this the
  // UI shows a stray "Sloadout Assortment." in front of every NPC.
  name = name.replace(/^SLoadoutAssortment\./i, '')

  // Strip common NPC archetype prefixes to get the meaningful part
  // "PU_Human_Enemy_GroundCombat_NPC_Pyro_Outlaw_Sniper" → "Pyro_Outlaw_Sniper"
  name = name.replace(/^PU_Human_Enemy_GroundCombat_NPC_/i, '')
  // "PU_Human-Populace-Engineer-Male-StormBreaker_01" → "Engineer-Male-StormBreaker_01"
  name = name.replace(/^PU_Human-Populace-/i, '')
  // "NPC_Archetypes-Male-Human-MissionGivers-AgnorKent" → "AgnorKent"
  name = name.replace(/^NPC_Archetypes-(?:Male|Female)-Human-MissionGivers-/i, '')
  // Strip remaining "PU_Human-" prefixes
  name = name.replace(/^PU_Human-/i, '')
  // Strip gender markers from middle: "-Male-" or "-Female-"
  name = name.replace(/-(Male|Female)-/g, ' ')
  // Normalize separators: both - and _ to _
  name = name.replace(/-/g, '_')

  // Now apply the same formatting as loadout names
  return formatLoadoutName(name)
}
