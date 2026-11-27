import React from 'react'
import { Link } from 'react-router-dom'
import { renderUrl } from '../../lib/renders'

const formatLength = (m) => `${Number(m.toFixed(1))} m`

// A ship's length and its image's share of the row. A render the publisher measured carries its
// scale (metres per pixel of the large view) and the ship's drawn length: the image's real width
// is then exact, whatever vehicles.length says (it is wrong for some ships). Without a scale the
// site's length stands in, which leaves out the publisher's crop margin (2% a side).
const measuredLength = (s) => s.side_render?.span_m ?? s.length
const rowShare = (s) => (s.side_render?.metres_per_pixel ? s.side_render.width * s.side_render.metres_per_pixel : s.length)

/**
 * Picked ships side by side at true relative size, on one baseline.
 *
 * Each ship's side render is a near-orthographic profile, nose to the right. Giving each image
 * a width share equal to the real-world width it shows (`rowShare`) keeps every ship to scale,
 * and the heights follow from each image's own aspect ratio.
 * Ships without a side render, or with neither a scale nor a length, are listed by name instead.
 */
export default function SizeLineup({ ships }) {
  const drawable = ships
    .filter((s) => s.side_render && rowShare(s) > 0)
    .sort((a, b) => measuredLength(a) - measuredLength(b))
  const missing = ships.filter((s) => !drawable.includes(s))

  if (ships.length === 0) {
    return <p className="text-sm text-gray-500">Pick ships with Compare size to see them side by side.</p>
  }

  return (
    <div className="space-y-3">
      {drawable.length > 0 && (
        <div className="flex items-end gap-3 overflow-hidden">
          {drawable.map((ship) => (
            <div
              key={ship.slug}
              data-testid="lineup-ship"
              data-slug={ship.slug}
              className="min-w-0 flex flex-col items-center"
              style={{ flexGrow: rowShare(ship), flexBasis: 0 }}
            >
              <img
                src={renderUrl(ship.side_render, 2048)}
                alt={ship.name}
                width={ship.side_render.width}
                height={ship.side_render.height}
                loading="lazy"
                className="w-full h-auto"
              />
              <Link
                to={`/ships/${ship.slug}`}
                className="mt-2 text-[11px] text-gray-300 hover:text-sc-accent whitespace-nowrap"
                title={ship.name}
              >
                {ship.name}
              </Link>
              <span className="text-[10px] font-mono text-gray-500 whitespace-nowrap">{formatLength(measuredLength(ship))}</span>
            </div>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <p data-testid="lineup-missing" className="text-xs text-gray-500">
          No side view yet for {missing.map((s) => s.name).join(', ')}.
        </p>
      )}
    </div>
  )
}
