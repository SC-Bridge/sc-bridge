import React from 'react'
import { FlaskConical, AlertTriangle, Gem } from 'lucide-react'

function Toggle({ checked, onChange }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${checked ? 'bg-sc-accent' : 'bg-gray-700'}`}
    >
      <span className={`block w-4 h-4 rounded-full bg-white transition-transform absolute top-[2px] ${checked ? 'left-[18px]' : 'left-[2px]'}`} />
    </button>
  )
}

const ENHANCEMENTS = [
  {
    configKey: 'enhanceContrabandWarnings',
    label: 'Contraband Warnings',
    desc: 'Prefix illegal substance and counterfeit goods names with [!] so you can spot contraband at a glance in cargo and shop UIs.',
    icon: AlertTriangle,
    iconColor: 'text-red-400',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    example: 'WiDoW \u2192 [!] WiDoW',
    count: '20 commodities',
  },
  {
    configKey: 'enhanceMaterialNames',
    label: 'Shortened Material Names',
    desc: 'Shorten verbose mining material names for cleaner cargo, inventory, and scanning displays.',
    icon: Gem,
    iconColor: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    example: 'Hephaestanite Raw \u2192 Heph Raw',
    count: '15+ materials',
  },
  {
    configKey: 'enhanceBlueprintPools',
    label: 'Blueprint Pools',
    desc: 'Tag blueprint-awarding contracts with [BP] + reputation in the title, and append the potential blueprint rewards (kept separated by pool) to the description so you can see what each contract might drop before accepting.',
    icon: FlaskConical,
    iconColor: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    example: 'Your Best Shot [10 Rep] [BP] — Potential Blueprints: R97 Shotgun, Monde Arms',
    count: '320+ contracts',
  },
]

export default function EnhancementsSection({ config, onUpdateConfig }) {
  return (
    <div className="panel">
      <div className="px-5 py-4 border-b border-sc-border">
        <h3 className="font-display font-semibold text-sm text-white">String Enhancements</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Bulk string replacements generated from our database. Toggle on to include in your download.
        </p>
      </div>

      <div className="p-4 space-y-3">
        {ENHANCEMENTS.map(enh => {
          const enabled = config[enh.configKey] || false
          const Icon = enh.icon

          return (
            <div
              key={enh.configKey}
              className={`rounded-lg border p-4 transition-all ${
                enabled
                  ? `${enh.bgColor} ${enh.borderColor}`
                  : enh.comingSoon
                    ? 'bg-white/[0.01] border-white/[0.04] opacity-60'
                    : 'bg-white/[0.01] border-white/[0.06] hover:border-white/[0.12]'
              }`}
            >
              <div className="flex gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  enabled ? enh.bgColor : 'bg-white/[0.03]'
                }`}>
                  <Icon className={`w-5 h-5 ${enabled ? enh.iconColor : 'text-gray-600'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-medium text-white">{enh.label}</h4>
                    <span className="text-[10px] font-mono text-gray-500">{enh.count}</span>
                    {enh.comingSoon && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        coming soon
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{enh.desc}</p>
                  <p className="text-[10px] font-mono text-gray-600 mt-2 bg-black/30 rounded px-2 py-1">
                    {enh.example}
                  </p>
                </div>
                <div className="shrink-0 flex items-start pt-1">
                  {!enh.comingSoon ? (
                    <Toggle
                      checked={enabled}
                      onChange={() => onUpdateConfig({ [enh.configKey]: !enabled })}
                    />
                  ) : (
                    <div className="w-9 h-5 rounded-full bg-gray-800 opacity-40" title="Coming soon" />
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
