import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ListChecks, Table2, Upload, RotateCcw } from 'lucide-react'
import {
  useHangarCleanup, useShips, saveCleanupDecision, saveCleanupBuy, removeCleanupBuy,
  saveCleanupState, resetCleanup,
} from '../../hooks/useAPI'
import PageHeader from '../../components/PageHeader'
import LoadingState from '../../components/LoadingState'
import ErrorState from '../../components/ErrorState'
import EmptyState from '../../components/EmptyState'
import SyncStalenessBanner from '../../components/SyncStalenessBanner'
import { makeCatalog, normaliseExport, analyse, rebuyPrice, buildSteps } from '../../lib/hangarCleanup'
import { Totals, Insights } from './Overview'
import Ledger from './Ledger'
import BuyList from './BuyList'
import ProcessView from './ProcessView'

const EMPTY_PLAN = { decisions: {}, buys: {}, creditOverride: null, done: [] }

/** Server payload → the plan shape the page edits. */
function planFromServer(data) {
  if (!data) return EMPTY_PLAN
  return {
    decisions: data.decisions ?? {},
    buys: Object.fromEntries((data.buys ?? []).map((b) => [b.vehicle_id, b.price_cents ?? null])),
    creditOverride: data.state?.credit_override_cents ?? null,
    done: data.state?.done_steps ?? [],
  }
}

/** Drop a decision row once it says nothing, matching the server's delete-when-empty rule. */
function cleanDecision(d) {
  return d && (d.decision || d.buy_ingame || d.iae_price_cents != null) ? d : null
}

