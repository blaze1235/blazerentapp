import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Gamepad2, StopCircle, Loader2, RefreshCw, Wallet,
  CheckCircle2, Clock, AlertTriangle, User, ChevronDown, ChevronUp,
} from 'lucide-react'
import { kickSession, getPendingTopups, confirmTopup, getActiveSessions } from '../../api/admin'
import type { AdminTopup, AdminActiveSession } from '../../types'

// ── helpers ────────────────────────────────────────────────────────────────

function fmtMinutes(mins: number) {
  if (mins <= 0) return 'Ended'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function fmtDateTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

// ── TopupStatusPill ────────────────────────────────────────────────────────

function TopupStatusPill({ status }: { status: AdminTopup['status'] }) {
  if (status === 'confirmed') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
      <CheckCircle2 size={10} /> Confirmed
    </span>
  )
  if (status === 'expired') return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-400">
      Expired
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
      <Clock size={10} className="animate-pulse" /> Pending
    </span>
  )
}

// ── ActiveSessionsSection ──────────────────────────────────────────────────

function ActiveSessionsSection() {
  const qc = useQueryClient()
  const { data: sessions = [], isLoading, refetch } = useQuery({
    queryKey: ['adminActiveSessions'],
    queryFn: getActiveSessions,
    refetchInterval: 20_000,
  })

  const kickMutation = useMutation({
    mutationFn: kickSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminActiveSessions'] })
      qc.invalidateQueries({ queryKey: ['adminDashboard'] })
    },
  })

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Gamepad2 size={14} className="text-emerald-400" />
          Active Sessions
          {sessions.length > 0 && (
            <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {sessions.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-xs transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-slate-500" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="bg-card border border-white/5 rounded-2xl p-6 text-center">
          <Gamepad2 size={28} className="mx-auto mb-2 text-slate-600" />
          <p className="text-slate-500 text-sm">No active sessions right now</p>
        </div>
      ) : (
        <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Client</th>
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Account</th>
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Balance</th>
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Duration</th>
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Ends</th>
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Left</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sessions.map((s: AdminActiveSession) => (
                  <tr key={s.sessionId} className="hover:bg-white/2 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-brand/15 flex items-center justify-center shrink-0">
                          <User size={12} className="text-blue-xl" />
                        </div>
                        <div>
                          <p className="text-white font-medium text-xs">{s.customerName}</p>
                          <p className="text-slate-500 text-[10px]">{s.customerPhone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-300 text-xs font-mono">{s.accountLogin || s.accountId}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${s.balance < 5000 ? 'text-red-400' : 'text-slate-300'}`}>
                        {s.balance.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-400 text-xs">{s.hoursTotal}h</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-400 text-xs">{fmtTime(s.endsAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${s.minutesLeft < 30 ? 'text-red-400' : s.minutesLeft < 90 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {fmtMinutes(s.minutesLeft)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => kickMutation.mutate(s.sessionId)}
                        disabled={kickMutation.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-40"
                      >
                        <StopCircle size={10} /> Kick
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

// ── PendingTopupsSection ───────────────────────────────────────────────────

function PendingTopupsSection() {
  const qc = useQueryClient()
  const [showAll, setShowAll] = useState(false)

  const { data: topups = [], isLoading, refetch } = useQuery({
    queryKey: ['adminPendingTopups'],
    queryFn: getPendingTopups,
    refetchInterval: 5_000,
  })

  const confirmMutation = useMutation({
    mutationFn: confirmTopup,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminPendingTopups'] })
      qc.invalidateQueries({ queryKey: ['adminDashboard'] })
    },
  })

  const pending = topups.filter((t) => t.status === 'pending')
  const others = topups.filter((t) => t.status !== 'pending')
  const displayed = showAll ? topups : [...pending, ...others.slice(0, 3)]

  return (
    <section id="topups-section">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Wallet size={14} className="text-amber-400" />
          Payment Confirmations
          {pending.length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
              {pending.length} pending
            </span>
          )}
        </h2>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-xs transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Pending alert */}
      {pending.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-2xl px-4 py-3 mb-3">
          <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300 text-xs">
            <span className="font-bold">{pending.length} payment{pending.length !== 1 ? 's' : ''}</span> waiting for manual verification.
            Click <strong>Verify</strong> once you've confirmed receipt in your bank app.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin text-slate-500" />
        </div>
      ) : topups.length === 0 ? (
        <div className="bg-card border border-white/5 rounded-2xl p-6 text-center">
          <CheckCircle2 size={28} className="mx-auto mb-2 text-slate-600" />
          <p className="text-slate-500 text-sm">No payment requests</p>
        </div>
      ) : (
        <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[540px]">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Client</th>
                  <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">Amount</th>
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Card</th>
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Received</th>
                  <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {displayed.map((t) => (
                  <tr
                    key={t.topupId}
                    className={`hover:bg-white/2 transition-colors ${t.status === 'pending' ? 'bg-amber-500/3' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <p className="text-white font-medium text-xs">{t.customerName}</p>
                      <p className="text-slate-500 text-[10px]">{fmtDateTime(t.createdAt)}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-white font-bold">{t.amount.toLocaleString()}</span>
                      <span className="text-slate-500 text-[10px] ml-1">UZS</span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <span className="text-slate-300 text-xs font-mono">
                          {t.cardLast4 ? `*${t.cardLast4}` : '—'}
                        </span>
                        {t.cardBank && (
                          <p className="text-slate-500 text-[10px]">{t.cardBank}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-slate-400 text-xs">
                        {t.confirmedAt
                          ? fmtDateTime(t.confirmedAt)
                          : t.status === 'pending'
                            ? <span className="inline-flex items-center gap-1 text-amber-400/70">
                                <Loader2 size={9} className="animate-spin" /> Waiting…
                              </span>
                            : '—'
                        }
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <TopupStatusPill status={t.status} />
                    </td>
                    <td className="px-4 py-3">
                      {t.status === 'pending' && (
                        <button
                          onClick={() => confirmMutation.mutate(t.topupId)}
                          disabled={confirmMutation.isPending}
                          className="px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                        >
                          {confirmMutation.isPending
                            ? <Loader2 size={10} className="animate-spin" />
                            : 'Verify ✓'
                          }
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {topups.length > displayed.length || (showAll && topups.length > pending.length + 3) ? (
            <div className="border-t border-white/5 px-4 py-2.5 text-center">
              <button
                onClick={() => setShowAll((v) => !v)}
                className="flex items-center gap-1 mx-auto text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showAll ? <><ChevronUp size={12} /> Show fewer</> : <><ChevronDown size={12} /> Show all {topups.length}</>}
              </button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AdminOperations() {
  return (
    <div className="max-w-3xl mx-auto px-4 pt-6 pb-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Live Operations</h1>
        <p className="text-slate-400 text-sm mt-0.5">Real-time session management & payment confirmations</p>
      </div>

      <ActiveSessionsSection />
      <PendingTopupsSection />
    </div>
  )
}
