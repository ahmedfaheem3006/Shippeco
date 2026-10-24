import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { Task } from '../services/tasks.service'

const tasksSvc = vi.hoisted(() => ({ getTasks: vi.fn(), getTask: vi.fn(), createTask: vi.fn(), updateStatus: vi.fn(), addMessage: vi.fn() }))
vi.mock('../services/tasks.service', () => ({ tasksService: tasksSvc }))
const unregSvc = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), complete: vi.fn(), relink: vi.fn(), cancel: vi.fn(), searchInvoices: vi.fn() }))
vi.mock('../services/unregisteredInvoices.service', () => ({ unregisteredInvoicesService: unregSvc }))
const auth = vi.hoisted(() => ({ user: { id: 1, role: 'admin' } as { id: number; role: string } }))
vi.mock('../hooks/useAuthStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: auth.user }),
}))
const realtime = vi.hoisted(() => ({ handlers: [] as Array<{ events: readonly string[]; fn: () => void }> }))
vi.mock('../hooks/useRealtimeRefresh', () => ({
  useRealtimeRefresh: (events: readonly string[], fn: () => void) => { realtime.handlers.push({ events, fn }) },
}))
vi.mock('../services/unifiedService', () => ({ unifiedService: { get: vi.fn().mockResolvedValue([]) } }))

import { TasksPage } from './TasksPage'

Element.prototype.scrollTo = vi.fn() as never
Element.prototype.scrollBy = vi.fn() as never

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  realtime.handlers = []
  auth.user = { id: 1, role: 'admin' }
})

const task = (id: number, over: Partial<Task> = {}): Task => ({
  id, title: `المهمة ${id}`, description: null, assigned_to: 1, assigned_by: 2, status: 'open',
  created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T09:00:00Z', assigned_to_name: 'المدير', assigned_by_name: 'محاسب', ...over,
})
const counts = (pending: number) => ({ items: [], counts: { pending, done: 0, cancelled: 0, all: pending }, pagination: { page: 1, limit: 1, total: pending, totalPages: 1 } })

function Where() {
  const l = useLocation()
  return <div data-testid="where">{l.search}</div>
}
const renderPage = (url = '/tasks') =>
  render(<MemoryRouter initialEntries={[url]}><TasksPage /><Where /></MemoryRouter>)

describe('TasksPage — "فواتير غير مسجلة" tab', () => {
  it('sits right after "مهامي المستلمة" and shows the pending count; the other tabs still work', async () => {
    tasksSvc.getTasks.mockResolvedValue([task(1), task(2, { task_type: 'unregistered_invoice', awb: '1234567890', title: 'فاتورة غير مسجلة — AWB 1234567890' })])
    unregSvc.list.mockResolvedValue(counts(3))
    renderPage()
    const tabs = within(screen.getByRole('tablist', { name: 'تصفية المهام' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent?.replace(/\d+/g, '').trim())).toEqual(['الكل', 'مهامي المستلمة', 'فواتير غير مسجلة', 'مهام أسندتها', 'مفتوحة', 'مغلقة'])
    await waitFor(() => expect(screen.getByRole('tab', { name: /فواتير غير مسجلة/ })).toHaveTextContent('3'))
    expect(unregSvc.list).toHaveBeenCalledWith({ state: 'pending', limit: 1 })

    // The record is also a normal task card in "الكل", marked as such.
    expect(await screen.findByText('فاتورة غير مسجلة — AWB 1234567890')).toBeInTheDocument()
    expect(screen.getAllByText('فاتورة غير مسجلة').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('tab', { name: /مهامي المستلمة/ }))
    await waitFor(() => expect(tasksSvc.getTasks).toHaveBeenLastCalledWith({ view: 'received' }))
  })

  it('the count follows realtime events (3 → 2) without a refresh', async () => {
    tasksSvc.getTasks.mockResolvedValue([])
    unregSvc.list.mockResolvedValue(counts(3))
    renderPage()
    await waitFor(() => expect(screen.getByRole('tab', { name: /فواتير غير مسجلة/ })).toHaveTextContent('3'))
    unregSvc.list.mockResolvedValue(counts(2))
    // The page's counter subscription (the list panel is not mounted on this tab).
    const h = realtime.handlers.filter((x) => x.events.includes('tasks:updated')).at(-1)!
    expect(h.events).toEqual(['tasks:updated'])
    act(() => h.fn())
    await waitFor(() => expect(screen.getByRole('tab', { name: /فواتير غير مسجلة/ })).toHaveTextContent('2'))
  })

  it('a task edited/reassigned elsewhere (tasks:updated) appears in or leaves the list without a refresh', async () => {
    auth.user = { id: 10, role: 'employee' }
    tasksSvc.getTasks.mockResolvedValue([task(1, { assigned_to: 10 })])
    unregSvc.list.mockResolvedValue(counts(0))
    renderPage()
    expect(await screen.findByText('المهمة 1')).toBeInTheDocument()
    // Task 2 was reassigned to this user, task 1 to someone else.
    tasksSvc.getTasks.mockResolvedValue([task(2, { assigned_to: 10, title: 'مهمة أُسندت إليّ' })])
    const h = realtime.handlers.filter((x) => x.events.includes('tasks:updated')).at(-1)!
    act(() => h.fn())
    expect(await screen.findByText('مهمة أُسندت إليّ')).toBeInTheDocument()
    expect(screen.queryByText('المهمة 1')).toBeNull()
  })

  it('opening the tab loads its own list and keeps the tab in the URL; employees get it after "الكل"', async () => {
    tasksSvc.getTasks.mockResolvedValue([])
    unregSvc.list.mockResolvedValue(counts(0))
    renderPage()
    fireEvent.click(screen.getByRole('tab', { name: /فواتير غير مسجلة/ }))
    expect(await screen.findByText('لا توجد فواتير غير مسجلة حاليًا')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('?tab=unregistered')
    expect(screen.getByPlaceholderText(/رقم البوليصة/)).toBeInTheDocument()
    cleanup()

    auth.user = { id: 7, role: 'employee' }
    renderPage('/tasks?tab=unregistered&record=11')
    const tabs = within(screen.getByRole('tablist', { name: 'تصفية المهام' })).getAllByRole('tab')
    expect(tabs.map((t) => t.textContent?.replace(/\d+/g, '').trim())).toEqual(['الكل', 'فواتير غير مسجلة', 'مفتوحة', 'مغلقة'])
    expect(screen.getByRole('tab', { name: /فواتير غير مسجلة/ })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(unregSvc.list).toHaveBeenCalledWith(expect.objectContaining({ id: 11 })))
  })
})
