import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getActiveSession } from '../api/rental'
import { useSessionStore } from '../store/session'
import { useAuthStore } from '../store/auth'

export function useActiveSession() {
  const { user } = useAuthStore()
  const { activeSession, setSession } = useSessionStore()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['activeSession'],
    queryFn: getActiveSession,
    refetchInterval: 30_000,
    enabled: !!user,
  })

  useEffect(() => {
    if (data !== undefined) {
      setSession(data)
    }
  }, [data, setSession])

  return {
    activeSession: activeSession ?? data ?? null,
    isLoading,
    refetch,
  }
}
