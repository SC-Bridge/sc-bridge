-- Follow-up to 0276: those five concept ships also carry the wrong maker in
-- their stored display name (e.g. "MISC Vulcan"), so the site still shows the
-- old maker after the manufacturer_id fix. Rename to the correct maker prefix,
-- in the style the other ships use ("Aegis Idris-P", "C.O. Nomad").
--
-- Each update only matches the exact old name, so it never overwrites a name
-- changed since. Fleet import matching strips these prefixes
-- (stripManufacturer in src/lib/fleet-import.ts), so matching is unaffected.

UPDATE vehicles SET name = 'Aegis Vulcan'      WHERE slug = 'vulcan'      AND uuid IS NULL AND name = 'MISC Vulcan';
UPDATE vehicles SET name = 'C.O. Pioneer'      WHERE slug = 'pioneer'     AND uuid IS NULL AND name = 'MISC Pioneer';
UPDATE vehicles SET name = 'RSI Arrastra'      WHERE slug = 'arrastra'    AND uuid IS NULL AND name = 'Argo Arrastra';
UPDATE vehicles SET name = 'MISC Expanse'      WHERE slug = 'expanse'     AND uuid IS NULL AND name = 'Drake Expanse';
UPDATE vehicles SET name = 'Anvil Legionnaire' WHERE slug = 'legionnaire' AND uuid IS NULL AND name = 'Drake Legionnaire';
