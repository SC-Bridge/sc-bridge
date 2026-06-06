-- 0256_twofactor_verified
--
-- better-auth 1.6 added a `verified` field to the twoFactor table.
-- Without it, every TOTP verify attempt fails at the UPDATE path
-- (better-auth writes verified=true after a successful verify) with
-- "no such column: verified" even when the user enters the correct code.
--
-- Default 1 (true): all existing rows belong to users who successfully
-- set up TOTP before this upgrade — they are already verified.

ALTER TABLE "twoFactor" ADD COLUMN verified INTEGER DEFAULT 1;
