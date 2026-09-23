import { beforeEach, describe, expect, it, vi } from 'vitest'

const disconnectSocket = vi.fn()
vi.mock('../services/socketClient', () => ({ disconnectSocket }))

describe('useAuthStore logout', () => {
  beforeEach(() => {
    vi.resetModules()
    disconnectSocket.mockClear()
    sessionStorage.clear()
    localStorage.clear()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, replace: vi.fn() },
      writable: true,
    })
  })

  it('clears session storage, legacy localStorage credentials, disconnects the socket, and redirects once via replace', async () => {
    sessionStorage.setItem('shippec_session', JSON.stringify({ id: 1 }))
    sessionStorage.setItem('auth_token', 'abc')
    localStorage.setItem('token', 'legacy-token')
    localStorage.setItem('shippec_settings', JSON.stringify({ currency: 'PL' })) // unrelated, must survive

    const { useAuthStore } = await import('./useAuthStore')
    useAuthStore.getState().logout()

    expect(sessionStorage.getItem('shippec_session')).toBeNull()
    expect(sessionStorage.getItem('auth_token')).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
    // Unrelated browser storage must be preserved.
    expect(localStorage.getItem('shippec_settings')).not.toBeNull()

    expect(disconnectSocket).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()

    expect(window.location.replace).toHaveBeenCalledTimes(1)
    expect(window.location.replace).toHaveBeenCalledWith('/login')
  })
})
