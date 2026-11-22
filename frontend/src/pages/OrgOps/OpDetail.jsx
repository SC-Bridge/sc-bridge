import React, { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Users, Ship, DollarSign, CheckCircle, Clock, Play, XCircle,
  UserPlus, UserMinus, Plus, Loader2, AlertCircle, Check, Copy, ExternalLink, Star,
} from 'lucide-react'
import { useOrgOp } from '../../hooks/useAPI'
import { useSession } from '../../lib/auth-client'
import PageHeader from '../../components/PageHeader'
import LoadingState from '../../components/LoadingState'
import ErrorState from '../../components/ErrorState'
import ShipImage from '../../components/ShipImage'
import RatingModal from '../../components/RatingModal'
import ConfirmDialog from '../../components/ConfirmDialog'
import { formatDate } from '../../lib/dates'
import useTimezone from '../../hooks/useTimezone'

const STATUS_BADGES = {
  planning: { label: 'Planning', color: 'text-blue-400 bg-blue-400/10 border-blue-400/30' },
  active: { label: 'Active', color: 'text-green-400 bg-green-400/10 border-green-400/30' },
  completed: { label: 'Completed', color: 'text-gray-400 bg-white/5 border-sc-border' },
  cancelled: { label: 'Cancelled', color: 'text-red-400 bg-red-400/10 border-red-400/30' },
  archived: { label: 'Archived', color: 'text-gray-600 bg-white/5 border-sc-border' },
}

