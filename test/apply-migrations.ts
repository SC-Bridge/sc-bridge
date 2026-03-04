/**
 * Test setup: creates Better Auth tables then applies D1 migrations.
 *
 * Better Auth tables (user, session, account, verification, organization, member,
 * invitation) are managed by Better Auth's own migration system, not D1 migration
 * files. But D1 migration 0004 runs ALTER TABLE user ADD COLUMN status, so the
 * user table must exist before D1 migrations are applied.
 */
import { env, applyD1Migrations } from "cloudflare:test";

// Better Auth core tables — minimal schema needed for auth to work.
// Column names use camelCase matching Better Auth's SQLite convention.
// Each statement on one line — D1 exec() in miniflare splits on newlines.
const BETTER_AUTH_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "user" (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, role TEXT DEFAULT 'user', banned INTEGER DEFAULT 0, banReason TEXT, banExpires TEXT, twoFactorEnabled INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS "session" (id TEXT PRIMARY KEY NOT NULL, expiresAt TEXT NOT NULL, token TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, ipAddress TEXT, userAgent TEXT, userId TEXT NOT NULL REFERENCES "user"(id), impersonatedBy TEXT, activeOrganizationId TEXT)`,
  `CREATE TABLE IF NOT EXISTS "account" (id TEXT PRIMARY KEY NOT NULL, accountId TEXT NOT NULL, providerId TEXT NOT NULL, userId TEXT NOT NULL REFERENCES "user"(id), accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt TEXT, refreshTokenExpiresAt TEXT, scope TEXT, password TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "verification" (id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL, expiresAt TEXT NOT NULL, createdAt TEXT, updatedAt TEXT)`,
  `CREATE TABLE IF NOT EXISTS "organization" (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, logo TEXT, createdAt TEXT NOT NULL, metadata TEXT, rsiSid TEXT, rsiUrl TEXT, homepage TEXT, discord TEXT, twitch TEXT, youtube TEXT)`,
  `CREATE TABLE IF NOT EXISTS "member" (id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL REFERENCES "organization"(id), userId TEXT NOT NULL REFERENCES "user"(id), role TEXT NOT NULL DEFAULT 'member', createdAt TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS "invitation" (id TEXT PRIMARY KEY NOT NULL, organizationId TEXT NOT NULL REFERENCES "organization"(id), email TEXT NOT NULL, role TEXT, status TEXT NOT NULL DEFAULT 'pending', expiresAt TEXT NOT NULL, inviterId TEXT NOT NULL REFERENCES "user"(id))`,
];

/**
 * Apply Better Auth tables + D1 migrations to a fresh D1 database.
 * Call this in beforeAll() of each test file.
 */
export async function setupTestDatabase(db: D1Database): Promise<void> {
  await db.batch(BETTER_AUTH_STATEMENTS.map((sql) => db.prepare(sql)));
  await applyD1Migrations(db, env.TEST_MIGRATIONS);
}
