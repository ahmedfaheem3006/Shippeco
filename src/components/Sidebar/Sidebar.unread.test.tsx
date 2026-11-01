import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const badges = vi.hoisted(() => ({ value: null as null | Record<string, number | null> }))
vi.mock('../../hooks/useNavBadges', () => ({ useNavBadges: () => badges.value }))
vi.mock('../../hooks/useAuthStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 1, role: 'employee', name: 'U' }, logout: () => undefined }),
}))

import { Sidebar } from './Sidebar'

afterEach(() => cleanup())
const tasksItem = () => screen.getByRole('button', { name: /المهام المسؤول عنها/ })

describe('Sidebar — tasks with unread replies', () => {
  it('shows how many TASKS have unread replies, next to (and distinct from) the open-tasks counter', () => {
    badges.value = { assignedTasks: 4, unreadTaskConversations: 2, supportAttention: null, shippingRequests: null }
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    const item = within(tasksItem())
    expect(item.getByTestId('nav-badge-chat')).toHaveAccessibleName('مهام بها رسائل غير مقروءة: 2')
    expect(item.getByTestId('nav-badge')).toHaveAccessibleName('مهام مفتوحة مسندة إليك: 4')
  })

  it('nothing when no task has unread replies (or the server has not answered)', () => {
    badges.value = { assignedTasks: 0, unreadTaskConversations: 0, supportAttention: null, shippingRequests: null }
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(within(tasksItem()).queryByTestId('nav-badge-chat')).toBeNull()
    cleanup()
    badges.value = null
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(within(tasksItem()).queryByTestId('nav-badge-chat')).toBeNull()
  })
})
