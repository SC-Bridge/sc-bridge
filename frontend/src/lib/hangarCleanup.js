/**
 * Hangar Cleanup — the analysis behind the page.
 *
 * Works on one "model": the user's pledges in the GET /api/hangar-cleanup
 * shape. A synced hangar arrives in that shape already; an uploaded extension
 * export is converted to it by `normaliseExport`. Everything here is pure, so
 * the page only renders and saves.
 *
 * Melting (RSI calls it "Exchange") works on a whole pledge and returns its
 * current value as store credit, so a pledge's melt value is its value when it
 * is reclaimable.
 */

export const IAE_MONTHS = 120
const LTI_TOKEN_MAX_CENTS = 6000

export const usd = (c) => '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// ── Parsing helpers ─────────────────────────────────────────────────────────

const cleanTarget = (s) => String(s ?? '')
  .replace(/\s+(standard|warbond)\s+edition[\s\S]*$/i, '')
  .replace(/\s+warbond[\s\S]*$/i, '')
  .replace(/\s+upgrade$/i, '')
  .replace(/\s{2,}/g, ' ')
  .trim()

/** "…Upgrade - Prowler to Ironclad Standard Edition, new value: $445.00 USD" → { from, to } */
export function parseUpgradeName(text) {
  const m = String(text ?? '').match(/Upgrade\s*-\s*(.+?)\s+to\s+(.+?)(?:,\s*new value[\s\S]*)?$/i)
  if (!m) return null
  return { from: cleanTarget(m[1]), to: cleanTarget(m[2]) }
}

function cleanHull(name) {
  let s = String(name ?? '')
    .replace(/^(standalone ships?|package|buggies)\s*-\s*/i, '')
    .replace(/\s+plus\s+.*$/i, '')
    .replace(/\b(warbond( edition| anniversary \d{4})?|anniversary \d{4}|iae \d{4}|standard edition|lti)\b/gi, '')
    .replace(/\bbaseline edition\b/i, '')
    .replace(/\s*-\s*-/g, ' -').replace(/\s{2,}/g, ' ').trim()
    .replace(/\s*-\s*$/, '')
  s = s.replace(/^(aegis|drake|misc|rsi|argo|esperia|aopoa|consolidated outland|tumbril|kruger|crusader|anvil|origin|greycat)\s+/i, '')
  return s.replace(/\s*-\s*$/, '').trim()
}

const NOT_A_SHIP = /insurance|paint|schematic|livery/i

function insuranceFromTitle(title) {
  if (/lti|lifetime/i.test(title)) return { insurance_months: null, insurance_lifetime: true }
  const m = String(title).match(/(\d+)\s*-?\s*month/i)
  return { insurance_months: m ? +m[1] : null, insurance_lifetime: false }
}

/** Best insurance on a pledge, from its Insurance items and its linked fleet ships. */
export function insuranceOf(p) {
  let best = null
  const consider = (months, lifetime) => {
    const v = lifetime ? Infinity : (months ?? 0)
    if (best === null || v > best) best = v
  }
  for (const i of p.items ?? []) if (i.kind === 'Insurance') consider(i.insurance_months, i.insurance_lifetime)
  for (const s of p.ships ?? []) if (s.insurance_lifetime || s.insurance_months) consider(s.insurance_months, s.insurance_lifetime)
  if (best === null || best === 0) return { label: 'None', months: 0, tier: 'none', rank: 0 }
  if (best === Infinity) return { label: 'LTI', months: Infinity, tier: 'LTI', rank: 1000 }
  return { label: `${best} mo`, months: best, tier: best >= 60 ? 'long' : 'short', rank: best }
}

function versionLt(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0)
  return false
}

const centsFrom = (s) => {
  const m = String(s ?? '').replace(/,/g, '').match(/\$\s*([\d.]+)/)
  return m ? Math.round(parseFloat(m[1]) * 100) : null
}

// ── Ship catalog (GET /api/ships) ───────────────────────────────────────────

