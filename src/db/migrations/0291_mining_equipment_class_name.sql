-- Game class name on mining equipment, so each laser, module and gadget can be
-- linked to its item render (item_renders.item_key) without matching display names.
-- Filled by the tools v2 pipeline (enrich/mining_detail.py) on the next load.
-- The ptu_ copies get it too: the mining route reads them on the PTU channel.
ALTER TABLE mining_lasers ADD COLUMN class_name TEXT;
ALTER TABLE mining_modules ADD COLUMN class_name TEXT;
ALTER TABLE mining_gadgets ADD COLUMN class_name TEXT;
ALTER TABLE ptu_mining_lasers ADD COLUMN class_name TEXT;
ALTER TABLE ptu_mining_modules ADD COLUMN class_name TEXT;
ALTER TABLE ptu_mining_gadgets ADD COLUMN class_name TEXT;
