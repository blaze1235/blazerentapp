import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Loader2, ChevronRight, X, Send, Power, Ban } from 'lucide-react'
import { getClients, adjustBalance, notifyClient, kickSession, getActiveSessions } from '../../api/admin'
import type { AdminClient } from '../../types'

const AVATAR_GRADS = [
  'linear-gradient(135deg,#2563eb,#8b5cf6)',
  'linear-gradient(135deg,#dc2626,#9f1239)',
  'linear-gradient(135deg,#d97706,#92400e)',
  'linear-gradient(135deg,#7c3aed,#4c1d95)',
  'linear-gradient(135deg,#0891b2,#0e7490)',
]
function avatarGrad(name: string) { return AVATAR_GRADS[name.charCodeAt(0) % AVATAR_GRADS.length] }

function TierTag({ tier }: { tier: string }) {
  if (tier === 'gold')   return <span className="tag tag-yellow">Gold 🏅</span>
  if (tier === 'silver') return <span className="tag tag-gray">Silver</span>
  return <span className="tag tag-gray">Bronze</span>
}

// ── Client Detail Drawer ─────────────────────────────────────────────────
function ClientDrawer({
  client,
  onClose,
}: {
  client: AdminClient | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [balAdj, setBalAdj] = useState('')
  const [notifyMsg, setNotifyMsg] = useState('')
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const adjMutation = useMutation({
    mutationFn: () => adjustBalance(client!.id, parseInt(balAdj.replace(/[^-\d]/g, ''), 10)),
    onSuccess: () => { showToast('Balance adjusted ✓'); setBalAdj(''); qc.invalidateQueries({ queryKey: ['adminClients'] }) },
  })

  const notifyMutation = useMutation({
    mutationFn: () => notifyClient(client!.id, notifyMsg),
    onSuccess: () => { showToast('Notification sent ✓'); setNotifyMsg('') },
  })

  const { data: sessions = [] } = useQuery({
    queryKey: ['adminActiveSessions'],
    queryFn: getActiveSessions,
    enabled: !!client,
  })

  const clientSessions = sessions.filter(s => s.customerId === client?.id)

  return (
    <>
      {/* Backdrop */}
      <div
        className={`drawer-backdrop ${client ? 'open' : ''}`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div className={`drawer ${client ? 'open' : ''}`}>
        {client && (
          <>
            <div className="drawer-header" style={{ padding:24, borderBottom:'1px solid rgba(255,255,255,.06)', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, background:'#0d1220', zIndex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:avatarGrad(client.name), display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:900 }}>
                  {client.name[0]?.toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize:16, fontWeight:900 }}>{client.name}</div>
                  <div className="td-sub">{client.phone}</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
            </div>

            <div style={{ padding:24 }}>
              {/* Status + tier */}
              <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
                {clientSessions.length > 0
                  ? <span className="tag tag-live">Active session</span>
                  : <span className="tag tag-gray">No active session</span>
                }
                <TierTag tier={client.tier} />
              </div>

              {/* Stats grid */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
                <div className="sbox"><div className="sv" style={{ fontSize:20, color:'#60a5fa' }}>{client.balance.toLocaleString()}</div><div className="sl">Balance (UZS)</div></div>
                <div className="sbox"><div className="sv" style={{ fontSize:20 }}>{client.sessions}</div><div className="sl">Sessions</div></div>
                <div className="sbox"><div className="sv" style={{ fontSize:20 }}>{client.totalSpent.toLocaleString()}</div><div className="sl">Total spent (UZS)</div></div>
                <div className="sbox"><div className="sv" style={{ fontSize:20 }}>{client.language.toUpperCase()}</div><div className="sl">Language</div></div>
              </div>

              <div style={{ height:1, background:'rgba(255,255,255,.06)', margin:'0 0 20px' }} />

              {/* Balance adjust */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:2, color:'#64748b', marginBottom:10 }}>Adjust balance</div>
                <div style={{ display:'flex', gap:8 }}>
                  <input
                    value={balAdj}
                    onChange={e => setBalAdj(e.target.value)}
                    placeholder="e.g. +10000 or -5000"
                    style={{ flex:1, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, padding:'10px 14px', color:'#fff', fontSize:13, fontFamily:'inherit', outline:'none' }}
                  />
                  <button className="btn btn-primary" onClick={() => adjMutation.mutate()} disabled={adjMutation.isPending || !balAdj}>
                    Apply
                  </button>
                </div>
              </div>

              {/* Recent sessions */}
              <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:2, color:'#64748b', marginBottom:10 }}>Active sessions</div>
              {clientSessions.length > 0 ? (
                <div className="tbl-wrap" style={{ marginBottom:20 }}>
                  <table>
                    <thead><tr><th>Account</th><th>Time left</th><th></th></tr></thead>
                    <tbody>
                      {clientSessions.map(s => (
                        <tr key={s.sessionId}>
                          <td><b>{s.accountLogin}</b></td>
                          <td style={{ color: s.minutesLeft < 30 ? '#f87171' : '#60a5fa', fontWeight:700 }}>
                            {s.minutesLeft < 60 ? `${s.minutesLeft}m` : `${Math.floor(s.minutesLeft/60)}h ${s.minutesLeft%60}m`}
                          </td>
                          <td><button className="btn btn-red btn-sm"><Power size={10} /> Kick</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ fontSize:12, color:'#64748b', marginBottom:20, padding:'10px 0' }}>No active sessions</div>
              )}

              <div style={{ height:1, background:'rgba(255,255,255,.06)', margin:'0 0 20px' }} />

              {/* Actions */}
              <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:2, color:'#64748b', marginBottom:10 }}>Actions</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
                <div style={{ display:'flex', gap:8 }}>
                  <input
                    value={notifyMsg}
                    onChange={e => setNotifyMsg(e.target.value)}
                    placeholder="Message to send via Telegram…"
                    style={{ flex:1, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, padding:'10px 14px', color:'#fff', fontSize:13, fontFamily:'inherit', outline:'none' }}
                  />
                  <button className="btn btn-ghost btn-sm" onClick={() => notifyMutation.mutate()} disabled={!notifyMsg || notifyMutation.isPending}>
                    <Send size={12} />
                  </button>
                </div>
                <button className="btn btn-red btn-w btn-sm" onClick={() => showToast('Feature coming soon')}>
                  <Ban size={12} /> Suspend account
                </button>
              </div>

              {/* Notes */}
              <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:2, color:'#64748b', marginBottom:8 }}>Admin notes</div>
              <textarea
                rows={3}
                placeholder="Internal notes about this client…"
                style={{ width:'100%', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, padding:'12px 16px', color:'#fff', fontSize:13, fontFamily:'inherit', outline:'none', resize:'none', boxSizing:'border-box' }}
              />

              {toast && (
                <div style={{ position:'fixed', bottom:20, right:20, background:'#0d2010', border:'1px solid rgba(34,197,94,.3)', color:'#4ade80', borderRadius:12, padding:'12px 18px', fontSize:13, fontWeight:700 }}>
                  {toast}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function AdminClients() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'highbal' | 'low'>('all')
  const [selected, setSelected] = useState<AdminClient | null>(null)

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['adminClients'],
    queryFn: getClients,
    refetchInterval: 60_000,
  })

  const { data: activeSessions = [] } = useQuery({
    queryKey: ['adminActiveSessions'],
    queryFn: getActiveSessions,
    refetchInterval: 20_000,
  })

  const activeIds = new Set(activeSessions.map(s => s.customerId))

  let filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  )
  if (filter === 'active')  filtered = filtered.filter(c => activeIds.has(c.id))
  if (filter === 'highbal') filtered = filtered.filter(c => c.balance >= 50000)
  if (filter === 'low')     filtered = filtered.filter(c => c.balance < 10000)

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '28px 20px 40px' }}>
      <div style={{ fontSize:22, fontWeight:900, letterSpacing:'-.5px', marginBottom:4 }}>Clients</div>
      <div style={{ fontSize:13, color:'#94a3b8', marginBottom:28 }}>All registered users — click any row to view full profile</div>

      {/* Search + filters */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <div style={{ position:'relative', maxWidth:280, flex:'1 1 200px' }}>
          <Search size={15} color="#64748b" style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone…"
            style={{ width:'100%', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.06)', borderRadius:12, padding:'10px 14px 10px 38px', color:'#fff', fontSize:13, fontFamily:'inherit', outline:'none' }}
          />
        </div>
        {(['all','active','highbal','low'] as const).map(f => (
          <button
            key={f}
            className={filter === f ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f === 'active' ? 'Active' : f === 'highbal' ? 'High balance' : 'Low balance'}
          </button>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:'48px 0' }}>
          <Loader2 size={24} color="#64748b" className="animate-spin" />
        </div>
      ) : (
        <div className="tbl-wrap">
          <div className="tbl-head">
            <div className="tbl-title">Clients <span style={{ color:'#64748b', fontWeight:500 }}>· {filtered.length} shown</span></div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:'rgba(52,168,83,.08)', border:'1px solid rgba(52,168,83,.2)', borderRadius:8, padding:'4px 10px', fontSize:10, fontWeight:700, color:'#34a853' }}>
              <span style={{ width:5, height:5, borderRadius:'50%', background:'#34a853', display:'inline-block' }} />
              Sheets
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Balance</th>
                <th>Sessions</th>
                <th>Total spent</th>
                <th>Last active</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => setSelected(c)} style={{ cursor:'pointer' }}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:36, height:36, borderRadius:10, background:avatarGrad(c.name), display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:900, flexShrink:0 }}>
                        {c.name[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight:700 }}>{c.name}</div>
                        <div className="td-sub">{c.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontWeight:700, color: c.balance === 0 ? '#f87171' : c.balance < 10000 ? '#fbbf24' : '#60a5fa' }}>
                    {c.balance.toLocaleString()} UZS
                  </td>
                  <td>{c.sessions} sessions</td>
                  <td>{c.totalSpent.toLocaleString()} UZS</td>
                  <td style={{ color:'#94a3b8' }}>
                    {c.lastActive ? new Date(c.lastActive).toLocaleDateString('en', { month:'short', day:'numeric' }) : '—'}
                  </td>
                  <td>
                    {activeIds.has(c.id)
                      ? <span className="tag tag-live">Active</span>
                      : c.balance === 0
                        ? <span className="tag tag-red">No balance</span>
                        : c.balance < 10000
                          ? <span className="tag tag-yellow">Low bal</span>
                          : <span className="tag tag-gray">Idle</span>
                    }
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setSelected(c) }}>
                      <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ textAlign:'center', padding:'24px', color:'#64748b', fontSize:13 }}>No clients found</div>
          )}
        </div>
      )}

      <ClientDrawer client={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
