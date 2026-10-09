import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NavBadge } from './NavBadge'
import { formatBadgeCount } from '../../utils/navBadges'
import type { NavBadges } from '../../hooks/useNavBadges'

// ── socket / API fakes for useNavBadges ──
type Handler = (payload?: unknown) => void
const handlers = new Map<string, Set<Handler>>()
const fakeSocket = {
  on: (ev: string, fn: Handler) => { if (!handlers.has(ev)) handlers.set(ev, new Set()); handlers.get(ev)!.add(fn) },
  off: (ev: string, fn: Handler) => { handlers.get(ev)?.delete(fn) },
}
const emit = (ev: string, payload?: unknown) => handlers.get(ev)?.forEach((fn) => fn(payload))
const socketState = { socket: fakeSocket as unknown, connected: true, resyncVersion: 0 }
vi.mock('../../contexts/SocketContext', () => ({ useSocket: () => socketState }))

const apiGet = vi.fn()
vi.mock('../../utils/apiClient', () => ({ api: { get: (...a: unknown[]) => apiGet(...a) }, ApiError: class extends Error {} }))

const { useNavBadges } = await import('../../hooks/useNavBadges')
const { useAuthStore } = await import('../../hooks/useAuthStore')
const { Sidebar } = await import('./Sidebar')

const ok = (b: NavBadges) => Promise.resolve(b) // apiClient unwraps { success, data }
const setUser = (id: number, role: string) => useAuthStore.setState({ user: { id, username: `u${id}`, role, status: 'approved' } as never, token: 't' })

function Probe() {
  const b = useNavBadges()
  return <div data-testid="probe">{b ? JSON.stringify(b) : 'none'}</div>
}
const probe = () => screen.getByTestId('probe').textContent

beforeEach(() => {
  handlers.clear()
  socketState.resyncVersion = 0
  apiGet.mockReset()
  setUser(1, 'admin')
})
afterEach(() => cleanup())

describe('NavBadge', () => {
  it('formats 1, 9, 99 as is and 100+ as 99+', () => {
    expect([1, 9, 99, 100, 250].map(formatBadgeCount)).toEqual(['1', '9', '99', '99+', '99+'])
  })
  it('is hidden at zero and when unknown — never a made-up number', () => {
    for (const c of [0, null, undefined, NaN, -1]) {
      const { container, unmount } = render(<NavBadge count={c as number} label="x" />)
      expect(container.innerHTML).toBe('')
      unmount()
    }
  })
  it('shows the count in a red pill with an accessible label', () => {
    render(<NavBadge count={100} label="مهام مفتوحة" />)
    const b = screen.getByTestId('nav-badge')
    expect(b).toHaveTextContent('99+')
    expect(b).toHaveAttribute('aria-label', 'مهام مفتوحة: 100')
    expect(b.className).toContain('bg-red-600')
    expect(b.className).toContain('ms-auto') // end of the row in RTL, never over the icon/text
  })
})

describe('useNavBadges', () => {
  it('loads from the server, then re-reads it after a realtime signal (no local arithmetic)', async () => {
    apiGet.mockReturnValueOnce(ok({ assignedTasks: 5, supportAttention: 2, shippingRequests: 8 }))
    render(<Probe />)
    expect(probe()).toBe('none') // loading → no badge
    await waitFor(() => expect(probe()).toContain('"assignedTasks":5'))
    expect(apiGet).toHaveBeenCalledWith('/navigation/badges')

    apiGet.mockReturnValueOnce(ok({ assignedTasks: 4, supportAttention: 3, shippingRequests: 8 }))
    act(() => { emit('nav:badges', { scope: 'tasks' }); emit('support:message', {}) }) // burst → one read
    await waitFor(() => expect(probe()).toContain('"assignedTasks":4'), { timeout: 2000 })
    expect(probe()).toContain('"supportAttention":3')
    expect(apiGet).toHaveBeenCalledTimes(2)
  })

  it('re-reads after a reconnect and keeps the last confirmed numbers when a read fails', async () => {
    apiGet.mockReturnValueOnce(ok({ assignedTasks: 3, supportAttention: 0, shippingRequests: null }))
    const { rerender } = render(<Probe />)
    await waitFor(() => expect(probe()).toContain('"assignedTasks":3'))

    apiGet.mockImplementationOnce(() => Promise.reject(new Error('network')))
    act(() => emit('nav:badges', { scope: 'tasks' }))
    await new Promise((r) => setTimeout(r, 600))
    expect(probe()).toContain('"assignedTasks":3')

    apiGet.mockReturnValueOnce(ok({ assignedTasks: 7, supportAttention: 1, shippingRequests: null }))
    socketState.resyncVersion = 1
    rerender(<Probe />)
    await waitFor(() => expect(probe()).toContain('"assignedTasks":7'))
  })

  it('shows nothing when the first read fails, and never another account\'s counters', async () => {
    apiGet.mockImplementationOnce(() => Promise.reject(new Error('500')))
    render(<Probe />)
    await new Promise((r) => setTimeout(r, 50))
    expect(probe()).toBe('none')

    apiGet.mockReturnValue(new Promise(() => undefined)) // the new account's read is still pending
    act(() => setUser(2, 'employee'))
    expect(probe()).toBe('none')
  })
})

describe('Sidebar badges', () => {
  const renderAt = (path: string) => render(<MemoryRouter initialEntries={[path]}><Sidebar /></MemoryRouter>)

  it('admin: three badges next to their items, 99+ cap, active item unchanged', async () => {
    apiGet.mockReturnValue(ok({ assignedTasks: 5, supportAttention: 3, shippingRequests: 120 }))
    renderAt('/tasks')
    await waitFor(() => expect(screen.getAllByTestId('nav-badge')).toHaveLength(3))
    const item = (label: string) => screen.getByText(label).closest('button')!
    expect(item('المهام المسؤول عنها')).toHaveTextContent('5')
    expect(item('مركز خدمة العملاء')).toHaveTextContent('3')
    expect(item('طلبات الشحن والتواصل')).toHaveTextContent('99+')
    expect(item('المهام المسؤول عنها').className).toContain('bg-indigo-50') // active state kept
  })

  it('employee: no shipping-requests item or badge; zero counters hidden', async () => {
    setUser(3, 'employee')
    apiGet.mockReturnValue(ok({ assignedTasks: 0, supportAttention: 2, shippingRequests: null }))
    renderAt('/dashboard')
    await waitFor(() => expect(screen.getAllByTestId('nav-badge')).toHaveLength(1))
    expect(screen.queryByText('طلبات الشحن والتواصل')).toBeNull()
    expect(screen.getByText('مركز خدمة العملاء').closest('button')).toHaveTextContent('2')
  })

  it('viewer: no support item, no support badge', async () => {
    setUser(4, 'viewer')
    apiGet.mockReturnValue(ok({ assignedTasks: 1, supportAttention: null, shippingRequests: null }))
    renderAt('/dashboard')
    await waitFor(() => expect(screen.getAllByTestId('nav-badge')).toHaveLength(1))
    expect(screen.queryByText('مركز خدمة العملاء')).toBeNull()
  })
})
