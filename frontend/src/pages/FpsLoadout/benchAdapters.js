// Per-kind bench behavior (#200 slice 2). ItemBench owns everything shared —
// sliders, saved builds, divergence warning, layout; adapters answer the four
// kind-specific questions: attachments?, how do config+quality become stats,
// which grid renders them, and what the item's display identity is.
import { combinedMultipliers, computeBenchStats, equippedZoom, craftedMultipliers } from './weaponBenchStats'
import { computeArmourStats } from './armourBenchStats'

const weaponAdapter = {
  kind: 'weapon',
  hasAttachments: true,
  computeStats(blueprint, qualities, equippedList) {
    const m = combinedMultipliers(blueprint?.slots || [], qualities, equippedList)
    return { ...computeBenchStats(blueprint?.base_stats, m), zoom: equippedZoom(equippedList) }
  },
}

const armourAdapter = {
  kind: 'armour',
  hasAttachments: false,
  computeStats(blueprint, qualities) {
    const m = Object.fromEntries(craftedMultipliers(blueprint?.slots || [], qualities))
    return computeArmourStats(blueprint?.base_stats, m)
  },
}

export function getBenchAdapter(kind) {
  return kind === 'armour' ? armourAdapter : weaponAdapter
}
