import React from 'react'
import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router-dom'

const RSI_BASE = 'https://robertsspaceindustries.com'

/**
 * Displays an org as a chip/badge with two actions:
 *  - If the org exists in SC Bridge: link to /orgs/:slug
 *  - Always: external link to RSI org page
 *
 * Props:
 *   slug      {string}  RSI org SID / slug (e.g. "EXLS")
 *   name      {string}  Org display name
 *   isMain    {boolean} Whether this is the citizen's primary org
 *   scBridge  {boolean} Whether this org exists in SC Bridge
 */
export default function RsiOrgChip({ slug, name, isMain = false, scBridge = false }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-mono ${
      isMain
        ? 'border-sc-accent/40 bg-sc-accent/10 text-sc-accent'
        : 'border-sc-border bg-white/5 text-gray-400'
    }`}>
      {scBridge ? (
        <Link
          to={`/orgs/${slug.toLowerCase()}`}
          className="hover:text-white transition-colors font-display tracking-wide uppercase"
          title={`View ${name} on SC Bridge`}
        >
          {slug}
        </Link>
      ) : (
        <span className="font-display tracking-wide uppercase" title={name}>
          {slug}
        </span>
      )}
      {isMain && (
        <span className="text-[9px] uppercase tracking-widest text-sc-accent/70 ml-0.5">
          main
        </span>
      )}
      <a
        href={`${RSI_BASE}/en/orgs/${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        title={`View ${name} on RSI`}
        className="opacity-50 hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="w-2.5 h-2.5" />
      </a>
    </span>
  )
}