/** Index /api/ships for name lookups and the Buy list. */
export function makeCatalog(ships) {
  const list = (ships ?? []).map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    maker: s.manufacturer_name ?? '',
    role: [s.focus, s.classification].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · '),
    focus: s.focus ?? null,
    classification: s.classification ?? null,
    pledge_price_cents: s.pledge_price != null ? Math.round(s.pledge_price * 100) : null,
    price_auec: s.price_auec ?? null,
    status: s.production_status ?? null,
    pledgeable: s.is_pledgeable == null ? true : !!s.is_pledgeable,
  }))
  const byKey = new Map()
  const put = (k, s) => { if (k && !byKey.has(k)) byKey.set(k, s) }
  for (const s of list) {
    const n = norm(s.name)
    put(n, s)
    const maker = norm(s.maker)
    if (maker && n.startsWith(maker + ' ')) put(n.slice(maker.length + 1), s)
    const parts = n.split(' ')
    if (parts.length > 1) put(parts.slice(1).join(' '), s)
    if (n.startsWith('c o ')) put(n.slice(4), s)
  }
  const find = (name) => {
    let words = norm(name).split(' ')
    while (words.length && words[0]) {
      const s = byKey.get(words.join(' '))
      if (s) return s
      words = words.slice(0, -1)
    }
    return null
  }
  return { list, find, byId: new Map(list.map((s) => [s.id, s])) }
}

// ── Extension export → model ────────────────────────────────────────────────

/** Convert the extension's hangar JSON export to the synced model shape. */
export function normaliseExport(json, catalog) {
  if (!json || !Array.isArray(json.pledges)) {
    throw new Error('This file has no "pledges" list. Export your hangar with the SC Bridge extension and load that file.')
  }
  const logsByPledge = new Map()
  for (const l of json.upgrade_logs ?? []) {
    if (!logsByPledge.has(l.pledge_id)) logsByPledge.set(l.pledge_id, [])
    const text = l.new_value || l.name || ''
    logsByPledge.get(l.pledge_id).push({ name: text, applied_at: l.applied_at ?? null, new_value_cents: centsFrom(text.split(/new value:/i)[1]) })
  }
  const pledges = json.pledges.map((p) => {
    const items = (p.items ?? []).map((i) => ({
      title: i.title,
      kind: i.kind ?? null,
      manufacturer_name: i.manufacturer ?? null,
      custom_name: null,
      ...(i.kind === 'Insurance' ? insuranceFromTitle(i.title) : { insurance_months: null, insurance_lifetime: false }),
    }))
    if (p.insurance_type && !items.some((i) => i.kind === 'Insurance')) {
      items.push({ title: String(p.insurance_type), kind: 'Insurance', manufacturer_name: null, custom_name: null, ...insuranceFromTitle(p.insurance_type) })
    }
    let ccuFrom = p.upgradeData?.match_items?.[0]?.name ?? null
    let ccuTo = (p.upgradeData?.target_items ?? []).map((t) => t.name).find((n) => !NOT_A_SHIP.test(n)) ?? null
    if (!ccuFrom && /^upgrade\s*-/i.test(p.name ?? '')) {
      const parsed = parseUpgradeName(p.name)
      if (parsed) { ccuFrom = parsed.from; ccuTo = parsed.to }
    }
    const ships = items.filter((i) => i.kind === 'Ship').map((i) => {
      const s = catalog?.find(i.title)
      return s ? {
        vehicle_id: s.id, slug: s.slug, name: s.name, focus: s.focus, classification: s.classification,
        pledge_price_cents: s.pledge_price_cents, price_auec: s.price_auec,
        insurance_label: null, insurance_months: null, insurance_lifetime: false, warbond: !!(p.is_warbond ?? p.isWarbond),
      } : null
    }).filter(Boolean)
    return {
      rsi_pledge_id: p.id,
      name: p.name ?? '',
      value_cents: typeof p.valueCents === 'number' ? p.valueCents : (centsFrom(p.value) ?? 0),
      currency: p.currency ?? null,
      date: p.date ?? null,
      is_reclaimable: !!(p.is_reclaimable ?? p.isReclaimable),
      is_giftable: !!(p.is_giftable ?? p.isGiftable),
      is_upgraded: !!(p.is_upgraded ?? p.isUpgraded),
      is_warbond: !!(p.is_warbond ?? p.isWarbond),
      ccu_from: ccuFrom ? cleanTarget(ccuFrom) : null,
      ccu_to: ccuTo ? cleanTarget(ccuTo) : null,
      items,
      upgrades: logsByPledge.get(p.id) ?? [],
      ships,
    }
  })
  const acct = json.account ?? {}
  let credit = acct.store_credit_cents ?? null
  const version = json.export_meta?.extension_version
  if (credit != null && (!version || versionLt(version, '0.6.2'))) credit = Math.round(credit / 100)
  return {
    source: 'file',
    owner: acct.nickname || acct.displayname || '',
    synced_at: json.export_meta?.exported_at ?? null,
    store_credit_cents: credit,
    pledges,
    buybacks: (json.buyback_pledges ?? []).map((b) => ({ name: b.name, value_cents: b.value_cents ?? null, buyback_type: null, vehicle_name: null, from_vehicle_name: null, to_vehicle_name: null })),
  }
}

