import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('../Sidebar/Sidebar', () => ({ Sidebar: () => <nav data-testid="sidebar" /> }))
vi.mock('../../hooks/useNotifications', () => ({
  useNotifications: () => ({ notifications: [], unreadCount: 0, markAsRead: vi.fn(), markAllAsRead: vi.fn() }),
}))
vi.mock('../../hooks/useAuthStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 1, role: 'admin', full_name: 'System Admin', email: 'admin@x.test' } }),
}))
vi.mock('../../hooks/useTheme', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }))

import { AppLayout } from './AppLayout'

const renderAt = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div>dashboard</div>} />
          <Route path="/create-shipment" element={<div>create</div>} />
          <Route path="/shipment-tracking" element={<div>list</div>} />
          <Route path="/shipment-tracking/:awb" element={<div>details</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )

afterEach(() => cleanup())

describe('AppLayout header title (route-aware)', () => {
  it.each([
    ['/dashboard', 'الرئيسية'],
    ['/create-shipment', 'إنشاء شحنة'],
    ['/shipment-tracking', 'متابعة البوليصة'],
    ['/shipment-tracking/6606077671', 'تفاصيل البوليصة'],
  ])('%s → header "%s" and tab "%s | SHIPPEC"', (url, title) => {
    renderAt(url)
    const header = screen.getByRole('banner')
    // desktop + mobile headings both carry the page's name
    const headings = within(header).getAllByRole('heading', { level: 1 })
    expect(headings).toHaveLength(2)
    for (const h of headings) expect(h.textContent).toBe(title)
    expect(document.title).toBe(`${title} | SHIPPEC`)
  })

  it('mobile heading truncates a long name instead of overflowing; header controls are intact', () => {
    renderAt('/shipment-tracking/6606077671')
    const header = screen.getByRole('banner')
    const [desktop, mobile] = within(header).getAllByRole('heading', { level: 1 })
    expect(desktop.className).toContain('hidden sm:block')
    expect(desktop.className).toContain('truncate')
    expect(mobile.className).toContain('sm:hidden')
    expect(mobile.className).toContain('truncate')
    expect(mobile.getAttribute('title')).toBe('تفاصيل البوليصة')
    // menu, theme toggle and notifications are still there
    expect(within(header).getByTitle('القائمة')).toBeTruthy()
    expect(within(header).getByTitle('تبديل المظهر')).toBeTruthy()
    expect(within(header).getByTitle('الإشعارات')).toBeTruthy()
    expect(header.closest('[dir="rtl"]')).not.toBeNull()
  })
})
