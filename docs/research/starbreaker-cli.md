---
description: StarBreaker CLI reference — commands, flags, renames, known issues, and usage patterns for SC data extraction.
tags: [starbreaker, extraction, datacore, p4k, cli, dotnet]
audience: { human: 30, agent: 70 }
purpose: { reference: 80, research: 20 }
---

# StarBreaker CLI Reference

## What It Is

StarBreaker is a .NET 10 CLI tool for extracting data from Star Citizen's `Data.p4k` archive. It handles DataCore record extraction, CryXML conversion, DDS texture merging, and raw file extraction.

**Requires:** .NET 10 SDK (`winget install Microsoft.DotNet.SDK.10`)

---

## Command Rename History

| Old Name | Current Name | Notes |
|----------|-------------|-------|
| `dcb-extract-all` | `dcb-extract` | Renamed; old sessions may reference the old name |

Always use the current name. Old command names will fail silently or with "unknown command" errors.

---

## Command Reference

### `dcb-extract`

Extracts DataCore records from `Data.p4k` or a standalone `.dcb` file.

```bash
dcb-extract -p Data.p4k -o output/ -t json
```

| Flag | Long | Description | Default |
|------|------|-------------|---------|
| `-p` | `--p4k` | Path to Data.p4k | — |
| `-d` | `--dcb` | Path to Game.dcb directly | — |
| `-o` | `--output` | Output directory | **required** |
| `-f` | `--filter` | Glob pattern filter | all |
| `-t` | `--text-format` | `json` or `xml` | `xml` |
| `-e` | `--extract-types` | Output folder for C# type schemas | — |
| `-n` | `--extract-enums` | Output folder for enum definitions | — |

Either `-p` or `-d` must be provided, not both.

**DCB path search order when using `-p`:** StarBreaker tries `Data\Game2.dcb` first, then `Data\Game.dcb` (hardcoded in `DataCoreUtils.KnownPaths`). SC 4.0+ uses Game2.dcb — tools hardcoding the old path will fail.

---

### `cryxml-convert-all`

Batch-converts CryXML binary files to readable XML.

```bash
cryxml-convert-all -i input_dir/ -o output_dir/
```

| Flag | Long | Description | Default |
|------|------|-------------|---------|
| `-i` | `--input` | Input directory | **required** |
| `-o` | `--output` | Output directory | **required** |
| `-f` | `--filter` | File filter | `*.xml` |

**Critical:** Positional arguments do NOT work — `-i` and `-o` flags are mandatory. Processing is parallelized; per-file errors are printed but processing continues.

---

### `p4k-extract`

Extracts files from `Data.p4k` matching an optional filter.

```bash
p4k-extract -p Data.p4k -o output/ -f "*ShopInventories*"
```

| Flag | Long | Description |
|------|------|-------------|
| `-p` | `--p4k` | Path to Data.p4k — **required** |
| `-o` | `--output` | Output directory — **required** |
| `-f` | `--filter` | Glob pattern filter |

---

### `dds-merge-all`

Merges split DDS mipmap files (`*.dds.1` through `*.dds.8`) into complete DDS files.

```bash
dds-merge-all -i textures_raw/ -o textures_merged/
```

| Flag | Long | Description |
|------|------|-------------|
| `-i` | `--input` | Input directory — **required** |
| `-o` | `--output` | Output directory — **required** |

---

### `p4k-dump`

Lists files in `Data.p4k` without extracting (metadata only).

```bash
p4k-dump -p Data.p4k -o dump/ -t json
```

---

### `diff`

Full game data snapshot in one step: `p4k-dump` + `dcb-extract` + `proto-extract`.

```bash
diff -g game_folder/ -o output/
```

---

### `cryxml-convert`

Single-file CryXML conversion.

---

## Running StarBreaker

### Via `dotnet run` (no build required)

```bash
dotnet run --project /path/to/StarBreaker/src/StarBreaker.Cli -- dcb-extract \
  -p Data.p4k -o output/ -t json
```

In WSL, dotnet may be at `~/.dotnet/dotnet`.

### Via built binary

```bash
StarBreaker/src/StarBreaker.Cli/bin/Release/net10.0/StarBreaker.Cli dcb-extract ...
```

---

## Full Command List

```
chf-download        chf-export-all      chf-export-watch    chf-import-all
chf-import-watch    chf-process         chf-process-all     cryxml-convert
cryxml-convert-all  dcb-extract         dcb-generate        dds-merge
dds-merge-all       diff                p4k-dump            p4k-extract
proto-extract       proto-set-extract
```

---

## DataCore Path Note (SC 4.0+)

SC 4.0 switched from `Data/Game.dcb` to `Data/Game2.dcb`. StarBreaker searches for `Game2.dcb` first when given `-p`. Any external script that hardcodes `Game.dcb` will fail on 4.0+ game data — always use `-p Data.p4k` and let StarBreaker find the correct DCB.