// ── Analysis ────────────────────────────────────────────────────────────────

function category(p) {
  const n = p.name ?? ''
  if (p.ccu_from || p.ccu_to || /^upgrade\s*-/i.test(n)) return 'CCU'
  if ((p.items ?? []).some((i) => i.kind === 'Ship') || (p.ships ?? []).length) return 'Ship'
  if (/^paints?\s*-/i.test(n)) return 'Paint'
  if (/^(gear|subscribers exclusive)\s*-/i.test(n)) return 'Gear'
  if (/^add-ons?\s*-/i.test(n)) return (p.items ?? []).some((i) => i.kind === 'Component') ? 'Add-on' : 'Gear'
  if (/^(package|digital goodies)/i.test(n)) return 'Package'
  return 'Other'
}

export const CATEGORIES = ['Ship', 'CCU', 'Paint', 'Gear', 'Add-on', 'Package', 'Other']

export const FLAGS = {
  'ins-short': { label: 'Short insurance', tone: 'bad', tip: 'Ship insurance under 60 months' },
  'ins-none': { label: 'No insurance', tone: 'bad', tip: 'Ship has no insurance' },
  'ins-long': { label: 'Non-LTI', tone: 'warn', tip: '60+ months but not LTI' },
  'lti-token': { label: 'LTI token', tone: 'good', tip: 'Cheap un-upgraded LTI ship: a CCU base' },
  'lti-chain': { label: 'LTI via CCU', tone: 'info', tip: 'LTI carried through a CCU chain' },
  'dupe-ship': { label: 'Duplicate ship', tone: 'warn', tip: 'Same hull in more than one pledge' },
  'dupe-item': { label: 'Duplicate', tone: 'warn', tip: 'Identical pledge owned more than once' },
  'paint-unowned': { label: 'Paint, no ship', tone: 'warn', tip: "Paint for a ship you don't own" },
  'paint-partial': { label: 'Some paints unowned', tone: 'mute', tip: "Pack includes paints for ships you don't own" },
  'ccu-orphan': { label: 'CCU, no base', tone: 'warn', tip: "You can't reach this CCU's from-ship" },
  'ccu-dupe': { label: 'Multiple CCUs', tone: 'mute', tip: 'Several identical CCUs' },
  warbond: { label: 'Warbond', tone: 'mute', tip: 'Warbond pricing' },
  'non-cash': { label: 'Non-cash', tone: 'mute', tip: 'Bought with UEC or ledger credit' },
  'zero-melt': { label: '$0 melt', tone: 'mute', tip: 'Reclaimable but worth nothing' },
  'not-meltable': { label: 'Not meltable', tone: 'mute', tip: 'Not reclaimable' },
}

