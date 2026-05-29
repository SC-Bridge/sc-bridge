import { cacheSlug } from "./cache";

export function publicFleetCacheKey(handle: string): string {
  return `public-fleet:${cacheSlug(handle.toLowerCase())}`;
}

export async function purgePublicFleetCache(
  kv: KVNamespace | undefined,
  handle: string | null,
): Promise<void> {
  if (!kv || !handle) return;
  await kv.delete(publicFleetCacheKey(handle));
}

// Curated SELECT for the public fleet endpoint. Excludes all monetary
// fields per the share-link spec: no pledge_cost, no current_value_cents,
// no pledge_price (MSRP), no pledge_id/name/date/warbond/is_loaner,
// no original_vehicle_name (which leaks CCU history).
export const PUBLIC_FLEET_SELECT = `
  uf.id,
  uf.custom_name,
  uf.org_visibility,
  COALESCE(rv.name, v.name) as vehicle_name,
  COALESCE(rv.slug, v.slug) as vehicle_slug,
  COALESCE(rv.image_url, v.image_url) as image_url,
  COALESCE(rv.focus, v.focus) as focus,
  COALESCE(rv.size_label, v.size_label) as size_label,
  COALESCE(rv.cargo, v.cargo) as cargo,
  COALESCE(rv.crew_min, v.crew_min) as crew_min,
  COALESCE(rv.crew_max, v.crew_max) as crew_max,
  COALESCE(rv.speed_scm, v.speed_scm) as speed_scm,
  COALESCE(rv.classification, v.classification) as classification,
  COALESCE(rm.name, m.name) as manufacturer_name,
  COALESCE(rm.code, m.code) as manufacturer_code,
  it.label as insurance_label,
  it.duration_months,
  it.is_lifetime,
  p.name as paint_name,
  p.slug as paint_slug,
  p.image_url as paint_image_url,
  p.image_url_medium as paint_image_url_medium,
  p.image_url_small as paint_image_url_small,
  COALESCE(rps.key, ps.key) as production_status
`;
