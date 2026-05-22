import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, Clock, RefreshCw, Power, Loader2 } from 'lucide-react'
import { getSessionHistory, endSession } from '../api/rental'
import { useActiveSession } from '../hooks/useActiveSession'
import { useSessionStore } from '../store/session'
import type { RentalSession } from '../types'

function timeRemainingStr(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  const s = Math.floor((diff % 60_000) / 1000)
  return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function timeRemainingPct(startedAt: string, endsAt: string) {
  const s = new Date(startedAt).getTime()
  const e = new Date(endsAt).getTime()
  const n = Date.now()
  if (e <= s) return 0
  return Math.min(100, Math.max(0, ((n - s) / (e - s)) * 100))
}

function StatusTag({ status }: { status: RentalSession['status'] }) {
  if (status === 'active') return <span className="tag tag-live">Live</span>
  if (status === 'completed') return <span className="tag tag-green">Done</span>
  return <span className="tag tag-gray">Expired</span>
}

export default function Sessions() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { clearSession } = useSessionStore()
  const { activeSession } = useActiveSession()
  const [copied, setCopied] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['sessionHistory'],
    queryFn: () => getSessionHistory(50),
  })

  const endMutation = useMutation({
    mutationFn: (id: string) => endSession(id),
    onSuccess: () => {
      clearSession()
      qc.invalidateQueries({ queryKey: ['activeSession'] })
      qc.invalidateQueries({ queryKey: ['sessionHistory'] })
    },
  })

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }

  const past = history.filter(s => s.status !== 'active')

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '28px 20px 40px' }}>
      <div style={{ fontSize:22, fontWeight:900, letterSpacing:'-.5px', marginBottom:4 }}>My Sessions</div>
      <div style={{ fontSize:13, color:'#94a3b8', marginBottom:28 }}>Active rental and history</div>

      {/* Active session */}
      {activeSession && (
        <div style={{ background:'linear-gradient(135deg,rgba(37,99,235,.1),rgba(139,92,246,.05))', border:'1px solid rgba(37,99,235,.25)', borderRadius:24, padding:24, marginBottom:24, position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:-80, right:-80, width:240, height:240, borderRadius:'50%', background:'radial-gradient(circle,rgba(37,99,235,.08),transparent 70%)', pointerEvents:'none' }} />
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
            <div>
              <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:2, color:'#60a5fa', marginBottom:4 }}>Currently renting</div>
              <div style={{ fontSize:18, fontWeight:900 }}>CS2 Prime Account</div>
            </div>
            <span className="tag tag-live">Live</span>
          </div>

          {/* Credentials */}
          <div className="cred">
            <div>
              <div className="cred-k">Login</div>
              <div className="cred-v">{activeSession.accountLogin}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => copy(activeSession.accountLogin, 'login')}>
              {copied === 'login' ? <span style={{ color:'#4ade80', fontSize:10 }}>Copied!</span> : <Copy size={12} />}
            </button>
          </div>
          <div className="cred" style={{ marginBottom:16 }}>
            <div>
              <div className="cred-k">Password</div>
              <div className="cred-v">{activeSession.accountPassword}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => copy(activeSession.accountPassword, 'pass')}>
              {copied === 'pass' ? <span style={{ color:'#4ade80', fontSize:10 }}>Copied!</span> : <Copy size={12} />}
            </button>
          </div>

          {/* Timer */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:7 }}>
              <span style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:2, color:'#64748b' }}>Time remaining</span>
              <span style={{ fontSize:13, fontWeight:800, color:'#60a5fa' }}>{timeRemainingStr(activeSession.endsAt)}</span>
            </div>
            <div className="prog">
              <div className="prog-fill" style={{ width: `${timeRemainingPct(activeSession.startedAt, activeSession.endsAt)}%` }} />
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', marginTop:5, fontSize:10, color:'#64748b' }}>
              <span>Started {new Date(activeSession.startedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
              <span>Ends {new Date(activeSession.endsAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
            </div>
          </div>

          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => navigate('/app/rent')}>
              <RefreshCw size={13} /> Extend
            </button>
            <button
              className="btn btn-red" style={{ flex:1 }}
              onClick={() => {
                if (confirm('End session early? You will be logged out of Steam. No refund for unused time.')) {
                  endMutation.mutate(activeSession.id)
                }
              }}
              disabled={endMutation.isPending}
            >
              {endMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
              End session
            </button>
          </div>
        </div>
      )}

      {/* No active session */}
      {!activeSession && !isLoading && (
        <div style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', borderRadius:20, padding:'36px 24px', textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:13, color:'#94a3b8', marginBottom:16 }}>No active session right now</div>
          <button className="btn btn-primary" onClick={() => navigate('/app/rent')}>Rent Now</button>
        </div>
      )}

      {/* History table */}
      {past.length > 0 && (
        <>
          <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:2, color:'#64748b', marginBottom:12 }}>Past sessions</div>
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>#</th><th>Duration</th><th>Cost</th><th>Date</th><th>Status</th></tr></thead>
              <tbody>
                {past.map((s, i) => (
                  <tr key={s.id}>
                    <td><b>#{String(past.length - i).padStart(3,'0')}</b></td>
                    <td>{s.hoursTotal} hrs</td>
                    <td>{s.cost.toLocaleString()} UZS</td>
                    <td style={{ color:'#94a3b8' }}>{new Date(s.startedAt).toLocaleDateString('en',{month:'short',day:'numeric'})}</td>
                    <td><StatusTag status={s.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {isLoading && (
        <div style={{ display:'flex', justifyContent:'center', padding:'32px 0' }}>
          <Loader2 size={20} color="#64748b" className="animate-spin" />
        </div>
      )}
    </div>
  )
}
