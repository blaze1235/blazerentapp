import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Zap, Bell, Plus, ChevronRight, CheckCircle } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { useActiveSession } from '../hooks/useActiveSession'
import { getSessionHistory } from '../api/rental'

function timeRemainingStr(endsAt: string) {
  const diff = new Date(endsAt).getTime() - Date.now()
  if (diff <= 0) return 'Expired'
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  const s = Math.floor((diff % 60_000) / 1000)
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} remaining` : `${m}:${String(s).padStart(2,'0')} remaining`
}

function timeRemainingPct(startedAt: string, endsAt: string) {
  const s = new Date(startedAt).getTime()
  const e = new Date(endsAt).getTime()
  const n = Date.now()
  if (e <= s) return 0
  return Math.min(100, Math.max(0, ((n - s) / (e - s)) * 100))
}

const TIER_EMOJI: Record<string, string> = { gold: '🏅', silver: '🥈', bronze: '🥉' }

export default function Home() {
  const { user } = useAuthStore()
  const { activeSession } = useActiveSession()
  const navigate = useNavigate()
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const { data: history = [] } = useQuery({
    queryKey: ['sessionHistory', 20],
    queryFn: () => getSessionHistory(20),
    enabled: !!user,
  })

  const past = history.filter(s => s.status !== 'active')
  const totalSpent = past.reduce((a, s) => a + s.cost, 0)
  const avgHours  = past.length ? past.reduce((a, s) => a + s.hoursTotal, 0) / past.length : 0
  const greet = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  })()

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '28px 20px 0', display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Greeting row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:2 }}>{greet}</div>
          <div style={{ fontSize:24, fontWeight:900, letterSpacing:'-.4px', marginTop:3 }}>
            {user?.name || 'Player'} 👋
          </div>
        </div>
        <button
          onClick={() => navigate('/app/profile')}
          style={{ width:40, height:40, borderRadius:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.06)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
        >
          <Bell size={17} color="#94a3b8" />
        </button>
      </div>

      {/* Balance hero */}
      <div style={{
        background:'linear-gradient(145deg,rgba(37,99,235,.18) 0%,rgba(79,70,229,.1) 60%,rgba(139,92,246,.06) 100%)',
        border:'1px solid rgba(37,99,235,.3)', borderRadius:28, padding:'26px 24px 22px', marginBottom:16, position:'relative', overflow:'hidden',
      }}>
        <div style={{ position:'absolute', top:-60, right:-60, width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle,rgba(37,99,235,.14),transparent 70%)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-40, left:-20, width:140, height:140, borderRadius:'50%', background:'radial-gradient(circle,rgba(139,92,246,.07),transparent 70%)', pointerEvents:'none' }} />

        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
          <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'2.5px', color:'rgba(96,165,250,.8)' }}>Balance</div>
          {user?.tier && (
            <span className="tag tag-yellow" style={{ fontSize:9, padding:'2px 8px' }}>
              {user.tier.charAt(0).toUpperCase() + user.tier.slice(1)} {TIER_EMOJI[user.tier] || ''}
            </span>
          )}
        </div>

        <div style={{ fontSize:52, fontWeight:900, letterSpacing:-3, lineHeight:1, color:'#fff', marginBottom:6 }}>
          {(user?.balance ?? 0).toLocaleString()}
        </div>
        <div style={{ fontSize:13, color:'rgba(148,163,184,.7)', marginBottom:22, fontWeight:500 }}>UZS available</div>

        <div style={{ display:'flex', gap:10 }}>
          <button
            onClick={() => navigate('/app/wallet')}
            className="btn btn-primary"
            style={{ flex:1, padding:12, borderRadius:14, fontSize:12 }}
          >
            <Plus size={14} /> Top up
          </button>
          <button
            onClick={() => navigate('/app/wallet')}
            className="btn btn-ghost"
            style={{ padding:'12px 16px', borderRadius:14, fontSize:12 }}
          >
            History
          </button>
        </div>
      </div>

      {/* Active session mini widget */}
      {activeSession && (
        <div
          onClick={() => navigate('/app/sessions')}
          style={{
            background:'rgba(37,99,235,.06)', border:'1px solid rgba(37,99,235,.18)',
            borderRadius:18, padding:'14px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:12, cursor:'pointer',
          }}
        >
          <div style={{ width:40, height:40, background:'rgba(37,99,235,.14)', borderRadius:11, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Zap size={17} color="#60a5fa" />
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:5 }}>
              <span style={{ fontSize:12, fontWeight:800 }}>{activeSession.accountLogin}</span>
              <span className="tag tag-live" style={{ fontSize:9, padding:'2px 8px' }}>Live</span>
            </div>
            <div className="prog" style={{ height:3, marginBottom:4 }}>
              <div className="prog-fill" style={{ width: `${timeRemainingPct(activeSession.startedAt, activeSession.endsAt)}%` }} />
            </div>
            <div style={{ fontSize:11, color:'#60a5fa', fontWeight:700 }}>{timeRemainingStr(activeSession.endsAt)}</div>
          </div>
          <ChevronRight size={16} color="#475569" />
        </div>
      )}

      {/* Quick stats */}
      <div style={{ display:'flex', gap:10, marginBottom:20 }}>
        {[
          { label: 'Sessions', value: past.length },
          { label: 'Spent UZS', value: totalSpent > 999 ? `${(totalSpent/1000).toFixed(0)}k` : totalSpent },
          { label: 'Avg session', value: avgHours > 0 ? `${avgHours.toFixed(1)}h` : '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ flex:1, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.04)', borderRadius:16, padding:'14px 12px', textAlign:'center' }}>
            <div style={{ fontSize:22, fontWeight:900, lineHeight:1 }}>{value}</div>
            <div style={{ fontSize:9, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:'1.5px', marginTop:4 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Recent sessions */}
      {past.length > 0 && (
        <div style={{ marginBottom:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:2, color:'#64748b' }}>Recent</div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize:9, padding:'4px 10px' }} onClick={() => navigate('/app/sessions')}>See all</button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {past.slice(0,3).map(s => (
              <div key={s.id} style={{ background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.04)', borderRadius:12, padding:'11px 14px', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:28, height:28, background:'rgba(34,197,94,.08)', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <CheckCircle size={13} color="#4ade80" />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {s.accountLogin || 'Steam Account'} · {s.hoursTotal} hrs
                  </div>
                  <div style={{ fontSize:10, color:'#64748b' }}>
                    {new Date(s.startedAt).toLocaleDateString('en',{month:'short',day:'numeric'})} · {s.cost.toLocaleString()} UZS
                  </div>
                </div>
                <span className="tag tag-green" style={{ fontSize:8, padding:'2px 6px' }}>Done</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Rent CTA */}
      <button
        onClick={() => navigate('/app/rent')}
        style={{
          width:'100%', padding:'20px 24px', marginTop: 24, marginBottom: 28,
          background:'linear-gradient(135deg,#2563eb,#4f46e5)',
          border:'none', borderRadius:22, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', gap:10,
          boxShadow:'0 8px 36px rgba(37,99,235,.45)', transition:'.2s', position:'relative', overflow:'hidden',
        }}
      >
        <Zap size={22} color="white" fill="white" />
        <span style={{ fontSize:17, fontWeight:900, color:'#fff', textTransform:'uppercase', letterSpacing:'1.5px' }}>Rent Now</span>
      </button>
    </div>
  )
}