function orderChain(steps) {
  if (steps.length < 2) return steps
  const tos = new Set(steps.map((c) => norm(c.to)))
  const start = steps.find((c) => !tos.has(norm(c.from))) || steps[0]
  const ordered = [start]
  const rest = steps.filter((c) => c !== start)
  while (rest.length) {
    const last = ordered[ordered.length - 1]
    const i = rest.findIndex((c) => norm(c.from) === norm(last.to))
    ordered.push(i >= 0 ? rest.splice(i, 1)[0] : rest.shift())
  }
  return ordered
}

function toRow(p) {
  const cat = category(p)
  const shipItems = (p.items ?? []).filter((i) => i.kind === 'Ship').map((i) => i.title)
  const shipNames = shipItems.length ? shipItems : (p.ships ?? []).map((s) => s.name)
  // RSI lists upgrades newest first; the chain reads oldest first.
  const chain = orderChain((p.upgrades ?? []).slice().reverse()
    .map((u) => { const s = parseUpgradeName(u.name); return s ? { ...s, value: u.new_value_cents } : null })
    .filter(Boolean))
  let base = ''
  if (cat === 'Ship') base = chain.length ? chain[0].from : (p.is_upgraded ? cleanHull(p.name) : (shipNames[0] || cleanHull(p.name)))
  // Syncs before the import stored upgradeData have no ccu_from/ccu_to: read them from the name.
  let ccuFrom = p.ccu_from
  let ccuTo = p.ccu_to
  if (cat === 'CCU' && !ccuFrom && !ccuTo) {
    const parsed = parseUpgradeName(p.name)
    if (parsed) { ccuFrom = parsed.from; ccuTo = parsed.to }
  }
  return {
    id: p.rsi_pledge_id,
    name: p.name,
    cat,
    value: p.value_cents ?? 0,
    meltable: !!p.is_reclaimable,
    giftable: !!p.is_giftable,
    warbond: !!p.is_warbond || (p.ships ?? []).some((s) => s.warbond),
    currency: p.currency ?? '',
    date: p.date ?? '',
    upgraded: !!p.is_upgraded,
    shipItems: shipNames,
    current: shipNames.join(' + '),
    ships: p.ships ?? [],
    ins: insuranceOf(p),
    base,
    chain,
    ccu: cat === 'CCU' ? { from: ccuFrom ? [ccuFrom] : [], to: ccuTo ? [ccuTo] : [] } : null,
    paints: (p.items ?? []).filter((i) => i.kind === 'Skin').map((i) => i.title),
    items: (p.items ?? []).map((i) => ({ title: i.title, kind: i.kind ?? '' })),
    flags: [],
    suggestion: null,
  }
}

