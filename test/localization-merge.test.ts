import { describe, it, expect } from "vitest";
import {
  mergeGlobalIniBytes,
  BP_APPEND_SENTINEL,
  BP_PREPEND_SENTINEL,
} from "../src/lib/localization";

/**
 * Byte-level merge used by /api/localization/download. It must keep every line
 * it does not deliberately change bit-identical to CIG's file (values may be
 * non-ASCII and the file is ~10MB, so only keys are decoded).
 */
const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);
const merge = (src: string, over: Record<string, string>) =>
  dec(mergeGlobalIniBytes(enc(src), new Map(Object.entries(over))));

describe("mergeGlobalIniBytes", () => {
  it("replaces a matched key's value and leaves other lines untouched", () => {
    const out = merge("a_key=Original\nother_key=Keep Me\n", { a_key: "Replaced" });
    expect(out).toBe("a_key=Replaced\nother_key=Keep Me\n");
  });

  it("matches keys case-insensitively but preserves the file's original casing", () => {
    const out = merge("item_NameCooler=FullStop\n", { "item_namecooler": "Tagged" });
    expect(out).toBe("item_NameCooler=Tagged\n");
  });

  it("APPEND keeps the base value and adds text after it", () => {
    const out = merge("k=Spark-G\n", { k: `${BP_APPEND_SENTINEL} [CS1]` });
    expect(out).toBe("k=Spark-G [CS1]\n");
  });

  it("PREPEND keeps the base value and adds text before it", () => {
    const out = merge("k=Spark-G\n", { k: `${BP_PREPEND_SENTINEL}[CS1] ` });
    expect(out).toBe("k=[CS1] Spark-G\n");
  });

  it("preserves CRLF line endings when wrapping", () => {
    const out = merge("k=Spark-G\r\n", { k: `${BP_PREPEND_SENTINEL}[CS1] ` });
    expect(out).toBe("k=[CS1] Spark-G\r\n");
  });

  it("leaves a non-matching line's bytes completely untouched", () => {
    const src = "; a comment\nno_equals_here\nkept=Ünïcodé Vàlue\n";
    expect(merge(src, { absent: "x" })).toBe(src);
  });

  it("does not corrupt a non-ASCII base value when wrapping it", () => {
    const out = merge("k=Ünïcodé\n", { k: `${BP_APPEND_SENTINEL} [S1]` });
    expect(out).toBe("k=Ünïcodé [S1]\n");
  });

  it("handles a final line with no trailing newline", () => {
    expect(merge("k=Val", { k: "New" })).toBe("k=New");
  });

  it("skips the UTF-8 BOM when matching the first key", () => {
    const out = merge("﻿first_key=Val\n", { first_key: "New" });
    expect(out).toContain("first_key=New");
  });
});
