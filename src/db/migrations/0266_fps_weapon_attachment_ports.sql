-- 0266_fps_weapon_attachment_ports
--
-- Real attachment compatibility (#200, Plan B). Each weapon exposes attachment
-- ports; each port accepts a set of attachment sub-types within a size range and
-- gated by required tags. One row per (weapon, port, accepted sub-type) so a
-- simple equality join answers "does this attachment fit this port".
-- fps_attachments.attach_tags carries the attachment's AttachDef.Tags so the
-- RequiredPortTags ⊆ Tags rule can be checked.

CREATE TABLE fps_weapon_attachment_ports (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  weapon_id          INTEGER NOT NULL REFERENCES fps_weapons(id) ON DELETE CASCADE,
  port_name          TEXT    NOT NULL,
  port_type          TEXT    NOT NULL,   -- an accepted attachment SubType (Barrel, Magazine, IronSight, …)
  size_min           INTEGER NOT NULL DEFAULT 0,
  size_max           INTEGER NOT NULL DEFAULT 0,
  required_port_tags TEXT,
  game_version_id    INTEGER NOT NULL REFERENCES game_versions(id),
  UNIQUE(weapon_id, port_name, port_type, game_version_id)
);
CREATE INDEX idx_fwap_weapon ON fps_weapon_attachment_ports(weapon_id);
CREATE INDEX idx_fwap_port_type ON fps_weapon_attachment_ports(port_type);

ALTER TABLE fps_attachments ADD COLUMN attach_tags TEXT;
