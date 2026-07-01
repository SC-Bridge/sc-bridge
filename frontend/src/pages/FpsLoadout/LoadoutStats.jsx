// frontend/src/pages/FpsLoadout/LoadoutStats.jsx
import React from 'react'

const ICON = (name) => `/inventory-assets/${name}`

// Palette lifted from the FPS loadout visual system (see MyLoadout.jsx / index.jsx / mock v5).
const CYAN = '#00e8ff'
const CYAN_DIM = '#5fbecb'
const ICE = '#c0f6fe'
const ICE_DIM = 'rgba(192,246,254,0.45)'
const WANT = '#f3b03a'
const LINE = 'rgba(120,200,220,0.14)'
const LINE2 = 'rgba(120,200,220,0.30)'
const PANEL = '#0b1218'

// CSS filter to tint dark SVG icons — matches Ico() in index.jsx / MyLoadout.jsx.
const ICO_FILTER_DIM = 'brightness(0) saturate(100%) invert(60%) sepia(20%) saturate(500%) hue-rotate(155deg) brightness(0.7)'
const ICO_FILTER_ACTIVE = 'brightness(0) saturate(100%) invert(85%) sepia(30%) saturate(1000%) hue-rotate(155deg) brightness(1.1) drop-shadow(0 0 3px rgba(0,232,255,0.6))'

const SLOT_ICON = {
  primary: 'icon_common_primary_weapon',
  secondary: 'icon_common_secondary_weapon',
  sidearm: 'icon_common_sidearm',
}

const ATTACHMENT_ICON = {
  barrel: 'icon_common_weapon_attachment_barrel',
  optic: 'icon_common_weapon_attachment_scope',
  scope: 'icon_common_weapon_attachment_scope',
  underbarrel: 'icon_common_weapon_attachment_underbarrel',
}

const EM_DASH = '—'
const fmtNum = (v, d = 0) => (v == null ? EM_DASH : Number(v).toFixed(d))

const RESIST_ROWS = ['Physical', 'Energy', 'Distortion', 'Temperature']
const ARMOUR_COLS = ['Helmet', 'Core', 'Arms', 'Legs']

function BlockHeader({ children }) {
  return (
    <div
      className="flex items-center gap-2 uppercase"
      style={{
        padding: '9px 12px',
        borderBottom: `1px solid ${LINE}`,
        letterSpacing: '2.4px',
        fontSize: 11,
        color: CYAN_DIM,
      }}
    >
      {children}
    </div>
  )
}

function Th({ children, first = false }) {
  return (
    <th
      className="uppercase font-semibold"
      style={{
        fontSize: 9,
        letterSpacing: '0.8px',
        color: CYAN_DIM,
        textAlign: first ? 'left' : 'right',
        padding: 8,
        borderBottom: `1px solid ${LINE2}`,
      }}
    >
      {children}
    </th>
  )
}

function Td({ children, first = false, emph = false, dim = false, last = false }) {
  return (
    <td
      className="tabular-nums"
      style={{
        padding: '7px 8px',
        borderBottom: last ? 'none' : `1px solid ${LINE}`,
        textAlign: first ? 'left' : 'right',
        color: dim ? ICE_DIM : first ? ICE : '#eafcff',
        fontWeight: emph ? 700 : 400,
      }}
    >
      {children}
    </td>
  )
}

function WeaponName({ slotKey, name, isDesign }) {
  const icon = SLOT_ICON[slotKey]
  return (
    <div className="flex items-center gap-1.5">
      {icon && (
        <img
          src={ICON(`${icon}.svg`)}
          alt=""
          style={{ width: 16, height: 16, filter: ICO_FILTER_DIM }}
        />
      )}
      <span>{name}</span>
      {isDesign && (
        <span
          data-testid="design-tag"
          className="rounded-sm"
          style={{ fontSize: 8, color: WANT, border: '1px solid rgba(243,176,58,0.4)', padding: '0 4px' }}
        >
          DESIGN
        </span>
      )}
    </div>
  )
}

