// Compact, URL-safe encoding of a bench build (base64 of JSON).
export function encodeBuild({ weapon = null, qualities = {}, attachments = {} } = {}) {
  const json = JSON.stringify({ w: weapon, q: qualities, a: attachments })
  return btoa(unescape(encodeURIComponent(json)))
}

export function decodeBuild(value) {
  const empty = { weapon: null, qualities: {}, attachments: {} }
  if (!value || typeof value !== 'string') return empty
  try {
    const json = decodeURIComponent(escape(atob(value)))
    const o = JSON.parse(json)
    const qualities = {}
    for (const [k, v] of Object.entries(o.q || {})) qualities[Number(k)] = v
    return { weapon: o.w ?? null, qualities, attachments: o.a || {} }
  } catch {
    return empty
  }
}
