import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task, TaskMessage } from '../../services/tasks.service'

const svc = vi.hoisted(() => ({
  getTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateStatus: vi.fn(),
  addMessage: vi.fn(),
}))
vi.mock('../../services/tasks.service', () => ({ tasksService: svc }))
vi.mock('../../services/unifiedService', () => ({
  unifiedService: { get: vi.fn().mockResolvedValue([{ id: 7, full_name: 'موظف أول', role: 'employee' }]) },
}))
vi.mock('../../utils/apiClient', async (orig) => ({ ...(await orig<object>()), api: { get: vi.fn().mockResolvedValue({ data: [] }) } }))
vi.mock('../../hooks/useAuthStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: { id: 1, role: 'admin' } }),
}))

import { CreateTaskModal } from './CreateTaskModal'
import { TaskDetailsModal, type DraftStore } from './TaskDetailsModal'

// jsdom has no layout/scrolling APIs
Element.prototype.scrollTo = vi.fn() as never
Element.prototype.scrollBy = vi.fn() as never
Element.prototype.scrollIntoView = vi.fn()

afterEach(() => cleanup())
beforeEach(() => vi.clearAllMocks())

const deferred = <T,>() => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const msg = (id: number, task_id: number, message: string, user_id = 2): TaskMessage =>
  ({ id, task_id, user_id, message, created_at: `2026-01-01T10:0${id % 10}:00Z`, user_name: 'موظف' })
const taskOf = (id: number, messages: TaskMessage[] = []): Task => ({
  id, title: `المهمة ${id}`, description: `وصف ${id}`, assigned_to: 2, assigned_by: 1, status: 'open',
  created_at: '2026-01-01T09:00:00Z', updated_at: '2026-01-01T09:00:00Z', assigned_to_name: 'موظف', assigned_by_name: 'مدير', messages,
})
const memDrafts = (): DraftStore => { const m = new Map<number, string>(); return { get: (id) => m.get(id) ?? '', set: (id, t) => { m.set(id, t) } } }

