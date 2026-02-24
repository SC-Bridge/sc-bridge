/**
 * RSI citizen profile fetcher.
 *
 * Primary:  POST /api/spectrum/search/member/autocomplete — structured data.
 * Fallback: GET  /en/citizens/{handle}              — HTML scraping for org info.
 *
 * The rate-limit (one sync per 10 min per user) is enforced in the route layer.
 */

export interface RsiOrg {
  slug: string;
  name: string;
  is_main: boolean;
}

export interface RsiProfile {
  handle: string;
  display_name: string | null;
  citizen_record: string | null;
  enlisted_at: string | null;
  avatar_url: string | null;
  main_org_slug: string | null;
  orgs: RsiOrg[];
}

const RSI_BASE = "https://robertsspaceindustries.com";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Fetch an RSI citizen profile by handle.
 * Tries spectrum API first; always falls back to citizen-page scrape for org data.
 */
export async function fetchRsiProfile(handle: string): Promise<RsiProfile> {
  // Try the Spectrum API (faster, structured)
  let partial: Partial<RsiProfile> | null = null;
  try {
    partial = await fetchViaSpectrum(handle);
  } catch (err) {
    console.warn("[rsi] spectrum API failed:", err);
  }

  // Always scrape citizen page — org affiliations are not reliably in spectrum response
  let citizenData: Partial<RsiProfile> | null = null;
  try {
    citizenData = await fetchViaCitizenPage(handle);
  } catch (err) {
    console.warn("[rsi] citizen page scrape failed:", err);
  }

  // Merge: citizen page wins for org data; spectrum wins for avatar/record if richer
  const merged: RsiProfile = {
    handle: citizenData?.handle ?? partial?.handle ?? handle,
    display_name: partial?.display_name ?? citizenData?.display_name ?? null,
    citizen_record: citizenData?.citizen_record ?? partial?.citizen_record ?? null,
    enlisted_at: citizenData?.enlisted_at ?? partial?.enlisted_at ?? null,
    avatar_url: partial?.avatar_url ?? citizenData?.avatar_url ?? null,
    main_org_slug: citizenData?.main_org_slug ?? null,
    orgs: citizenData?.orgs ?? [],
  };

  if (!merged.handle) {
    throw new Error(`No data found for RSI handle: ${handle}`);
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Spectrum search API
// ---------------------------------------------------------------------------

interface SpectrumMember {
  id?: string;
  handle?: string;
  displayname?: string;
  avatar?: string;
  meta?: {
    citizen_record?: string;
    enlisted?: string;
  };
}

async function fetchViaSpectrum(handle: string): Promise<Partial<RsiProfile> | null> {
  const resp = await fetch(`${RSI_BASE}/api/spectrum/search/member/autocomplete`, {
    method: "POST",
    headers: {
      ...FETCH_HEADERS,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Rsi-Token": "anonymous",
    },
    body: JSON.stringify({ symbol: handle, community_id: "1" }),
  });

  if (!resp.ok) {
    console.warn(`[rsi] spectrum API returned ${resp.status}`);
    return null;
  }

  const data = (await resp.json()) as {
    success?: number;
    data?: { members?: SpectrumMember[] };
    members?: SpectrumMember[];
  };

  const members: SpectrumMember[] = data?.data?.members ?? data?.members ?? [];
  const member = members.find(
    (m) => m.handle?.toLowerCase() === handle.toLowerCase(),
  );

  if (!member) return null;

  return {
    handle: member.handle ?? handle,
    display_name: member.displayname ?? null,
    citizen_record: member.meta?.citizen_record ?? null,
    enlisted_at: member.meta?.enlisted ?? null,
    // RSI CDN avatars from spectrum are usually smaller — prefer CDN URL as-is
    avatar_url: member.avatar ?? null,
  };
}

// ---------------------------------------------------------------------------
// Citizen page HTML scraper
// ---------------------------------------------------------------------------

async function fetchViaCitizenPage(handle: string): Promise<Partial<RsiProfile> | null> {
  const url = `${RSI_BASE}/en/citizens/${encodeURIComponent(handle)}`;
  const resp = await fetch(url, { headers: FETCH_HEADERS });

  if (!resp.ok) {
    if (resp.status === 404) throw new Error(`Handle not found: ${handle}`);
    throw new Error(`Citizen page returned ${resp.status}`);
  }

  const html = await resp.text();

  // Check if we got redirected to a 404 or error page
  if (html.includes('class="page-not-found"') || html.includes("404")) {
    throw new Error(`Handle not found: ${handle}`);
  }

  return parseCitizenHtml(html, handle);
}

function parseCitizenHtml(html: string, handle: string): Partial<RsiProfile> {
  // ── Avatar ──────────────────────────────────────────────────────────────
  // Target: .profile.left-col > .inner > .thumb > img
  // That div holds the user's actual profile picture.
  // The .info section inside .profile.left-col contains game badge icons — avoid those.
  let avatar_url: string | null = null;
  const profileBlock = html.match(/class="profile left-col"[\s\S]{0,2000}?class="thumb"[\s\S]{0,300}?<img[^>]+src="([^"]+)"/);
  if (profileBlock) {
    const raw = profileBlock[1];
    avatar_url = raw.startsWith("/") ? `${RSI_BASE}${raw}` : raw;
  }

  // ── Community Moniker + Handle ───────────────────────────────────────────
  // .profile.left-col .info contains strong.value elements in order:
  //   [0] = Community Moniker (display name / vanity name)
  //   [1] = Handle (canonical SC handle)
  // Use indexOf+slice, capped at the main-org block, to avoid picking up
  // org-rank strong.value elements from the sibling right-col.
  let display_name: string | null = null;
  let parsedHandle = handle;
  const leftColIdx = html.indexOf('class="profile left-col"');
  if (leftColIdx !== -1) {
    const mainOrgIdxInLeft = html.indexOf('class="main-org', leftColIdx);
    const leftColEnd = mainOrgIdxInLeft !== -1 ? mainOrgIdxInLeft : leftColIdx + 4000;
    const leftColWindow = html.slice(leftColIdx, leftColEnd);
    const valueMatches = [...leftColWindow.matchAll(/<strong[^>]*class="value[^"]*"[^>]*>([^<]+)<\/strong>/g)];
    if (valueMatches[0]) display_name = valueMatches[0][1].trim() || null;
    if (valueMatches[1]) parsedHandle = valueMatches[1][1].trim() || handle;
  }

  // ── Citizen record ───────────────────────────────────────────────────────
  // New RSI format: #1147876 — displayed after "UEE Citizen Record" label.
  // Old format (kept for safety): R-XXXXXXX
  let citizen_record: string | null = null;
  const recordNewMatch = html.match(/UEE Citizen Record[\s\S]{0,300}<strong[^>]*class="value[^"]*"[^>]*>(#\d+)/);
  if (recordNewMatch) {
    citizen_record = recordNewMatch[1];
  } else {
    const recordOldMatch = html.match(/R[‑\-](\d{7})/);
    if (recordOldMatch) citizen_record = `R-${recordOldMatch[1]}`;
  }

  // ── Enlisted date ────────────────────────────────────────────────────────
  // Label "Enlisted" followed by a date value
  const enlistedMatch =
    html.match(/Enlisted[\s\S]{0,200}?<strong[^>]*class="value"[^>]*>([\w\s,]+)<\/strong>/) ??
    html.match(/Enlisted[\s\S]{0,200}?<span[^>]*>([\w\s,]+\d{4})<\/span>/) ??
    html.match(/enlisted[^>]*>[\s\S]{0,100}?(\w+ \d{1,2}, \d{4})/i);
  const enlisted_at = enlistedMatch ? enlistedMatch[1].trim() : null;

  // ── Org affiliations ─────────────────────────────────────────────────────
  // Use indexOf+slice instead of regex terminators — the terminator patterns
  // (affiliations, sidebar-wrap, </section) are not reliably present and caused
  // the mainOrgBlock regex to always return null.
  const orgs: RsiOrg[] = [];
  let main_org_slug: string | null = null;

  // Main org: scan a 5000-char window from the main-org div start
  const mainOrgIdx = html.indexOf('class="main-org');
  if (mainOrgIdx !== -1) {
    const mainOrgWindow = html.slice(mainOrgIdx, mainOrgIdx + 5000);
    const orgData = extractOrgFromBlock(mainOrgWindow);
    if (orgData) {
      orgs.push({ ...orgData, is_main: true });
      main_org_slug = orgData.slug;
    }
  }

  // Affiliated orgs: scan from the affiliations div start
  const affiliationsIdx = html.indexOf('class="affiliations"');
  if (affiliationsIdx !== -1) {
    const affiliationsWindow = html.slice(affiliationsIdx, affiliationsIdx + 10000);
    const orgPattern = /class="org"([\s\S]{0,1000}?)(?=class="org"|$)/g;
    let match;
    while ((match = orgPattern.exec(affiliationsWindow)) !== null) {
      const orgData = extractOrgFromBlock(match[1]);
      if (orgData && !orgs.find((o) => o.slug === orgData.slug)) {
        orgs.push({ ...orgData, is_main: false });
      }
    }
  }

  // Fallback: if no structured org blocks found, look for org links in the HTML
  if (orgs.length === 0) {
    const orgLinkPattern = /href="\/(?:en\/)?orgs?\/([A-Z0-9]+)"[^>]*>[\s\S]{0,200}?<(?:p|div)[^>]*class="(?:name|org-name)"[^>]*>([^<]+)<\//g;
    let match;
    let first = true;
    while ((match = orgLinkPattern.exec(html)) !== null) {
      const slug = match[1];
      const name = match[2].trim();
      if (slug && name && !orgs.find((o) => o.slug === slug)) {
        orgs.push({ slug, name, is_main: first });
        if (first) main_org_slug = slug;
        first = false;
      }
    }
  }

  return {
    handle: parsedHandle,
    display_name,
    citizen_record,
    enlisted_at,
    avatar_url,
    main_org_slug,
    orgs,
  };
}

function extractOrgFromBlock(block: string): { slug: string; name: string } | null {
  // Extract slug from href="/en/orgs/SLUG" or href="/orgs/SLUG"
  const slugMatch = block.match(/href="\/(?:en\/)?orgs?\/([A-Z0-9]+)"/);
  if (!slugMatch) return null;

  // RSI org name is the text content of the <a> tag whose href points to the org.
  // The class suffix varies per user (e.g. "value data5", "value data12") — match any.
  // Both attribute orderings (href-first, class-first) are handled.
  const nameMatch =
    block.match(/href="\/(?:en\/)?orgs?\/[A-Z0-9]+"[^>]*>([^<]+)<\/a>/) ??
    block.match(/<(?:p|div)[^>]*class="name"[^>]*>([^<]+)<\//) ??
    block.match(/class="org-name"[^>]*>([^<]+)<\//) ??
    block.match(/<strong[^>]*>([^<]+)<\/strong>/);

  if (!nameMatch) return null;
  return { slug: slugMatch[1], name: nameMatch[1].trim() };
}
