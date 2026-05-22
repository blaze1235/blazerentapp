import { create } from 'zustand'
import type { RentalSession } from '../types'

interface SessionState {
  activeSession: RentalSession | null
  setSession: (session: RentalSession | null) => void
  clearSession: () => void
}

export const useSessionStore = create<SessionState>()((set) => ({
  activeSession: null,

  setSession: (session) => set({ activeSession: session }),

  clearSession: () => set({ activeSession: null }),
}))