/** Analyse a model: flags and a suggestion for every pledge. */
export function analyse(model) {
  const rows = (model?.pledges ?? []).map(toRow)
  const ships = rows.filter((r) => r.cat === 'Ship')
  const ownedHulls = ships.flatMap((r) => r.shipItems).map(norm).map((n) => n.replace(/^(aegis|anvil|argo|c o|crusader|drake|misc|mirai|origin|rsi|esperia|gatac|kruger|tumbril|greycat|aopoa|banu) /, '')).filter(Boolean)
  const owns = (hull) => {
    const h = norm(hull)
    if (!h) return true
    return ownedHulls.some((o) => o === h || o.startsWith(h + ' ') || h.startsWith(o + ' ') || o.split(' ').includes(h) || o.includes(h))
  }

  for (const r of ships) {
    if (r.ins.tier === 'LTI' && r.meltable && !r.upgraded && r.value > 0 && r.value <= LTI_TOKEN_MAX_CENTS) r.flags.push('lti-token')
    if (r.ins.tier === 'LTI' && (r.upgraded || r.chain.length)) r.flags.push('lti-chain')
    if (r.ins.tier === 'short') r.flags.push('ins-short')
    if (r.ins.tier === 'long') r.flags.push('ins-long')
    if (r.ins.tier === 'none') r.flags.push('ins-none')
  }

  const byHull = new Map()
  for (const r of ships) for (const h of r.shipItems) {
    const k = norm(h)
    if (!byHull.has(k)) byHull.set(k, [])
    byHull.get(k).push(r)
  }
  for (const group of byHull.values()) {
    if (group.length < 2) continue
    const sorted = group.slice().sort((a, b) => b.ins.rank - a.ins.rank || b.value - a.value)
    sorted.forEach((r, i) => {
      if (!r.flags.includes('dupe-ship')) r.flags.push('dupe-ship')
      r.dupeKeep = i === 0
      r.dupeOf = group.length
    })
  }

  const byName = new Map()
  for (const r of rows.filter((x) => x.cat !== 'Ship')) {
    const k = norm(r.name)
    if (!byName.has(k)) byName.set(k, [])
    byName.get(k).push(r)
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue
    group.forEach((r, i) => { r.flags.push(r.cat === 'CCU' ? 'ccu-dupe' : 'dupe-item'); r.dupeIndex = i; r.dupeOf = group.length })
  }

  for (const r of rows) {
    if (!r.paints.length || !['Paint', 'Gear', 'Add-on'].includes(r.cat)) continue
    const hulls = r.paints.map((t) => t.split(/\s+-\s+|\s+paint\b/i)[0].trim())
    r.paintUnowned = [...new Set(hulls.filter((h) => !owns(h)))]
    if (r.cat === 'Paint' && hulls.length && r.paintUnowned.length === new Set(hulls).size) r.flags.push('paint-unowned')
    else if (r.paintUnowned.length) r.flags.push('paint-partial')
  }

  // A CCU is usable if its from-ship is owned, or reachable through other CCUs.
  const ccus = rows.filter((r) => r.cat === 'CCU')
  const reach = new Set(ownedHulls)
  const canReach = (f) => reach.has(norm(f)) || owns(f)
  for (let grew = true; grew;) {
    grew = false
    for (const c of ccus) if (c.ccu.from.some(canReach)) for (const t of c.ccu.to) if (!reach.has(norm(t))) { reach.add(norm(t)); grew = true }
  }
  const buybackNames = (model?.buybacks ?? []).map((b) => norm([b.name, b.vehicle_name].filter(Boolean).join(' ')))
  for (const c of ccus) {
    if (c.ccu.from.some(canReach)) continue
    c.flags.push('ccu-orphan')
    c.inBuyback = c.ccu.from.filter((f) => { const h = norm(f).split(' ')[0]; return h && buybackNames.some((b) => b.split(' ').includes(h)) })
  }

  for (const r of rows) {
    if (!r.meltable) r.flags.push('not-meltable')
    else if (r.value === 0) r.flags.push('zero-melt')
    if (r.warbond) r.flags.push('warbond')
    if (r.currency && !/store credit/i.test(r.currency)) r.flags.push('non-cash')
  }

  const tokens = ships.filter((r) => r.flags.includes('lti-token')).sort((a, b) => a.value - b.value)
  for (const r of rows) r.suggestion = suggest(r, tokens)
  return { rows, tokens }
}

