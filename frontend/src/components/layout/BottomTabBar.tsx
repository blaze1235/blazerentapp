import React from 'react'
import { NavLink } from 'react-router-dom'
import {
  Home, Zap, Clock, Wallet, User,
  LayoutDashboard, Activity, Users, DollarSign, BarChart3,
  type LucideIcon,
} from 'lucide-react'
import { useAuthStore } from '../../store/auth'

type Tab = { to: string; label: string; icon: LucideIcon; rent?: boolean }

const clientTabs: Tab[] = [
  { to: '/app/home',     label: 'Home',     icon: Home },
  { to: '/app/sessions', label: 'Sessions', icon: Clock },
  { to: '/app/rent',     label: 'Rent',     icon: Zap, rent: true },
  { to: '/app/wallet',   label: 'Wallet',   icon: Wallet },
  { to: '/app/profile',  label: 'Profile',  icon: User },
]

const adminTabs: Tab[] = [
  { to: '/app/admin/dashboard',  label: 'Overview', icon: LayoutDashboard },
  { to: '/app/admin/operations', label: 'Live',     icon: Activity },
  { to: '/app/admin/clients',    label: 'Clients',  icon: Users, rent: true },
  { to: '/app/admin/finance',    label: 'Finance',  icon: DollarSign },
  { to: '/app/admin/stats',      label: 'Stats',    icon: BarChart3 },
]

export default function BottomTabBar() {
  const { isAdmin } = useAuthStore()
  const tabs = isAdmin ? adminTabs : clientTabs

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 md:hidden z-50 flex items-start pt-2 pb-0"
      style={{
        height: 72,
        background: 'rgba(7,11,20,.97)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTop: '1px solid rgba(255,255,255,.07)',
      }}
    >
      {tabs.map(({ to, label, icon: Icon, rent }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center gap-[3px] border-none cursor-pointer transition-all ${
              isActive ? 'text-blue-xl' : 'text-slate5 hover:text-white'
            }`
          }
          style={{ background: 'none', textDecoration: 'none' }}
        >
          {({ isActive }) =>
            rent ? (
              <>
                <span
                  className="flex items-center justify-center"
                  style={{
                    width: 52, height: 52, borderRadius: 16, marginTop: -14,
                    background: 'linear-gradient(135deg,#2563eb,#4f46e5)',
                    boxShadow: '0 4px 24px rgba(37,99,235,.55)',
                    border: '3px solid rgba(7,11,20,.97)',
                    transition: '.2s',
                  }}
                >
                  <Icon size={22} color="white" />
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: '#60a5fa' }}>
                  {label}
                </span>
              </>
            ) : (
              <>
                <span
                  className="flex items-center justify-center transition-all"
                  style={{
                    width: 36, height: 28, borderRadius: 9,
                    background: isActive ? 'rgba(37,99,235,.18)' : 'none',
                  }}
                >
                  <Icon size={18} />
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px' }}>
                  {label}
                </span>
              </>
            )
          }
        </NavLink>
      ))}
    </nav>
  )
}
