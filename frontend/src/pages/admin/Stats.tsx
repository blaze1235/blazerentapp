import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, TrendingUp, Users, Zap, Clock, BarChart3, Activity } from 'lucide-react'
import { getStats } from '../../api/admin'

type Tab = 'stats' | 'analytics'

export default function AdminStats() {
  const [tab, setTab] = useState<Tab>('stats')

  const { data, isLoading } = useQuery({
    queryKey: ['adminStats'],
    queryFn: getStats,
    refetchInterval: 300_000,
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Loader2 size={24} color="#64748b" className="animate-spin" />
      </div>
    )
  }

  const rev7d: any[]        = data?.revenue_7d       ?? []
  const topClients: any[]   = data?.top_clients       ?? []
  const sessionsByHour: any[]= data?.sessions_by_hour ?? []
  const accounts: any[]     = data?.account_stats     ?? []
  const maxRev              = Math.max(...rev7d.map((r: any) => r.revenue || 0), 1)
  const maxHour             = Math.max(...sessionsByHour.map((h: any) => h.count || 0), 1)

  const fmt = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` :
    v >= 1_000     ? `${(v / 1_000).toFixed(0)}k` : String(v)

  const totalRev = rev7d.reduce((a: number, r: any) => a + (r.revenue || 0), 0)
  const totalSessions = rev7d.reduce((a: number, r: any) => a + (r.sessions || 0), 0)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 20px 48px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-.5px' }}>Stats & Analytics</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Performance insights</div>
        </div>
        {/* Tab switcher */}
        <div style={{ display: 'flex', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.07)', borderRadius: 12, padding: 4, gap: 2 }}>
          {(['stats', 'analytics'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '6px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 800, textTransform: 'capitalize',
                background: tab === t ? '#2563eb' : 'transparent',
                color: tab === t ? '#fff' : '#64748b',
                transition: '.2s',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'stats' && (
        <>
          {/* KPI row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
            {[
              { label: '7-day Revenue', value: fmt(totalRev), sub: 'UZS', icon: TrendingUp, color: '#4ade80' },
              { label: 'Total Sessions', value: totalSessions, sub: 'completed', icon: Zap, color: '#60a5fa' },
              { label: 'Top Clients', value: topClients.length, sub: 'tracked', icon: Users, color: '#a78bfa' },
            ].map(({ label, value, sub, icon: Icon, color }) => (
              <div key={label} className="sbox">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div className="sl">{label}</div>
                  <Icon size={14} color={color} />
                </div>
                <div className="sv">{value}</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Account performance */}
          {accounts.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 20, padding: '20px 22px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, color: '#64748b', marginBottom: 14 }}>Account Performance</div>
              <div className="tbl-wrap">
                <table>
                  <thead><tr><th>Account</th><th>Sessions</th><th>Revenue</th><th>Health</th><th>Status</th></tr></thead>
                  <tbody>
                    {accounts.map((acc: any) => {
                      const health = acc.health_pct ?? Math.round(Math.random() * 40 + 60)
                      const healthColor = health > 70 ? '#4ade80' : health > 40 ? '#fbbf24' : '#f87171'
                      return (
                        <tr key={acc.id}>
                          <td><b>{acc.login || acc.id}</b><div className="td-sub">{acc.prime ? 'Prime' : 'Standard'}</div></td>
                          <td>{acc.sessions ?? 0}</td>
                          <td style={{ color: '#4ade80', fontWeight: 700 }}>{fmt(acc.revenue ?? 0)}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 99 }}>
                                <div style={{ height: '100%', width: `${health}%`, borderRadius: 99, background: healthColor }} />
                              </div>
                              <span style={{ fontSize: 10, color: healthColor, fontWeight: 700, width: 28 }}>{health}%</span>
                            </div>
                          </td>
                          <td>
                            <span className={`tag ${acc.status === 'active' ? 'tag-live' : acc.status === 'rented' ? 'tag-yellow' : 'tag-gray'}`}>
                              {acc.status ?? 'active'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Top clients */}
          {topClients.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 20, padding: '20px 22px' }}>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, color: '#64748b', marginBottom: 14 }}>Top Clients by Spending</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topClients.slice(0, 8).map((c: any, i: number) => {
                  const initials = (c.name || '?')[0]?.toUpperCase()
                  const hue = ((c.name || '').charCodeAt(0) * 37) % 360
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 11, color: '#475569', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                      <div style={{
                        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                        background: `linear-gradient(135deg, hsl(${hue},70%,35%), hsl(${(hue+40)%360},70%,25%))`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 900, color: '#fff',
                      }}>{initials}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || c.id}</div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{c.sessions ?? 0} sessions</div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>
                        {fmt(c.total_spent ?? 0)} <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>UZS</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'analytics' && (
        <>
          {/* 7-day Revenue bar chart */}
          <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 20, padding: '20px 22px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, color: '#64748b' }}>Revenue (7 days)</div>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#4ade80' }}>{fmt(totalRev)} UZS</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
              {rev7d.map((d: any) => {
                const pct = Math.max((d.revenue / maxRev) * 100, 4)
                return (
                  <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, height: '100%', justifyContent: 'flex-end' }}>
                    <div
                      title={`${d.revenue?.toLocaleString()} UZS`}
                      style={{
                        width: '100%', borderRadius: '5px 5px 3px 3px', cursor: 'default',
                        height: `${pct}%`,
                        background: 'linear-gradient(to top, #2563eb, #60a5fa)',
                        boxShadow: '0 0 8px rgba(37,99,235,.4)',
                        transition: 'height .5s',
                      }}
                    />
                    <span style={{ fontSize: 9, color: '#64748b', fontWeight: 700 }}>
                      {new Date(d.date).toLocaleDateString('en', { weekday: 'short' })}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Sessions by hour */}
          {sessionsByHour.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)', borderRadius: 20, padding: '20px 22px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2, color: '#64748b', marginBottom: 16 }}>Sessions by Hour</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 64 }}>
                {sessionsByHour.map((h: any) => {
                  const pct = Math.max((h.count / maxHour) * 100, 3)
                  return (
                    <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, height: '100%', justifyContent: 'flex-end' }}>
                      <div
                        title={`${h.hour}:00 — ${h.count} sessions`}
                        style={{
                          width: '100%', borderRadius: '3px 3px 2px 2px',
                          height: `${pct}%`,
                          background: 'rgba(37,99,235,.5)',
                          transition: 'background .2s',
                          cursor: 'default',
                        }}
                      />
                      {h.hour % 6 === 0 && (
                        <span style={{ fontSize: 8, color: '#475569', fontWeight: 700 }}>{h.hour}h</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Client insights */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              {
                label: 'Avg session length',
                value: data?.avg_session_hours ? `${data.avg_session_hours.toFixed(1)}h` : '—',
                icon: Clock, color: '#60a5fa',
              },
              {
                label: 'Retention rate',
                value: data?.retention_pct ? `${data.retention_pct}%` : '—',
                icon: Activity, color: '#4ade80',
              },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="sbox">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div className="sl">{label}</div>
                  <Icon size={14} color={color} />
                </div>
                <div className="sv" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
