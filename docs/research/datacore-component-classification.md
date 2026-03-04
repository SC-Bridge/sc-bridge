---
description: How SC ship component class (Civilian/Military/Industrial/Stealth/Competition) is determined — investigation findings, corrected mappings, and per-component extraction approach.
tags: [datacore, components, classification, manufacturers, ship-loadout]
audience: { human: 40, agent: 60 }
purpose: { research: 50, reference: 30, findings: 20 }
---

# DataCore Component Classification

## Finding

**Component class IS available in DataCore** — embedded in localization description text as a structured `Class: <value>` header line. This is more accurate than manufacturer-based derivation because some manufacturers produce components across multiple classes.

Previous approach (manufacturer→class mapping via migration 0031) had **5 incorrect mappings** and couldn't handle multi-class manufacturers.

---

## The Two Sources of Class Data

### 1. Component Description Text (Primary — per-component)

Every component's localization description contains a structured header:

```
Item Type: Cooler
Manufacturer: ACOM
Size: 1
Grade: C
Class: Competition

Descriptive text follows...
```

Parseable via `Class:\s*(\w+)` regex. Coverage: **266/296 (90%)** purchasable components. The 30 missing are placeholders or capital ship bespoke items.

Extracted by: `scbridge/tools/scripts/ship_components_core/extract.py`
Stored in: `vehicle_components.class` (added in migration 0045)

### 2. Manufacturer Identity (Fallback)

Stored in `manufacturers.class`. Used as fallback for components without description-based class. This mapping was:
- Originally applied in migration 0031
- Lost when `manufacturers` table was rebuilt in migration 0037
- Repopulated with corrected values in migration 0045

---

## Corrected Manufacturer → Class Mapping

### Changes from Original 0031 Mapping

| Code | Original (0031) | Corrected (0045) | Evidence |
|------|-----------------|-------------------|----------|
| ACAS | Civilian | **Competition** | Description text on 4 QDs |
| BEH | Military | **Civilian** | Description text on 11 shields |
| WCPR | Industrial | **Civilian** | Description text on 14 coolers |
| YORM | Industrial | **Competition** | Description text on 7 shields |
| BANU | NULL | **Military** | Description text on 2 shields |

### Multi-Class Manufacturers

Some manufacturers make components of different classes. The per-component `class` column handles these; the manufacturer gets its primary class.

| Code | Primary Class | Exceptions |
|------|--------------|------------|
| AEGS | Military (19) | Industrial (2) — bespoke Reclaimer cooler + shield |
| ORIG | Civilian (3) | Industrial (1) — bespoke 890 Jump shield |

### Full Mapping (as applied in migration 0045)

| Code | Manufacturer | Class |
|------|-------------|-------|
| ACOM | Amon & Reese Co. | Competition |
| ACAS | Anvil Aerospace | Competition |
| YORM | Yormundir | Competition |
| AEG | Aegis Dynamics | Military |
| AMRS | Amon & Reese | Military |
| GODI | Greycat Industrial | Military |
| WETK | Wei-Tek | Military |
| BANU | Banu | Military |
| ASAS | Talon Defense | Stealth |
| RACO | RAMP Corporation | Stealth |
| TYDT | TDynamic | Stealth |
| BEH | Behring | Civilian |
| WCPR | WillsOps Systems | Civilian |
| LPLT | Lightning Power Ltd. | Civilian |
| ARCC | Rocktenon | Civilian |
| JSPN | Joker Engineering | Civilian |
| ORIG | Origin Jumpworks | Civilian |
| RSI | Roberts Space Industries | Civilian |
| SECO | Sakura Sun | Civilian |
| TARS | Talon Armaments | Civilian |
| SASU | Sasu Inc. | Civilian |
| BASL | Behring Applied Science | Industrial |
| JUST | Klaus & Werner | Industrial |

---

## Implementation

### Database

- **Migration 0045**: Added `class TEXT` column to `vehicle_components`, repopulated `manufacturers.class`
- **Query**: `getShipLoadout()` in `queries.ts` uses `COALESCE(vc.class, m.class, child.class, child.manufacturer_class)` — prefers per-component class, falls back to manufacturer class

### Extraction

- **Script**: `scbridge/tools/scripts/ship_components_core/extract.py`
- **Helper**: `scbridge/tools/scripts/lib/datacore.py` — `extract_class_from_description()`
- **Process**: Walks DataCore component JSON → resolves localization description → regex extracts class → generates UPDATE SQL

### Frontend

Displayed in `ShipDetail.jsx` `LoadoutTab` as the "Class" column (lines 276-278, 302-304).

---

## AEG vs AEGS Discrepancy

DataCore loot files use `aegs` as the manufacturer code for Aegis Dynamics.
The D1 `manufacturers` table uses `AEG` (from the SC Wiki sync).
These are the same manufacturer — `AEG` in DB = `AEGS` in DataCore loot files.

---

## Classes

| Class | Description |
|-------|-------------|
| Civilian | Standard consumer-grade components |
| Military | High-performance military-spec components |
| Industrial | Heavy-duty industrial applications |
| Stealth | Low-emission, signature-reduced |
| Competition | Racing/performance-tuned |
