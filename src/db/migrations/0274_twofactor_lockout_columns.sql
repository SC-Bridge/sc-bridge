-- 0274_twofactor_lockout_columns
--
-- better-auth 1.7 added failed-attempt lockout to the twoFactor plugin and
-- now validates the database schema on startup: with these two columns
-- missing, EVERY request that touches auth fails with
-- "Database schema mismatch ... twoFactor.failedVerificationCount,
-- twoFactor.lockedUntil". Same class of drift as 0256 / 0257 — the Better
-- Auth-managed tables are not owned by the migration files.
--
-- Confirmed against better-auth 1.7.14 plugins/two-factor/schema:
--   • failedVerificationCount — number, defaultValue 0, incremented on a bad
--                               TOTP/OTP code, reset to 0 on success.
--   • lockedUntil             — date, nullable; set when the failure count
--                               reaches the configured maximum.
--
-- Must be applied to staging and prod D1 BEFORE the 1.7 worker is deployed.

ALTER TABLE "twoFactor" ADD COLUMN failedVerificationCount INTEGER DEFAULT 0;
ALTER TABLE "twoFactor" ADD COLUMN lockedUntil TEXT;
