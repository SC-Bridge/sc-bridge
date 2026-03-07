# Session Journal

## Current Focus
Post-Epic 013 cleanup — committed final DetailPanel stats rendering

## Recent Changes
- `frontend/src/pages/LootDB/DetailPanel.jsx` — Added STAT_LABELS for utility/consumable/grenade stats (committed as aca302b)
- Extraction scripts updated (outside repo): `fps_clothing/extract.py`, `fps_utilities/extract.py`
- `run_pipeline.ps1` — Step 6 added for FPS item extraction (outside repo)

## Key Decisions
- GitHub Issues is the project tracker — Plane is deprecated, do not reference it
- Clothing stats only for items with `SCItemSuitArmorParams` (10 of 1803)
- Attachment/armour stats gaps are by-design (cosmetic grips, ship armour)

## Important Context
- FPS extraction pipeline step is built but untested on a real patch day
- Open issues: #36 (armor set pages), #31 (CF Images pipeline), #30 (org settings), #10 (paint browser)