function suggest(r, tokens) {
  if (!r.meltable) return { action: 'keep', label: "Can't melt", reasons: ['RSI marks this pledge as not reclaimable.'] }
  if (r.value === 0) return { action: 'keep', label: 'Keep ($0 melt)', reasons: ['Melting returns nothing.'] }
  if (r.cat === 'Ship') {
    if (r.flags.includes('dupe-ship') && !r.dupeKeep) {
      return { action: 'melt', label: 'Melt (duplicate)', reasons: [`You own ${r.dupeOf} pledges with this hull; another copy has equal or better insurance.`] }
    }
    if (r.ins.tier !== 'LTI') {
      const reasons = [`Insurance is ${r.ins.label}, not LTI.`]
      const tok = tokens.find((t) => t.value < r.value)
      if (tok) reasons.push(`Rebuild on LTI: melt (${usd(r.value)}), then CCU your ${tok.current} LTI token (${usd(tok.value)}) up to this hull. CCUs needed ≈ ${usd(r.value - tok.value)} at current prices.`)
      if (r.warbond) reasons.push('Warbond pledge: it melts for what you paid, but rebuying costs standard price.')
      return { action: 'ins', label: 'Upgrade insurance', reasons }
    }
    if (r.flags.includes('lti-token')) return { action: 'keep', label: 'Keep (LTI token)', reasons: ['Cheap LTI hull: a CCU base for an LTI chain.'] }
    if (r.flags.includes('lti-chain')) return { action: 'keep', label: 'Keep (LTI chain)', reasons: [`LTI carried from ${r.base || 'its base hull'} through CCUs. Melting loses that LTI.`] }
    return { action: 'keep', label: 'Keep', reasons: ['LTI ship.'] }
  }
  if (r.cat === 'CCU') {
    if (r.flags.includes('ccu-orphan')) {
      return { action: 'review', label: 'Review: no base', reasons: [
        `You don't own ${r.ccu.from.join(', ') || 'the from-ship'} and no other CCU leads to it.`,
        r.inBuyback?.length ? `Your buy-back list may hold a ${r.inBuyback.join(', ')} pledge to apply it to.` : '',
        r.warbond ? 'Warbond CCU: melting loses the warbond discount.' : '',
      ].filter(Boolean) }
    }
    if (r.flags.includes('ccu-dupe') && r.dupeIndex > 0) return { action: 'review', label: 'Review: extra copy', reasons: [`You hold ${r.dupeOf} copies. Keep only as many as you will apply.`] }
    return { action: 'keep', label: 'Keep (usable CCU)', reasons: ['Applies to a hull you own or can reach.'] }
  }
  if (r.flags.includes('paint-unowned')) return { action: 'melt', label: 'Melt (no ship)', reasons: [`You don't own: ${r.paintUnowned.join(', ')}.`] }
  if (r.flags.includes('dupe-item') && r.dupeIndex > 0) return { action: 'melt', label: 'Melt (duplicate)', reasons: [`Extra copy ${r.dupeIndex + 1} of ${r.dupeOf}. Item pledges add nothing when doubled.`] }
  const reasons = r.flags.includes('paint-partial') ? [`Some paints are for ships you don't own: ${r.paintUnowned.join(', ')}.`] : ['Nothing flags this as redundant.']
  return { action: 'keep', label: 'Keep', reasons }
}

// ── Display helpers ─────────────────────────────────────────────────────────

export function displayName(r) {
  if (r.cat === 'Ship') return r.current || r.name
  if (r.cat === 'CCU') return `${r.ccu.from.join('/') || '?'} → ${r.ccu.to.join('/') || '?'}`
  return r.name.replace(/^(paints?|gear|add-ons?|subscribers exclusive|package|digital goodies pack|upgrade)\s*-\s*/i, '').trim() || r.name
}

