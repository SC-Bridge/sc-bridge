import { useRef, useMemo, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronUp, ChevronDown, RotateCcw } from 'lucide-react'
import { DmgShape, getDamageType } from '../Loadout/loadoutHelpers'
import { reconcileColumns } from './useColumnOrder'
import RenderThumb from '../../components/RenderThumb'

export default function ComponentTable({
  components, columns, columnOrder, onReorderColumns, onResetColumns,
  isSelected, onToggleCompare, compareCount, maxCompare,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const sortKey = searchParams.get('sort') || null
  const sortDir = searchParams.get('dir') || 'desc'
  const dragColRef = useRef(null)
  const topScrollRef = useRef(null)
  const tableScrollRef = useRef(null)
  const syncingRef = useRef(false)

  const orderedKeys = useMemo(
    () => reconcileColumns(columnOrder, columns),
    [columnOrder, columns],
  )
  const colMap = useMemo(() => {
    const m = {}
    for (const col of columns) m[col.key] = col
    return m
  }, [columns])
  const orderedCols = orderedKeys.map(k => colMap[k]).filter(Boolean)

  const sorted = useMemo(() => {
    if (!sortKey) return components
    return [...components].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey]
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'string' && typeof vb === 'string') {
        const cmp = va.localeCompare(vb)
        return sortDir === 'asc' ? cmp : -cmp
      }
      const na = Number(va), nb = Number(vb)
      if (!isNaN(na) && !isNaN(nb)) return sortDir === 'asc' ? na - nb : nb - na
      return 0
    })
  }, [components, sortKey, sortDir])

  // Sync top scrollbar ↔ table scroll
  const syncScroll = useCallback((source) => {
    if (syncingRef.current) return
    syncingRef.current = true
    const top = topScrollRef.current
    const tbl = tableScrollRef.current
    if (source === 'top' && top && tbl) tbl.scrollLeft = top.scrollLeft
    else if (source === 'table' && top && tbl) top.scrollLeft = tbl.scrollLeft
    requestAnimationFrame(() => { syncingRef.current = false })
  }, [])

  // Set top scrollbar width to match table
  useEffect(() => {
    const tbl = tableScrollRef.current
    const top = topScrollRef.current
    if (!tbl || !top) return
    const inner = top.firstElementChild
    if (inner) inner.style.width = `${tbl.scrollWidth}px`
  }, [sorted, orderedCols])

  const toggleSort = (key) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      if (sortKey === key) {
        next.set('dir', sortDir === 'asc' ? 'desc' : 'asc')
      } else {
        next.set('sort', key)
        next.set('dir', 'desc')
      }
      return next
    }, { replace: true })
  }

  const handleDragStart = (e, idx) => {
    dragColRef.current = idx
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
  const handleDragOver = (e) => { e.preventDefault() }
  const handleDrop = (e, dropIdx) => {
    e.preventDefault()
    const dragIdx = dragColRef.current
    if (dragIdx === null || dragIdx === dropIdx) return
    const newOrder = [...orderedKeys]
    const [moved] = newOrder.splice(dragIdx, 1)
    newOrder.splice(dropIdx, 0, moved)
    onReorderColumns(newOrder)
    dragColRef.current = null
  }

  const renderCell = (comp, col) => {
    const val = comp[col.key]
    if (val == null || val === '') {
      return <span className="text-gray-600">&mdash;</span>
    }
    if (col.key === 'damage_type') {
      const dt = getDamageType(comp)
      if (dt) return <span className="inline-flex items-center gap-1.5"><DmgShape type={dt} size={12} />{val}</span>
      return val
    }
    if (col.format) return col.format(val)
    return String(val)
  }

  return (
    <div className="border border-sc-border rounded-lg bg-sc-panel/90">
      {/* Top scrollbar — mirrors table horizontal scroll */}
      <div
        ref={topScrollRef}
        onScroll={() => syncScroll('top')}
        className="overflow-x-auto overflow-y-hidden"
        style={{ height: '12px' }}
      >
        <div style={{ height: '1px' }} />
      </div>

      {/* Scrollable table container — vertical + horizontal */}
      <div
        ref={tableScrollRef}
        onScroll={() => syncScroll('table')}
        className="overflow-x-auto overflow-y-auto"
        style={{ maxHeight: 'calc(100vh - 120px)' }}
      >
        <table className="w-full">
          <thead className="sticky top-0 z-20">
            <tr className="bg-sc-panel border-b border-sc-border">
              <th className="w-12 px-3 py-3 text-center bg-sc-panel">
                <span className="text-xs font-mono text-sc-accent2">{compareCount}/{maxCompare}</span>
              </th>
              {orderedCols.map((col, idx) => {
                const isSorted = sortKey === col.key
                const isNameCol = col.key === 'name'
                return (
                  <th
                    key={col.key}
                    draggable={!isNameCol}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, idx)}
                    onClick={() => toggleSort(col.key)}
                    className={`px-3 py-3 text-xs font-mono uppercase tracking-wider cursor-pointer select-none whitespace-nowrap transition-colors bg-sc-panel ${
                      isSorted ? 'text-sc-accent' : 'text-sc-accent2 hover:text-sc-accent'
                    } ${col.align === 'left' ? 'text-left' : 'text-right'} ${
                      isNameCol ? 'sticky left-0 z-30' : ''
                    }`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {isSorted && (
                        sortDir === 'asc'
                          ? <ChevronUp className="w-3.5 h-3.5" />
                          : <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </span>
                  </th>
                )
              })}
              {columnOrder && (
                <th className="w-10 px-2 py-3 bg-sc-panel">
                  <button
                    onClick={(e) => { e.stopPropagation(); onResetColumns() }}
                    title="Reset column order"
                    className="text-gray-500 hover:text-sc-accent transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((comp) => {
              const selected = isSelected(comp.id)
              return (
                <tr
                  key={comp.id}
                  className={`border-b border-sc-border/30 transition-colors ${
                    selected
                      ? 'bg-sc-accent/10'
                      : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <td className="w-12 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleCompare(comp.id)}
                      className="w-4 h-4 rounded cursor-pointer accent-sc-accent"
                    />
                  </td>
                  {orderedCols.map((col) => {
                    const isNameCol = col.key === 'name'
                    const isMfr = col.key === 'manufacturer_name'
                    return (
                      <td
                        key={col.key}
                        className={`px-3 py-3 text-sm whitespace-nowrap ${
                          isNameCol
                            ? 'sticky left-0 z-10 bg-sc-panel text-white font-medium'
                            : isMfr
                              ? 'text-gray-400'
                              : col.align === 'left'
                                ? 'text-gray-300'
                                : 'text-right font-mono tabular-nums text-gray-200'
                        }`}
                      >
                        {isNameCol ? (
                          <span className="flex items-center gap-2">
                            <RenderThumb
                              render={comp.render}
                              kind={comp.render_variants_kind}
                              itemKey={comp.render_item_key}
                              title={comp.name}
                            />
                            {renderCell(comp, col)}
                          </span>
                        ) : renderCell(comp, col)}
                      </td>
                    )
                  })}
                  {columnOrder && <td className="w-10" />}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {sorted.length === 0 && (
        <div className="py-12 text-center text-gray-400 text-sm">No components match your filters</div>
      )}
    </div>
  )
}
