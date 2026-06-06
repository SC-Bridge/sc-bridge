-- 0257_better_auth_16_schema_parity
--
-- Brings the Better Auth-managed tables up to the schema better-auth 1.6 expects.
-- These tables are created by Better Auth at runtime / were bootstrapped
-- out-of-band during the NERDZ → SC Bridge migration, so they are NOT owned by
-- the migration files and drifted when the better-auth 1.4 → 1.6 bump (PR #170)
-- added new columns. Same class of bug as 0256 (twoFactor.verified).
--
-- Confirmed against better-auth 1.6.13 adapter.create payloads:
--   • passkey.aaguid       — verifyPasskeyRegistration inserts `aaguid`
--                            → new passkey registration was failing
--                            ("no such column: aaguid").
--   • invitation.createdAt — createInvitation inserts `createdAt`
--   • invitation.teamId    — createInvitation inserts `teamId` (NULL when teams
--                            are disabled, but still written)
--                            → org invites were failing.
--   • session.impersonatedBy — admin plugin writes it when impersonating
--                            → admin impersonation was failing.
--
-- All nullable (better-auth supplies values on insert; existing rows stay NULL).

ALTER TABLE "passkey" ADD COLUMN aaguid TEXT;
ALTER TABLE "invitation" ADD COLUMN createdAt TEXT;
ALTER TABLE "invitation" ADD COLUMN teamId TEXT;
ALTER TABLE "session" ADD COLUMN impersonatedBy TEXT;
