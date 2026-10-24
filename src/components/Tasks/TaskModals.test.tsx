import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Task, TaskMessage } from '../../services/tasks.service'

const svc = vi.hoisted(() => ({
  getTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  updateStatus: vi.fn(),
  addMessage: vi.fn(),
}))
vi.mock('../../services/tasks.service', () => ({ tasksService: svc }))
const unreg = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }))
vi.mock('../../services/unregisteredInvoices.service', () => ({ unregisteredInvoicesService: unreg }))
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast: toastMock, default: toastMock }))
vi.mock('../../services/unifiedService', () => ({
  unifiedService: { get: vi.fn().mockResolvedValue([{ id: 7, full_name: 'موظف أول', role: 'employee' }]) },
}))
vi.mock('../../utils/apiClient', async (orig) => ({ ...(await orig<object>()), api: { get: vi.fn().mockResolvedValue({ data: [] }) } }))
const auth = vi.hoisted(() => ({ user: { id: 1, role: 'admin' } as { id: number; role: string } }))
vi.mock('../../hooks/useAuthStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: auth.user }),
}))

import { CreateTaskModal } from './CreateTaskModal'
import { TaskDetailsModal, type DraftStore } from './TaskDetailsModal'
import { ApiError } from '../../utils/apiClient'

// jsdom has no layout/scrolling APIs
Element.prototype.scrollTo = vi.fn() as never
Element.prototype.scrollBy = vi.fn() as never
Element.prototype.scrollIntoView = vi.fn()

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  auth.user = { id: 1, role: 'admin' }
})

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

