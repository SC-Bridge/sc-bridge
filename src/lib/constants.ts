/**
 * Shared constants — sync source IDs match seed data in 0001_initial_schema.sql
 */

export const SYNC_SOURCE = {
  HANGARXPLOR: 3,
  SCUNPACKED: 4,
  RSI_API: 5,
} as const;

/**
 * SQL INNER JOIN that resolves vehicles to their latest version at or before
 * the default game version.
 *
 * Without this, vehicle queries would either show duplicates (if vehicles exist
 * in multiple versions) or return nothing (if the default version has no vehicle
 * rows because only loot data was loaded for that patch).
 *
 * Append after `FROM vehicles v` in any user-facing read query.
 */
export const VEHICLE_VERSION_JOIN = `INNER JOIN (
    SELECT slug, MAX(game_version_id) as latest_gv
    FROM vehicles
    WHERE game_version_id <= (SELECT id FROM game_versions WHERE is_default = 1)
    GROUP BY slug
  ) _vv ON v.slug = _vv.slug AND v.game_version_id = _vv.latest_gv`;

/**
 * Version cap for import queries — resolves vehicles at or before the default
 * version (same logic as VEHICLE_VERSION_JOIN but for inline subqueries).
 */
export const VEHICLE_VERSION_CAP = `game_version_id <= (SELECT id FROM game_versions WHERE is_default = 1)`;
