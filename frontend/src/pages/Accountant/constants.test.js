import { describe, it, expect } from 'vitest';
import {
  ACCOUNTANT_TIERS,
  ACCOUNTANT_MODULES,
  TIER_RANK,
  isModuleAvailable,
  LEDGER_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_HOTKEYS,
  DEFAULT_TAGS,
} from './constants';

describe('accountant constants', () => {
  it('exports exactly three tiers in rank order', () => {
    expect(ACCOUNTANT_TIERS).toEqual(['easy', 'advanced', 'industrial']);
  });

  it('lists four modules (no corp module in M0)', () => {
    expect(ACCOUNTANT_MODULES.map((m) => m.id)).toEqual([
      'core-financials',
      'finance',
      'reports',
      'orders',
    ]);
  });

  it('TIER_RANK orders tiers monotonically', () => {
    expect(TIER_RANK.easy).toBeLessThan(TIER_RANK.advanced);
    expect(TIER_RANK.advanced).toBeLessThan(TIER_RANK.industrial);
  });

  describe('isModuleAvailable', () => {
    it('easy tier unlocks only core-financials', () => {
      expect(isModuleAvailable('easy', 'easy')).toBe(true);
      expect(isModuleAvailable('advanced', 'easy')).toBe(false);
      expect(isModuleAvailable('industrial', 'easy')).toBe(false);
    });

    it('advanced tier unlocks core-financials and orders, not industrial-only modules', () => {
      expect(isModuleAvailable('easy', 'advanced')).toBe(true);
      expect(isModuleAvailable('advanced', 'advanced')).toBe(true);
      expect(isModuleAvailable('industrial', 'advanced')).toBe(false);
    });

    it('industrial tier unlocks everything', () => {
      expect(isModuleAvailable('easy', 'industrial')).toBe(true);
      expect(isModuleAvailable('advanced', 'industrial')).toBe(true);
      expect(isModuleAvailable('industrial', 'industrial')).toBe(true);
    });
  });
});

describe('ledger category constants', () => {
  it('exposes the six categories in master-doc order', () => {
    expect(LEDGER_CATEGORIES).toEqual(['assets', 'running_cost', 'financial', 'production', 'trading', 'mission_income']);
  });
  it('has a label and hotkey for every category', () => {
    for (const c of LEDGER_CATEGORIES) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
    expect(Object.values(CATEGORY_HOTKEYS)).toEqual(LEDGER_CATEGORIES);
    // hotkey numbers must align with array position — the Sorting page renders
    // the displayed number from the array index ({i + 1})
    LEDGER_CATEGORIES.forEach((c, i) => expect(CATEGORY_HOTKEYS[i + 1]).toBe(c));
  });
  it('default trading tags match the master doc', () => {
    expect(DEFAULT_TAGS.trading).toEqual(['minerals', 'salvage', 'harvestable', 'collectibles']);
  });
  it('mission_income has no default tags', () => {
    expect(DEFAULT_TAGS.mission_income).toEqual([]);
  });
  it('hotkey 6 maps to mission_income', () => {
    expect(CATEGORY_HOTKEYS[6]).toBe('mission_income');
  });
});
