import { create } from 'zustand'
import type { SessionUser } from '../utils/models'
import { readJson, removeKey, storageKeys, writeJson } from '../utils/storage'
import { disconnectSocket } from '../services/socketClient'

/** Legacy keys from earlier auth implementations — cleared on logout so a
 *  stale credential from before this fix can never be picked up again. */
const LEGACY_AUTH_KEYS = ['token', 'auth_token', 'shippec_session'] as const

type AuthState = {
  user: SessionUser | null
  token: string | null
  setUser: (user: SessionUser, token?: string) => void
  logout: () => void
}

function loadInitialAuth(): { user: SessionUser | null, token: string | null } {
  if (typeof sessionStorage === 'undefined') return { user: null, token: null }
  const user = readJson<SessionUser>(storageKeys.session, sessionStorage)
  const token = sessionStorage.getItem('auth_token')
  return { user: user ?? null, token: token ?? null }
}

export const useAuthStore = create<AuthState>((set) => {
  const initial = loadInitialAuth()
  return {
    user: initial.user,
    token: initial.token,
    setUser: (user, token) => {
      if (typeof sessionStorage !== 'undefined') {
        writeJson(storageKeys.session, user, sessionStorage)
        if (token) {
          sessionStorage.setItem('auth_token', token)
        }
      }
      set({ user, token: token || initial.token })
    },
    logout: () => {
      if (typeof sessionStorage !== 'undefined') {
        removeKey(storageKeys.session, sessionStorage)
        sessionStorage.removeItem('auth_token')
        LEGACY_AUTH_KEYS.forEach((key) => sessionStorage.removeItem(key))
      }
      // Clear any credential a previous build may have left in localStorage
      // (e.g. services/http.ts used to read localStorage/token) without
      // touching unrelated persisted data (theme, settings, WA templates...).
      if (typeof localStorage !== 'undefined') {
        LEGACY_AUTH_KEYS.forEach((key) => localStorage.removeItem(key))
      }
      disconnectSocket()
      set({ user: null, token: null })
      // Full reload + history replacement: guarantees in-memory app state
      // (including protected page data) is gone and Back cannot return to it.
      window.location.replace('/login')
    },
  }
})
