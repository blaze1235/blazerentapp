import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types'

interface AuthState {
  user: User | null
  token: string | null
  isAdmin: boolean
  isLoading: boolean

  login: (token: string, user: User) => void
  logout: () => void
  setBalance: (balance: number) => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAdmin: false,
      isLoading: false,

      login: (token, user) => {
        localStorage.setItem('token', token)
        set({ token, user, isAdmin: user.isAdmin, isLoading: false })
      },

      logout: () => {
        localStorage.removeItem('token')
        set({ token: null, user: null, isAdmin: false, isLoading: false })
      },

      setBalance: (balance) =>
        set((state) => ({
          user: state.user ? { ...state.user, balance } : null,
        })),

      setUser: (user) =>
        set({ user, isAdmin: user.isAdmin }),
    }),
    {
      name: 'blazerent-auth',
      partialize: (state) => ({ token: state.token, user: state.user, isAdmin: state.isAdmin }),
    }
  )
)
