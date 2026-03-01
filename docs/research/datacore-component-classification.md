---
description: How SC ship component class (Civilian/Military/Industrial/Stealth/Competition) is determined from DataCore data — investigation findings and manufacturer mapping.
tags: [datacore, components, classification, manufacturers, ship-loadout]
audience: { human: 40, agent: 60 }
purpose: { research: 50, reference: 30, findings: 20 }
---

# DataCore Component Classification

## Finding

**Component class is NOT stored in DataCore component JSON files.** It is determined entirely by manufacturer identity, and the ground-truth mapping is encoded in DataCore loot harvestable filenames.

---

## Investigation

### What Was Checked (All Negative)

| Field / Location | Expected | Actual |
|-----------------|----------|--------|
| `AttachDef.SubType` in component JSON | class value | `"UNDEFINED"` for all coolers, shields, power plants, QDs |
| `AttachDef.DisplayType` | class value | generic type string |
| Tag database hierarchy under `Ship/Components` | class node | Only: Powerplant, QuantumDrive, Cooler, Sizes (0–4), Grade (A/B/C/D), Fuse, FlightBlade |
| `SCItemPurchasableParams` | any class field | not present |
| Localization strings in component JSON | class name | absent |
| Manufacturer JSON (`scitemmanufacturer.*.json`) | class field | only: Code, Name, Logo reference |

### The Actual Source

DataCore ships/utility harvestable loot files use a naming convention that encodes class directly:

```
loot_{type}_{size}_{grade}_{mfr}_{name}_{class}.json
```

**Examples:**
```
loot_cooler_s2_gradeb_acom_absolutezero_competition.json    → ACOM = Competition
loot_cooler_s2_gradeb_asas_shadowcooler_stealth.json        → ASAS = Stealth
loot_powerplant_s1_gradeb_amrs_dynaflux_military.json       → AMRS = Military
loot_shield_s1_gradeb_aegs_vanguard_military.json           → AEGS = Military
loot_cooler_s1_gradea_raco_snowpack_stealth.json            → RACO = Stealth
loot_cooler_s2_gradec_wetk_heatsink_military.json           → WETK = Military
loot_quantumdrive_s2_gradeb_tydt_strider_stealth.json       → TYDT = Stealth
```

These files live at:
```
DataCore/libs/foundry/records/entities/scitem/ships/loot/
```

---

## Manufacturer → Class Mapping

### Ground Truth (from loot file naming — most reliable)

| Code | Manufacturer | Class | Evidence |
|------|-------------|-------|----------|
| ACOM | Amon & Reese Co. | Competition | loot filenames |
| AEGS | Aegis Dynamics | Military | loot filenames (note: DB uses `AEG`) |
| AMRS | Amon & Reese | Military | loot filenames (**not** Civilian — surprising) |
| ASAS | Talon Defense | Stealth | loot filenames |
| GODI | Greycat Industrial | Military | loot filenames |
| RACO | RAMP Corporation | Stealth | loot filenames (**not** Industrial — surprising) |
| SASU | Sasu Inc. | Civilian | loot filenames |
| TYDT | TDynamic | Stealth | loot filenames |
| WETK | Wei-Tek | Military | loot filenames |

### User-Confirmed

| Code | Manufacturer | Class | Evidence |
|------|-------------|-------|----------|
| LPLT | Lightning Power Ltd. | Civilian | user example |
| BASL | Behring Applied Science | Industrial | user example |

### SC Community Knowledge (manufacturer identity/lore)

| Code | Manufacturer | Class |
|------|-------------|-------|
| BEH | Behring | Military |
| ACAS | Anvil Aerospace | Civilian |
| ARCC | Rocktenon | Civilian |
| JSPN | Joker Engineering | Civilian |
| ORIG | Origin Jumpworks | Civilian |
| RSI | Roberts Space Industries | Civilian |
| SECO | Sakura Sun | Civilian |
| TARS | Talon Armaments | Civilian |
| JUST | Klaus & Werner | Industrial |
| WCPR | WillsOps Systems | Industrial |
| YORM | Yormundir | Industrial |
| BANU | Banu | NULL (alien — no human class designation) |

### Key Surprises

- **AMRS (Amon & Reese) = Military**, not Civilian. Despite a civilian-sounding name.
- **ACOM = Competition**, not Civilian or Military.
- **RACO (RAMP Corporation) = Stealth**, not Industrial as might be assumed.

---

## AEG vs AEGS Discrepancy

DataCore loot files use `aegs` as the manufacturer code for Aegis Dynamics.
The D1 `manufacturers` table uses `AEG` (from the SC Wiki sync).
These are the same manufacturer — `AEG` in DB = `AEGS` in DataCore loot files.

When adding future manufacturers from DataCore, verify against the existing `manufacturers.code` values.

---

## Implementation

Applied in **migration 0031** (`src/db/migrations/0031_manufacturer_class.sql`):
- Added `class TEXT` column to `manufacturers` table
- Populated 21 manufacturer codes across 5 class values

Surfaced via `getShipLoadout` in `queries.ts` as `component_class`, using the same COALESCE child-port fallback pattern as `manufacturer_name` to resolve through weapon mounts.

Displayed in `ShipDetail.jsx` `LoadoutTab` as the "Class" column.

---

## Classes

| Class | Description |
|-------|-------------|
| Civilian | Standard consumer-grade components |
| Military | High-performance military-spec components |
| Industrial | Heavy-duty industrial applications |
| Stealth | Low-emission, signature-reduced |
| Competition | Racing/performance-tuned |
