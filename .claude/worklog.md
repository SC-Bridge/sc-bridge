# WORKLOG v1

@ACTIVE
# sid|registered|last_active|scope
c7e45d0f|2026-03-03T14:06+1300|2026-03-03T14:13+1300|stats_json extraction
2e01fb82|2026-03-03T13:47+1300|2026-03-03T13:56+1300|missile+eyewear loot FKs
4b622282|2026-03-03T13:22+1300|2026-03-03T13:22+1300|unset
2e16a9b4|2026-03-03T12:07+1300|2026-03-03T12:35+1300|loot unmatched items
985e21d3|2026-03-03T12:07+1300|2026-03-03T12:07+1300|unset
faf5b909|2026-03-03T11:35+1300|2026-03-03T11:35+1300|push paint extraction commits
e495048d|2026-03-03T11:35+1300|2026-03-03T11:35+1300|invite token signup system
b6129c05|2026-03-03T10:56+1300|2026-03-03T10:56+1300|unset
0b7dbfad|2026-03-03T10:45+1300|2026-03-03T10:45+1300|unset
af0da55c|2026-03-03T10:44+1300|2026-03-03T10:44+1300|unset
424aa96f|2026-03-03T10:07+1300|2026-03-03T10:12+1300|full audit + code fixes
# sid|registered|last_active|scope
c7e45d0f|2026-03-03T14:06+1300|2026-03-03T14:13+1300|stats_json extraction
2e01fb82|2026-03-03T13:47+1300|2026-03-03T13:56+1300|missile+eyewear loot FKs
4b622282|2026-03-03T13:22+1300|2026-03-03T13:22+1300|unset
2e16a9b4|2026-03-03T12:07+1300|2026-03-03T12:35+1300|loot unmatched items
985e21d3|2026-03-03T12:07+1300|2026-03-03T12:07+1300|unset
faf5b909|2026-03-03T11:35+1300|2026-03-03T11:35+1300|push paint extraction commits
e495048d|2026-03-03T11:35+1300|2026-03-03T11:35+1300|invite token signup system
b6129c05|2026-03-03T10:56+1300|2026-03-03T10:56+1300|unset
0b7dbfad|2026-03-03T10:45+1300|2026-03-03T10:45+1300|unset
af0da55c|2026-03-03T10:44+1300|2026-03-03T10:44+1300|unset
424aa96f|2026-03-03T10:07+1300|2026-03-03T10:12+1300|full audit + code fixes
@FILES
# sid|file_path
4b622282|src/lib/auth.ts
e495048d|src/db/migrations/0044_invite_tokens.sql
e495048d|src/index.ts
e495048d|src/routes/admin.ts
e495048d|frontend/src/pages/Register.jsx
e495048d|frontend/src/pages/Admin.jsx

@LOG
# timestamp|sid|op|detail
08:15+1300|1b6a23b8|SCO|POI plan complete — 7 tasks created
08:25+1300|1b6a23b8|MOD|frontend/src/pages/LootDB.jsx
08:35+1300|1b6a23b8|CMT|201ebdd fix(loot-detail): stacking/encoding/fire modes/stat order
08:40+1300|1b6a23b8|CMT|18f09be feat(loot): grouped container locations
08:51+1300|0f84d034|REG|started
09:10+1300|0f84d034|MOD|src/db/migrations/0041_fix_fk_references.sql
09:10+1300|0f84d034|CMT|b4298ed fix(db): broken FK refs from 0037
09:12+1300|e667d40d|REG|started
09:13+1300|c09b4dc2|REG|started
09:14+1300|c09b4dc2|SCO|orientation
09:15+1300|e667d40d|MOD|src/db/migrations/0042_vehicles_acquisition_source_name.sql
09:16+1300|e667d40d|CMT|d4280f3 fix(db): missing acquisition_source_name column
09:20+1300|e667d40d|CMT|2af8b58 fix(db): missing manufacturers.class column
09:43+1300|d846531a|REG|started
09:43+1300|c09b4dc2|SCO|github community setup
09:55+1300|c09b4dc2|CMT|725f6a9 feat(github): community infrastructure for beta
09:47+1300|cee1b559|REG|started
09:58+1300|c09b4dc2|CMT|dc228e0 docs(github): discussions opening posts
09:48+1300|cee1b559|SCO|full audit + code fixes
10:02+1300|c09b4dc2|CMT|2e52544 docs(github): revise discussions posts for actual categories
10:07+1300|424aa96f|REG|started
10:12+1300|424aa96f|CMT|bac3058 fix(account): GDPR loot export
10:12+1300|424aa96f|CMT|2dafa6b fix(loot): UGFs group/double-parse/escape
10:12+1300|424aa96f|PUSH|3e3d626..2dafa6b → main
10:44+1300|af0da55c|REG|started
10:45+1300|0b7dbfad|REG|started
10:56+1300|b6129c05|REG|started
10:57+1300|af0da55c|CMT|2e4466c fix(vehicles): paint variant guards
10:58+1300|af0da55c|CMT|fc293cd fix(sync): paint tree truncation
11:00+1300|af0da55c|CMT|eb03a38 refactor(sync): local paint extraction
11:35+1300|e495048d|REG|started
11:35+1300|faf5b909|REG|started
11:35+1300|e495048d|SCO|invite token signup system
11:36+1300|faf5b909|PUSH|fc293cd..eb03a38 → main — CI deploying
11:38+1300|e495048d|CMT|feat(auth): invite token signup system
12:07+1300|985e21d3|REG|started
12:35+1300|2e16a9b4|CLN|stale:1b6a23b8,1b6a23b8
12:35+1300|2e16a9b4|REG|started
12:35+1300|2e16a9b4|CMT|scbridge/tools: loot unmatched items fix (9c979ed)
13:22+1300|4b622282|CLN|stale:e667d40d,0f84d034,e667d40d,0f84d034
13:22+1300|4b622282|REG|started
13:28+1300|4b622282|CMT|67884db fix(auth): social sign-in existing users
13:47+1300|2e01fb82|CLN|stale:d846531a,c09b4dc2,d846531a,c09b4dc2
13:47+1300|2e01fb82|REG|started
13:56+1300|2e01fb82|MOD|queries.ts+LootDB+0045 migration
13:56+1300|2e01fb82|MOD|queries.ts+LootDB+0045 migration
13:58+1300|2e01fb82|CMT|cbb298c feat(loot): missile+eyewear FKs
14:00+1300|2e01fb82|CMT|chore: worklog+journal update
14:06+1300|c7e45d0f|CLN|stale:cee1b559,cee1b559
14:06+1300|c7e45d0f|REG|started
14:13+1300|c7e45d0f|CMT|411a303 feat(loot): stats_json helmets+attachments
14:14+1300|c7e45d0f|PUSH|6c66aff..411a303 → main — CI deploying