function AttachmentMini({ attachments }) {
  if (!attachments || attachments.length === 0) {
    return <span style={{ color: ICE_DIM }}>{EM_DASH}</span>
  }
  return (
    <div className="inline-flex gap-1 justify-end">
      {attachments.map((type, i) => {
        const icon = ATTACHMENT_ICON[type] || ATTACHMENT_ICON.barrel
        return (
          <span
            key={`${type}-${i}`}
            data-testid={`attmini-${type}`}
            title={type}
            className="inline-flex"
            style={{ width: 14, height: 14 }}
          >
            <img src={ICON(`${icon}.svg`)} alt={type} style={{ width: '100%', height: '100%', filter: ICO_FILTER_ACTIVE }} />
          </span>
        )
      })}
    </div>
  )
}

function WeaponStatsBlock({ weaponStats }) {
  const rows = weaponStats || []
  return (
    <div className="rounded" style={{ border: `1px solid ${LINE}`, background: PANEL }}>
      <BlockHeader>
        <b style={{ color: '#fff' }}>Weapon Stats</b>
        <span style={{ color: ICE_DIM }}>&mdash; per weapon, incl. attachments</span>
      </BlockHeader>
      <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11.5 }} data-testid="weapon-stats-table">
        <thead>
          <tr>
            <Th first>Weapon</Th>
            <Th>DMG</Th>
            <Th>RPM</Th>
            <Th>DPS</Th>
            <Th>Recoil</Th>
            <Th>Attachments</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <Td first last dim>No weapons equipped</Td>
              <Td last dim>{EM_DASH}</Td>
              <Td last dim>{EM_DASH}</Td>
              <Td last dim>{EM_DASH}</Td>
              <Td last dim>{EM_DASH}</Td>
              <Td last dim>{EM_DASH}</Td>
            </tr>
          ) : (
            rows.map((w, i) => {
              const last = i === rows.length - 1
              return (
                <tr key={`${w.slot_key}-${i}`} data-testid={`weapon-stat-row-${w.slot_key}`}>
                  <Td first last>
                    <WeaponName slotKey={w.slot_key} name={w.name} isDesign={w.isDesign} />
                  </Td>
                  <Td last>{fmtNum(w.damage, 1)}</Td>
                  <Td last>{fmtNum(w.rpm, 0)}</Td>
                  <Td last emph>{fmtNum(w.dps, 0)}</Td>
                  <Td last>{w.recoil != null ? `×${Number(w.recoil).toFixed(2)}` : EM_DASH}</Td>
                  <Td last>
                    <AttachmentMini attachments={w.attachments} />
                  </Td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

function ArmourStatsBlock() {
  return (
    <div className="rounded" style={{ border: `1px solid ${LINE}`, background: PANEL }}>
      <BlockHeader>
        <b style={{ color: '#fff' }}>Armour Stats</b>
        <span style={{ color: ICE_DIM }}>&mdash; combined + per piece</span>
      </BlockHeader>
      <table className="w-full" style={{ borderCollapse: 'collapse', fontSize: 11.5 }} data-testid="armour-stats-table">
        <thead>
          <tr>
            <Th first>Resist</Th>
            <Th>&#931; Total</Th>
            {ARMOUR_COLS.map((c) => <Th key={c}>{c}</Th>)}
          </tr>
        </thead>
        <tbody>
          {RESIST_ROWS.map((r, i) => {
            const last = i === RESIST_ROWS.length - 1
            return (
              <tr key={r} data-testid={`armour-stat-row-${r.toLowerCase()}`}>
                <Td first last>{r}</Td>
                <Td last emph dim>{EM_DASH}</Td>
                {ARMOUR_COLS.map((c) => (
                  <Td key={c} last dim>{EM_DASH}</Td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="italic" style={{ padding: '8px 10px', fontSize: 11, color: ICE_DIM }}>
        No armour equipped &middot; slice 2
      </div>
    </div>
  )
}

export default function LoadoutStats({ weaponStats }) {
  return (
    <div className="grid grid-cols-2 gap-3 mt-3">
      <WeaponStatsBlock weaponStats={weaponStats} />
      <ArmourStatsBlock />
    </div>
  )
}
