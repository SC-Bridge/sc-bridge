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
  // <div class="thumb"><img src="https://cdn.robertsspaceindustries.com/..."/></div>
  const avatarMatch =
    html.match(/class="profile[^"]*"[^>]*>[\s\S]{0,500}?<img[^>]+src="([^"]+)"/) ??
    html.match(/class="thumb"[^>]*>[\s\S]{0,200}?<img[^>]+src="([^"]+cdn[^"]+)"/) ??
    html.match(/class="avatar"[^>]*>[\s\S]{0,200}?<img[^>]+src="([^"]+)"/);
  const avatar_url = avatarMatch ? avatarMatch[1] : null;

  // ── Citizen record ───────────────────────────────────────────────────────
  // Pattern: R-XXXXXXX (7 digits with optional non-breaking hyphen)
  const recordMatch = html.match(/R[‑\-](\d{7})/);
  const citizen_record = recordMatch ? `R-${recordMatch[1]}` : null;

  // ── Enlisted date ────────────────────────────────────────────────────────
  // Label "Enlisted" followed by a date value
  const enlistedMatch =
    html.match(/Enlisted[\s\S]{0,200}?<strong[^>]*class="value"[^>]*>([\w\s,]+)<\/strong>/) ??
    html.match(/Enlisted[\s\S]{0,200}?<span[^>]*>([\w\s,]+\d{4})<\/span>/) ??
    html.match(/enlisted[^>]*>[\s\S]{0,100}?(\w+ \d{1,2}, \d{4})/i);
  const enlisted_at = enlistedMatch ? enlistedMatch[1].trim() : null;

  // ── Handle (canonical) ───────────────────────────────────────────────────
  // Look for the handle in the profile section
  const handleMatch =
    html.match(/Handle[^<]*<\/[^>]+>[\s\S]{0,200}?<strong[^>]*class="value"[^>]*>([^<]+)<\/strong>/) ??
    html.match(/class="value">([^<]+)<\/strong>[\s\S]{0,100}?(?=Enlisted|UEE)/);
  const parsedHandle = handleMatch ? handleMatch[1].trim() : handle;

  // ── Org affiliations ─────────────────────────────────────────────────────
  // Orgs section has org name, SID, and whether it's the main org
  // Pattern varies but typically:
  //   <div class="main-org">...<div class="org">...href="/en/orgs/SLUG"...<p class="name">Name</p>...
  //   <div class="affiliations">...<div class="org">...

  const orgs: RsiOrg[] = [];
  let main_org_slug: string | null = null;

  // Extract main org block
  const mainOrgBlock = html.match(/class="main-org"([\s\S]{0,2000}?)(?:class="affiliations"|class="sidebar-wrap"|<\/section)/);
  if (mainOrgBlock) {
    const orgData = extractOrgFromBlock(mainOrgBlock[1]);
    if (orgData) {
      orgs.push({ ...orgData, is_main: true });
      main_org_slug = orgData.slug;
    }
  }

  // Extract affiliated orgs block
  const affiliationsBlock = html.match(/class="affiliations"([\s\S]{0,5000}?)(?:class="sidebar-wrap"|<\/section|class="main-org")/);
  if (affiliationsBlock) {
    // Each org is in a <div class="org"> block
    const orgPattern = /class="org"([\s\S]{0,1000}?)(?=class="org"|$)/g;
    let match;
    while ((match = orgPattern.exec(affiliationsBlock[1])) !== null) {
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
    display_name: null, // citizen page doesn't always have a separate display name
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
  // Extract name from <p class="name">...</p> or <div class="name">...</div>
  const nameMatch =
    block.match(/<(?:p|div)[^>]*class="name"[^>]*>([^<]+)<\//) ??
    block.match(/class="org-name"[^>]*>([^<]+)<\//) ??
    block.match(/<strong[^>]*>([^<]+)<\/strong>/);

  if (!slugMatch || !nameMatch) return null;
  return { slug: slugMatch[1], name: nameMatch[1].trim() };
}
