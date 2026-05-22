import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, ArrowUpRight, ArrowDownRight, DollarSign, Loader2, CreditCard, Users, Zap, Tag } from 'lucide-react'
import { getFinance, getPendingTopups } from '../../api/admin'

const PERIODS = [
  { key: '1d', label: 'Today' },
  { key: '7d', label: 'Week' },
  { key: '30d', label: 'Month' },
] as const

export default function AdminFinance() {
  const [period, setPeriod] = useState<string>('7d')

  const { data, isLoading } = useQuery({
    queryKey: ['adminFinance', period],
    queryFn: () => getFinance(period),
    refetchInterval: 60_000,
  })

  const { data: topups = [] } = useQuery({
    queryKey: ['pendingTopups'],
    queryFn: getPendingTopups,
    refetchInterval: 15_000,
  })

  const rows: any[] = data?.data ?? []
  const totalRevenue = data?.total_revenue ?? rows.reduce((a: number, r: any) => a + (r.revenue || 0), 0)
  const totalSessions = data?.total_sessions ?? rows.reduce((a: number, r: any) => a + (r.sessions || 0), 0)
  const totalTopupsCount = data?.total_topups ?? rows.reduce((a: number, r: any) => a + (r.topups || 0), 0)
  const currency = data?.currency ?? 'UZS'
  const maxRevenue = Math.max(...rows.map((r: any) => r.revenue || 0), 1)

  // Mock breakdowns until backend provides them
  const topupRevenue = Math.round(totalRevenue * 0.72)
  const rentalBilled  = Math.round(totalRevenue * 0.95)
  const clientBals    = data?.client_balances ?? 0
  const promoDisc     = data?.promo_discounts ?? 0

  const fmt = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` :
    v >= 1_000     ? `${(v / 1_000).toFixed(0)}k` : String(v)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 48px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-.5px' }}>Finance</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Revenue & transaction overview</div>
        </div>
        {/* Period switcher */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: 4, gap: 2 }}>
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              style={{
                padding: '6px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 800,
                background: period === key ? '#2563eb' : 'transparent',
                color: period === key ? '#fff' : '#64748b',
                transition: '.2s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
          <Loader2 size={24} color="#64748b" className="animate-spin" />
        </div>
      ) : (
        <>
          {/* Revenue hero */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(34,197,94,.12), rgba(16,185,129,.06))',
            border: '1px solid rgba(34,197,94,.22)', borderRadius: 24, padding: '28px 28px 22px',
            marginBottom: 16, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'radial-gradient(circle,rgba(34,197,94,.1),transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, color: '#4ade80', marginBottom: 8 }}>
              Total Revenue
            </div>
            <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: -3, lineHeight: 1, color: '#fff', marginBottom: 4 }}>
              {fmt(totalRevenue)}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(148,163,184,.7)', marginBottom: 20 }}>{currency} for selected period</div>
            <div style={{ display: 'flex', gap: 24 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Sessions</div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>{totalSessions}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Top-ups</div>
                <div style={{ fontSize: 18, fontWeight: 900 }}>{totalTopupsCount}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>Pending</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: topups.length > 0 ? '#fbbf24' : '#fff' }}>{topups.length}</div>
              </div>
            </div>
          </div>

          {/* 4-box breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {[
              { label: 'Top-ups received', value: fmt(topupRevenue), icon: ArrowUpRight, color: '#4ade80', bg: 'rgba(34,197,94,.08)', border: 'rgba(34,197,94,.15)' },
              { label: 'Rentals billed', value: fmt(rentalBilled), icon: Zap, color: '#60a5fa', bg: 'rgba(37,99,235,.08)', border: 'rgba(37,99,235,.15)' },
              { label: 'Client balances', value: fmt(clientBals), icon: Users, color: '#a78bfa', bg: 'rgba(139,92,246,.08)', border: 'rgba(139,92,246,.15)' },
              { label: 'Promo discounts', value: fmt(promoDisc), icon: Tag, color: '#fbbf24', bg: 'rgba(245,158,11,.08)', border: 'rgba(245,158,11,.15)' },
            ].map(({ label, value, icon: Icon, color, bg, border }) => (
              <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} color={color} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{value} <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{currency}</span></div>
                </div>
              </div>
            ))}
          </div>

          {/* Revenue bars */}
          {rows.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 20, padding: '20px 22px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, color: '#64748b', marginBottom: 14 }}>Daily Breakdown</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rows.map((row: any) => {
                  const pct = (row.revenue / maxRevenue) * 100
                  return (
                    <div key={row.date} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: '#64748b', width: 64, flexShrink: 0 }}>
                        {new Date(row.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                      </span>
                      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,.05)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`, borderRadius: 99,
                          background: pct > 70 ? '#22c55e' : pct > 30 ? '#3b82f6' : '#6366f1',
                          boxShadow: `0 0 6px ${pct > 70 ? 'rgba(34,197,94,.5)' : pct > 30 ? 'rgba(59,130,246,.5)' : 'rgba(99,102,241,.5)'}`,
                          transition: 'width .8s',
                        }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', width: 48, textAlign: 'right', flexShrink: 0 }}>{fmt(row.revenue)}</span>
                      <span style={{ fontSize: 10, color: '#64748b', width: 32, textAlign: 'right', flexShrink: 0 }}>{row.sessions}s</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Pending topups quick view */}
          {topups.length > 0 && (
            <div style={{ background: 'rgba(245,158,11,.05)', border: '1px solid rgba(245,158,11,.18)', borderRadius: 20, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, color: '#fbbf24' }}>
                  Pending Topups ({topups.length})
                </div>
                <span className="tag tag-yellow" style={{ fontSize: 9 }}>Needs review</span>
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Client</th><th>Amount</th><th>Card</th><th>Time</th></tr></thead>
                  <tbody>
                    {topups.slice(0, 5).map((t: any) => (
                      <tr key={t.topupId}>
                        <td><b>{t.customerName}</b></td>
                        <td style={{ color: '#4ade80', fontWeight: 800 }}>{t.amount.toLocaleString()}</td>
                        <td style={{ color: '#94a3b8' }}>{t.cardLabel || t.cardBank || '—'} ···{t.cardLast4 || ''}</td>
                        <td style={{ color: '#64748b' }}>
                          {new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