export default function OpDetail() {
  const { slug, opId } = useParams()
  const navigate = useNavigate()
  const { data: session } = useSession()
  const { timezone } = useTimezone()
  const { data, loading, error, refetch } = useOrgOp(slug, opId)

  const [ratingTarget, setRatingTarget] = useState(null) // { userId, name }
  const [actionLoading, setActionLoading] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [actionMsg, setActionMsg] = useState(null)
  const [earningAmount, setEarningAmount] = useState('')
  const [earningNote, setEarningNote] = useState('')
  const [showEarningForm, setShowEarningForm] = useState(false)
  const [joinCode, setJoinCode] = useState(null)
  const [codeCopied, setCodeCopied] = useState(false)

  if (loading) return <LoadingState message="Loading op..." />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data) return null

  const { op, participants, ships, earnings, capital, payouts, callerRole } = data
  const userId = session?.user?.id
  const r = op
  const isCreator = r.created_by === userId
  const canManage = isCreator || callerRole === 'owner' || callerRole === 'admin'
  const isParticipant = participants.some(p => p.user_id === userId && !p.left_at)
  const badge = STATUS_BADGES[r.status] || STATUS_BADGES.planning
  const totalEarnings = earnings.reduce((s, e) => s + e.amount, 0)
  const totalCapital = capital.reduce((s, c) => s + c.amount, 0)

  const apiCall = async (url, method = 'POST', body = undefined) => {
    setActionLoading(url)
    setActionError(null)
    setActionMsg(null)
    try {
      const opts = { method, credentials: 'include', headers: {} }
      if (body) {
        opts.headers['Content-Type'] = 'application/json'
        opts.body = JSON.stringify(body)
      }
      const resp = await fetch(url, opts)
      const d = await resp.json()
      if (!resp.ok) throw new Error(d.error || 'Request failed')
      setActionMsg(d.message || 'Done')
      setTimeout(() => setActionMsg(null), 3000)
      await refetch()
      return d
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActionLoading(null)
    }
  }

  const handleJoin = () => apiCall(`/api/orgs/${slug}/ops/${opId}/join`)
  const handleLeave = () => apiCall(`/api/orgs/${slug}/ops/${opId}/leave`)
  const handleStart = () => apiCall(`/api/orgs/${slug}/ops/${opId}`, 'PATCH', { status: 'active' })
  const handleComplete = () => apiCall(`/api/orgs/${slug}/ops/${opId}/complete`)
  const handleCancel = () => apiCall(`/api/orgs/${slug}/ops/${opId}`, 'PATCH', { status: 'cancelled' })

  const handleAddEarning = async (e) => {
    e.preventDefault()
    const amount = parseInt(earningAmount, 10)
    if (!amount || amount <= 0) return
    await apiCall(`/api/orgs/${slug}/ops/${opId}/earnings`, 'POST', {
      amount,
      note: earningNote || null,
    })
    setEarningAmount('')
    setEarningNote('')
    setShowEarningForm(false)
  }

  const handleMarkPaid = (payeeUserId) =>
    apiCall(`/api/orgs/${slug}/ops/${opId}/payouts/${payeeUserId}`, 'PATCH')

  // F289: Share Link flips the op's is_public flag. Confirm first so org-leaders
  // don't accidentally expose internal ops to the public.
  const [shareConfirm, setShareConfirm] = useState(false)
  const handleGenerateCode = async () => {
    const result = await apiCall(`/api/orgs/${slug}/ops/${opId}/code`)
    if (result?.join_code) setJoinCode(result.join_code)
  }
  const confirmGenerateCode = () => {
    setShareConfirm(false)
    handleGenerateCode()
  }

  const handleCopyCode = () => {
    const code = joinCode || r.join_code
    if (code) {
      navigator.clipboard.writeText(`${window.location.origin}/join/${code}`)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title={r.name}
        subtitle={r.op_type_label}
        actions={
          <Link
            to={`/orgs/${slug}?tab=ops`}
            className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to ops
          </Link>
        }
      />

      {/* Status + action messages */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-widest px-2 py-1 rounded border font-display ${badge.color}`}>
          {badge.label}
        </span>
        {r.description && (
          <p className="text-sm text-gray-400 flex-1">{r.description}</p>
        )}
      </div>

      {actionError && (
        <div className="flex items-center gap-2 p-3 bg-sc-danger/10 border border-sc-danger/30 rounded text-sc-danger text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}
      {actionMsg && (
        <div className="flex items-center gap-2 p-3 bg-sc-success/10 border border-sc-success/30 rounded text-sc-success text-sm">
          <Check className="w-4 h-4 shrink-0" />
          <span>{actionMsg}</span>
        </div>
      )}

      {/* Actions bar */}
      <div className="flex flex-wrap gap-2">
        {!isParticipant && (r.status === 'planning' || r.status === 'active') && (
          <button onClick={handleJoin} disabled={!!actionLoading}
            className="btn-primary px-3 py-1.5 text-xs font-display tracking-wider uppercase flex items-center gap-1.5 disabled:opacity-50">
            <UserPlus className="w-3.5 h-3.5" />
            Join Op
          </button>
        )}
        {isParticipant && !isCreator && (r.status === 'planning' || r.status === 'active') && (
          <button onClick={handleLeave} disabled={!!actionLoading}
            className="px-3 py-1.5 text-xs font-display tracking-wider uppercase flex items-center gap-1.5 border border-sc-border rounded text-gray-400 hover:text-red-400 hover:border-red-400/30 transition-colors disabled:opacity-50">
            <UserMinus className="w-3.5 h-3.5" />
            Leave Op
          </button>
        )}
        {canManage && r.status === 'planning' && (
          <button onClick={handleStart} disabled={!!actionLoading}
            className="btn-primary px-3 py-1.5 text-xs font-display tracking-wider uppercase flex items-center gap-1.5 disabled:opacity-50">
            <Play className="w-3.5 h-3.5" />
            Start Op
          </button>
        )}
        {canManage && r.status === 'active' && (
          <button onClick={handleComplete} disabled={!!actionLoading}
            className="btn-primary px-3 py-1.5 text-xs font-display tracking-wider uppercase flex items-center gap-1.5 disabled:opacity-50">
            <CheckCircle className="w-3.5 h-3.5" />
            Complete
          </button>
        )}
        {canManage && (r.status === 'planning' || r.status === 'active') && (
          <button onClick={handleCancel} disabled={!!actionLoading}
            className="px-3 py-1.5 text-xs font-display tracking-wider uppercase flex items-center gap-1.5 border border-sc-border rounded text-gray-400 hover:text-red-400 hover:border-red-400/30 transition-colors disabled:opacity-50">
            <XCircle className="w-3.5 h-3.5" />
            Cancel
          </button>
        )}
        {canManage && (r.status === 'planning' || r.status === 'active') && (
          <button onClick={() => setShareConfirm(true)} disabled={!!actionLoading}
            className="px-3 py-1.5 text-xs font-display tracking-wider uppercase flex items-center gap-1.5 border border-sc-border rounded text-gray-400 hover:text-sc-accent hover:border-sc-accent/30 transition-colors disabled:opacity-50">
            <ExternalLink className="w-3.5 h-3.5" />
            {r.join_code ? 'Regenerate Code' : 'Share Link'}
          </button>
        )}
      </div>

      {/* Join code display — F291: surface expiry timestamp so org-leaders know
          when the shared link stops working (defaults to 24h from generation). */}
      {(joinCode || r.join_code) && (
        <div className="flex flex-col gap-1 p-3 bg-sc-darker border border-sc-border rounded">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Join link:</span>
            <code className="text-sm text-sc-accent font-mono">{window.location.origin}/join/{joinCode || r.join_code}</code>
            <button onClick={handleCopyCode} className="p-1 rounded hover:bg-white/5">
              {codeCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}
            </button>
          </div>
          {r.join_code_expires_at && (
            <p className="text-[10px] text-gray-500 font-mono">
              Expires {formatDate(r.join_code_expires_at, timezone)} · Public is_public={r.is_public ? 'true' : 'false'}
            </p>
          )}
        </div>
      )}

      {/* Grid: participants, ships, earnings, payouts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Participants */}
        <div className="panel p-4 space-y-3">
          <h3 className="text-xs font-display uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Participants ({participants.length})
          </h3>
          <div className="space-y-1">
            {participants.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.02]">
                {p.user_image ? (
                  <img src={p.user_image} alt="" className="w-6 h-6 rounded-full border border-sc-border shrink-0" />
                ) : (
                  <div className="w-6 h-6 rounded-full border border-sc-border bg-sc-darker flex items-center justify-center text-[10px] text-gray-500 shrink-0">
                    {(p.user_name || '?')[0].toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-gray-300 flex-1 truncate">{p.user_name}</span>
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-display">{p.role}</span>
                {p.left_at && (
                  <span className="text-[10px] text-red-400">left</span>
                )}
                {r.status === 'completed' && p.user_id !== userId && isParticipant && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setRatingTarget({ userId: p.user_id, name: p.user_name }) }}
                    className="p-1 rounded hover:bg-amber-400/10 transition-colors"
                    title={`Rate ${p.user_name}`}
                  >
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Ships */}
        <div className="panel p-4 space-y-3">
          <h3 className="text-xs font-display uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
            <Ship className="w-3.5 h-3.5" />
            Ships ({ships.length})
          </h3>
          <div className="space-y-1">
            {ships.length === 0 ? (
              <p className="text-xs text-gray-600">No ships assigned</p>
            ) : ships.map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/[0.02]">
                <ShipImage render={s.render} src={s.image_url} alt={s.vehicle_name} aspectRatio="thumbnail" className="w-10 rounded border border-sc-border/50 shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white truncate block">{s.custom_name || s.vehicle_name}</span>
                  <span className="text-[10px] text-gray-500">{s.owner_name}{s.role ? ` · ${s.role}` : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Earnings */}
        <div className="panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-display uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              Earnings
            </h3>
            <span className="text-sm font-mono text-white">{totalEarnings.toLocaleString()} aUEC</span>
          </div>
          <div className="space-y-1">
            {earnings.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-2 py-1 text-xs">
                <span className="text-gray-400">{e.logged_by_name}{e.note ? ` — ${e.note}` : ''}</span>
                <span className="text-white font-mono">{e.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
          {isParticipant && r.status === 'active' && (
            <>
              {showEarningForm ? (
                <form onSubmit={handleAddEarning} className="space-y-2 pt-2 border-t border-sc-border">
                  <input
                    type="number"
                    value={earningAmount}
                    onChange={(e) => setEarningAmount(e.target.value)}
                    placeholder="Amount (aUEC)"
                    className="w-full px-3 py-2 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none"
                    min="1"
                  />
                  <input
                    type="text"
                    value={earningNote}
                    onChange={(e) => setEarningNote(e.target.value)}
                    placeholder="Note (optional)"
                    className="w-full px-3 py-2 bg-sc-darker border border-sc-border rounded text-sm text-white placeholder-gray-600 focus:border-sc-accent focus:outline-none"
                    maxLength={500}
                  />
                  <div className="flex gap-2">
                    <button type="submit" disabled={!earningAmount || !!actionLoading}
                      className="btn-primary px-3 py-1.5 text-xs font-display tracking-wider uppercase disabled:opacity-50">
                      Log
                    </button>
                    <button type="button" onClick={() => setShowEarningForm(false)}
                      className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-300">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setShowEarningForm(true)}
                  className="flex items-center gap-1 text-xs text-sc-accent hover:text-sc-accent/80">
                  <Plus className="w-3 h-3" />
                  Log Earning
                </button>
              )}
            </>
          )}
        </div>

        {/* Payouts */}
        {payouts.length > 0 && (
          <div className="panel p-4 space-y-3">
            <h3 className="text-xs font-display uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" />
              Payouts
            </h3>
            <div className="space-y-1">
              {payouts.map((p) => (
                <div key={p.user_id} className="flex items-center justify-between px-2 py-1.5 rounded bg-white/[0.02]">
                  <span className="text-sm text-gray-300">{p.user_name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-white">{p.amount.toLocaleString()} aUEC</span>
                    {p.paid ? (
                      <span className="text-[10px] uppercase text-green-400 font-display">Paid</span>
                    ) : canManage ? (
                      <button
                        onClick={() => handleMarkPaid(p.user_id)}
                        disabled={!!actionLoading}
                        className="text-[10px] uppercase text-sc-accent hover:text-sc-accent/80 font-display disabled:opacity-50"
                      >
                        Mark Paid
                      </button>
                    ) : (
                      <span className="text-[10px] uppercase text-amber-400 font-display">Unpaid</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Timestamps */}
      <div className="flex flex-wrap gap-4 text-[10px] text-gray-600 font-mono">
        <span>Created: {formatDate(r.created_at, timezone)}</span>
        {r.started_at && <span>Started: {formatDate(r.started_at, timezone)}</span>}
        {r.completed_at && <span>Completed: {formatDate(r.completed_at, timezone)}</span>}
      </div>

      {/* Rating modal */}
      {ratingTarget && (
        <RatingModal
          slug={slug}
          opId={opId}
          rateeUserId={ratingTarget.userId}
          rateeName={ratingTarget.name}
          onClose={() => setRatingTarget(null)}
          onRated={refetch}
        />
      )}

      {/* F289: Share Link confirm — one-click used to flip op to public silently. */}
      <ConfirmDialog
        open={shareConfirm}
        onConfirm={confirmGenerateCode}
        onCancel={() => setShareConfirm(false)}
        title={r.join_code ? 'Regenerate Join Code' : 'Share this Op'}
        message={
          r.join_code
            ? `Regenerate the join code? The existing link will stop working immediately and anyone who already had it won't be able to join.`
            : `Generate a public join code for "${r.name}"? Anyone with the link will be able to view + join this op for the next 24 hours.`
        }
        confirmLabel={r.join_code ? 'Regenerate' : 'Share'}
        variant="warning"
      />
    </div>
  )
}
