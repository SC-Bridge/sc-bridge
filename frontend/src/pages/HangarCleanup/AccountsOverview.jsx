import React from 'react'
import AccountMarker from '../../components/AccountMarker'
import { usd } from '../../lib/hangarCleanup'
import ProcessView from './ProcessView'

function Figure({ label, children, tone = 'text-gray-100' }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-gray-400">{label}</span>
      <span className={`font-mono tabular-nums ${tone}`}>{children}</span>
    </div>
  )
}

/** One account's money: credit, what its melts return, what its buys cost, and any shortfall. */
function AccountCard({ plan, markerAccounts }) {
  return (
    <div className="panel p-4 space-y-2 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <AccountMarker rsiAccountId={plan.accountId} accounts={markerAccounts} variant="cell" />
        <span className="font-display text-sm uppercase tracking-wider text-gray-200 truncate">{plan.name}</span>
      </div>
      <Figure label="Store credit">{usd(plan.credit)}</Figure>
      <Figure label="Melts" tone="text-sc-melt">{usd(plan.meltTotal)}</Figure>
      <Figure label="Buys">{plan.buyTotal ? `−${usd(plan.buyTotal)}` : usd(0)}</Figure>
      <Figure label="Shortfall" tone={plan.shortfall > 0 ? 'text-sc-danger' : 'text-sc-success'}>{usd(plan.shortfall)}</Figure>
    </div>
  )
}

/**
 * The combined view for several selected accounts: a strip of per-account money
 * with a reference total, then (in the steps view) one plan column per account.
 * Store credit never moves between accounts, so every figure is that account's
 * own and the combined total is only a sum for reference.
 */
export default function AccountsOverview({ plans, totals, markerAccounts, doneByAccount, onToggleDone, showPlans }) {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Accounts summary">
        {plans.map((p) => <AccountCard key={p.accountId} plan={p} markerAccounts={markerAccounts} />)}
        <div className="panel p-4 space-y-2 min-w-0">
          <span className="font-display text-sm uppercase tracking-wider text-gray-200">Combined credit</span>
          <div className="text-xl font-display tabular-nums text-white">{usd(totals.credit)}</div>
          <p className="text-[11px] text-gray-500">Store credit stays on its own account. This total is for reference only.</p>
        </div>
      </section>
      {showPlans && (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {plans.map((p) => (
            <section key={p.accountId} className="space-y-3 min-w-0" aria-label={`Plan for ${p.name}`}>
              <div className="flex items-center gap-2">
                <AccountMarker rsiAccountId={p.accountId} accounts={markerAccounts} variant="cell" />
                <h3 className="font-display text-sm uppercase tracking-wider text-white">{p.name}</h3>
              </div>
              <ProcessView
                plan={p.steps}
                done={doneByAccount[p.accountId] ?? []}
                onToggleDone={(key) => onToggleDone(p.accountId, key)}
                undecidedMelts={0}
                owner={p.name}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
