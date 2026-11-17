import type { UserFleetEntry } from "./types";

export interface FleetPayloadOptions {
  /** Include personal fields (custom name, pledge cost/date). Chat mode = true. */
  includePersonal: boolean;
  /**
   * RSI account id -> display name. Pass it only when the user has 2+ accounts;
   * each ship then carries `account`, so the model can tell hangars apart.
   */
  accountNames?: Map<number, string>;
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
    if (opts.accountNames) {
      const name = e.rsi_account_id == null ? undefined : opts.accountNames.get(e.rsi_account_id);
      if (name) row.account = name;
    }
    if (opts.includePersonal) {
      row.custom_name = e.custom_name;
      row.pledge_cost = e.pledge_cost;
      row.pledge_date = e.pledge_date;
    }
    return row;
  });
}

/** An entitled loaner as the chat payload carries it; `account` is added for 2+ accounts. */
export interface ChatLoaner {
  loaner: string;
  granted_by: string;
  rsi_account_id?: number;
  account?: string;
}

export interface ChatFleetPayload {
  ships: Array<Record<string, unknown> & { id: number; has_custom_loadout: boolean }>;
  loaners: ChatLoaner[];
}

/**
 * Chat-mode fleet payload: each ship gets its fleet-entry `id` (so the model can
 * pass it to the get_ship_loadout tool) and a `has_custom_loadout` flag (so it
 * knows which ships are worth a lookup), plus the user's entitled loaners.
 * With `accountNames` (2+ accounts) ships and loaners also carry their account.
 */
export function buildChatFleetPayload(
  entries: UserFleetEntry[],
  customLoadoutIds: Set<number>,
  loaners: ChatLoaner[],
  opts: { accountNames?: Map<number, string> } = {},
): ChatFleetPayload {
  const { accountNames } = opts;
  const ships = buildFleetPayload(entries, { includePersonal: true, accountNames }).map((row, i) => ({
    ...row,
    id: entries[i].id,
    has_custom_loadout: customLoadoutIds.has(entries[i].id),
  }));
  if (!accountNames) return { ships, loaners };
  return {
    ships,
    loaners: loaners.map((l) => {
      const account = l.rsi_account_id == null ? undefined : accountNames.get(l.rsi_account_id);
      return account ? { ...l, account } : l;
    }),
  };
}
