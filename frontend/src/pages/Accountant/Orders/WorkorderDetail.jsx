// Workorder detail route page (design §7, UX B.5): component orders with
// per-order progress, contract panel with change markers, status-driven
// actions — draft composes (attach/detach/publish), open cancels,
// in_progress terminates via TerminateModal.
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import PageHeader from '../../../components/PageHeader'
import LoadingState from '../../../components/LoadingState'
import { STATUS_LABELS } from '../constants'
import { formatAUEC, signClass } from '../formatAUEC'
import {
  addWorkorderOrders, cancelWorkorder, detachWorkorderOrder,
  publishWorkorder, useOrders, useWorkorder,
} from '../hooks'
import { orderRef, woRef } from '../orderMath'
import { CONTRACT_FIELDS } from './OrderDetail'
import OrderTable from './OrderTable'
import TerminateModal from './TerminateModal'

const accentBtn = 'bg-sc-accent/20 text-sc-accent border border-sc-accent/40 rounded px-3 py-1.5 text-sm hover:bg-sc-accent/30 disabled:opacity-50'
const ghostBtn = 'border border-sc-border text-gray-300 rounded px-3 py-1.5 text-sm hover:bg-white/5 disabled:opacity-50'

// busy disables the mutation buttons while a POST is in flight — a double
// click must never fire twice (the second 400 would paint a spurious error
// over a success).
function ActionBar({ wo, openCount, busy, onPublish, onCancel, onTerminate }) {
  if (wo.status === 'draft') {
    return (
      <div className="flex gap-2">
        <button onClick={onPublish} disabled={openCount < 2 || busy} className={accentBtn}>Publish</button>
        <button onClick={onCancel} disabled={busy} className={ghostBtn}>Cancel workorder</button>
      </div>
    )
  }
  if (wo.status === 'open') {
    return <button onClick={onCancel} disabled={busy} className={ghostBtn}>Cancel workorder</button>
  }
  if (wo.status === 'in_progress') {
    return <button onClick={onTerminate} className={accentBtn}>Terminate…</button>
  }
  return null
}

// Draft-only composition: attach standalone open orders one by one. The list
// endpoint has no standalone filter — workorder_id === null is client-side
// (NewWorkorder's AttachPicker pattern, immediate pessimistic attach here).
function AttachSection({ woId, onError }) {
  const { data, error, loading } = useOrders('status=open')

  if (loading && !data) return <p className="text-sm text-gray-500">Loading open orders…</p>
  if (error) return <p className="text-sm text-sc-danger">{error.message}</p>

  const standalone = (data.orders ?? []).filter((o) => o.workorder_id === null)
  if (standalone.length === 0) {
    return <p className="text-sm text-gray-500">No standalone open orders to attach.</p>
  }

  async function attach(orderId) {
    onError(null)
    try {
      await addWorkorderOrders(woId, { order_id: orderId })
    } catch (e) {
      onError(e.message)
    }
  }

  return (
    <div className="space-y-1" data-testid="attach-section">
      {standalone.map((o) => (
        <div key={o.id} className="flex items-center gap-2 text-sm text-gray-300 py-0.5">
          <span className="text-gray-400">{orderRef(o.id)}</span>
          <span className="text-white">{o.item}</span>
          <span className="ml-auto tabular-nums">{formatAUEC(o.total)}</span>
          <button type="button" onClick={() => attach(o.id)} className={ghostBtn}>Attach</button>
        </div>
      ))}
    </div>
  )
}

function DetachList({ woId, components, onError }) {
  async function detach(orderId) {
    onError(null)
    try {
      await detachWorkorderOrder(woId, orderId)
    } catch (e) {
      onError(e.message)
    }
  }

  return (
    <div className="space-y-1" data-testid="detach-list">
      {components.map((o) => (
        <div key={o.id} className="flex items-center gap-2 text-sm text-gray-300 py-0.5">
          <span className="text-gray-400">{orderRef(o.id)}</span>
          <span className="text-white">{o.item}</span>
          <button type="button" onClick={() => detach(o.id)} className={`ml-auto ${ghostBtn}`}>Detach</button>
        </div>
      ))}
    </div>
  )
}