describe('CreateTaskModal', () => {
  const fillValid = async () => {
    fireEvent.change(screen.getByLabelText(/عنوان المهمة/), { target: { value: 'مراجعة فواتير' } })
    fireEvent.click(await screen.findByRole('combobox', { name: /الموظف المسؤول/ }))
    fireEvent.click(await screen.findByRole('option', { name: /موظف أول/ }))
  }

  it('shows Arabic validation next to the fields and sends nothing', async () => {
    render(<CreateTaskModal open onClose={vi.fn()} onCreated={vi.fn()} />)
    // (jsdom ignores the button's form="…" association; real browsers were checked end-to-end)
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('عنوان المهمة مطلوب')).toBeInTheDocument()
    expect(screen.getByText('اختر الموظف المسؤول عن المهمة')).toBeInTheDocument()
    expect(screen.getByLabelText(/عنوان المهمة/)).toHaveAttribute('aria-invalid', 'true')
    expect(svc.createTask).not.toHaveBeenCalled()
  })

  it('double submit creates once, and reports success only after the API confirms', async () => {
    const d = deferred<Task>()
    svc.createTask.mockReturnValue(d.promise)
    const onCreated = vi.fn()
    render(<CreateTaskModal open onClose={vi.fn()} onCreated={onCreated} />)
    await fillValid()
    const submit = screen.getByRole('button', { name: /إرسال المهمة/ })
    fireEvent.click(submit)
    fireEvent.click(submit)
    fireEvent.submit(document.querySelector('form')!) // Enter in the title field
    expect(svc.createTask).toHaveBeenCalledTimes(1)
    expect(svc.createTask).toHaveBeenCalledWith({ title: 'مراجعة فواتير', description: undefined, assigned_to: 7, invoice_id: null })
    expect(onCreated).not.toHaveBeenCalled()
    expect(screen.getByText(/جاري الحفظ/)).toBeInTheDocument()
    await act(async () => d.resolve(taskOf(99)))
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 99 }))
  })

  it('on failure keeps the input, explains why and retries', async () => {
    svc.createTask.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(taskOf(5))
    const onCreated = vi.fn()
    render(<CreateTaskModal open onClose={vi.fn()} onCreated={onCreated} />)
    await fillValid()
    fireEvent.submit(document.querySelector('form')!)
    expect(await screen.findByText('لم يتم حفظ المهمة')).toBeInTheDocument()
    expect(screen.getByText(/تعذر الاتصال بالخادم/)).toBeInTheDocument()
    expect(screen.getByLabelText(/عنوان المهمة/)).toHaveValue('مراجعة فواتير')
    expect(onCreated).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
  })

  it('asks before discarding typed data on Escape', async () => {
    const onClose = vi.fn()
    render(<CreateTaskModal open onClose={onClose} onCreated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText(/عنوان المهمة/), { target: { value: 'شيء' } })
    fireEvent.keyDown(screen.getByLabelText(/عنوان المهمة/), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'تجاهل وإغلاق' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('TaskDetailsModal', () => {
  const base = {
    open: true, prevId: null, nextId: null, onNavigate: vi.fn(), onClose: vi.fn(), onTaskChanged: vi.fn(),
  }

  it('a late response for the previous task never shows inside the next one', async () => {
    const slow = deferred<Task>()
    svc.getTask.mockImplementation((id: number) => (id === 1 ? slow.promise : Promise.resolve(taskOf(2, [msg(20, 2, 'رد على المهمة 2')]))))
    const drafts = memDrafts()
    const { rerender } = render(<MemoryRouter><TaskDetailsModal {...base} taskId={1} drafts={drafts} /></MemoryRouter>)
    rerender(<MemoryRouter><TaskDetailsModal {...base} taskId={2} drafts={drafts} /></MemoryRouter>)
    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByText('رد على المهمة 2')).toBeInTheDocument()
    await act(async () => slow.resolve(taskOf(1, [msg(10, 1, 'رد على المهمة 1')])))
    expect(within(dialog).queryByText('رد على المهمة 1')).toBeNull()
    expect(within(dialog).getByRole('heading', { level: 2 })).toHaveTextContent('المهمة 2')
  })

  it('never calls scrollIntoView (it would scroll the page behind); sends a reply once, no duplicate on refresh', async () => {
    svc.getTask.mockResolvedValue(taskOf(3, [msg(1, 3, 'أول رد')]))
    const d = deferred<TaskMessage>()
    svc.addMessage.mockReturnValue(d.promise)
    render(<MemoryRouter><TaskDetailsModal {...base} taskId={3} drafts={memDrafts()} /></MemoryRouter>)
    const box = await screen.findByLabelText('اكتب ردك')
    await waitFor(() => expect(box).not.toBeDisabled())
    fireEvent.change(box, { target: { value: 'ردي' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    fireEvent.keyDown(box, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'إرسال الرد' }))
    expect(svc.addMessage).toHaveBeenCalledTimes(1)
    await act(async () => d.resolve({ ...msg(2, 3, 'ردي', 1) }))
    expect(screen.getAllByText('ردي')).toHaveLength(1)
    expect(box).toHaveValue('')
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
  })

  it('a failed reply keeps its text and can be retried', async () => {
    svc.getTask.mockResolvedValue(taskOf(4))
    svc.addMessage.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(msg(9, 4, 'نص مهم', 1))
    render(<MemoryRouter><TaskDetailsModal {...base} taskId={4} drafts={memDrafts()} /></MemoryRouter>)
    const box = await screen.findByLabelText('اكتب ردك')
    await waitFor(() => expect(box).not.toBeDisabled())
    fireEvent.change(box, { target: { value: 'نص مهم' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(await screen.findByText(/لم يُرسل الرد/)).toBeInTheDocument()
    expect(box).toHaveValue('نص مهم')
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(await screen.findByText('نص مهم', { selector: 'p' })).toBeInTheDocument()
  })

  it('keeps an unsent draft per task across navigation', async () => {
    svc.getTask.mockImplementation((id: number) => Promise.resolve(taskOf(id)))
    const drafts = memDrafts()
    const { rerender } = render(<MemoryRouter><TaskDetailsModal {...base} taskId={5} drafts={drafts} /></MemoryRouter>)
    const box = await screen.findByLabelText('اكتب ردك')
    fireEvent.change(box, { target: { value: 'مسودة ٥' } })
    rerender(<MemoryRouter><TaskDetailsModal {...base} taskId={6} drafts={drafts} /></MemoryRouter>)
    expect(await screen.findByLabelText('اكتب ردك')).toHaveValue('')
    rerender(<MemoryRouter><TaskDetailsModal {...base} taskId={5} drafts={drafts} /></MemoryRouter>)
    expect(await screen.findByLabelText('اكتب ردك')).toHaveValue('مسودة ٥')
  })

  it('load failure shows a reason with retry, and can still be closed', async () => {
    svc.getTask.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(taskOf(8))
    const onClose = vi.fn()
    render(<MemoryRouter><TaskDetailsModal {...base} onClose={onClose} taskId={8} drafts={memDrafts()} /></MemoryRouter>)
    expect(await screen.findByText('لم نتمكن من تحميل المهمة')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }))
    expect(await screen.findByText('وصف 8')).toBeInTheDocument()
  })

  it('prev/next buttons follow the list and are disabled at the ends', async () => {
    svc.getTask.mockResolvedValue(taskOf(1))
    const onNavigate = vi.fn()
    render(<MemoryRouter><TaskDetailsModal {...base} onNavigate={onNavigate} prevId={null} nextId={2} taskId={1} drafts={memDrafts()} /></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'المهمة السابقة' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'المهمة التالية' }))
    expect(onNavigate).toHaveBeenCalledWith(2)
  })
})
