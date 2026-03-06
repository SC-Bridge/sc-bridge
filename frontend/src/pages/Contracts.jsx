import React, { useState, useMemo } from 'react'
import { FileText, ChevronDown, ChevronUp, Package } from 'lucide-react'
import { useContracts } from '../hooks/useAPI'
import PageHeader from '../components/PageHeader'
import LoadingState from '../components/LoadingState'
import ErrorState from '../components/ErrorState'
import SearchInput from '../components/SearchInput'

const GIVER_TABS = [
  { key: 'all',    label: 'All' },
  { key: 'wikelo', label: 'Wikelo' },
  { key: 'gfs',    label: "Gilly's Flight School" },
  { key: 'ruto',   label: 'Ruto' },
]

const GIVER_BADGE = {
  wikelo: 'bg-purple-900/50 text-purple-300 border border-purple-700/50',
  gfs:    'bg-blue-900/50 text-blue-300 border border-blue-700/50',
  ruto:   'bg-orange-900/50 text-orange-300 border border-orange-700/50',
}

const CATEGORY_BADGE = {
  'Small Items':         'bg-green-900/40 text-green-300',
  'Standard':            'bg-gray-700/60 text-gray-300',
  'Favours':             'bg-yellow-900/40 text-yellow-300',
  'Vehicle Delivery':    'bg-indigo-900/40 text-indigo-300',
  'Combat Gauntlet':     'bg-blue-900/40 text-blue-300',
  'Navy Patrol Training':'bg-sky-900/40 text-sky-300',
  'Waste Disposal':      'bg-amber-900/40 text-amber-300',
  'Synced Assassination':'bg-red-900/40 text-red-300',
}

// Strip <EM4>…</EM4> tags and trim whitespace from description text
function cleanDesc(text) {
  if (!text) return ''
  return text.replace(/<[^>]+>/g, '').trim()
}

function parseRequirements(contract) {
  if (!contract.requirements_json) return null
  try {
    const reqs = JSON.parse(contract.requirements_json)
    return reqs.length > 0 ? reqs : null
  } catch { return null }
}

function ContractCard({ contract }) {
  const [expanded, setExpanded] = useState(false)
  const desc = cleanDesc(contract.description)
  const isLong = desc.length > 200
  const requirements = parseRequirements(contract)

  return (
    <div className="panel p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-white text-sm leading-tight">
            {contract.title}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <span className={`text-[10px] font-display uppercase tracking-wide px-2 py-0.5 rounded ${GIVER_BADGE[contract.giver_slug] || 'bg-gray-700 text-gray-300'}`}>
            {contract.giver_slug === 'wikelo' ? 'Wikelo' : contract.giver_slug === 'gfs' ? 'GFS' : 'Ruto'}
          </span>
        </div>
      </div>

      {/* Category + sequence */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${CATEGORY_BADGE[contract.category] || 'bg-gray-700/60 text-gray-400'}`}>
          {contract.category}
        </span>
        {contract.sequence_num != null && (
          <span className="text-[10px] font-mono text-gray-500">
            #{contract.sequence_num}{contract.category === 'Combat Gauntlet' ? ' of 8' : contract.category === 'Navy Patrol Training' ? ' of 3' : ''}
          </span>
        )}
      </div>

      {/* Reward */}
      {contract.reward_text && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-display uppercase tracking-wider text-gray-500">Reward</span>
          <span className={`text-xs font-mono ${contract.reward_currency === 'aUEC' ? 'text-sc-melt' : contract.reward_currency === 'MG Scrip' ? 'text-blue-300' : 'text-sc-accent2'}`}>
            {contract.reward_text}
          </span>
        </div>
      )}

      {/* Requirements */}
      {requirements && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Package className="w-3 h-3 text-gray-500" />
            <span className="text-[10px] font-display uppercase tracking-wider text-gray-500">Requirements</span>
          </div>
          <ul className="space-y-0.5 pl-1">
            {requirements.map((req, i) => (
              <li key={i} className="flex items-center gap-2 text-xs font-mono text-gray-300">
                <span className="text-sc-accent2 min-w-[2ch] text-right">{req.quantity}x</span>
                <span>{req.item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {contract.requirements_json === 'random' && (
        <div className="flex items-center gap-1.5">
          <Package className="w-3 h-3 text-gray-500" />
          <span className="text-[10px] font-display uppercase tracking-wider text-gray-500">Requirements</span>
          <span className="text-xs font-mono text-gray-400 italic">Randomized each time</span>
        </div>
      )}

      {/* Description */}
      {desc && (
        <div className="text-xs text-gray-400 leading-relaxed">
          <p className="whitespace-pre-line">
            {isLong && !expanded ? desc.slice(0, 200) + '…' : desc}
          </p>
          {isLong && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="mt-1 flex items-center gap-1 text-[10px] font-display uppercase tracking-wide text-gray-500 hover:text-gray-300 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}

      {/* Notes */}
      {contract.notes && (
        <p className="text-[10px] font-mono text-amber-400 italic">{contract.notes}</p>
      )}
    </div>
  )
}

export default function Contracts() {
  const { data: contracts, loading, error, refetch } = useContracts()
  const [giverTab, setGiverTab] = useState('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!contracts) return []
    let items = contracts

    if (giverTab !== 'all') {
      items = items.filter((c) => c.giver_slug === giverTab)
    }

    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          (c.description && cleanDesc(c.description).toLowerCase().includes(q)) ||
          (c.requirements_json && c.requirements_json.toLowerCase().includes(q))
      )
    }

    return items
  }, [contracts, giverTab, search])

  if (loading) return <LoadingState message="Loading contracts..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div className="space-y-4 animate-fade-in-up">
      <PageHeader
        title="CONTRACTS"
        subtitle="Named NPC mission chains — Wikelo, Gilly's Flight School, Ruto"
        actions={<FileText className="w-5 h-5 text-gray-500" />}
      />

      {/* Giver filter tabs */}
      <div className="flex flex-wrap gap-1.5">
        {GIVER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setGiverTab(tab.key)}
            className={`px-3 py-1.5 rounded text-xs font-display uppercase tracking-wide transition-all duration-150 ${
              giverTab === tab.key
                ? 'bg-sc-accent/20 text-sc-accent border border-sc-accent/40'
                : 'text-gray-400 hover:text-gray-300 border border-sc-border hover:border-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search contracts..."
        className="max-w-md"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-gray-500">{filtered.length} contracts</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((contract) => (
          <ContractCard key={contract.id} contract={contract} />
        ))}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500 font-mono text-sm">
          No contracts found.
        </div>
      )}
    </div>
  )
}
