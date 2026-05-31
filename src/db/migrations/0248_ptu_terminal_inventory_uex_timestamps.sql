-- 0248_ptu_terminal_inventory_uex_timestamps.sql
--
-- Mirror migration 0247 onto the PTU shadow table. ptu_terminal_inventory
-- needs the same uex_date_modified + uex_date_added columns so that
-- getLootByUuid (and any other code that uses `t("terminal_inventory")`
-- with isPTU=true) selects through the same schema. Without this, PTU
-- channel reads error with `no such column: ti.uex_date_modified`.

ALTER TABLE ptu_terminal_inventory ADD COLUMN uex_date_modified INTEGER;
ALTER TABLE ptu_terminal_inventory ADD COLUMN uex_date_added INTEGER;

CREATE INDEX IF NOT EXISTS ptu_idx_terminal_inventory_uex_modified
  ON ptu_terminal_inventory(uex_date_modified)
  WHERE uex_date_modified IS NOT NULL;
