// frontend/src/pages/Accountant/constants.js

export const ACCOUNTANT_TIERS = ['easy', 'advanced', 'industrial'];

export const TIER_RANK = { easy: 0, advanced: 1, industrial: 2 };

export const TIER_LABELS = {
  easy: 'Easy',
  advanced: 'Advanced',
  industrial: 'Industrial',
};

export const TIER_DESCRIPTIONS = {
  easy: 'Core ledger and sorting only — the foundation.',
  advanced: 'Adds the Order Market and Workorders for buy/sell agreements.',
  industrial: 'Full ERP — adds Loans, Tactical investments, and full reporting.',
};

export const ACCOUNTANT_MODULES = [
  {
    id: 'core-financials',
    name: 'Core Financials',
    description: 'Ledger and Sorting List for everyday transaction tracking.',
    minTier: 'easy',
  },
  {
    id: 'finance',
    name: 'Finance',
    description: 'Loans (outgoing and incoming) and Tactical investments.',
    minTier: 'industrial',
  },
  {
    id: 'reports',
    name: 'Reports',
    description: 'P&L, Balance Sheet, Net Worth, Cash Flow.',
    minTier: 'industrial',
  },
  {
    id: 'orders',
    name: 'Orders',
    description: 'Order Market and Workorders for buy/sell agreements.',
    minTier: 'advanced',
  },
];

/**
 * Returns true when a module is unlocked at the given tier.
 */
export function isModuleAvailable(moduleMinTier, currentTier) {
  return TIER_RANK[currentTier] >= TIER_RANK[moduleMinTier];
}

// --- M1: ledger domain (mirrors src/lib/accountant/constants.ts) ---

export const LEDGER_CATEGORIES = ['assets', 'running_cost', 'financial', 'production', 'trading', 'mission_income'];

export const CATEGORY_LABELS = {
  assets: 'Assets',
  running_cost: 'Running cost',
  financial: 'Financial invest.',
  production: 'Production invest.',
  trading: 'Trading',
  mission_income: 'Mission income',
};

// Sorting List keyboard shortcuts (UX doc B.1: "press 1-6 to categorize")
export const CATEGORY_HOTKEYS = {
  1: 'assets',
  2: 'running_cost',
  3: 'financial',
  4: 'production',
  5: 'trading',
  6: 'mission_income',
};

export const DEFAULT_TAGS = {
  assets: [],
  running_cost: ['ship_consumables', 'player_consumables', 'location_invest'],
  financial: ['tactical'],
  production: ['general', 'specified'],
  trading: ['minerals', 'salvage', 'harvestable', 'collectibles', 'player_trading', 'npc_trading'],
  mission_income: [],
};

export const TAG_LABELS = {
  ship_consumables: 'Ship consumables',
  player_consumables: 'Player consumables',
  location_invest: 'Location invest',
  tactical: 'Tactical',
  general: 'General',
  specified: 'Specified',
  minerals: 'Minerals',
  salvage: 'Salvage',
  harvestable: 'Harvestable',
  collectibles: 'Collectibles',
  player_trading: 'Player Trading',
  npc_trading: 'NPC Trading',
};

export const SOURCE_LABELS = {
  parsed: 'Parsed',
  manual: 'Manual',
  adjustment: 'Adjustment',
  loan_principal: 'Loan principal',
  loan_fee: 'Loan fee',
  loan_repayment: 'Repayment',
  accrual_tick: 'Accrual tick',
};
