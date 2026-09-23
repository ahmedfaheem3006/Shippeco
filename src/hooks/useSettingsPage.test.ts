import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const getUsersMock = vi.fn()
const deleteUserMock = vi.fn()
const activateUserMock = vi.fn()
const deactivateUserMock = vi.fn()

vi.mock('../services/usersService', () => ({
  usersService: {
    getUsers: (...args: unknown[]) => getUsersMock(...args),
    getPendingUsers: vi.fn(async () => []),
    approveUser: vi.fn(),
    rejectUser: vi.fn(),
    changeRole: vi.fn(),
    updateUser: vi.fn(),
    activateUser: (...args: unknown[]) => activateUserMock(...args),
    deactivateUser: (...args: unknown[]) => deactivateUserMock(...args),
    deleteUser: (...args: unknown[]) => deleteUserMock(...args),
  },
}))

vi.mock('../services/settingsService', () => ({
  settingsService: { getSettings: vi.fn(async () => ({})) },
}))

vi.mock('../services/paymobService', () => ({
  pingPaymobWorker: vi.fn(async () => ({ status: 'ok' })),
}))

vi.mock('../utils/apiClient', () => ({
  api: { get: vi.fn(async () => null), post: vi.fn(), put: vi.fn() },
}))

import { useSettingsPage } from './useSettingsPage'

const USER_A = {
  id: 1, email: 'a@shippeco.com', full_name: 'A', role: 'employee' as const,
  status: 'approved' as const, is_active: true, created_at: '2026-01-01',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useSettingsPage — user list resilience', () => {
  it('keeps the last-known user list and surfaces an error when a later refresh fails', async () => {
    getUsersMock.mockResolvedValueOnce([USER_A])
    const { result } = renderHook(() => useSettingsPage())

    await act(async () => { await result.current.refresh() })
    expect(result.current.users).toHaveLength(1)
    expect(result.current.usersError).toBeNull()

    getUsersMock.mockRejectedValueOnce(new Error('network down'))
    await act(async () => { await result.current.refresh() })

    // The list must NOT have been silently wiped to [] by the failed fetch.
    expect(result.current.users).toHaveLength(1)
    expect(result.current.usersError).toBe('network down')
  })
})

describe('useSettingsPage — per-user pending state', () => {
  it('ignores a duplicate delete click on the same user while the first is in flight', async () => {
    getUsersMock.mockResolvedValue([USER_A])
    let resolveDelete: () => void = () => {}
    deleteUserMock.mockReturnValue(new Promise<void>((resolve) => { resolveDelete = resolve }))

    const { result } = renderHook(() => useSettingsPage())

    let firstCall: Promise<void>
    act(() => {
      firstCall = result.current.handleDelete(1)
      result.current.handleDelete(1) // duplicate click while first is pending
    })

    expect(result.current.isUserPending(1)).toBe(true)
    expect(deleteUserMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveDelete()
      await firstCall
    })
    expect(result.current.isUserPending(1)).toBe(false)
  })
})

describe('useSettingsPage — status message timing', () => {
  it('shows the toggle-active success message after refresh, not before (refresh() clears it)', async () => {
    getUsersMock.mockResolvedValue([{ ...USER_A, is_active: true }])
    deactivateUserMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useSettingsPage())
    await act(async () => { await result.current.handleToggleActive(1, true) })

    expect(result.current.status).toBe('تم تعطيل الحساب')
  })
})
