-- 0251_mining_global_params.sql
--
-- Global mining configuration per scope (ship/fps/ground_vehicle). The
-- Rock Calculator's instability + window + explosion baselines live here --
-- the rock entity itself has zero instability/window references (verified
-- via p4k probe 2026-06-01).
--
-- Column names mirror the JSON keys snake_cased. Nested params blocks
-- (mineableInstabilityParams, mineableExplosionParams) are flattened in.

CREATE TABLE mining_global_params (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL UNIQUE,
  -- Top-level numeric fields from miningglobalparams*.json
  power_capacity_per_mass REAL,
  decay_per_mass REAL,
  optimal_window_size REAL,
  optimal_window_factor REAL,
  optimal_window_thinness_curve_factor REAL,
  optimal_window_max_size REAL,
  resistance_curve_factor REAL,
  controlled_breaking_fill_rate REAL,
  controlled_breaking_fill_rate_danger REAL,
  controlled_breaking_decay_rate REAL,
  danger_breaking_fill_rate REAL,
  danger_breaking_fill_rate_exponent REAL,
  danger_breaking_decay_rate REAL,
  cscu_per_volume REAL,
  -- mineableInstabilityParams (nested in source JSON, flattened here)
  instability_wave_period REAL,
  instability_wave_variance REAL,
  instability_curve_factor REAL,
  -- mineableExplosionParams -- keep the full nested ExplosionParams block as
  -- JSON for now. We don't need the inner shape until explosion math is
  -- wired into the Calculator.
  explosion_params_json TEXT,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- PTU shadow -- DROP+CREATE for idempotency.
DROP TABLE IF EXISTS ptu_mining_global_params;

CREATE TABLE IF NOT EXISTS ptu_mining_global_params (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL UNIQUE,
  power_capacity_per_mass REAL,
  decay_per_mass REAL,
  optimal_window_size REAL,
  optimal_window_factor REAL,
  optimal_window_thinness_curve_factor REAL,
  optimal_window_max_size REAL,
  resistance_curve_factor REAL,
  controlled_breaking_fill_rate REAL,
  controlled_breaking_fill_rate_danger REAL,
  controlled_breaking_decay_rate REAL,
  danger_breaking_fill_rate REAL,
  danger_breaking_fill_rate_exponent REAL,
  danger_breaking_decay_rate REAL,
  cscu_per_volume REAL,
  instability_wave_period REAL,
  instability_wave_variance REAL,
  instability_curve_factor REAL,
  explosion_params_json TEXT,
  game_version_id INTEGER NOT NULL REFERENCES game_versions(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
