import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task, TaskMessage } from '../services/tasks.service'

const tasksSvc = vi.hoisted(() => ({
  getTasks: vi.fn(), getTask: vi.fn(), createTask: vi.fn(), updateStatus: vi.fn(), addMessage: vi.fn(), markConversationRead: vi.fn(),
}))
vi.mock('../services/tasks.service', () => ({ tasksService: tasksSvc }))
const unregSvc = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), complete: vi.fn(), relink: vi.fn(), cancel: vi.fn(), searchInvoices: vi.fn() }))
vi.mock('../services/unregisteredInvoices.service', () => ({ unregisteredInvoicesService: unregSvc }))
const auth = vi.hoisted(() => ({ user: { id: 1, role: 'employee' } as { id: number; role: string } }))
vi.mock('../hooks/useAuthStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: auth.user }),
}))
const realtime = vi.hoisted(() => ({ handlers: [] as Array<{ events: readonly string[]; fn: (b: unknown[]) => void }> }))
vi.mock('../hooks/useRealtimeRefresh', () => ({
  useRealtimeRefresh: (events: readonly string[], fn: (b: unknown[]) => void) => { realtime.handlers.push({ events, fn }) },
}))
vi.mock('../services/unifiedService', () => ({ unifiedService: { get: vi.fn().mockResolvedValue([]) } }))

import { TasksPage } from './TasksPage'
import { firstUnreadMessageId, unreadRepliesLabel } from '../components/Tasks/taskUtils'

const scrollTo = vi.fn()
Element.prototype.scrollTo = scrollTo as never
Element.prototype.scrollBy = vi.fn() as never

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  realtime.handlers = []
  auth.user = { id: 1, role: 'employee' }
  unregSvc.list.mockResolvedValue({ items: [], counts: { pending: 0, done: 0, cancelled: 0, all: 0 }, pagination: { page: 1, limit: 1, total: 0, totalPages: 1 } })
  tasksSvc.markConversationRead.mockImplementation(async (id: number, last: number) => ({ task_id: id, last_read_message_id: last, last_read_at: '', unread_message_count: 0 }))
})

const task = (id: number, over: Partial<Task> = {}): Task => ({
  id, title: `المهمة ${id}`, description: null, assigned_to: 1, assigned_by: 2, status: 'open',
  created_at: '2026-10-01T09:00:00Z', updated_at: '2026-10-01T09:00:00Z', assigned_to_name: 'الموظف', assigned_by_name: 'المحاسب',
  unread_message_count: 0, has_unread_conversation: false, ...over,
})
const msg = (id: number, user_id: number, text: string): TaskMessage => ({
  id, task_id: 7, user_id, message: text, created_at: `2026-10-0${Math.min(9, id)}T09:00:00Z`, user_name: user_id === 1 ? 'أنا' : 'المحاسب',
})
const renderPage = (url = '/tasks') => render(<MemoryRouter initialEntries={[url]}><TasksPage /></MemoryRouter>)
const card = (id: number) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!
const findCard = (id: number) => waitFor(() => {
  const el = card(id)
  if (!el) throw new Error(`card ${id} not rendered yet`)
  return el
})
const fire = async (events: string[], payload: unknown = {}) => {
  for (const h of realtime.handlers.filter((x) => events.some((e) => x.events.includes(e)))) {
    await act(async () => { h.fn([{ event: events[0], payload }]) })
  }
}

describe('Arabic unread label + first unread', () => {
  it('uses the right Arabic form', () => {
    expect(unreadRepliesLabel(1)).toBe('رسالة جديدة')
    expect(unreadRepliesLabel(2)).toBe('رسالتان جديدتان')
    expect(unreadRepliesLabel(3)).toBe('3 رسائل جديدة')
    expect(unreadRepliesLabel(11)).toBe('11 رسالة جديدة')
  })
  it('first unread skips my own replies and anything already read', () => {
    const list = [msg(1, 2, 'a'), msg(2, 1, 'mine'), msg(3, 2, 'b')]
    expect(firstUnreadMessageId(list, 1, 1)).toBe(3)
    expect(firstUnreadMessageId(list, 3, 1)).toBeNull()
    expect(firstUnreadMessageId(list, 0, 1)).toBe(1)
  })
})

