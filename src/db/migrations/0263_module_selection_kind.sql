-- Let user_module_selection also hold gadget selections (mining/salvage
-- consumable modules that slot into a tool head), not just bay/room modules.
-- 'bay' = a ship bay/room module (validated against vehicle_modules);
-- 'mining_gadget' / 'salvage_gadget' = a consumable in a head's gadget slot
-- (port_name holds the composite slot key '<headPortName>#<slotIndex>').
-- The UNIQUE(user_id, owner_kind, owner_id, port_name) still holds — gadget slot
-- keys never collide with bay port names. Existing rows backfill to 'bay'.
ALTER TABLE user_module_selection ADD COLUMN module_kind TEXT NOT NULL DEFAULT 'bay';
CREATE INDEX idx_ums_kind ON user_module_selection(owner_kind, owner_id, module_kind);
