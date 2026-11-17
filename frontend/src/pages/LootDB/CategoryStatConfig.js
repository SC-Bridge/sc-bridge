// Category-specific stat display configurations for item cards and detail views.
// Each category defines which stats appear on cards and how they're rendered.

export const CATEGORY_STAT_CONFIGS = {
  weapon: {
    cardStats: [
      { key: 'dps', label: 'DPS', color: 'text-red-400', format: 'number' },
      { key: 'damage_type', label: null, format: 'badge' },
    ],
    secondaryStats: [
      { key: 'rounds_per_minute', label: 'RPM' },
      { key: 'effective_range', label: 'Range', suffix: 'm' },
    ],
    sortOptions: ['name', 'dps', 'rarity'],
  },

  melee: {
    cardStats: [
      { key: 'melee_damage', label: 'Damage', color: 'text-red-400', format: 'number' },
      { key: 'damage_type', label: null, format: 'badge' },
    ],
    secondaryStats: [
      { key: 'melee_heavy_damage', label: 'Heavy', showWhenNonNull: true },
    ],
    sortOptions: ['name', 'melee_damage', 'rarity'],
  },

  armour: {
    resistanceBars: true,
    resistanceKeys: ['resist_physical', 'resist_energy', 'resist_distortion'],
    sortOptions: ['name', 'resist_physical', 'rarity'],
  },

  ship_component: {
    badges: ['comp_size', 'comp_grade'],
    subTypeConfigs: {
      PowerPlant:    { key: 'power_output', label: 'Power', color: 'text-yellow-400', suffix: '' },
      Cooler:        { key: 'cooling_rate', label: 'Cooling', color: 'text-blue-400', suffix: '/s' },
      Shield:        { key: 'shield_hp', label: 'Shield HP', color: 'text-cyan-400', suffix: '' },
      QuantumDrive:  { key: 'quantum_speed', label: 'QT Speed', color: 'text-purple-400', suffix: ' m/s' },
    },
    sortOptions: ['name', 'comp_size', 'comp_grade', 'rarity'],
  },

  ship_weapon: {
    badges: ['comp_size', 'comp_grade'],
    cardStats: [
      { key: 'dps', label: 'DPS', color: 'text-red-400', format: 'number' },
      { key: 'damage_type', label: null, format: 'badge' },
    ],
    sortOptions: ['name', 'dps', 'comp_size', 'rarity'],
  },

  missile: {
    cardStats: [
      { key: 'missile_damage', label: 'Damage', color: 'text-red-400', format: 'number' },
      { key: 'tracking_signal', label: null, format: 'badge' },
    ],
    secondaryStats: [
      { key: 'lock_time', label: 'Lock', suffix: 's' },
      { key: 'missile_speed', label: 'Speed', suffix: ' m/s' },
    ],
    sortOptions: ['name', 'missile_damage', 'rarity'],
  },

  consumable: {
    cardStats: [
      { key: 'heal_amount', label: 'Heal', color: 'text-green-400', format: 'number' },
    ],
    sortOptions: ['name', 'rarity'],
  },

  attachment: {
    cardStats: [
      { key: 'zoom_scale', label: 'Zoom', color: 'text-blue-400', format: 'zoom', showWhenNonNull: true },
      { key: 'damage_multiplier', label: 'Dmg', color: 'text-red-400', format: 'multiplier', showWhenNonNull: true },
      { key: 'sound_radius_multiplier', label: 'Sound', color: 'text-emerald-400', format: 'multiplier', showWhenNonNull: true },
    ],
    sortOptions: ['name', 'rarity'],
  },

  utility: {
    cardStats: [
      { key: 'heal_amount', label: 'Heal', color: 'text-green-400', format: 'number', showWhenNonNull: true },
      { key: 'utility_blast_radius', label: 'Blast', color: 'text-orange-400', format: 'number', suffix: 'm', showWhenNonNull: true },
      { key: 'device_type', label: null, format: 'badge', showWhenNonNull: true },
    ],
    sortOptions: ['name', 'rarity'],
  },

  clothing: {
    cardStats: [
      { key: 'storage_capacity', label: 'Storage', color: 'text-blue-400', format: 'microscu', showWhenNonNull: true },
    ],
    sortOptions: ['name', 'rarity'],
  },

  carryable: {
    cardStats: [
      { key: 'carryable_mass', label: 'Mass', color: 'text-amber-400', format: 'number', suffix: ' kg', showWhenNonNull: true },
      { key: 'carryable_interaction', label: null, format: 'badge', showWhenNonNull: true },
    ],
    sortOptions: ['name', 'rarity'],
  },

  _default: {
    cardStats: [],
    sortOptions: ['name', 'rarity', 'category'],
  },
}

export function getStatConfig(category) {
  return CATEGORY_STAT_CONFIGS[category] || CATEGORY_STAT_CONFIGS._default
}
