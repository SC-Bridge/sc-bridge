---
description: The DataCore extraction pipeline — how SC game data is extracted from Data.p4k and loaded into D1.
tags: [datacore, extraction, pipeline, python, scdatatools, d1]
audience: { human: 40, agent: 60 }
purpose: { research: 50, reference: 30, flow: 20 }
---

# DataCore Extraction Pipeline

## Overview

Star Citizen game data lives in `Data.p4k` (a ZIP-based archive). CIG's DataCore (DCB) is embedded inside — ~55,000 JSON records covering every in-game item, ship, component, and entity. The extraction pipeline turns that raw data into the D1 database that powers SC Bridge.

**Key rule:** Never use `python3.14` for any p4k work. Use **`python3.10`** only — the ZIP64 bug fix is applied at `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py:308-313`.

---

## Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **scdatatools** | Python library for reading Data.p4k | Use python3.10 only |
| **StarBreaker CLI** | .NET 10 tool for extracting DataCore | `dcb-extract`, `p4k-extract`, `cryxml-convert-all` |
| **DataCore** | Extracted JSON records | 55k+ files at `DataCore/libs/foundry/records/` |

**scdatatools ZIP64 bug:** The stock library fails on large p4k files. Fix in place at `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py:308-313`. This must be reapplied after any scdatatools upgrade.

**StarBreaker command rename:** `dcb-extract-all` was renamed to `dcb-extract` in the current version. `cryxml-convert-all` requires `-i`/`-o` flags (not positional args).

---

## P4K Directory Layout (After Extraction)

```
4.6.0-live.11303722/
├── DataCore/
│   └── libs/foundry/records/
│       ├── entities/
│       │   ├── scitem/
│       │   │   ├── ships/           ← coolers, shields, powerplants, weapons, missiles
│       │   │   ├── weapons/         ← fps_weapons, weapon_modifier (attachments)
│       │   │   ├── characters/
│       │   │   │   └── human/
│       │   │   │       ├── armor/pu_armor/   ← fps_armour
│       │   │   │       ├── starwear/helmet/  ← fps_helmets
│       │   │   │       ├── pu_clothing/      ← fps_clothing
│       │   │   │       └── pu_bespoke/       ← fps_clothing (bespoke items)
│       │   │   └── carryables/
│       │   │       ├── 1h/          ← consumables, harvestables, props
│       │   │       └── 2h/          ← harvestables (2-handed), props
│       │   └── spaceships/          ← ship entity definitions + default loadouts
│       ├── scitemmanufacturer/       ← manufacturer JSON records
│       ├── contracts/
│       │   ├── contractgenerator/   ← mission reward contracts
│       │   └── contractrewards/     ← contract reward definitions
│       └── tagdatabase/             ← item tag hierarchy
├── Extracted/
│   ├── Data/
│   │   ├── global.ini               ← localization strings (latin-1)
│   │   └── Scripts/ShopInventory/   ← shop item lists (for auec prices)
│   └── libs/foundry/records/
│       └── contracts/               ← contract reward files
└── Resolved/
    └── loot_map.json               ← final loot map output (5,218 items)
```

---

## DataCore JSON Record Structure

Every DataCore entity follows this pattern:
```json
{
  "_RecordId_": "uuid-here",
  "_RecordName_": "POWR_AEGS_S01_Regulus_SCItem",
  "_RecordValue_": {
    "Components": {
      "SAttachableComponentParams": {
        "AttachDef": {
          "Type": "PowerPlant",
          "SubType": "UNDEFINED",
          "Size": 1,
          "Grade": 3,
          "Manufacturer": "@path/to/scitemmanufacturer.aegs.json",
          "Localization": {
            "Name": "@localization_key",
            "Description": "@localization_key"
          },
          "Tags": ["uuid1", "uuid2", "uuid3"]
        }
      },
      "SCItemPurchasableParams": { ... }  ← present only if purchasable in-game shops
    }
  }
}
```

**Key fields:**
- `_RecordId_` → `uuid` column in D1 tables
- `_RecordName_` → `class_name` column (with prefix stripped)
- `AttachDef.Type` → item category (WeaponGun, Cooler, Shield, PowerPlant…)
- `AttachDef.SubType` → subcategory — **always "UNDEFINED" for ship components**
- `AttachDef.Grade` → 1→A, 2→B, 3→C, 4→D
- `Manufacturer` → file URI reference to `scitemmanufacturer.*.json`

---

## Shared Library (`lib/datacore.py`)

All scripts import from `/home/gavin/scbridge/tools/scripts/lib/datacore.py`.

