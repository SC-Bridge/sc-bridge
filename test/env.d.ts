import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";

// Augment the global Cloudflare.Env type so `env` from cloudflare:test
// surfaces our project bindings. Required since
// @cloudflare/vitest-pool-workers v0.16 (vitest v4 era) — previous releases
// augmented `ProvidedEnv` inside the cloudflare:test module declaration.
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      TEST_SCHEMA: string;
      TEST_MIGRATIONS: D1Migration[];
      ENVIRONMENT: string;
      ENCRYPTION_KEY: string;
      BETTER_AUTH_SECRET: string;
      BETTER_AUTH_URL: string;
    }
  }
}

export {};
