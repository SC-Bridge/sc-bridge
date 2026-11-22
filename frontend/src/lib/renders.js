export const RENDER_ORIGIN = 'https://renders.scbridge.app'

// Build the public URL for a render. `size` is 512 (cards) or 2048 (large view).
export function renderUrl(render, size) {
  if (!render) return null
  return `${RENDER_ORIGIN}/${render.hash}/${size}.webp`
}
