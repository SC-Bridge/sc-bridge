-- 0275_drop_passkey_webauthnuserid
--
-- better-auth 1.7 validates the schema on startup and refuses to run when a
-- managed table has a NOT NULL column it never writes:
--
--   Database schema mismatch
--     Required columns Better Auth never writes
--       passkey.webauthnUserID
--     Inserts into passkey will fail.
--
-- `webauthnUserID TEXT NOT NULL` is a leftover from the pre-1.4 passkey plugin
-- shape the Better Auth tables were bootstrapped with (see 0257). No current
-- better-auth version writes it, nothing in SC Bridge reads it, and because it
-- is NOT NULL every passkey INSERT since the 1.4 -> 1.6 bump has failed on the
-- constraint (staging passkey has 0 rows). Dropping it fixes both the 1.7
-- startup check and passkey registration.
--
-- Plain column (no index, PK, FK or UNIQUE), so DROP COLUMN is safe.

ALTER TABLE "passkey" DROP COLUMN webauthnUserID;