export default function WorkorderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data, error, loading, refetch } = useWorkorder(id)
  const [terminating, setTerminating] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (loading && !data) return <LoadingState />
  if (error) {
    return (
      <div className="p-6">
        <div role="alert" className="panel p-4 text-sc-danger text-sm">{error.message}</div>
        <button onClick={refetch} className="mt-3 text-sm text-sc-accent">Retry</button>
      </div>
    )
  }

  const { workorder: wo, components, summaryPreview, settlementPreview } = data
  // Publish gate counts OPEN components only — the server's rule, mirrored
  // as a disabled hint (never enforced client-side alone).
  const openCount = components.filter((o) => o.status === 'open').length

  async function run(action) {
    setActionError(null)
    setBusy(true)
    try {
      await action()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function publish() {
    run(() => publishWorkorder(wo.id))
  }

  function cancel() {
    if (!window.confirm('Cancel this workorder? Open components are cancelled and their reserves released.')) return
    run(() => cancelWorkorder(wo.id))
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title={`${woRef(wo.id)} · ${wo.title}`}
        subtitle={`${STATUS_LABELS[wo.status]}${wo.counterparty ? ` · ${wo.counterparty}` : ''}`}
        actions={
          <ActionBar wo={wo} openCount={openCount} busy={busy}
            onPublish={publish} onCancel={cancel} onTerminate={() => setTerminating(true)} />
        }
      />

      {actionError && <div role="alert" className="text-sm text-sc-danger">{actionError}</div>}

      {wo.status === 'terminated' && (
        <div data-testid="termination-banner" className="panel p-4 border-sc-danger/40">
          <p className="text-sm text-sc-danger">
            Terminated by {wo.terminated_by === 'you' ? 'you' : 'counterparty'}
          </p>
          <p className="text-sm text-gray-300 mt-1">{wo.termination_note}</p>
        </div>
      )}

      {wo.status === 'complete' ? (
        <div data-testid="wo-summary" className="panel p-4 text-sm text-gray-300">
          Net result: <span className={`tabular-nums ${signClass(summaryPreview.netFulfilled)}`}>
            {formatAUEC(summaryPreview.netFulfilled)}
          </span>
          {' '}· completed {new Date(wo.completed_at).toLocaleDateString()}
        </div>
      ) : wo.status !== 'terminated' && wo.status !== 'cancelled' && (
        <p className="text-sm text-gray-400" data-testid="wo-summary-preview">
          Summary (on completion) — net fulfilled so far:{' '}
          <span className="tabular-nums">{formatAUEC(summaryPreview.netFulfilled)}</span>
        </p>
      )}

      <section className="panel p-4 space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-gray-500">
          Component orders ({components.length})
        </h3>
        {components.length === 0 ? (
          <p className="text-sm text-gray-500">No component orders yet.</p>
        ) : (
          <OrderTable orders={components}
            onSelect={(orderId) => navigate(`/accountant/orders/market?order=${orderId}`)} />
        )}
        {wo.status === 'draft' && openCount < 2 && (
          <p className="text-sm text-sc-warn">
            A workorder needs at least 2 open component orders to publish.
          </p>
        )}
      </section>

      {wo.status === 'draft' && (
        <section className="panel p-4 space-y-4">
          <h3 className="text-xs uppercase tracking-wider text-gray-500">Composition (draft)</h3>
          <p className="text-sm text-gray-500">
            Draft components can&apos;t be cancelled or fulfilled — detach them instead.
          </p>
          {components.length > 0 && (
            <DetachList woId={wo.id} components={components} onError={setActionError} />
          )}
          <fieldset className="border border-sc-border rounded p-3 space-y-2">
            <legend className="text-xs uppercase tracking-wider text-gray-500 px-1">
              Attach existing open orders
            </legend>
            <AttachSection woId={wo.id} onError={setActionError} />
          </fieldset>
        </section>
      )}

      <section className="panel p-4">
        <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2">Contract</h3>
        <dl className="text-sm space-y-1 max-w-md">
          {CONTRACT_FIELDS.map(([key, label, value]) => (
            <div key={key} data-testid={`contract-${key}`} className="flex justify-between gap-2">
              <dt className="text-gray-500">{label}</dt>
              <dd className="text-gray-300 text-right">
                {value(wo)}
                {wo.modified_fields.includes(key) && (
                  <span data-testid="modified-marker" className="ml-1.5 text-sc-warn">← modified</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {terminating && (
        <TerminateModal
          workorder={wo}
          orders={components}
          suggestion={settlementPreview.suggestion}
          onClose={() => setTerminating(false)}
          onSaved={() => setTerminating(false)}
        />
      )}
    </div>
  )
}
