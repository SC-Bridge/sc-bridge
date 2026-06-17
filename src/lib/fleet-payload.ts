import type { UserFleetEntry } from "./types";

export interface FleetPayloadOptions {
  /** Include personal fields (custom name, pledge cost/date). Chat mode = true. */
  includePersonal: boolean;
}

/**
 * Shape fleet entries into the payload sent to an LLM.
 *
 * Spec fields are always included. Personal fields (custom_name, pledge_cost,
 * pledge_date) are only included when `includePersonal` is true — the one-shot
 * Analysis strips them; the opted-in Chat mode includes them so the user can
 * refer to ships by their own names and ask budget questions.
 */
export function buildFleetPayload(
  entries: UserFleetEntry[],
  opts: FleetPayloadOptions,
): Record<string, unknown>[] {
  return entries.map((e) => {
    const row: Record<string, unknown> = {
      vehicle_name: e.vehicle_name,
      vehicle_slug: e.vehicle_slug,
      focus: e.focus,
      size_label: e.size_label,
      classification: e.classification,
      cargo: e.cargo,
      crew_min: e.crew_min,
      crew_max: e.crew_max,
      speed_scm: e.speed_scm,
      pledge_price: e.pledge_price,
      manufacturer_name: e.manufacturer_name,
      insurance_label: e.insurance_label,
      is_lifetime: e.is_lifetime,
      production_status: e.production_status,
      warbond: e.warbond,
    };
    if (opts.includePersonal) {
      row.custom_name = e.custom_name;
      row.pledge_cost = e.pledge_cost;
      row.pledge_date = e.pledge_date;
    }
    return row;
  });
}