describe('TaskDetailsModal — editing an open task', () => {
  const base = {
    open: true, prevId: null, nextId: null, onNavigate: vi.fn(), onClose: vi.fn(), onTaskChanged: vi.fn(),
  }
  const open = async (task: Task, props: Partial<React.ComponentProps<typeof TaskDetailsModal>> = {}) => {
    svc.getTask.mockResolvedValue(task)
    render(<MemoryRouter><TaskDetailsModal {...base} taskId={task.id} drafts={memDrafts()} {...props} /></MemoryRouter>)
    await screen.findByText(task.description ?? 'لا يوجد وصف')
    await waitFor(() => expect(screen.getByLabelText('اكتب ردك')).not.toBeDisabled())
  }
  const editButton = () => screen.queryByRole('button', { name: /^تعديل$/ })

  it('admin sees «تعديل» on an open task, never on a closed one', async () => {
    await open(taskOf(9))
    expect(editButton()).toBeInTheDocument()
    cleanup()
    await open({ ...taskOf(10), status: 'closed' })
    expect(editButton()).toBeNull()
  })

  it.each([
    ['manager, any task', { id: 50, role: 'manager' }, true],
    ['accountant who received it', { id: 2, role: 'accountant' }, true],
    ['accountant who sent it', { id: 1, role: 'accountant' }, true],
    ['unrelated accountant', { id: 3, role: 'accountant' }, false],
    ['the assigned employee', { id: 2, role: 'employee' }, false],
    ['viewer', { id: 2, role: 'viewer' }, false],
  ])('%s → button shown: %s', async (_n, user, shown) => {
    auth.user = user
    await open(taskOf(11))
    expect(!!editButton()).toBe(shown)
  })

  it('the form is prefilled, saves only what changed (once), and returns to the task with the new values', async () => {
    const onTaskChanged = vi.fn()
    await open(taskOf(12), { onTaskChanged })
    fireEvent.click(editButton()!)
    const title = await screen.findByLabelText(/عنوان المهمة/)
    expect(title).toHaveValue('المهمة 12')
    expect(screen.getByLabelText('التفاصيل')).toHaveValue('وصف 12')
    expect(screen.getByRole('combobox', { name: /الموظف المسؤول/ })).toHaveTextContent('موظف')
    const save = screen.getByRole('button', { name: /حفظ التعديلات/ })
    expect(save).toBeDisabled() // nothing changed yet

    const d = deferred<Task>()
    svc.updateTask.mockReturnValue(d.promise)
    fireEvent.change(title, { target: { value: 'المهمة 12 بعد التعديل' } })
    expect(save).not.toBeDisabled()
    fireEvent.click(save)
    fireEvent.click(save)
    fireEvent.submit(document.querySelector('form')!)
    expect(svc.updateTask).toHaveBeenCalledTimes(1)
    expect(svc.updateTask).toHaveBeenCalledWith(12, { title: 'المهمة 12 بعد التعديل' })
    expect(screen.getByText(/جاري الحفظ/)).toBeInTheDocument()

    const saved = { ...taskOf(12), title: 'المهمة 12 بعد التعديل', changed: true }
    svc.getTask.mockResolvedValue(saved)
    await act(async () => d.resolve(saved))
    expect(await screen.findByRole('heading', { level: 2, name: 'المهمة 12 بعد التعديل' })).toBeInTheDocument()
    expect(screen.getByLabelText('اكتب ردك')).toBeInTheDocument() // back in the task view
    await waitFor(() => expect(onTaskChanged).toHaveBeenCalledWith(expect.objectContaining({ id: 12, title: 'المهمة 12 بعد التعديل' })))
    expect(toastMock.success).toHaveBeenCalledWith('تم تعديل المهمة بنجاح')
  })

  it('changing the assignee sends only assigned_to', async () => {
    svc.updateTask.mockResolvedValue({ ...taskOf(13), assigned_to: 7, assigned_to_name: 'موظف أول' })
    await open(taskOf(13))
    fireEvent.click(editButton()!)
    fireEvent.click(await screen.findByRole('combobox', { name: /الموظف المسؤول/ }))
    fireEvent.click(await screen.findByRole('option', { name: /موظف أول/ }))
    fireEvent.click(screen.getByRole('button', { name: /حفظ التعديلات/ }))
    await waitFor(() => expect(svc.updateTask).toHaveBeenCalledWith(13, { assigned_to: 7 }))
  })

  it('client validation: a too-short title is shown and nothing is sent', async () => {
    await open(taskOf(14))
    fireEvent.click(editButton()!)
    fireEvent.change(await screen.findByLabelText(/عنوان المهمة/), { target: { value: 'اب' } })
    fireEvent.click(screen.getByRole('button', { name: /حفظ التعديلات/ }))
    expect(await screen.findByText(/عنوان المهمة يجب ألا يقل عن 3 أحرف/)).toBeInTheDocument()
    expect(svc.updateTask).not.toHaveBeenCalled()
  })

  it('a task closed meanwhile (409) shows «تم إتمام المهمة بالفعل» and re-reads the task', async () => {
    svc.updateTask.mockRejectedValue(new ApiError('لا يمكن تعديل المهمة بعد إتمامها.', 409, 'TASK_COMPLETED'))
    await open(taskOf(15))
    fireEvent.click(editButton()!)
    fireEvent.change(await screen.findByLabelText(/عنوان المهمة/), { target: { value: 'تعديل متأخر' } })
    svc.getTask.mockClear()
    fireEvent.click(screen.getByRole('button', { name: /حفظ التعديلات/ }))
    expect(await screen.findByText(/تم إتمام المهمة بالفعل ولا يمكن تعديلها/)).toBeInTheDocument()
    expect(screen.getByLabelText(/عنوان المهمة/)).toHaveValue('تعديل متأخر') // input kept
    await waitFor(() => expect(svc.getTask).toHaveBeenCalledWith(15))
  })

  it('other server errors are shown as sent by the Backend', async () => {
    svc.updateTask.mockRejectedValue(new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [{ field: 'assigned_to', message: 'الموظف المحدد غير موجود أو غير مفعّل' }]))
    await open(taskOf(16))
    fireEvent.click(editButton()!)
    fireEvent.change(await screen.findByLabelText(/عنوان المهمة/), { target: { value: 'عنوان آخر' } })
    fireEvent.click(screen.getByRole('button', { name: /حفظ التعديلات/ }))
    expect((await screen.findAllByText(/الموظف المحدد غير موجود أو غير مفعّل/)).length).toBeGreaterThan(0)
  })

  it('Escape with unsaved edits asks first and keeps the window; cancel returns to the task', async () => {
    const onClose = vi.fn()
    await open(taskOf(17), { onClose })
    fireEvent.click(editButton()!)
    const title = await screen.findByLabelText(/عنوان المهمة/)
    fireEvent.change(title, { target: { value: 'تعديل غير محفوظ' } })
    fireEvent.keyDown(title, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'تجاهل وإغلاق' }))
    expect(await screen.findByLabelText('اكتب ردك')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'المهمة 17' })).toBeInTheDocument()
    expect(svc.updateTask).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('an unregistered-invoice record opens its own edit form (AWB, date, assignee) in the same window', async () => {
    unreg.get.mockResolvedValue({
      id: 18, awb: '1114256205', awb_date: '2026-10-20', created_at: '2026-10-20T08:00:00Z', state: 'pending', action_taken: false,
      note: 'ملاحظة', assigned_to: 2, assigned_to_name: 'موظف', assigned_by: 1, assigned_by_name: 'مدير',
      linked_invoice_id: null, linked_invoice_number: null, linked_invoice_missing: false, completed_by: null, completed_by_name: null, completed_at: null,
    })
    await open({ ...taskOf(18), description: 'ملاحظة', task_type: 'unregistered_invoice', awb: '1114256205' })
    fireEvent.click(editButton()!)
    expect(await screen.findByLabelText(/رقم البوليصة AWB/)).toHaveValue('1114256205')
    expect(screen.getByLabelText(/تاريخ الإنشاء/)).toHaveValue('2026-10-20')
    expect(unreg.get).toHaveBeenCalledWith(18)
    expect(svc.updateTask).not.toHaveBeenCalled()
  })
})
