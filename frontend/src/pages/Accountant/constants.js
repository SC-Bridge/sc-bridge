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
