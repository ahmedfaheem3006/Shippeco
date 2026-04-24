import { create } from 'zustand'
import type { SessionUser } from '../utils/models'
import { readJson, removeKey, storageKeys, writeJson } from '../utils/storage'

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
      }
      set({ user: null, token: null })
      window.location.href = '/login'
    },
  }
})
