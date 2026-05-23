/**
 * Test setup: applies the consolidated baseline schema to a fresh D1 database.
 *
 * The baseline (test/test-schema.sql, exposed as the TEST_SCHEMA binding) is a
 * single snapshot of Better Auth tables + ALL D1 migrations + seed rows. We
 * apply it instead of replaying ~248 migration files per suite, which was the
 * root cause of the vitest-pool-workers flake: each beforeAll re-ran every
 * migration, and that storage churn raced the isolated-storage abort/refetch
 * under WSL, timing out a random subset of workers each run.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * REGENERATE THE BASELINE AFTER ADDING/CHANGING A MIGRATION:
 *     npm run test:schema:gen
 * vitest.config.ts fails fast if the snapshot's migration count drifts from
 * src/db/migrations/, so a stale baseline can't slip through.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { env } from "cloudflare:test";

// Split the baseline into individual statements. .dump terminates every
// statement with ";\n" (internal lines of a multi-line CREATE end with ","),
// so splitting on a semicolon-at-end-of-line is reliable for DDL + the simple
// lookup-row INSERTs in the seed. Header "--" comment lines are dropped first.
function splitStatements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.startsWith("--"))
    .join("\n")
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Apply the baseline schema to a fresh D1 database. Call in beforeAll().
 */
export async function setupTestDatabase(db: D1Database): Promise<void> {
  // The baseline is already FK-clean (generated with FK on so cascades fired;
  // orphan image seed excluded), so no PRAGMA is needed — and miniflare ignores
  // PRAGMA foreign_keys anyway. One atomic batch, fewest storage round-trips.
  const statements = splitStatements(env.TEST_SCHEMA as string);
  // Apply as ONE atomic batch. Fewer storage round-trips = a smaller window for
  // the vitest-pool-workers isolated-storage "Network connection lost" race
  // under WSL, and atomic apply means a hit rolls the whole setup back cleanly
  // so retry:2 re-runs from scratch (chunked applies could leave a half-built
  // DB → "no such table" cascades). The baseline is FK-clean + ordered
  // tables→indexes→data, so a single batch is safe.
  await db.batch(statements.map((sql) => db.prepare(sql)));
}

/** Game version ID for test fixtures. Always 1 in a fresh test DB. */
export const TEST_GAME_VERSION_ID = 1;