export function roleOf(r) {
  const roles = (r.ships ?? []).map((s) => [s.focus, s.classification].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ')).filter(Boolean)
  return [...new Set(roles)].join(' / ')
}

/** IAE rebuy price: your own figure first, then the ships' store price. */
export function rebuyPrice(r, decisions) {
  const own = decisions?.[r.id]?.iae_price_cents
  if (own != null) return { cents: own, source: 'yours' }
  if (!r.ships.length || r.ships.some((s) => s.pledge_price_cents == null)) return { cents: null, source: 'none' }
  return { cents: r.ships.reduce((a, s) => a + s.pledge_price_cents, 0), source: 'store' }
}

export function iaeReasons(r, decisions) {
  const out = []
  const p = rebuyPrice(r, decisions)
  if (p.cents != null) {
    const net = r.value - p.cents
    out.push(`Melt ${usd(r.value)}, rebuy at IAE for ~${usd(p.cents)}: ${net >= 0 ? `${usd(net)} credit left over.` : `${usd(-net)} extra needed.`}`)
  } else out.push('No store price on file for this hull. Enter the IAE price.')
  if (r.ins.tier === 'LTI') out.push(`You would swap LTI for ${IAE_MONTHS}-month insurance.`)
  else if (r.ins.months >= IAE_MONTHS) out.push(`Already ${r.ins.label}: no insurance gain.`)
  else out.push(`Insurance goes from ${r.ins.label} to ${IAE_MONTHS} months.`)
  if (r.warbond) out.push('Warbond: it melts for the warbond price you paid, and the rebuy costs standard price.')
  if (r.upgraded || r.chain.length) out.push('CCU chain: melting returns the full value but loses the chain and its base hull.')
  return out
}

// ── Process plan ────────────────────────────────────────────────────────────

const MELT_DECISIONS = new Set(['melt', 'melt-ig', 'iae'])

/**
 * Turn decisions into an ordered checklist. Melts come first so the credit
 * exists before anything is bought; purchases carry a running balance that
 * shows where store credit runs out.
 *
 * `buys` is [{ vehicle_id, name, price_cents }] with the effective price.
 */
export function buildSteps({ rows, decisions, buys, credit, catalog }) {
  const dec = (r) => decisions?.[r.id]?.decision ?? null
  const melts = rows.filter((r) => MELT_DECISIONS.has(dec(r))).sort((a, b) => b.value - a.value)
  const rebuys = rows.filter((r) => dec(r) === 'iae')
  const inGame = rows.filter((r) => dec(r) === 'melt-ig')
  const insWork = rows.filter((r) => dec(r) === 'ins')
  const review = rows.filter((r) => dec(r) === 'review')
  const buyList = buys ?? []

  const start = credit ?? 0
  const meltTotal = melts.reduce((a, r) => a + r.value, 0)
  const spend = rebuys.reduce((a, r) => a + (rebuyPrice(r, decisions).cents ?? 0), 0) + buyList.reduce((a, b) => a + (b.price_cents ?? 0), 0)
  const shortfall = Math.max(0, spend - start - meltTotal)
  const phases = []

  phases.push({ key: 'prep', title: 'Before you start', steps: [{
    key: 'prep-check', title: 'Check the plan adds up',
    meta: ['Prices are estimates. Check each one on RSI before you buy.'],
    money: [`Store credit now ${usd(start)}`, `Melts add ${usd(meltTotal)}`, `Purchases cost ~${usd(spend)}`, shortfall ? `Card needed ~${usd(shortfall)}` : `Credit left ~${usd(start + meltTotal - spend)}`],
    warn: shortfall ? ['Your credit does not cover everything. The purchase steps show where a card payment starts.'] : [],
  }] })

  if (melts.length) {
    let bal = start
    phases.push({
      key: 'melt', title: 'Melt',
      intro: 'On robertsspaceindustries.com go to Account → My Gear. For each pledge, find it (the SC Bridge extension search helps), open it and click Exchange. A melted pledge can only come back through Buy Back Pledges, on RSI’s terms.',
      steps: melts.map((r) => {
        bal += r.value
        const warn = []
        if (r.ins.tier === 'LTI') warn.push('This pledge has LTI. Melting gives it up.')
        if (r.cat === 'Ship' && (r.upgraded || r.chain.length)) warn.push(`Melting returns the full value but loses its CCU chain from ${r.base || 'the base hull'}.`)
        if (r.warbond) warn.push('Warbond: you get back what you paid; buying it again costs standard price.')
        if (r.currency && !/store credit/i.test(r.currency)) warn.push(`Originally paid with ${r.currency}.`)
        const why = dec(r) === 'iae' ? `To rebuy at IAE with ${IAE_MONTHS}-month insurance (step below).` : dec(r) === 'melt-ig' ? 'You will buy it in-game instead (step below).' : ''
        return { key: `melt-${r.id}`, title: `Exchange “${displayName(r)}”`, meta: [`Pledge #${r.id} · ${r.name}`, why].filter(Boolean), money: [`+${usd(r.value)} store credit`, `credit ≈ ${usd(bal)}`], warn }
      }),
    })
    phases.push({ key: 'verify', title: 'Check your credit', steps: [{ key: 'verify-credit', title: 'Confirm your store credit on My Gear', meta: ['If it is lower, stop and check which melts went through before buying anything.'], money: [`Expect about ${usd(start + meltTotal)}`], warn: [] }] })
  }

  if (rebuys.length || buyList.length) {
    let bal = start + meltTotal
    const buyStep = (key, title, price, meta, warn) => {
      const p = price ?? 0
      const covered = Math.min(p, Math.max(bal, 0))
      const card = p - covered
      bal -= p
      return {
        key, title, meta,
        warn: price == null ? ['No price set. Enter it in the planner, or check RSI.', ...warn] : warn,
        money: [
          price != null ? `~${usd(p)}` : 'price unknown',
          card > 0 ? (covered > 0 ? `${usd(covered)} from credit + ${usd(card)} by card` : `${usd(card)} by card`) : 'paid from store credit',
          `credit after ≈ ${usd(Math.max(bal, 0))}`,
        ],
      }
    }
    phases.push({
      key: 'buy', title: 'Buy at IAE',
      intro: 'During IAE, open the RSI pledge store, find each ship in the IAE sale, and buy the standalone ship. Check the insurance on the product page before paying.',
      steps: [
        ...rebuys.map((r) => buyStep(`rebuy-${r.id}`, `Buy ${r.current} (standalone, ${IAE_MONTHS}-month insurance)`, rebuyPrice(r, decisions).cents, [`Replaces the pledge you melted: ${r.name}`], r.ins.tier === 'LTI' ? ['The old pledge was LTI; this one will not be.'] : [])),
        ...buyList.map((b) => buyStep(`buy-${b.vehicle_id}`, `Buy ${b.name} (standalone, ${IAE_MONTHS}-month insurance)`, b.price_cents, ['From your IAE buy list'], [])),
      ],
    })
  }

  if (inGame.length) {
    phases.push({
      key: 'ingame', title: 'Buy in-game', intro: 'In the game, buy these with aUEC instead.',
      steps: inGame.map((r) => {
        const auec = r.ships.find((s) => s.price_auec)?.price_auec ?? (r.cat === 'Ship' ? catalog?.find(r.shipItems[0])?.price_auec : null)
        return { key: `ig-${r.id}`, title: `Buy ${displayName(r)} in-game`, meta: [auec ? `About ${Number(auec).toLocaleString('en-US')} aUEC` : 'Check in-game shops for price and location.'], money: [], warn: [] }
      }),
    })
  }

  if (insWork.length) {
    phases.push({
      key: 'ins', title: 'Insurance upgrades', intro: 'Ships you marked "Upgrade insurance". Pick the route in each note.',
      steps: insWork.map((r) => ({ key: `ins-${r.id}`, title: `Upgrade insurance on ${displayName(r)} (now ${r.ins.label})`, meta: r.suggestion.reasons, money: [], warn: [] })),
    })
  }

  if (review.length) {
    phases.push({ key: 'review', title: 'Still to decide', steps: review.map((r) => ({ key: `rev-${r.id}`, title: displayName(r), meta: r.suggestion.reasons.slice(0, 2), money: [usd(r.value)], warn: [] })) })
  }

  const counts = { melts: melts.length, buys: rebuys.length + buyList.length, inGame: inGame.length, ins: insWork.length, review: review.length }
  return { phases, counts, actionable: Object.values(counts).reduce((a, n) => a + n, 0), shortfall }
}

/** Plain-text checklist for pasting into Discord or notes. */
export function stepsAsText(plan, doneSteps) {
  const done = new Set(doneSteps ?? [])
  let n = 0
  return plan.phases.map((ph) => [
    ph.title.toUpperCase(),
    ph.intro || '',
    ...ph.steps.map((s) => {
      n++
      return [
        `${done.has(s.key) ? '[x]' : '[ ]'} ${n}. ${s.title}`,
        ...s.meta.map((m) => `      ${m}`),
        ...(s.money.length ? [`      ${s.money.join(' · ')}`] : []),
        ...s.warn.map((w) => `      ! ${w}`),
      ].join('\n')
    }),
  ].filter(Boolean).join('\n')).join('\n\n')
}
