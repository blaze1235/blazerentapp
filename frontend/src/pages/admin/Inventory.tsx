import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Shield, Zap, Clock, Ban, Search, RefreshCw, Loader2, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react'
import api from '../../api/client'

// Types
interface Account {
  id: string
  login: string
  password?: string
  prime: boolean
  status: 'available' | 'rented' | 'cooldown' | 'blocked' | string
  health_pct?: number
  total_sessions?: number
  last_rented?: string
  cooldown_until?: string
  note?: string
}

async function getInventory(): Promise<Account[]> {
  const { data } = await api.get('/admin/inventory')
  return Array.isArray(data) ? data : []
}

async function setAccountStatus(id: string, status: string): Promise<void> {
  await api.patch(`/admin/inventory/${id}/status`, { status })
}

const STATUS_META: Record<string, { label: string; tagClass: string; icon: React.ReactNode }> = {
  available: { label: 'Available', tagClass: 'tag-green',  icon: <Zap size={10} /> },
  rented:    { label: 'In use',    tagClass: 'tag-live',   icon: <Zap size={10} /> },
  cooldown:  { label: 'Cooldown',  tagClass: 'tag-yellow', icon: <Clock size={10} /> },
  blocked:   { label: 'Blocked',   tagClass: 'tag-red',    icon: <Ban size={10} /> },
}

function kpiFor(accounts: Account[]) {
  const available = accounts.filter(a => a.status === 'available').length
  const rented    = accounts.filter(a => a.status === 'rented').length
  const cooldown  = accounts.filter(a => a.status === 'cooldown').length
  const blocked   = accounts.filter(a => a.status === 'blocked').length
  return { available, rented, cooldown, blocked, total: accounts.length }
}

export default function AdminInventory() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [showPw, setShowPw] = useState<string | null>(null)

  const { data: accounts = [], isLoading, refetch } = useQuery({
    queryKey: ['adminInventory'],
    queryFn: getInventory,
    refetchInterval: 30_000,
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => setAccountStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adminInventory'] }),
  })

  const kpi = kpiFor(accounts)

  const visible = accounts.filter(a => {
    const matchFilter = filter === 'all' || a.status === filter
    const matchSearch = !search || a.login.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const healthColor = (pct: number) => pct > 70 ? '#4ade80' : pct > 40 ? '#fbbf24' : '#f87171'

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 20px 48px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-.5px' }}>Inventory</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>Steam account pool management</div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refresh
        </button>
      </div>

      {/* KPI boxes */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Available', value: kpi.available, color: '#4ade80', bg: 'rgba(34,197,94,.07)', border: 'rgba(34,197,94,.18)', filter: 'available' },
          { label: 'In Use',    value: kpi.rented,    color: '#60a5fa', bg: 'rgba(37,99,235,.07)', border: 'rgba(37,99,235,.18)', filter: 'rented'    },
          { label: 'Cooldown',  value: kpi.cooldown,  color: '#fbbf24', bg: 'rgba(245,158,11,.07)',border: 'rgba(245,158,11,.18)',filter: 'cooldown'  },
          { label: 'Blocked',   value: kpi.blocked,   color: '#f87171', bg: 'rgba(239,68,68,.07)', border: 'rgba(239,68,68,.18)', filter: 'blocked'   },
        ].map(box => (
          <div
            key={box.label}
            onClick={() => setFilter(f => f === box.filter ? 'all' : box.filter)}
            style={{
              background: filter === box.filter ? box.bg : 'rgba(255,255,255,.02)',
              border: `1px solid ${filter === box.filter ? box.border : 'rgba(255,255,255,.05)'}`,
              borderRadius: 16, padding: '16px 16px 12px', cursor: 'pointer', transition: '.2s', textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 900, color: filter === box.filter ? box.color : '#fff', lineHeight: 1 }}>{box.value}</div>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5, color: '#64748b', marginTop: 4 }}>{box.label}</div>
          </div>
        ))}
      </div>

      {/* Search + filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={13} color="#64748b" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by login..."
            style={{
              width: '100%', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)',
              borderRadius: 12, padding: '9px 12px 9px 32px', color: '#f1f5f9', fontSize: 13, outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <Loader2 size={22} color="#64748b" className="animate-spin" />
        </div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Type</th>
                <th>Sessions</th>
                <th>Health</th>
                <th>Last rented</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#64748b', padding: '32px 0' }}>No accounts match</td></tr>
              ) : visible.map(acc => {
                const meta = STATUS_META[acc.status] ?? { label: acc.status, tagClass: 'tag-gray', icon: null }
                const health = acc.health_pct ?? 85
                const hColor = healthColor(health)
                return (
                  <tr key={acc.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(37,99,235,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Shield size={13} color="#60a5fa" />
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700 }}>{acc.login}</div>
                          {acc.password && (
                            <div style={{ fontSize: 10, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                              {showPw === acc.id ? acc.password : '••••••••'}
                              <button
                                onClick={() => setShowPw(p => p === acc.id ? null : acc.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#64748b' }}
                              >
                                {showPw === acc.id ? <EyeOff size={10} /> : <Eye size={10} />}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`tag ${acc.prime ? 'tag-yellow' : 'tag-gray'}`} style={{ fontSize: 9 }}>
                        {acc.prime ? 'Prime' : 'Standard'}
                      </span>
                    </td>
                    <td>{acc.total_sessions ?? 0}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 56, height: 4, background: 'rgba(255,255,255,.06)', borderRadius: 99 }}>
                          <div style={{ height: '100%', width: `${health}%`, borderRadius: 99, background: hColor }} />
                        </div>
                        <span style={{ fontSize: 10, color: hColor, fontWeight: 700 }}>{health}%</span>
                      </div>
                    </td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>
                      {acc.last_rented
                        ? new Date(acc.last_rented).toLocaleDateString('en', { month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                    <td>
                      <span className={`tag ${meta.tagClass}`} style={{ fontSize: 9 }}>
                        {meta.icon} {meta.label}
                      </span>
                    </td>
                    <td>
                      <select
                        value={acc.status}
                        onChange={e => statusMutation.mutate({ id: acc.id, status: e.target.value })}
                        style={{
                          background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                          borderRadius: 8, padding: '4px 8px', fontSize: 11, color: '#94a3b8', cursor: 'pointer',
                        }}
                      >
                        <option value="available">Available</option>
                        <option value="cooldown">Cooldown</option>
                        <option value="blocked">Blocked</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Total row */}
      {visible.length > 0 && !isLoading && (
        <div style={{ textAlign: 'right', fontSize: 11, color: '#475569', marginTop: 10 }}>
          Showing {visible.length} of {accounts.length} accounts
        </div>
      )}
    </div>
  )
}
