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

describe('Sidebar — إنشاء شحنة', () => {
  it.each(['admin', 'manager', 'employee'])('is visible for %s and opens /create-shipment', (role) => {
    auth.role = role
    render(<MemoryRouter initialEntries={['/dashboard']}><Sidebar /><Where /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: /إنشاء شحنة/ }))
    expect(screen.getByTestId('where')).toHaveTextContent('/create-shipment')
  })

  it.each(['viewer', 'accountant'])('is hidden for %s (no draft permission)', (role) => {
    auth.role = role
    render(<MemoryRouter initialEntries={['/dashboard']}><Sidebar /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: /إنشاء شحنة/ })).toBeNull()
  })
})