| Function | Purpose |
|----------|---------|
| `load_localization(p4k_path)` | Reads `Data/global.ini` (latin-1 encoded), returns `{key: value}` dict |
| `localize(loc, key)` | Resolves `@key` to display string, None if missing |
| `load_manufacturer_map(p4k_path)` | Reads all `scitemmanufacturer/*.json`, returns `{uuid: code}` |
| `manufacturer_code_from_ref(ref, mfr_map)` | Resolves file URI → manufacturer code |
| `is_purchasable(data)` | Returns True if `SCItemPurchasableParams` component present |
| `get_attach_def(data)` | Navigates `_RecordValue_.Components.SAttachableComponentParams.AttachDef` |
| `get_component(data, name)` | Gets named component from `_RecordValue_.Components` |
| `grade_letter(n)` | Maps 1→A, 2→B, 3→C, 4→D |
| `nullable_str(v)` | SQL-safe string quoting or NULL |
| `nullable_num(v)` | SQL-safe number or NULL |
| `slug_from_class_name(name)` | Lowercases and replaces underscores with hyphens |
| `strip_record_prefix(name)` | Removes `POWR_`/`WEAP_` DataCore prefixes |
| `is_placeholder_name(name)` | Detects @loc keys and template names |

---

## Extraction Scripts

All scripts at `/home/gavin/scbridge/tools/scripts/`. Each outputs a `.sql` file applied via `wrangler d1 execute sc-companion --remote --file=<output>`.

### Stage 1 — Reference Data

#### `manufacturers/`
Populates the `manufacturers` table.

#### `ship_production_status/`
Determines flight_ready/in_production/in_concept from DataCore evidence.

Priority: (1) entity file exists → `flight_ready`, (2) asset reference found → `in_production`, (3) neither → `in_concept`

#### `auec_prices/`
Extracts in-game aUEC ship prices from shop inventory files in `Data.p4k`.

**Requires scdatatools** (python3.10 with ZIP64 fix). Uses `uuid_index.json` for GUID resolution. Has a `SLUG_OVERRIDES` map for ship slug mismatches.

#### `acquisition_types/`
Extracts acquisition method from `thecollector.json` and `cz_rewardterminal.json`.

Output values: `ingame_shop`, `ingame_quest`, `ingame_cz`, NULL. Uses regex to match entity names.

---

### Stage 2 — Ship Components

All output to `vehicle_components` with `stats_json`.

#### `ship_components_core/`
Source: `DataCore/entities/scitem/ships/` — cooler, shield, powerplant, quantum_drive dirs

Stats extracted per type:
- PowerPlant: `power_output`, `power_to_em`
- Cooler: `cooling_rate`, `suppression_ir_factor`
- Shield: `max_shield_health`, `regen_rate`, `max_shield_regen`
- QuantumDrive: `quantum_speed`, `fuel_requirement`, `spool_up_time`

#### `ship_weapons/`
Source: `DataCore/entities/scitem/ships/weapons/`

Types: WeaponGun, WeaponLaser, WeaponBallistic

Stats: `rounds_per_minute` (max across fire actions), `fire_modes` (Single/Burst/Auto detected from action type), `ammo_capacity`, `power_draw`

#### `ship_missiles/`
Source: `DataCore/entities/scitem/ships/missile_racks/`

Types: MissileLauncher, MissileRack

Stats: `num_missiles`, `port_count`, `port_size`, `tags`

#### `ship_misc/`
Source: 9 directories — batteries, computers, radar, scanners, qed, countermeasures, fuel_intakes, fuel_tanks, jump_drive

Stats vary by type: `power_draw`, `thermal_output`, `capacity`, `radar_range`, `qed_jammer_strength`, `ammo_count`

#### `ship_mining/`
Source: `DataCore/entities/scitem/ships/utility/mining/miningarm/`

Type: MiningModifier (NOT mining arms). Populates `vehicle_components` for `loot_map` FK resolution.

#### `ship_salvage/`
Source: `DataCore/entities/scitem/ships/utility/salvage/`

Types: SalvageHead, SalvageModifier. Populates `vehicle_components` (9 rows).

---

### Stage 3 — FPS Gear

#### `fps_weapons/`
Source: `DataCore/entities/scitem/weapons/fps_weapons/`

Type filter: WeaponPersonal

Stats: `rounds_per_minute`, `fire_modes`, `burst_count`, `ammo_capacity`, `zoom_factor`

Fire action types: FireSingle→Single, FireBurst→Burst, FireRapid/FireCharged→Auto

#### `fps_armour/`
Source: `DataCore/entities/scitem/characters/human/armor/pu_armor/` (excludes `s42_armor`)

Types: Char_Armor_Arms/Torso/Helmet/Legs/Undersuit/Backpack/Core

Stats: `damage_resistance`, `temperature_resist_min/max`, `item_port_count`, `carry_capacity`

#### `fps_attachments/`
Source: `DataCore/entities/scitem/weapons/weapon_modifier/`

Stats: `zoom_factor` (from SCItemIronSightParams), `sound_modifier` (from SCItemMuzzleParams), `barrel_type` (from SCItemBarrelAttachParams)

#### `fps_utilities/`
Source: 4 dirs — consumables, fps_devices, throwable, mines

Deduplicates across directories using `seen_uuids` set.

Stats: `heal_amount`, `effect_duration`, `damage`, `blast_radius`, `fuse_time`, `device_type`