export default function HangarCleanup() {
  const { data, loading, error, refetch } = useHangarCleanup()
  const { data: shipsData } = useShips()
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'steps' ? 'steps' : 'plan'

  // A loaded export file is analysed locally and never saved to the account.
  const [fileModel, setFileModel] = useState(null)
  const [fileError, setFileError] = useState('')
  const [syncedPlan, setSyncedPlan] = useState(EMPTY_PLAN)
  const [filePlan, setFilePlan] = useState(EMPTY_PLAN)
  const [saveError, setSaveError] = useState('')
  const [open, setOpen] = useState(new Set())
  const [confirmReset, setConfirmReset] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => { if (data) setSyncedPlan(planFromServer(data)) }, [data])

  const catalog = useMemo(() => makeCatalog(Array.isArray(shipsData) ? shipsData : shipsData?.ships ?? []), [shipsData])
  const isFile = fileModel != null
  const plan = isFile ? filePlan : syncedPlan
  const setPlan = isFile ? setFilePlan : setSyncedPlan
  // Handlers compute the next value from this, so what we save is what we show
  // (a setState updater may run after the handler returns).
  const planRef = useRef(plan)
  planRef.current = plan

  const model = useMemo(() => {
    if (fileModel) return fileModel
    if (!data) return null
    return { source: 'synced', synced_at: data.synced_at, store_credit_cents: data.store_credit_cents, pledges: data.pledges ?? [], buybacks: data.buybacks ?? [] }
  }, [fileModel, data])
  const analysis = useMemo(() => (model ? analyse(model) : { rows: [], tokens: [] }), [model])
  const { rows, tokens } = analysis

  // Saves go to the account in synced mode only; the local state is the source of truth for the page.
  const persist = useCallback(async (fn) => {
    if (isFile) return
    try { await fn(); setSaveError('') } catch (e) { setSaveError(`Couldn’t save: ${e.message}. Your change shows here but isn’t stored yet.`) }
  }, [isFile])

  const onDecide = useCallback((id, patch) => {
    const blank = { decision: null, buy_ingame: false, iae_price_cents: null }
    const merged = cleanDecision({ ...blank, ...planRef.current.decisions[id], ...patch })
    setPlan((p) => {
      const decisions = { ...p.decisions }
      if (merged) decisions[id] = merged
      else delete decisions[id]
      return { ...p, decisions }
    })
    persist(() => saveCleanupDecision(id, merged ?? blank))
  }, [setPlan, persist])

  const onToggleBuy = useCallback((vehicleId, on) => {
    setPlan((p) => {
      const buys = { ...p.buys }
      if (on) buys[vehicleId] = null
      else delete buys[vehicleId]
      return { ...p, buys }
    })
    persist(() => (on ? saveCleanupBuy(vehicleId, null) : removeCleanupBuy(vehicleId)))
  }, [setPlan, persist])

  const onBuyPrice = useCallback((vehicleId, cents) => {
    setPlan((p) => ({ ...p, buys: { ...p.buys, [vehicleId]: cents } }))
    persist(() => saveCleanupBuy(vehicleId, cents))
  }, [setPlan, persist])

  const onCredit = useCallback((cents) => {
    setPlan((p) => ({ ...p, creditOverride: cents }))
    persist(() => saveCleanupState({ credit_override_cents: cents }))
  }, [setPlan, persist])

  const onToggleDone = useCallback((key) => {
    const cur = planRef.current.done
    const done = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
    setPlan((p) => ({ ...p, done }))
    persist(() => saveCleanupState({ done_steps: done }))
  }, [setPlan, persist])

  const onReset = useCallback(async () => {
    if (!confirmReset) { setConfirmReset(true); setTimeout(() => setConfirmReset(false), 4000); return }
    setConfirmReset(false)
    setPlan(EMPTY_PLAN)
    persist(() => resetCleanup())
  }, [confirmReset, setPlan, persist])

  const loadFile = useCallback((file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result)
        setFileModel(normaliseExport(json, catalog))
        setFilePlan(EMPTY_PLAN)
        setOpen(new Set())
        setFileError('')
      } catch (e) {
        setFileError(e instanceof SyntaxError ? 'That file isn’t valid JSON. Load the file the SC Bridge extension exported (sc-bridge-hangar-YYYY-MM-DD.json).' : e.message)
      }
    }
    reader.readAsText(file)
  }, [catalog])

  const setView = (v) => setSearchParams((prev) => { if (v === 'steps') prev.set('view', 'steps'); else prev.delete('view'); return prev })
  const onToggleRow = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const onJump = (id) => {
    setOpen((s) => new Set(s).add(id))
    setTimeout(() => document.getElementById(`hc-row-${id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
  }

  const credit = plan.creditOverride ?? model?.store_credit_cents ?? 0
  const buyList = useMemo(() => Object.entries(plan.buys).map(([id, price]) => {
    const s = catalog.byId.get(Number(id))
    return { vehicle_id: Number(id), name: s?.name ?? `Ship #${id}`, price_cents: price ?? s?.pledge_price_cents ?? null }
  }), [plan.buys, catalog])
  const owned = useMemo(() => new Set(rows.flatMap((r) => r.ships.map((s) => s.vehicle_id))), [rows])

  const totals = useMemo(() => {
    const d = (r) => plan.decisions[r.id]
    const meltable = rows.filter((r) => r.meltable && r.value > 0)
    const suggested = meltable.filter((r) => r.suggestion.action === 'melt' || (d(r)?.buy_ingame && r.cat !== 'CCU'))
    const planned = rows.filter((r) => ['melt', 'melt-ig', 'iae'].includes(d(r)?.decision))
    const rebuys = rows.filter((r) => d(r)?.decision === 'iae')
    const sum = (list, f) => list.reduce((a, x) => a + (f(x) || 0), 0)
    const plannedV = sum(planned, (r) => r.value)
    const rebuyV = sum(rebuys, (r) => rebuyPrice(r, plan.decisions).cents)
    const buyV = sum(buyList, (b) => b.price_cents)
    return {
      meltableV: sum(meltable, (r) => r.value), meltableN: meltable.length,
      suggestedV: sum(suggested, (r) => r.value), suggestedN: suggested.length,
      plannedV, plannedN: planned.length, rebuyV, rebuyN: rebuys.length, buyV, buyN: buyList.length,
      after: credit + plannedV - rebuyV - buyV,
      insN: rows.filter((r) => r.suggestion.action === 'ins').length,
    }
  }, [rows, plan.decisions, buyList, credit])

  const steps = useMemo(() => buildSteps({ rows, decisions: plan.decisions, buys: buyList, credit, catalog }), [rows, plan.decisions, buyList, credit, catalog])
  const undecidedMelts = rows.filter((r) => !plan.decisions[r.id]?.decision && r.suggestion.action === 'melt').length
  const actionCount = Object.values(plan.decisions).filter((x) => x.decision && x.decision !== 'keep').length + buyList.length

  if (loading && !fileModel) return <LoadingState message="Loading your hangar…" />
  if (error && !fileModel) return <ErrorState message={error} onRetry={refetch} />

  const noSync = !isFile && !(data?.pledges?.length)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hangar Cleanup"
        subtitle="What to melt, what needs better insurance, what was CCU’d from what, and what to buy at IAE."
        actions={(
          <div className="flex items-center gap-2">
            {view === 'steps'
              ? <button type="button" className="btn-secondary inline-flex items-center gap-2" onClick={() => setView('plan')}><Table2 className="w-4 h-4" />Back to planner</button>
              : <button type="button" className="btn-primary inline-flex items-center gap-2" onClick={() => setView('steps')} disabled={!model}><ListChecks className="w-4 h-4" />Process plan</button>}
          </div>
        )}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="px-2 py-0.5 rounded border border-sc-warn/40 bg-sc-warn/10 text-amber-200 text-[11px] font-display uppercase tracking-wider">Preview</span>
        {isFile ? (
          <>
            <span className="text-gray-300">Viewing an export file{fileModel.owner ? ` for ${fileModel.owner}` : ''}. Decisions here aren’t saved.</span>
            <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => { setFileModel(null); setOpen(new Set()) }}>Back to my synced hangar</button>
          </>
        ) : (
          <span className="text-gray-400">
            Your synced hangar{data?.synced_at ? `, last synced ${new Date(data.synced_at).toLocaleString()}` : ''}. Decisions save to your account.
            {view === 'plan' && actionCount > 0 && <span className="ml-1 text-gray-500">{actionCount} action{actionCount > 1 ? 's' : ''} planned.</span>}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = '' }} />
          <button type="button" className="btn-ghost inline-flex items-center gap-1.5 !px-2 !py-1" onClick={() => fileInput.current?.click()}><Upload className="w-4 h-4" />Load export file</button>
          {!noSync && (
            <button type="button" className={`${confirmReset ? 'btn-danger' : 'btn-ghost'} inline-flex items-center gap-1.5 !px-2 !py-1`} onClick={onReset}>
              <RotateCcw className="w-4 h-4" />{confirmReset ? 'Click again to clear all decisions' : 'Reset decisions'}
            </button>
          )}
        </span>
      </div>
      {fileError && <p className="text-sm text-red-300" role="alert">{fileError}</p>}
      {saveError && <p className="text-sm text-red-300" role="alert">{saveError}</p>}
      {!isFile && !noSync && <SyncStalenessBanner />}

      {noSync ? (
        <EmptyState
          large
          icon={Upload}
          message="No synced hangar yet. Sync your RSI hangar with the SC Bridge extension, or load an export file above."
          actionLink={{ to: '/sync-import', label: 'Go to Sync & Import' }}
        />
      ) : (
        <>
          <Totals totals={totals} credit={credit} creditIsOverride={plan.creditOverride != null} onCredit={onCredit} />
          {view === 'steps' ? (
            <ProcessView plan={steps} done={plan.done} onToggleDone={onToggleDone} undecidedMelts={undecidedMelts} />
          ) : (
            <>
              <Insights rows={rows} tokens={tokens} onJump={onJump} />
              <Ledger rows={rows} decisions={plan.decisions} onDecide={onDecide} open={open} onToggle={onToggleRow} />
              <BuyList catalog={catalog} owned={owned} buys={plan.buys} onToggle={onToggleBuy} onPrice={onBuyPrice} />
            </>
          )}
        </>
      )}
    </div>
  )
}
