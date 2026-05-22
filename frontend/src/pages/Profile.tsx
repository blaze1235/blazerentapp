import React from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Send, Globe, Bell, Shield, Terminal } from 'lucide-react'
import { useAuthStore } from '../store/auth'

const TIER_EMOJI: Record<string, string> = { gold: '🏅', silver: '🥈', bronze: '🥉' }
const AVATAR_GRADIENTS = ['#2563eb,#8b5cf6', '#dc2626,#9f1239', '#d97706,#92400e', '#7c3aed,#4c1d95', '#0891b2,#0e7490']

export default function Profile() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/auth', { replace: true })
  }

  if (!user) return null

  const initials = user.name[0]?.toUpperCase() || 'U'
  const grad = AVATAR_GRADIENTS[user.name.charCodeAt(0) % AVATAR_GRADIENTS.length]

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '28px 20px 40px' }}>

      {/* Avatar + name */}
      <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:28 }}>
        <div style={{
          width:60, height:60, borderRadius:18,
          background:`linear-gradient(135deg,${grad})`,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:20, fontWeight:900, flexShrink:0,
        }}>
          {initials}
        </div>
        <div>
          <div style={{ fontSize:20, fontWeight:900 }}>{user.name}</div>
          <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>
            {user.phone} · {user.tier.charAt(0).toUpperCase() + user.tier.slice(1)} tier {TIER_EMOJI[user.tier] || ''}
          </div>
        </div>
      </div>

      {/* Notifications card */}
      <div style={{ background:'#111827', border:'1px solid rgba(255,255,255,.06)', borderRadius:20, padding:20, marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
          <Bell size={15} color="#60a5fa" />
          <span style={{ fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:2, color:'#60a5fa' }}>Bot notifications</span>
        </div>
        <div style={{ background:'rgba(59,130,246,.06)', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#60a5fa', lineHeight:1.5 }}>
          Telegram bot sends you reminders about your sessions.
        </div>
        {[
          { label: 'Session started', sub: 'Bot confirms when rental begins' },
          { label: '15 min reminder', sub: '"15 min left — extend?"' },
          { label: '5 min reminder', sub: '"Still playing? 5 min left!"' },
          { label: 'Session expired', sub: 'Notified when time is up' },
        ].map(({ label, sub }) => (
          <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700 }}>{label}</div>
              <div className="td-sub">{sub}</div>
            </div>
            <button style={{ width:40, height:22, borderRadius:99, border:'none', cursor:'pointer', background:'#2563eb', position:'relative', transition:'.3s', flexShrink:0 }}>
              <span style={{ position:'absolute', top:3, left:21, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'.3s' }} />
            </button>
          </div>
        ))}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:14 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700 }}>Low balance</div>
            <div className="td-sub">Alert below 10 000 UZS</div>
          </div>
          <button style={{ width:40, height:22, borderRadius:99, border:'none', cursor:'pointer', background:'rgba(255,255,255,.1)', position:'relative', transition:'.3s', flexShrink:0 }}>
            <span style={{ position:'absolute', top:3, left:3, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'.3s' }} />
          </button>
        </div>
      </div>

      {/* Telegram linked */}
      {user.tgChatId && (
        <div style={{ background:'#111827', border:'1px solid rgba(255,255,255,.06)', borderRadius:20, padding:'14px 18px', marginBottom:14, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Send size={15} color="#29b6f6" />
            <div>
              <div style={{ fontSize:13, fontWeight:700 }}>Telegram linked</div>
              <div className="td-sub">ID: {user.tgChatId}</div>
            </div>
          </div>
          <span className="tag tag-green">Connected</span>
        </div>
      )}

      {/* Language */}
      <div style={{ background:'#111827', border:'1px solid rgba(255,255,255,.06)', borderRadius:20, padding:'14px 18px', marginBottom:14, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <Globe size={15} color="#60a5fa" />
          <span style={{ fontSize:13, fontWeight:700 }}>Language</span>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {(['en','uz','ru'] as const).map(lang => (
            <button
              key={lang}
              className={user.language === lang ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
              style={{ fontSize:10, padding:'6px 12px' }}
            >
              {lang.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Admin console */}
      {user.isAdmin && (
        <button
          className="btn btn-ghost btn-w"
          style={{ marginBottom:8, color:'#64748b' }}
          onClick={() => navigate('/app/admin/dashboard')}
        >
          <Terminal size={14} /> Admin console
        </button>
      )}

      {/* Sign out */}
      <button className="btn btn-red btn-w" onClick={handleLogout}>
        <LogOut size={14} /> Sign out
      </button>
    </div>
  )
}
