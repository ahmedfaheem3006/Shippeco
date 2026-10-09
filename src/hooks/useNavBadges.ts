import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../utils/apiClient'
import { useAuthStore } from './useAuthStore'
import { useSocket } from '../contexts/SocketContext'

/** Server-computed sidebar counters (null = the user may not see that section). */
export type NavBadges = {
  assignedTasks: number
  supportAttention: number | null
  shippingRequests: number | null
}

/**
 * Server events after which the counters may have changed. The counters are
 * never adjusted here (no "count - 1"): each event only triggers a re-read of
 * GET /navigation/badges, so every tab and every user ends on the server's
 * numbers. `nav:badges` covers tasks, quote requests and the user's own
 * read state; the support events cover new customer messages, hand-offs,
 * take-overs and ticket changes.
 */
export const BADGE_EVENTS = ['nav:badges', 'support:message', 'support:conversation', 'support:ticket'] as const

const DEBOUNCE_MS = 400

export function useNavBadges(): NavBadges | null {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const { socket, resyncVersion } = useSocket()
  // Remembers whose counters these are, so another account never sees them.
  const [state, setState] = useState<{ userId: number; badges: NavBadges } | null>(null)
  const seq = useRef(0)

  const load = useCallback(() => {
    if (!userId) return
    const n = ++seq.current
    api.get<NavBadges | { data?: NavBadges }>('/navigation/badges')
      .then((res) => {
        // apiClient unwraps { success, data } → the counters themselves.
        const b = res && 'assignedTasks' in res ? res : (res as { data?: NavBadges } | null)?.data
        if (n !== seq.current || !b || typeof b.assignedTasks !== 'number') return
        setState({ userId, badges: b })
      })
      // A failed read keeps the last numbers the server confirmed (or none).
      .catch(() => undefined)
  }, [userId])

  // First load, login/account switch, and after every reconnect (events sent
  // while offline are lost).
  useEffect(() => { load() }, [load, resyncVersion])

  useEffect(() => {
    if (!socket) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const onEvent = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; load() }, DEBOUNCE_MS)
    }
    for (const ev of BADGE_EVENTS) socket.on(ev, onEvent)
    return () => {
      if (timer) clearTimeout(timer)
      for (const ev of BADGE_EVENTS) socket.off(ev, onEvent)
    }
  }, [socket, load])

  // Back to a tab that slept: re-read once.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  return state && state.userId === userId ? state.badges : null
}
