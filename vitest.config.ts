import path from "node:path";
import { readFileSync } from "node:fs";
import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  // Migrations are still loaded (the PTU e2e test replays a filtered subset via
  // env.TEST_MIGRATIONS) AND used to staleness-check the baseline below. But
  // normal suites NO LONGER replay all 248 migrations per beforeAll — they
  // apply the single consolidated test/test-schema.sql (via setupTestDatabase).
  // That replay churn was the root of the vitest-pool-workers flake under WSL.
  const migrations = await readD1Migrations(
    path.resolve(__dirname, "src/db/migrations")
  );
  const testSchema = readFileSync(
    path.resolve(__dirname, "test/test-schema.sql"),
    "utf-8"
  );
  // The generator bakes the migration count it built from into a header line.
  // If that drifts from src/db/migrations/, the snapshot is stale — fail fast
  // with the fix so a forgotten regenerate can't ship a wrong schema.
  const bakedCount = Number(
    testSchema.match(/^-- migrations: (\d+)/m)?.[1] ?? -1
  );
  if (bakedCount !== migrations.length) {
    throw new Error(
      `test/test-schema.sql is stale: built from ${bakedCount} migrations but ` +
        `${migrations.length} exist in src/db/migrations/. Regenerate it:\n` +
        `    npm run test:schema:gen`
    );
  }

  return {
    resolve: {
      alias: {
        tslib: path.resolve(__dirname, "node_modules/tslib/tslib.es6.mjs"),
      },
    },
    test: {
      globals: true,
      include: ["test/**/*.test.ts"],
      // Generous hook timeout — suites now apply one baseline schema (fast),
      // but the PTU e2e suite still replays a migration subset and CI runners
      // are slower than local. Kept at 60s for headroom.
      hookTimeout: 60000,
      // retry:3 absorbs the residual vitest-pool-workers isolated-storage flake
      // ("Network connection lost" on storage reset under WSL). The big driver
      // — every suite replaying all 248 migrations — is gone (baseline schema),
      // so this is now a rare, cheap-to-retry race rather than the norm. Bumped
      // 2→3 because retries are fast now (baseline apply, not 248 migrations).
      // A genuinely-broken test still fails all 4 attempts.
      retry: 3,
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            kvNamespaces: ["SC_BRIDGE_CACHE", "LOCALIZATION_KV"],
            bindings: {
              // Baseline schema applied by setupTestDatabase (the fast path).
              TEST_SCHEMA: testSchema,
              // Still provided for the PTU e2e suite, which replays a filtered
              // migration subset directly. Normal suites don't touch it.
              TEST_MIGRATIONS: migrations,
              ENVIRONMENT: "test",
              ENCRYPTION_KEY: "dGVzdC1lbmNyeXB0aW9uLWtleS1mb3Itdml0ZXN0IXQ=",
              BETTER_AUTH_SECRET: "test-secret-value-for-testing-xx",
              BETTER_AUTH_URL: "http://localhost:8787",
            },
          },
        },
      },
    },
  };
});
