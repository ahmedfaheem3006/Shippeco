import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

vi.mock('../../hooks/useNavBadges', () => ({ useNavBadges: () => null }))
const auth = vi.hoisted(() => ({ role: 'viewer' }))
vi.mock('../../hooks/useAuthStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 1, role: auth.role, name: 'U' }, logout: () => undefined }),
}))

import { Sidebar } from './Sidebar'

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>
}

afterEach(() => cleanup())

describe('Sidebar — متابعة البوليصة', () => {
  it.each(['admin', 'employee', 'viewer'])('is visible for %s and opens /shipment-tracking', (role) => {
    auth.role = role
    render(<MemoryRouter initialEntries={['/dashboard']}><Sidebar /><Where /></MemoryRouter>)
    const item = screen.getByRole('button', { name: /متابعة البوليصة/ })
    fireEvent.click(item)
    expect(screen.getByTestId('where')).toHaveTextContent('/shipment-tracking')
  })

  it('is highlighted on its page', () => {
    render(<MemoryRouter initialEntries={['/shipment-tracking?awb=9988679120']}><Sidebar /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /متابعة البوليصة/ }).className).toMatch(/text-indigo-600/)
  })
})
