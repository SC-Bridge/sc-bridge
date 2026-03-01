---
description: scdatatools library reference — Python version requirements, ZIP64 bug fix, known bugs across versions, and p4k.py internals.
tags: [scdatatools, python, p4k, zip64, extraction, bugs]
audience: { human: 30, agent: 70 }
purpose: { reference: 70, research: 30 }
---

# scdatatools Reference

## Critical: Use Python 3.10

**Never use Python 3.14 (or any version other than 3.10) for p4k work.**

scdatatools' CryXmlB parser does not work on Python 3.14. The ZIP64 fix (see below) is applied at a known line offset in the Python 3.10 installation. Pin to 3.10 for all extraction scripts.

```bash
python3.10 extract.py --p4k-path "..."
```

---

## Installation

```bash
python3.10 -m pip install scdatatools
```

Current version: **1.0.5** (devel branch)

---

## Known Bugs

### Bug 1: ZIP64 Central Directory Offset (Critical)

**Versions affected:** All versions without the manual fix applied
**Fix location:** `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py`, lines 308-313
**Must be reapplied after any scdatatools upgrade.**

**What fails:** `Data.p4k` exceeds 4GB and is a ZIP64 archive. Without this fix, `_RealGetContents()` computes `self.start_dir` incorrectly, causing `fp.seek()` to land at the wrong position. The central directory read fails and no files can be listed or extracted.

**The fix (line 308):**
```python
if endrec[zipfile._ECD_SIGNATURE] == zipfile.stringEndArchive64:
    # If Zip64 extension structures are present, account for them
    concat -= zipfile.sizeEndCentDir64 + zipfile.sizeEndCentDir64Locator

# self.start_dir:  Position of start of central directory
self.start_dir = offset_cd + concat
fp.seek(self.start_dir, 0)
data = io.BytesIO(fp.read(size_cd))
```

When the ZIP64 EOCD signature is detected, `concat` must be decremented by both `sizeEndCentDir64` and `sizeEndCentDir64Locator`. Without the subtraction, the offset is wrong for ZIP64 archives.

---

### Bug 2: `line_profiler` Debug Import Left in p4k.py (v1.0.5 devel)

**Versions affected:** v1.0.5 devel branch
**Symptom:** Blender addon crashes on startup with `ModuleNotFoundError: No module named 'line_profiler'`
**Cause:** `import line_profiler` at line 1 and `@line_profiler.profile` decorator at line 292 were left in from profiling work.
**Fix:** Remove the import and decorator. Committed upstream.

---

### Bug 3: Game2.dcb Path (v1.0.4)

**Versions affected:** v1.0.4
**Symptom:** DataCore extraction fails on SC 4.0+ data
**Cause:** Hardcoded `"Data/Game.dcb"` path; SC 4.0 switched to `"Data/Game2.dcb"`
**Fix in v1.0.5:** Uses `self.p4k.search("Data/Game*.dcb")` with numeric sort

---

### Bug 4: DataCore Assertion Failure with Game2.dcb (v1.0.4)

**Versions affected:** v1.0.4
**Symptom:** Assertion error when parsing Game2.dcb even after path fix
**Cause:** Structural incompatibility in DataCore parsing logic beyond just the path
**Fix:** Upgrade to v1.0.5+

---

## p4k.py Class Structure

| Class | Extends | Lines | Purpose |
|-------|---------|-------|---------|
| `P4KExtFile` | `zipfile.ZipExtFile` | 69–112 | Adds zstd decompression + AES decryption |
| `P4KInfo` | `zipfile.ZipInfo` | 114–199 | Custom encryption detection + ZIP64 support |
| `P4KFile` | `zipfile.ZipFile` | 203–221 | p4k archive class |
| `_RealGetContents()` | (method on P4KFile) | 292–380 | Reads central directory — contains the ZIP64 fix |

---

## Upgrade Procedure

When scdatatools is upgraded via pip, the ZIP64 fix must be reapplied manually:

1. `python3.10 -m pip install --upgrade scdatatools`
2. Open `/home/gavin/.local/lib/python3.10/site-packages/scdatatools/p4k.py`
3. Find `_RealGetContents()` (~line 292)
4. Locate the block that reads `self.start_dir = offset_cd + concat`
5. Add before it:
   ```python
   if endrec[zipfile._ECD_SIGNATURE] == zipfile.stringEndArchive64:
       concat -= zipfile.sizeEndCentDir64 + zipfile.sizeEndCentDir64Locator
   ```
6. Verify extraction works on a small filter: `p4k.getnames()[:5]`
