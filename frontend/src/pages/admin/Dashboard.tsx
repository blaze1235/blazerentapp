import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users, Gamepad2, DollarSign, TrendingUp, Server, Clock,
  Loader2, AlertTriangle, CheckCircle2, ChevronRight, Wallet,
} from 'lucide-react'
import { getDashboard, getPendingTopups, confirmTopup } from '../../api/admin'
import type { AdminDashboard, AdminTopup } from '../../types'

function KPICard({
  label, value, sub, icon: Icon, color, onClick,
}: {
  label: string
  value: string | number
  sub?: string
  icon: React.ElementType
  color: string
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`bg-card border border-white/5 rounded-2xl p-4 text-left transition-all hover:border-white/10 ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${color}`}>
        <Icon size={17} />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </button>
  )
}

function statusPill(status: AdminTopup['status']) {
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

function PendingTopupsWidget() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: topups = [], isLoading } = useQuery({
    queryKey: ['adminPendingTopups'],
    queryFn: getPendingTopups,
    refetchInterval: 8_000,
  })

  const confirmMutation = useMutation({
    mutationFn: confirmTopup,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['adminPendingTopups'] })
      qc.invalidateQueries({ queryKey: ['adminDashboard'] })
    },
  })

  const pending = topups.filter((t) => t.status === 'pending')

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
          <Wallet size={14} className="text-amber-400" /> Pending Top-ups
          {pending.length > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {pending.length}
            </span>
          )}
        </h2>
        <button
          onClick={() => navigate('/app/admin/operations')}
          className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-0.5 transition-colors"
        >
          View all <ChevronRight size={12} />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 size={18} className="animate-spin text-slate-500" />
        </div>
      ) : topups.length === 0 ? (
        <div className="bg-card border border-white/5 rounded-2xl p-5 text-center text-slate-500 text-sm">
          No pending payments
        </div>
      ) : (
        <div className="bg-card border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Client</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">Amount</th>
                <th className="text-left text-xs text-slate-500 font-medium px-4 py-3 hidden sm:table-cell">Card</th>
                <th className="text-left text-xs text-slate-500 font-medium px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {topups.slice(0, 6).map((t) => (
                <tr key={t.topupId} className="hover:bg-white/2 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium text-xs truncate max-w-[100px]">{t.customerName}</p>
                    <p className="text-slate-500 text-[10px]">
                      {new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-white font-bold text-sm">{t.amount.toLocaleString()}</span>
                    <span className="text-slate-500 text-[10px] ml-1">UZS</span>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="text-slate-400 text-xs font-mono">
                      {t.cardLast4 ? `*${t.cardLast4}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{statusPill(t.status)}</td>
                  <td className="px-4 py-3">
                    {t.status === 'pending' && (
                      <button
                        onClick={() => confirmMutation.mutate(t.topupId)}
                        disabled={confirmMutation.isPending}
                        className="px-2.5 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {confirmMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : 'Verify ✓'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {topups.length > 6 && (
            <div className="border-t border-white/5 px-4 py-2.5 text-center">
              <button
                onClick={() => navigate('/app/admin/operations')}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                +{topups.length - 6} more — view all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['adminDashboard'],
    queryFn: getDashboard,
    refetchInterval: 60_000,
  })

  const { data: topups = [] } = useQuery({
    queryKey: ['adminPendingTopups'],
    queryFn: getPendingTopups,
    refetchInterval: 8_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={24} className="animate-spin text-slate-500" />
      </div>
    )
  }

  const d = data as AdminDashboard | undefined
  const pendingCount = topups.filter((t) => t.status === 'pending').length

  const kpis = [
    {
      label: 'Total Clients',
      value: d?.totalClients ?? '—',
      icon: Users,
      color: 'bg-blue-brand/15 text-blue-xl',
      onClick: () => navigate('/app/admin/clients'),
    },
    {
      label: 'Active Sessions',
      value: d?.activeSessions ?? '—',
      icon: Gamepad2,
      color: 'bg-emerald-500/15 text-emerald-400',
      onClick: () => navigate('/app/admin/operations'),
    },
    {
      label: "Today's Revenue",
      value: d ? `${(d.totalRevenueToday / 1000).toFixed(0)}k` : '—',
      sub: d?.currency,
      icon: DollarSign,
      color: 'bg-amber-500/15 text-amber-400',
      onClick: () => navigate('/app/admin/finance'),
    },
    {
      label: 'Month Revenue',
      value: d ? `${(d.totalRevenueMonth / 1000).toFixed(0)}k` : '—',
      sub: d?.currency,
      icon: TrendingUp,
      color: 'bg-purple-500/15 text-purple-400',
      onClick: () => navigate('/app/admin/finance'),
    },
    {
      label: 'Available Accounts',
      value: d ? `${d.availableAccounts}/${d.totalAccounts}` : '—',
      icon: Server,
      color: 'bg-slate-500/15 text-slate-400',
    },
    {
      label: 'Pending Topups',
      value: pendingCount || d?.pendingTopups || 0,
      icon: Clock,
      color: pendingCount > 0 ? 'bg-amber-500/20 text-amber-400' : 'bg-orange-500/15 text-orange-400',
      onClick: () => navigate('/app/admin/operations'),
    },
  ]

  return (
    <div className="max-w-3xl mx-auto px-4 pt-6 pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 text-sm mt-0.5">System overview</p>
      </div>

      {/* Pending topups alert banner */}
      {pendingCount > 0 && (
        <button
          onClick={() => navigate('/app/admin/operations')}
          className="w-full flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-4 py-3 text-left hover:bg-amber-500/15 transition-colors"
        >
          <AlertTriangle size={18} className="text-amber-400 shrink-0" />
          <div className="flex-1">
            <p className="text-amber-300 text-sm font-semibold">
              {pendingCount} pending top-up{pendingCount !== 1 ? 's' : ''} need verification
            </p>
            <p className="text-amber-400/60 text-xs mt-0.5">
              Tap to open Operations and verify payments
            </p>
          </div>
          <ChevronRight size={16} className="text-amber-400/60 shrink-0" />
        </button>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {kpis.map((kpi) => (
          <KPICard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Pending top-ups widget */}
      <PendingTopupsWidget />

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'View All Clients', onClick: () => navigate('/app/admin/clients') },
            { label: 'Live Operations', onClick: () => navigate('/app/admin/operations') },
            { label: 'Finance Report', onClick: () => navigate('/app/admin/finance') },
            { label: 'Analytics', onClick: () => navigate('/app/admin/stats') },
          ].map(({ label, onClick }) => (
            <button
              key={label}
              onClick={onClick}
              className="bg-card border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 text-sm font-medium text-slate-300 hover:text-white text-left transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
