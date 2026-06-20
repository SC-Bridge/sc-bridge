/**
 * Turn a raw vehicle-port name into a readable label.
 * e.g. "hardpoint_weapon_top_left_1" -> "Weapon Top Left 1".
 * Generic + robust across all port naming patterns.
 */
export function humanizePortName(raw: string | null | undefined): string {
  if (!raw) return "";
  const cleaned = String(raw).replace(/^hardpoint[_-]/i, "");
  return cleaned
    .split(/[_-]+/)
    .filter(Boolean)
    .map((t) => (/^\d+$/.test(t) ? t : t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()))
    .join(" ");
}
