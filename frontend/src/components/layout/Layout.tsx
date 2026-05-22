import React from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Home, Zap, Clock, Wallet, User,
  LayoutDashboard, Activity, Users, Database,
  BarChart3, DollarSign, Settings2, Plus,
} from 'lucide-react'
import BottomTabBar from './BottomTabBar'
import { useAuthStore } from '../../store/auth'

// ── Sidebar nav link ────────────────────────────────────────────────────
function NB({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl border-none cursor-pointer text-[11px] font-bold uppercase tracking-widest w-full transition-all whitespace-nowrap ${
          isActive
            ? 'bg-blue-brand text-white shadow-lg shadow-blue-brand/35'
            : 'text-slate4 hover:text-white hover:bg-white/4'
        }`
      }
    >
      <Icon size={15} style={{ opacity: 0.85, flexShrink: 0 }} />
      {label}
    </NavLink>
  )
}

function NavSection({ label }: { label: string }) {
  return (
    <div className="text-[9px] font-black text-slate6 uppercase tracking-[3px] px-2 pt-4 pb-1.5">{label}</div>
  )
}

// ── Sidebar ─────────────────────────────────────────────────────────────
function Sidebar() {
  const { user, isAdmin, logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <aside
      className="hidden md:flex flex-col fixed inset-y-0 left-0 z-40"
      style={{ width: 256, background: 'rgba(13,18,32,.98)', borderRight: '1px solid rgba(255,255,255,.06)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-6" style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
        <div
          className="flex items-center justify-center flex-shrink-0"
          style={{
            width: 36, height: 36, background: '#2563eb',
            borderRadius: 10, boxShadow: '0 0 16px rgba(37,99,235,.5)',
          }}
        >
          <Zap size={17} fill="white" color="white" />
        </div>
        <div className="text-[18px] font-black tracking-tight" style={{ letterSpacing: '-.5px' }}>
          <span className="text-blue-l italic">BLAZE</span>
          <span className="text-white">RENT</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {isAdmin ? (
          <>
            <NavSection label="Overview" />
            <NB to="/app/admin/dashboard"  icon={LayoutDashboard} label="Dashboard" />
            <NB to="/app/admin/operations" icon={Activity}        label="Live Sessions" />
            <NavSection label="Management" />
            <NB to="/app/admin/clients"    icon={Users}           label="Clients" />
            <NB to="/app/admin/inventory"  icon={Database}        label="Inventory" />
            <NB to="/app/admin/stats"      icon={BarChart3}       label="Stats & Analytics" />
            <NavSection label="Finance" />
            <NB to="/app/admin/finance"    icon={DollarSign}      label="Finance" />
            <NB to="/app/admin/settings"   icon={Settings2}       label="Operations" />
          </>
        ) : (
          <>
            <NB to="/app/home"     icon={Home}   label="Home" />
            <NB to="/app/rent"     icon={Zap}    label="Rent Now" />
            <NB to="/app/sessions" icon={Clock}  label="My Sessions" />
            <NB to="/app/wallet"   icon={Wallet} label="Wallet" />
            <NB to="/app/profile"  icon={User}   label="Profile" />
          </>
        )}
      </nav>

      {/* Footer */}
      {!isAdmin && user && (
        <div className="px-3 pb-4" style={{ borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 12 }}>
          <div
            className="flex items-center justify-between px-3.5 py-3 rounded-xl"
            style={{ background: 'rgba(37,99,235,.1)', border: '1px solid rgba(37,99,235,.2)' }}
          >
            <div>
              <div className="text-[9px] font-black text-slate5 uppercase tracking-[2px] mb-0.5">Balance</div>
              <div className="text-[15px] font-black text-blue-xl">{(user.balance ?? 0).toLocaleString()} UZS</div>
            </div>
            <button
              onClick={() => navigate('/app/wallet')}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
              style={{ background: '#2563eb', border: 'none', cursor: 'pointer' }}
            >
              <Plus size={14} color="white" />
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

// ── Layout root ──────────────────────────────────────────────────────────
export default function Layout() {
  return (
    <div className="flex min-h-screen" style={{ background: '#090E1A' }}>
      <Sidebar />
      <main className="flex-1 md:ml-64 pb-20 md:pb-0 min-h-screen overflow-y-auto">
        <Outlet />
      </main>
      <BottomTabBar />
    </div>
  )
}
