import React from 'react'
import { Link } from 'react-router-dom'
import { renderUrl } from '../../lib/renders'

const formatLength = (m) => `${Number(m.toFixed(1))} m`

/**
 * Picked ships side by side at true relative size, on one baseline.
 *
 * Each ship's side render is a profile, nose to the right, cropped to the ship with the same
 * small pad on every image, so its width is the ship's length plus a fixed fraction. Giving
 * each ship a width share equal to its length therefore keeps the lengths in proportion, and
 * the heights follow from each image's own aspect ratio.
 * Ships without a side render or a length are listed by name instead.
 */
export default function SizeLineup({ ships }) {
  const drawable = ships
    .filter((s) => s.side_render && s.length > 0)
    .sort((a, b) => a.length - b.length)
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
              style={{ flexGrow: ship.length, flexBasis: 0 }}
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
              <span className="text-[10px] font-mono text-gray-500 whitespace-nowrap">{formatLength(ship.length)}</span>
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
