---
description: The SC loot map pipeline — extract_all.py extraction steps, build_loot_map.py phases, output format, and R2 upload.
tags: [loot-map, pipeline, extraction, datacore, python, r2]
audience: { human: 30, agent: 70 }
purpose: { reference: 60, flow: 30, research: 10 }
---

# Loot Map Pipeline

## Overview

The loot map pipeline converts raw Star Citizen DataCore records into `loot_map.json` — a 5,218-item catalogue linking every lootable item to its containers, NPCs, shops, corpses, and contract rewards.

**Two scripts:** `extract_all.py` prepares the raw files; `build_loot_map.py` assembles the loot map.

---

## File Layout

```
E:\SC Bridge\Data p4k\                  (Windows path; /mnt/e/... in WSL)
├── extract_all.py                       Extraction pipeline
├── build_loot_map.py                    Loot map builder
├── run_pipeline.ps1                     Patch-day automation (PowerShell)
├── run_pipeline.sh                      Patch-day automation (Bash/WSL)
├── upload_to_r2.py                      R2 upload
└── 4.6.0-live.11303722\
    ├── Data.p4k                         Source archive (144 GB)
    ├── DataCore\                        55K+ JSON records (from dcb-extract)
    │   └── libs/foundry/records/        All entity records
    ├── Extracted\                       Raw + converted XMLs, shop data
    └── Resolved\
        ├── loot_map.json                Final output
        └── loot_map_summary.md          Human-readable summary
```

---

## Path Constants (`build_loot_map.py`)

```python
VERSION = "4.6.0-live.11303722"

# Resolves to /mnt/e/... on WSL, E:\... on Windows
DATACORE_DIR       = BASE / "DataCore" / "libs" / "foundry" / "records"
EXTRACTED_DIR      = BASE / "Extracted" / "Data"
OUTPUT_DIR         = BASE / "Resolved"
LOOT_DIR           = DATACORE_DIR / "lootgeneration"
SLOTPRESETS_DIR    = DATACORE_DIR / "harvestable" / "slotpresets"
ACTORS_DIR         = DATACORE_DIR / "actor" / "actors"
LOADOUTBUNDLES_DIR = DATACORE_DIR / "loadoutkits" / "pu_loadoutbundles"
MISSION_ENTITIES_DIR = DATACORE_DIR / "entities" / "scitem" / "mission_entities"
CONTRACT_GEN_DIR   = DATACORE_DIR / "contracts" / "contractgenerator"
CONTRACT_REWARDS_DIR = DATACORE_DIR / "contracts" / "contractrewards"
SHOP_DIR           = EXTRACTED_DIR / "Scripts" / "ShopInventories"
TAG_DB_PATH        = EXTRACTED_DIR / "Libs" / "Foundry" / "Records" / "TagDatabase" / "TagDatabase.TagDatabase.xml"
LOCALIZATION_PATH  = EXTRACTED_DIR / "Localization" / "english" / "global.ini"
```

---

## Stage 1: Extraction (`extract_all.py`)

Runs StarBreaker commands sequentially to prepare all input data.

| Step | Command | Filter / Args | Timeout |
|------|---------|---------------|---------|
| 1 | `dcb-extract` | `-p P4K -o DATACORE_DIR -t json` | 900s |
| 2 | `p4k-extract` | `-f "*ShopInventories*"` | 300s |
| 3 | `p4k-extract` | `-f "*Localization*"` | 300s |
| 4a | `p4k-extract` | `-f "*Loadouts*Character*"` | 600s |
| 4b | `cryxml-convert-all` | `-i LOADOUT_RAW -o LOADOUT_CONVERTED` | 600s |
| 5 | `p4k-extract` | `-f "*TagDatabase*"` | 120s |
| 6a | `p4k-extract` | `-f "*.xml"` | 1800s |
| 6b | `cryxml-convert-all` | `-i XML_RAW -o XML_CONVERTED` | 1800s |
| 7 | `p4k-extract` | `*.mtl` | — |
| 8 | `p4k-extract` | `*.entxml` | — |
| 9 | `p4k-extract` | `*.rmxml` | — |
| 10 | `p4k-extract` | `*.cdf`, `*.meshsetup`, `*.chrparams` | — |
| 11a | `p4k-extract` | `-f "*.dds*"` | opt-in only |
| 11b | `dds-merge-all` | merge split mipmaps | opt-in only |

