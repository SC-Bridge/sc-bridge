import React from 'react'
import LoadoutContainer from './LoadoutContainer'

// Sci-fi HUD frame — clipped corners + soft glow border, matching the rest of
// the FPS loadout visual system (see LoadoutContainer.jsx / mock v5).
export default function FpsLoadout() {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        height: 'calc(100vh - 3rem)',
        color: '#c0f6fe',
        fontFamily: 'sans-serif',
        background: 'radial-gradient(1200px 700px at 50% -10%, #0c1822, #070b0f 60%)',
      }}
    >
      {/* F288: page-level heading for screen readers (the visual UI uses styled spans). */}
      <h1 className="sr-only">FPS Loadout</h1>
      <div
        className="absolute overflow-hidden flex flex-col"
        style={{
          inset: 14,
          border: '1px solid rgba(120,200,220,0.30)',
          borderRadius: 6,
          background: 'linear-gradient(180deg, rgba(10,20,28,0.7), rgba(7,11,15,0.7))',
          clipPath: 'polygon(0 14px, 14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px))',
        }}
      >
        <div
          data-testid="wip-banner"
          className="flex-none flex items-center justify-center gap-2 uppercase"
          style={{
            padding: '5px 12px',
            letterSpacing: '2.4px',
            fontSize: 11,
            color: '#fbbf24',
            background: 'rgba(251,191,36,0.08)',
            borderBottom: '1px solid rgba(251,191,36,0.35)',
          }}
        >
          <span aria-hidden="true">⚠</span>
          <span>Work in progress — this page is under active development; layouts and stats may change</span>
        </div>
        <div className="relative flex-1 overflow-hidden">
          <LoadoutContainer />
        </div>
      </div>
    </div>
  )
}