describe('Tasks page — unread replies', () => {
  it('shows «💬 3 رسائل جديدة» on the card, highlights it, and nothing on read cards', async () => {
    tasksSvc.getTasks.mockResolvedValue([task(7, { unread_message_count: 3, has_unread_conversation: true }), task(8)])
    renderPage()
    const badge = await within(await findCard(7)).findByTestId('task-unread-badge')
    expect(badge).toHaveTextContent('3 رسائل جديدة')
    expect(badge).toHaveAccessibleName('3 رسائل جديدة غير مقروءة — فتح المناقشة')
    expect(card(7).dataset.unread).toBe('3')
    expect(card(7).className).toMatch(/border-rose-300/)
    expect(within(card(8)).queryByTestId('task-unread-badge')).toBeNull()
    expect(card(8).dataset.unread).toBeUndefined()
  })

  it('keeps the server order (unread first is decided server-side, before anything else)', async () => {
    tasksSvc.getTasks.mockResolvedValue([task(3, { unread_message_count: 1 }), task(9), task(8)])
    renderPage()
    await findCard(3)
    const order = Array.from(document.querySelectorAll<HTMLElement>('[data-task-id]')).map((e) => e.dataset.taskId)
    expect(order).toEqual(['3', '9', '8'])
  })

  it('a long Arabic title and the other badges sit next to the unread badge (both rendered)', async () => {
    const long = 'متابعة شحنة العميل الخاصة بفاتورة غير مسجلة مع تحويل بنكي متأخر ومراجعة الوزن النهائي والتكلفة'
    tasksSvc.getTasks.mockResolvedValue([task(7, { title: long, unread_message_count: 2, task_type: 'unregistered_invoice', invoice_id: 5, invoice_number: 'DH2674' })])
    renderPage()
    const c = await findCard(7)
    expect(within(c).getByRole('heading', { name: long })).toBeInTheDocument()
    expect(within(c).getByTestId('task-unread-badge')).toHaveTextContent('رسالتان جديدتان')
    expect(within(c).getByText('مفتوحة')).toBeInTheDocument()
    expect(within(c).getByText('فاتورة غير مسجلة', { exact: true })).toBeInTheDocument()
    expect(within(c).getByText('فاتورة #DH2674')).toBeInTheDocument()
  })

  it('a new reply over Socket.IO re-reads the list: the badge appears without a refresh', async () => {
    tasksSvc.getTasks.mockResolvedValue([task(7)])
    renderPage()
    await findCard(7)
    expect(within(card(7)).queryByTestId('task-unread-badge')).toBeNull()
    tasksSvc.getTasks.mockResolvedValue([task(7, { unread_message_count: 1, has_unread_conversation: true })])
    await fire(['tasks:updated'], { id: 7, kind: 'general', action: 'message' })
    await waitFor(() => expect(within(card(7)).getByTestId('task-unread-badge')).toHaveTextContent('رسالة جديدة'))
  })

  it('«رسائل غير مقروءة» asks the server for the same tab narrowed to unread, and back', async () => {
    tasksSvc.getTasks.mockResolvedValue([task(7, { unread_message_count: 2 }), task(8)])
    renderPage()
    const toggle = await screen.findByRole('button', { name: /رسائل غير مقروءة/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveTextContent('(1)')
    tasksSvc.getTasks.mockResolvedValue([task(7, { unread_message_count: 2 })])
    fireEvent.click(toggle)
    await waitFor(() => expect(tasksSvc.getTasks).toHaveBeenLastCalledWith({ unread: true }))
    fireEvent.click(await screen.findByRole('button', { name: /عرض كل المهام/ }))
    await waitFor(() => expect(tasksSvc.getTasks).toHaveBeenLastCalledWith({}))
  })

  it('no toggle when nothing is unread', async () => {
    tasksSvc.getTasks.mockResolvedValue([task(8)])
    renderPage()
    await findCard(8)
    expect(screen.queryByRole('button', { name: /رسائل غير مقروءة/ })).toBeNull()
  })
})

describe('Task window — reading', () => {
  const withMessages = (lastRead: number) => ({
    ...task(7, { unread_message_count: 2 }),
    viewer_last_read_message_id: lastRead,
    messages: [msg(1, 2, 'قديمة'), msg(2, 1, 'ردي'), msg(3, 2, 'جديدة 1'), msg(4, 2, 'جديدة 2')],
  })

  it('clicking the badge opens the task at the first unread reply, marks read only after the replies load, and the badge goes away', async () => {
    tasksSvc.getTasks.mockResolvedValue([task(7, { unread_message_count: 2, has_unread_conversation: true })])
    let resolve!: (t: Task) => void
    tasksSvc.getTask.mockReturnValue(new Promise<Task>((r) => { resolve = r }))
    renderPage()
    fireEvent.click(await within(await findCard(7)).findByTestId('task-unread-badge'))
    await screen.findByRole('dialog')
    expect(tasksSvc.markConversationRead).not.toHaveBeenCalled() // nothing shown yet
    tasksSvc.getTasks.mockResolvedValue([task(7)])
    await act(async () => resolve(withMessages(2)))
    const dlg = within(screen.getByRole('dialog'))
    expect(await dlg.findByRole('separator', { name: 'الرسائل الجديدة تبدأ من هنا' })).toBeInTheDocument()
    const log = dlg.getByRole('log')
    const sep = log.querySelector('[role="separator"]')!
    expect(sep.nextElementSibling?.getAttribute('data-message-id')).toBe('3') // divider right before the first unread
    await waitFor(() => expect(tasksSvc.markConversationRead).toHaveBeenCalledWith(7, 4))
    expect(tasksSvc.markConversationRead).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(within(card(7)).queryByTestId('task-unread-badge')).toBeNull())
  })

  it('my own replies never show the divider', async () => {
    tasksSvc.getTasks.mockResolvedValue([task(7)])
    tasksSvc.getTask.mockResolvedValue({ ...task(7), viewer_last_read_message_id: 1, messages: [msg(1, 2, 'قديمة'), msg(2, 1, 'ردي فقط')] })
    renderPage()
    fireEvent.click(await findCard(7))
    const dlg = within(await screen.findByRole('dialog'))
    await dlg.findByText('ردي فقط')
    expect(dlg.queryByRole('separator', { name: 'الرسائل الجديدة تبدأ من هنا' })).toBeNull()
  })

  it('a reply arriving while the window is open is fetched right away (realtime) and marked only when shown at the bottom', async () => {
    tasksSvc.getTasks.mockResolvedValue([task(7)])
    tasksSvc.getTask.mockResolvedValue({ ...task(7), viewer_last_read_message_id: 4, messages: withMessages(4).messages })
    renderPage()
    fireEvent.click(await findCard(7))
    const dlg = within(await screen.findByRole('dialog'))
    await dlg.findByText('جديدة 2')
    await waitFor(() => expect(tasksSvc.markConversationRead).toHaveBeenLastCalledWith(7, 4))
    tasksSvc.getTask.mockResolvedValue({ ...task(7), viewer_last_read_message_id: 4, messages: [...withMessages(4).messages, msg(5, 2, 'وصلت الآن')] })
    await fire(['tasks:updated'], { id: 7, kind: 'general', action: 'message' })
    await dlg.findByText('وصلت الآن')
    await waitFor(() => expect(tasksSvc.markConversationRead).toHaveBeenLastCalledWith(7, 5)) // at the bottom → shown → read
  })

  it('a failed mark-read leaves the badge (no fake "read")', async () => {
    tasksSvc.getTasks.mockResolvedValue([task(7, { unread_message_count: 2 })])
    tasksSvc.getTask.mockResolvedValue(withMessages(2))
    tasksSvc.markConversationRead.mockRejectedValue(new Error('network'))
    renderPage()
    fireEvent.click(await findCard(7))
    await waitFor(() => expect(tasksSvc.markConversationRead).toHaveBeenCalled())
    expect(within(card(7)).getByTestId('task-unread-badge')).toHaveTextContent('رسالتان جديدتان')
  })
})
