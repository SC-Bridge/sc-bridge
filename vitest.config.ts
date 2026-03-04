import path from "node:path";
import {
  defineWorkersConfig,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(
    path.resolve(__dirname, "src/db/migrations")
  );

  return {
    resolve: {
      alias: {
        tslib: path.resolve(__dirname, "node_modules/tslib/tslib.es6.mjs"),
      },
    },
    test: {
      globals: true,
      include: ["test/**/*.test.ts"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.toml" },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              ENVIRONMENT: "test",
              ENCRYPTION_KEY: "test-encryption-key-32-chars-ok!",
              BETTER_AUTH_SECRET: "test-secret-value-for-testing-xx",
              BETTER_AUTH_URL: "http://localhost:8787",
            },
          },
        },
      },
    },
  };
});
