/** Tool-argument coercion. Models often send numbers as strings ("3"), so accept both. */

export function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function str(v: unknown, max = 100): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s.slice(0, max) : undefined;
}

export function bool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return undefined;
}

/** Clip free text (descriptions) so tool results stay small. */
export function clip(v: unknown, max = 300): string | null {
  if (typeof v !== "string" || !v) return null;
  return v.length > max ? `${v.slice(0, max - 1)}…` : v;
}

/** Search and list caps shared by the catalogue tools. */
export const SEARCH_CAP = 25;
export const CANDIDATE_CAP = 10;