#### `fps_helmets/`
Source: `DataCore/entities/scitem/characters/human/starwear/helmet/`

SubType indicates weight: Light/Medium/Heavy

#### `fps_clothing/`
Source: `pu_clothing/` + `pu_bespoke/` (excludes `s42_clothing`)

**No purchasability filter** — includes loot-only items so `loot_map` FK matching achieves maximum coverage.

Slot extracted from type by stripping `Char_Clothing_` prefix.

---

### Stage 4 — Carryables

#### `consumables/`
Source: `DataCore/entities/scitem/carryables/1h/`

Filter: `AttachDef.Type` in `{Food, Drink}`. No purchasability filter.

`SubType = "UNDEFINED"` → stored as NULL.

#### `harvestables/`
Source: `DataCore/entities/scitem/carryables/1h/` + `2h/`

Includes tractor-beam-only items (e.g., Irradiated Apex Fang, TBO Yormandi Tongue).

#### `props/`
Source: `DataCore/entities/scitem/carryables/1h/` + `2h/`

Filter: `AttachDef.Type` starts with "Misc". Includes plushies, medals, artifacts, collectibles.

---

### Stage 5 — Ship Ports

#### `ship_ports/`
Source: `DataCore/libs/foundry/records/entities/spaceships/*.json`

Extracts the complete default loadout from `SEntityComponentDefaultLoadoutParams.loadout.entries`. Each entry maps a `vehicle_port.uuid` to an equipped component.

Generates deterministic UUIDs: `SHA1("{ship_uuid}:{port_name}")` formatted as UUID.

Recursion: handles nested ports (guns inside turret mounts, missiles inside racks) via `parent_port_id`.

**Skip logic:**
- Ships where `SEntityComponentDefaultLoadoutParams` is absent (AI variants, templates)
- Ports matching non-player prefixes: `hardpoint_landing`, `hardpoint_self_destruct`, `hardpoint_door_*`

---

### Stage 6 — Loot Map

#### `loot_map/`
Source: `Resolved/loot_map.json` (output of the SC loot pipeline)

The loot_map.json is produced separately by the `sc-loot-pipeline` — a multi-phase Python script that:
1. Reads DataCore loot generation rules (slot presets, loot tables)
2. Resolves container → loot table → item chains
3. Includes corpse loot (29 mission entity files in `mission_entities/`)
4. Includes contract rewards (`contracts/contractgenerator/`, `contracts/contractrewards/`)
5. Outputs `items[]` with `containers[]`, `npcs[]`, `shops[]`, `corpses[]`, `contracts[]` per item

The extract.py for loot_map reads this resolved JSON and generates FK-matching UPSERTs into D1.

**FK matching pattern for all 10 item tables:**
```sql
UPDATE loot_map SET x_id = (SELECT id FROM x WHERE uuid = loot_map.uuid)
WHERE EXISTS (SELECT 1 FROM x WHERE uuid = loot_map.uuid)
```

This correlated UPDATE pattern is required because D1's ON CONFLICT DO UPDATE with subquery-resolved values doesn't reliably propagate the FK. Always run the UPDATE after the batch UPSERT.

---

## Stats Migration

#### `stats_migration/`
Adds `stats_json` columns to FPS and vehicle component tables (these are out-of-band — not in migration files). Run this once per fresh database to enable stats storage.

---

## Common Run Pattern

```bash
source ~/.secrets

cd /home/gavin/scbridge/tools/scripts/{script_dir}

# Generate SQL
python3.10 extract.py --p4k-path "/mnt/e/SC Bridge/Data p4k/4.6.0-live.11303722"

# Apply to D1
source ~/.secrets && npx wrangler d1 execute sc-companion --remote --file=migration_{name}.sql
```

---

## Dependency Order

```
manufacturers
ship_production_status
auec_prices
acquisition_types
       ↓
ship_components_core
ship_weapons
ship_missiles
ship_misc
ship_mining
ship_salvage
fps_weapons
fps_armour
fps_attachments
fps_utilities
fps_helmets
fps_clothing
consumables
harvestables
props
       ↓
ship_ports         ← requires vehicles and vehicle_components
       ↓
loot_map           ← requires ALL item tables (FKs to all 10 tables)
```

`loot_map` must run last — it cross-references every other item table.
`ship_ports` requires vehicles to exist (looks up `vehicle_id` by UUID).

---

## Data Gaps (SC 4.6.0)

| Gap | Count | Notes |
|-----|-------|-------|
| NOITEM_Vehicle | 48 | Placeholder entries |
| No-type items | 47 | Missing Type field |
| UNDEFINED SubType | 39 | Catch-all category |
| Char_Skin_Color | 38 | Character cosmetics not in a table |
| Missile/Missile | 19 | Missiles not in vehicle_components |
| Char_Head_Hair | 19 | Hair not in any table |
| Eyewear | ~22 | Glasses/goggles not in any table |
| Char_Armor_Undersuit | 9 | Undersuits not yet extracted |

Total unmatched: 389/5,218 (7.5%). Coverage: 92.5%.