Steps 11a/11b are opt-in — DDS textures are ~125 GB and not needed for loot map generation.

---

## Stage 2: Loot Map Build (`build_loot_map.py`)

### Phase Overview

| Phase | Function | What It Does |
|-------|----------|-------------|
| 1 | `phase1_build_indexes` | Parse TagDatabase XML → tag_index + tag_hierarchy; load localization from global.ini; single DataCore scan → uuid_index + entity_tags + entity_info |
| 2 | `phase2_resolve_loot_tables` | Parse legacy + V3 loot tables from `lootgeneration/loottables/`; resolve secondary choices and pool filters |
| 3 | `phase3_match_items` | Tag-match items to archetypes |
| 4 | `phase4_map_locations` | Link loot tables to containers |
| 5 | `phase5_resolve_npcs` | Resolve hostile-only NPC loadouts |
| 6 | `phase6_resolve_shops` | Map shop inventory items |
| 6b | `phase6b_resolve_corpses` | Resolve corpse loot table references |
| 6c | `phase6c_resolve_contracts` | Resolve contract item rewards |
| 7 | `phase7_calc_probabilities` | Calculate `perRoll` probabilities |
| 8 | `phase8_build_output` | Merge all data into final `loot_map.json` |

### V3 Loot Tables

27 tables using flat tag matching. Tag logic:
- `positiveTags` — AND logic (item must match all)
- `negativeTags` — NOT logic (item must not match any)

Both `LootArchetypeV3_RecordRef` (file reference) and `LootArchetypeV3` (inline) formats are handled.

### Hostile Faction UUIDs (hardcoded constants)

```python
HOSTILE_FACTION_UUIDS = {
    "b842eca9-0f28-491a-a26f-65e8685ad1dd",  # AI.Archetype.PU_enemy
    "3e53f851-efe7-4858-9be3-6b405536387a",  # AI.Faction.Hostile
    # also: Ninetails, XenoThreat, Pirates, Criminal, Gang,
    #        Pyro_Outlaw, Slavers, KaboosEnemy
}
```

---

## Output Format (`loot_map.json`)

```json
{
  "metadata": { ... },
  "items": {
    "<uuid>": {
      "name": "...",
      "recordName": "EntityClassDefinition.<class>",
      "type": "...",
      "subType": "...",
      "rarity": "Unknown",
      "containers": [{ "name": "...", "perRoll": 0.0 }],
      "npcs":       [{ "name": "...", "perRoll": 0.0 }],
      "shops":      [{ "name": "...", "perRoll": 0.0 }],
      "corpses":    [{ "name": "...", "perRoll": 0.0 }],
      "contracts":  [{ "name": "...", "perRoll": 0.0 }]
    }
  }
}
```

**Known bug:** `rarity` is always `"Unknown"`. `LootGeneration.Rarity` tags exist in TagDatabase but the tag matching logic does not resolve them — unresolved as of 4.6.0.

---

## D1 Import (`import_to_d1.py`)

| Constant | Value | Effect |
|----------|-------|--------|
| `MAX_JSON_ENTRIES` | 50 | Top N entries per source array (sorted by `perRoll` desc) |
| `BATCH_SIZE` | 200 | INSERT statements per output SQL file |

Output files: `batch_loot_map_001.sql`, `batch_loot_map_002.sql`, …

Apply:
```bash
npx wrangler d1 execute sc-companion --remote --file=batch_loot_map_NNN.sql
```

FK pattern used:
```sql
(SELECT id FROM vehicle_components WHERE uuid = '...')
```

---

## R2 Upload (`upload_to_r2.py`)

| Setting | Value |
|---------|-------|
| Bucket | `sc-data-unpack` |
| Key prefix | `4.6.0-live.11303722` (the VERSION) |
| Parallel workers | 32 |
| Default skips | `Data.p4k`, `Extracted/XML_Raw`, `Textures/raw` |

Required env vars: `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

Uses `boto3` — run under python3.10 in WSL.

---

## Statistics (SC 4.6.0)

| Metric | Value |
|--------|-------|
| Total items in loot_map | 5,218 |
| Items with FK matches | 4,829 (92.5%) |
| Unmatched | 389 (7.5%) |
| DataCore records processed | ~55,000 |
| Hostile faction UUIDs | 10 |
| V3 loot tables | 27 |
