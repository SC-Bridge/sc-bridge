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

// Resolves a user's verified RSI handle from either verification path.
// Manual verification writes to `user_rsi_profile.verified_handle`; the
// browser extension writes to `user_rsi_profiles.rsi_handle` (plural).
// Manual takes precedence when both are present.
export async function resolveVerifiedHandle(
  db: D1Database,
  userID: string,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT
         (SELECT verified_handle FROM user_rsi_profile WHERE user_id = ?) AS manual_handle,
         (SELECT rsi_handle FROM user_rsi_profiles WHERE user_id = ?) AS ext_handle`,
    )
    .bind(userID, userID)
    .first<{ manual_handle: string | null; ext_handle: string | null }>();
  return row?.manual_handle || row?.ext_handle || null;
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

export interface PublicFleetShip {
  id: number;
  custom_name: string | null;
  org_visibility: string;
  vehicle_name: string;
  vehicle_slug: string;
  image_url: string | null;
  focus: string | null;
  size_label: string | null;
  cargo: number | null;
  crew_min: number | null;
  crew_max: number | null;
  speed_scm: number | null;
  classification: string | null;
  manufacturer_name: string | null;
  manufacturer_code: string | null;
  insurance_label: string | null;
  duration_months: number | null;
  is_lifetime: number | null;
  paint_name: string | null;
  paint_slug: string | null;
  paint_image_url: string | null;
  paint_image_url_medium: string | null;
  paint_image_url_small: string | null;
  production_status: string | null;
}

export interface PublicFleetPayload {
  handle: string;
  ships: PublicFleetShip[];
}

/**
 * The shared fleet page and the org roster are two distinct things:
 * `publicFleetShare` publishes the WHOLE fleet at /u/:handle/fleet, while
 * `user_fleet.org_visibility` only decides what an org's member list shows.
 * The org filter must never be applied here.
 */
export async function loadPublicFleet(
  db: D1Database,
  handle: string,
): Promise<PublicFleetPayload | null> {
  // Match the handle against EITHER verification path:
  //   - `user_rsi_profile.verified_handle` (manual citizen-page verification)
  //   - `user_rsi_profiles.rsi_handle` (browser extension sync)
  // Both count as "verified" per account.ts (`isManualVerified || isExtensionVerified`).
  // COALESCE prefers the manual handle for canonical-case display; ORDER BY
  // makes the pick deterministic when two accounts verify the same handle.
  const row = await db
    .prepare(
      `SELECT
         us.user_id,
         COALESCE(urp.verified_handle, urps.rsi_handle) AS verified_handle
       FROM user_settings us
       LEFT JOIN user_rsi_profile urp ON urp.user_id = us.user_id
       LEFT JOIN user_rsi_profiles urps ON urps.user_id = us.user_id
       WHERE us.key = 'publicFleetShare'
         AND us.value = 'true'
         AND (LOWER(urp.verified_handle) = LOWER(?) OR LOWER(urps.rsi_handle) = LOWER(?))
       ORDER BY (urp.verified_handle IS NOT NULL) DESC, us.user_id
       LIMIT 1`,
    )
    .bind(handle, handle)
    .first<{ user_id: string; verified_handle: string }>();

  if (!row) return null;

  const ships = await db
    .prepare(
      `SELECT ${PUBLIC_FLEET_SELECT}
       FROM user_fleet uf
       JOIN vehicles v ON v.id = uf.vehicle_id
       LEFT JOIN vehicles rv ON rv.id = v.replaced_by_vehicle_id
       LEFT JOIN manufacturers m ON m.id = v.manufacturer_id
       LEFT JOIN manufacturers rm ON rm.id = rv.manufacturer_id
       LEFT JOIN insurance_types it ON it.id = uf.insurance_type_id
       LEFT JOIN paints p ON p.id = uf.equipped_paint_id
       LEFT JOIN production_statuses ps ON ps.id = v.production_status_id
       LEFT JOIN production_statuses rps ON rps.id = rv.production_status_id
       WHERE uf.user_id = ?
       ORDER BY COALESCE(rv.name, v.name)`,
    )
    .bind(row.user_id)
    .all<PublicFleetShip>();

  return { handle: row.verified_handle, ships: ships.results };
}

// ── Non-JS rendering of /u/:handle/fleet ────────────────────────────────
//
// The SPA shell is a bare index.html. AI web readers, link unfurlers and
// search engines never run the React app, so the worker writes the roster,
// <title> and Open Graph tags straight into the HTML. The roster goes
// inside #root, which React replaces on mount — JS users see the app,
// everyone else sees a readable page.

const PUBLIC_FLEET_PATH = /^\/u\/([A-Za-z0-9_-]{1,64})\/fleet\/?$/;

export function matchPublicFleetPath(pathname: string): string | null {
  const m = PUBLIC_FLEET_PATH.exec(pathname);
  return m ? m[1] : null;
}

export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shipCount(n: number): string {
  return `${n} ${n === 1 ? "ship" : "ships"}`;
}

function rosterMarkup(data: PublicFleetPayload): string {
  const rows = data.ships
    .map((ship) => {
      const detail = [ship.manufacturer_name, ship.focus, ship.size_label]
        .filter(Boolean)
        .map(escapeHtml)
        .join(" · ");
      const extras = [
        ship.custom_name ? `“${escapeHtml(ship.custom_name)}”` : null,
        ship.paint_name ? `Paint: ${escapeHtml(ship.paint_name)}` : null,
        ship.insurance_label ? escapeHtml(ship.insurance_label) : null,
        ship.production_status ? escapeHtml(ship.production_status) : null,
      ].filter(Boolean);
      return (
        `<li><strong>${escapeHtml(ship.vehicle_name)}</strong>` +
        (detail ? ` — ${detail}` : "") +
        (extras.length ? `<br>${extras.join(" · ")}` : "") +
        `</li>`
      );
    })
    .join("");

  return (
    `<main>` +
    `<h1>${escapeHtml(data.handle)}'s Fleet</h1>` +
    `<p>${shipCount(data.ships.length)} shared publicly on SC Bridge. ` +
    `Read-only public view — pledge prices and ship values are never shared.</p>` +
    (data.ships.length ? `<ul>${rows}</ul>` : `<p>This fleet has no ships yet.</p>`) +
    `</main>`
  );
}

function notFoundMarkup(handle: string): string {
  return (
    `<main><h1>No public fleet for "${escapeHtml(handle)}"</h1>` +
    `<p>This citizen hasn't shared a fleet, or their share link is private.</p></main>`
  );
}

export function renderPublicFleetShell(
  shell: Response,
  handle: string,
  data: PublicFleetPayload | null,
): Response {
  const title = data
    ? `${data.handle}'s Fleet — SC Bridge`
    : `No public fleet for ${handle} — SC Bridge`;
  const description = data ? `${shipCount(data.ships.length)} shared publicly on SC Bridge` : null;
  const body = data ? rosterMarkup(data) : notFoundMarkup(handle);

  const metaTags = description
    ? `<meta name="description" content="${escapeHtml(description)}">` +
      `<meta property="og:title" content="${escapeHtml(title)}">` +
      `<meta property="og:description" content="${escapeHtml(description)}">` +
      `<meta property="og:type" content="website">`
    : "";

  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(title);
      },
    })
    .on("head", {
      element(el) {
        if (metaTags) el.append(metaTags, { html: true });
      },
    })
    .on("#root", {
      element(el) {
        el.setInnerContent(body, { html: true });
      },
    })
    .transform(shell);
}
