import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { setupTestDatabase, TEST_GAME_VERSION_ID } from "./apply-migrations";
import { seedVehicle, createTestUser, authHeaders } from "./helpers";

/**
 * Phase 3: loaner loadouts, loaner module selections and owned modules are
 * scoped to one RSI account. ?account=<id> picks it; absent means primary
 * (owned modules: the whole user); an id the user does not own is a 404.
 */
describe("Loadout settings per RSI account", () => {
  let vid: number;
  let portId: number;
  let compX: number;
  let compY: number;
  let token: string;
  let userId: string;
  let accA: number;
  let accB: number;
  let foreign: number;
  const PORT = "hardpoint_acct_module";

  const json = async () => ({ ...(await authHeaders(token)), "Content-Type": "application/json" });
  const del = async () => ({ ...(await authHeaders(token)), "Content-Length": "0" });
  const loaner = (q = "") => `http://localhost/api/loadout/loaner/${vid}${q}`;

  async function putLoadout(q: string, comp: number) {
    return SELF.fetch(loaner(q), {
      method: "PUT",
      headers: await json(),
      body: JSON.stringify({ overrides: [{ port_id: portId, component_id: comp }] }),
    });
  }
  async function getLoadout(q: string) {
    const res = await SELF.fetch(loaner(q), { headers: await authHeaders(token) });
    return { status: res.status, body: (await res.json()) as { overrides?: Array<{ component_id: number }> } };
  }
  const rowCount = async (extra = "") =>
    (await env.DB
      .prepare(`SELECT COUNT(*) AS c FROM user_loaner_loadout WHERE user_id = ? ${extra}`)
      .bind(userId)
      .first<{ c: number }>())!.c;
  const getModules = async (q: string) => {
    const r = await SELF.fetch(loaner(`/modules${q}`), { headers: await authHeaders(token) });
    return { status: r.status, body: (await r.json()) as { selections: Array<{ module_uuid: string }> } };
  };

  async function account(owner: string, handle: string, primary: number): Promise<number> {
    const row = await env.DB
      .prepare("INSERT INTO user_rsi_accounts (user_id, rsi_handle, is_primary, is_placeholder) VALUES (?, ?, ?, 0) RETURNING id")
      .bind(owner, handle, primary)
      .first<{ id: number }>();
    return row!.id;
  }

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
    vid = await seedVehicle(env.DB, { slug: "acct-loaner", name: "Acct Loaner" });
    for (const uuid of ["acct-x", "acct-y"]) {
      await env.DB
        .prepare(
          `INSERT INTO vehicle_components (uuid, name, slug, class_name, type, size, grade, game_version_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'PowerPlant', 2, 'A', ?, datetime('now'), datetime('now'))`,
        )
        .bind(uuid, uuid, uuid, uuid.replace("-", "_"), TEST_GAME_VERSION_ID)
        .run();
    }
    compX = (await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid = 'acct-x'").first<{ id: number }>())!.id;
    compY = (await env.DB.prepare("SELECT id FROM vehicle_components WHERE uuid = 'acct-y'").first<{ id: number }>())!.id;
    await env.DB
      .prepare(
        `INSERT INTO vehicle_ports (uuid, vehicle_id, name, size_min, size_max, port_type, game_version_id)
         VALUES ('acct-port', ?, 'hardpoint_power_1', 2, 2, 'power', ?)`,
      )
      .bind(vid, TEST_GAME_VERSION_ID)
      .run();
    portId = (await env.DB.prepare("SELECT id FROM vehicle_ports WHERE uuid = 'acct-port'").first<{ id: number }>())!.id;
    await env.DB.batch([
      env.DB
        .prepare(
          `INSERT INTO vehicle_modules (uuid, vehicle_id, port_name, class_name, display_name, size, is_default, has_loadout, game_version_id, data_source)
           VALUES ('acct-mod-base', ?, ?, 'acct_mod_base', 'Base', 3, 1, 0, ?, 'p4k')`,
        )
        .bind(vid, PORT, TEST_GAME_VERSION_ID),
      env.DB
        .prepare(
          `INSERT INTO vehicle_modules (uuid, vehicle_id, port_name, class_name, display_name, size, is_default, has_loadout, game_version_id, data_source)
           VALUES ('acct-mod-cargo', ?, ?, 'acct_mod_cargo', 'Cargo', 3, 0, 0, ?, 'p4k')`,
        )
        .bind(vid, PORT, TEST_GAME_VERSION_ID),
    ]);

    const user = await createTestUser(env.DB);
    token = user.sessionToken;
    userId = user.userId;
    accA = await account(userId, "AcctA", 1);
    accB = await account(userId, "AcctB", 0);
    const other = await createTestUser(env.DB);
    foreign = await account(other.userId, "Foreign", 1);
  });

  it("loaner loadouts are separate per account", async () => {
    expect((await putLoadout(`?account=${accA}`, compX)).status).toBe(200);
    expect((await putLoadout(`?account=${accB}`, compY)).status).toBe(200);
    expect((await getLoadout(`?account=${accA}`)).body.overrides!.map((o) => o.component_id)).toEqual([compX]);
    expect((await getLoadout(`?account=${accB}`)).body.overrides!.map((o) => o.component_id)).toEqual([compY]);
  });

  it("no account param uses the primary account", async () => {
    expect((await getLoadout("")).body.overrides!.map((o) => o.component_id)).toEqual([compX]);
    expect((await putLoadout("", compY)).status).toBe(200);
    const row = await env.DB
      .prepare("SELECT component_id FROM user_loaner_loadout WHERE user_id = ? AND rsi_account_id = ?")
      .bind(userId, accA)
      .first<{ component_id: number }>();
    expect(row!.component_id).toBe(compY);
    await putLoadout(`?account=${accA}`, compX);
  });

  it("rejects another user's account", async () => {
    const before = await rowCount();
    expect((await getLoadout(`?account=${foreign}`)).status).toBe(404);
    expect((await putLoadout(`?account=${foreign}`, compX)).status).toBe(404);
    const d1 = await SELF.fetch(loaner(`?account=${foreign}`), { method: "DELETE", headers: await del() });
    expect(d1.status).toBe(404);
    const d2 = await SELF.fetch(loaner(`/port/${portId}?account=${foreign}`), { method: "DELETE", headers: await del() });
    expect(d2.status).toBe(404);
    expect(await rowCount()).toBe(before);
    expect(await rowCount(`AND rsi_account_id = ${foreign}`)).toBe(0);
  });

  it("DELETE loaner/L?account=A leaves B's loadout", async () => {
    const res = await SELF.fetch(loaner(`?account=${accA}`), { method: "DELETE", headers: await del() });
    expect(res.status).toBe(200);
    expect((await getLoadout(`?account=${accA}`)).body.overrides).toEqual([]);
    expect((await getLoadout(`?account=${accB}`)).body.overrides!.map((o) => o.component_id)).toEqual([compY]);
  });

  it("DELETE loaner port resets only the given account", async () => {
    await putLoadout(`?account=${accA}`, compX);
    const res = await SELF.fetch(loaner(`/port/${portId}?account=${accA}`), { method: "DELETE", headers: await del() });
    expect(res.status).toBe(200);
    expect((await getLoadout(`?account=${accA}`)).body.overrides).toEqual([]);
    expect((await getLoadout(`?account=${accB}`)).body.overrides).toHaveLength(1);
  });

  it("loaner module selection is stored per account", async () => {
    const put = await SELF.fetch(loaner(`/modules?account=${accA}`), {
      method: "PUT",
      headers: await json(),
      body: JSON.stringify({ selections: [{ port_name: PORT, module_uuid: "acct-mod-cargo" }] }),
    });
    expect(put.status).toBe(200);
    expect((await getModules(`?account=${accA}`)).body.selections.map((s) => s.module_uuid)).toEqual(["acct-mod-cargo"]);
    expect((await getModules(`?account=${accB}`)).body.selections).toEqual([]);
    expect((await getModules(`?account=${foreign}`)).status).toBe(404);

    const rows = await env.DB
      .prepare("SELECT rsi_account_id FROM user_module_selection WHERE user_id = ? AND owner_kind = 'loaner' AND owner_id = ?")
      .bind(userId, vid)
      .all<{ rsi_account_id: number }>();
    expect(rows.results).toEqual([{ rsi_account_id: accA }]);

    const reset = await SELF.fetch(loaner(`/modules?account=${accB}`), { method: "DELETE", headers: await del() });
    expect(reset.status).toBe(200);
    expect((await getModules(`?account=${accA}`)).body.selections).toHaveLength(1);
  });

  it("owned modules count only the given account", async () => {
    await env.DB.prepare("INSERT INTO user_hangar_syncs (user_id, source) VALUES (?, 'extension')").bind(userId).run();
    const sync = await env.DB
      .prepare("SELECT id FROM user_hangar_syncs WHERE user_id = ? ORDER BY id DESC LIMIT 1")
      .bind(userId)
      .first<{ id: number }>();
    const pledge = await env.DB
      .prepare(
        `INSERT INTO user_pledges (user_id, sync_id, rsi_pledge_id, name, value, value_cents, currency, is_upgraded, is_reclaimable, rsi_account_id)
         VALUES (?, ?, 99001, 'Pledge', '$0', 0, 'USD', 0, 0, ?) RETURNING id`,
      )
      .bind(userId, sync!.id, accB)
      .first<{ id: number }>();
    await env.DB
      .prepare("INSERT INTO user_pledge_items (user_id, rsi_account_id, user_pledge_id, title, kind) VALUES (?, ?, ?, 'Cargo Module - Front', 'Component')")
      .bind(userId, accB, pledge!.id)
      .run();
    const owned = async (q: string) => {
      const r = await SELF.fetch(`http://localhost/api/loadout/acct-loaner/modules/owned${q}`, { headers: await authHeaders(token) });
      return { status: r.status, body: (await r.json()) as string[] };
    };
    expect((await owned(`?account=${accA}`)).body).toEqual([]);
    expect((await owned(`?account=${accB}`)).body).toEqual(["Cargo Module - Front"]);
    expect((await owned("")).body).toEqual(["Cargo Module - Front"]);
    expect((await owned(`?account=${foreign}`)).status).toBe(404);
  });
});
