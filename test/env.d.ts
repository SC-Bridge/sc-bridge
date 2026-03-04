import type { D1Migration } from "@cloudflare/vitest-pool-workers/config";

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
    ENVIRONMENT: string;
    ENCRYPTION_KEY: string;
    BETTER_AUTH_SECRET: string;
    BETTER_AUTH_URL: string;
  }
}
