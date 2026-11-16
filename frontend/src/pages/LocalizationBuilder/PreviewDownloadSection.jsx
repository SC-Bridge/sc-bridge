import React, { useState } from 'react'
import { Download, Loader, Languages, ChevronDown, ChevronUp, Eye } from 'lucide-react'
import { useLocalizationPreview } from '../../hooks/useAPI'

export default function PreviewDownloadSection({ hasAnyEnabled, onDownload, downloading, accountsQuery = '' }) {
  const { data: preview, loading: previewLoading } = useLocalizationPreview(accountsQuery)
  const [showInstall, setShowInstall] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const personalCount = preview?.personalCount || 0
  const packCount = preview?.packOverrideCount || 0
  const totalCount = preview?.totalCount || 0

  return (
    <div className="space-y-4">
      {/* Stats + Download */}
      <div className="panel">
        <div className="px-5 py-4 border-b border-sc-border flex items-center justify-between">
          <div>
            <h3 className="font-display font-semibold text-sm text-white">Preview & Download</h3>
            <p className="text-xs text-gray-500 mt-0.5">Review your overrides and download your customized global.ini</p>
          </div>
          <button
            onClick={onDownload}
            disabled={downloading || !hasAnyEnabled}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
          >
            {downloading ? <Loader className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download global.ini
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Override count summary */}
          <div className="flex flex-wrap gap-3">
            <div className="bg-black/30 rounded px-3 py-2 flex-1 min-w-[140px]">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Total Overrides</p>
              <p className="text-lg font-mono text-white mt-0.5">
                {previewLoading ? '\u2014' : totalCount.toLocaleString()}
              </p>
            </div>
            <div className="bg-black/30 rounded px-3 py-2 flex-1 min-w-[140px]">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Personal</p>
              <p className="text-lg font-mono text-sc-accent mt-0.5">
                {previewLoading ? '\u2014' : personalCount.toLocaleString()}
              </p>
            </div>
            <div className="bg-black/30 rounded px-3 py-2 flex-1 min-w-[140px]">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">Community Packs</p>
              <p className="text-lg font-mono text-purple-400 mt-0.5">
                {previewLoading ? '\u2014' : packCount.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Preview toggle */}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 transition-colors cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>{showPreview ? 'Hide' : 'Show'} personal override preview</span>
            {showPreview ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showPreview && preview?.overrides && (
            <div className="border border-sc-border rounded overflow-hidden">
              <div className="max-h-80 overflow-y-auto divide-y divide-sc-border/30">
                {preview.overrides.slice(0, 100).map((o, i) => (
                  <div key={i} className="px-3 py-2 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] font-mono text-gray-600 shrink-0 w-56 truncate">{o.key}</span>
                      <span className="text-xs font-mono text-sc-accent truncate">{o.value}</span>
                    </div>
                    {o.original && (
                      <p className="text-[10px] font-mono text-gray-600 mt-0.5 pl-56">was: {o.original}</p>
                    )}
                  </div>
                ))}
              </div>
              {preview.overrides.length > 100 && (
                <div className="px-3 py-2 text-xs text-gray-600 font-mono text-center border-t border-sc-border/30">
                  Showing 100 of {preview.overrides.length} personal overrides
                </div>
              )}
              {preview.overrides.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-gray-600">
                  No personal overrides configured. Enable features above to generate overrides.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Installation */}
      <div className="panel">
        <button
          onClick={() => setShowInstall(!showInstall)}
          className="px-5 py-3 flex items-center gap-2 w-full text-left cursor-pointer hover:bg-white/[0.02] transition-colors"
        >
          <Languages className="w-3.5 h-3.5 text-gray-500" />
          <span className="font-display font-semibold text-sm text-white flex-1">Installation Instructions</span>
          {showInstall ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
        </button>
        {showInstall && (
          <div className="px-5 pb-4 text-sm text-gray-400 space-y-3 border-t border-sc-border">
            <p className="pt-3">After downloading, place <code className="text-gray-300 bg-white/5 px-1.5 py-0.5 rounded">global.ini</code> in your Star Citizen folder:</p>
            <pre className="bg-black/30 rounded p-3 text-xs text-gray-300 overflow-x-auto">
{`StarCitizen/
\u2514\u2500\u2500 LIVE/           (or PTU/ or EPTU/)
    \u251C\u2500\u2500 user.cfg
    \u2514\u2500\u2500 data/
        \u2514\u2500\u2500 Localization/
            \u2514\u2500\u2500 english/
                \u2514\u2500\u2500 global.ini   \u2190 place file here`}
            </pre>
            <p>If <code className="text-gray-300 bg-white/5 px-1.5 py-0.5 rounded">user.cfg</code> doesn't exist, create it with:</p>
            <pre className="bg-black/30 rounded p-3 text-xs text-gray-300">g_language = english</pre>
            <p className="text-amber-400/80 text-xs">Game updates overwrite global.ini — re-download after each patch.</p>
          </div>
        )}
      </div>
    </div>
  )
}
