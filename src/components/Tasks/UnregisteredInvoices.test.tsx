import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { UnregisteredInvoice, UnregisteredListResponse } from '../../services/unregisteredInvoices.service'
import { ApiError } from '../../utils/apiClient'

const svc = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  complete: vi.fn(),
  relink: vi.fn(),
  cancel: vi.fn(),
  searchInvoices: vi.fn(),
}))
vi.mock('../../services/unregisteredInvoices.service', () => ({ unregisteredInvoicesService: svc }))
const auth = vi.hoisted(() => ({ user: { id: 7, role: 'employee' } as { id: number; role: string } }))
vi.mock('../../hooks/useAuthStore', () => ({
  useAuthStore: (sel: (s: unknown) => unknown) => sel({ user: auth.user }),
}))
// Socket events: the test fires the handler itself.
const realtime = vi.hoisted(() => ({ handlers: [] as Array<{ events: readonly string[]; fn: () => void }> }))
vi.mock('../../hooks/useRealtimeRefresh', () => ({
  useRealtimeRefresh: (events: readonly string[], fn: () => void) => { realtime.handlers.push({ events, fn }) },
}))
vi.mock('../../services/unifiedService', () => ({
  unifiedService: { get: vi.fn().mockResolvedValue([{ id: 7, full_name: 'موظف أول', role: 'employee' }]) },
}))

import { UnregisteredInvoicesPanel } from './UnregisteredInvoicesPanel'
import { checkInvoiceAwb, formatAwbDate, normalizeAwb } from './unregisteredInvoiceUtils'

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  realtime.handlers = []
  auth.user = { id: 7, role: 'employee' }
})

const pending = (over: Partial<UnregisteredInvoice> = {}): UnregisteredInvoice => ({
  id: 11, awb: '1234567890', awb_date: '2026-10-22', created_at: '2026-10-21T22:30:00Z', state: 'pending', action_taken: false,
  note: null, assigned_to: 7, assigned_to_name: 'موظف أول', assigned_by: 1, assigned_by_name: 'المدير',
  linked_invoice_id: null, linked_invoice_number: null, linked_invoice_missing: false,
  completed_by: null, completed_by_name: null, completed_at: null, ...over,
})
const done = (over: Partial<UnregisteredInvoice> = {}): UnregisteredInvoice => pending({
  id: 12, awb: '5555555555', state: 'done', action_taken: true, linked_invoice_id: 55, linked_invoice_number: 'DH2580',
  completed_by: 7, completed_by_name: 'موظف أول', completed_at: '2026-10-22T09:00:00Z', ...over,
})
const response = (items: UnregisteredInvoice[], over: Partial<UnregisteredListResponse> = {}): UnregisteredListResponse => ({
  items,
  counts: {
    pending: items.filter((i) => i.state === 'pending').length,
    done: items.filter((i) => i.state === 'done').length,
    cancelled: 0,
    all: items.length,
  },
  pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
  ...over,
})
const deferred = <T,>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="location">{loc.pathname}{loc.search}</div>
}

const renderPanel = (props: Partial<React.ComponentProps<typeof UnregisteredInvoicesPanel>> = {}) =>
  render(
    <MemoryRouter initialEntries={['/tasks?tab=unregistered']}>
      <Routes>
        <Route path="/tasks" element={<UnregisteredInvoicesPanel search="" recordId={null} onClearRecord={vi.fn()} onOpenTask={vi.fn()} onChanged={vi.fn()} {...props} />} />
        <Route path="/invoices" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  )
const card = (awb: string) => screen.getAllByText(awb).map((el) => el.closest('article')).find(Boolean) as HTMLElement

describe('UnregisteredInvoicesPanel — records', () => {
  it('shows AWB, creation date (no timezone shift), action status and the linked invoice', async () => {
    svc.list.mockResolvedValue(response([pending(), done()]))
    renderPanel()
    const p = await screen.findByText('1234567890').then(() => card('1234567890'))
    expect(within(p).getByText('لم يتم اتخاذ إجراء')).toBeInTheDocument()
    expect(within(p).getByText('22/10/2026')).toBeInTheDocument()
    expect(within(p).getByRole('button', { name: /تم تسجيل الفاتورة/ })).toBeInTheDocument()

    const d = card('5555555555')
    expect(within(d).getByText('✓ تم')).toBeInTheDocument()
    expect(within(d).queryByRole('button', { name: /تم تسجيل الفاتورة/ })).not.toBeInTheDocument()
    const link = within(d).getByRole('link', { name: /فتح الفاتورة DH2580/ })
    expect(link).toHaveAttribute('href', '/invoices?invoice=55')
    expect(link).toHaveTextContent('DH2580')
    // employees never see relink/cancel
    expect(screen.queryByRole('button', { name: /تعديل الربط/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^إلغاء$/ })).not.toBeInTheDocument()
  })

  it('clicking the invoice number opens that invoice (deep link, not just the list)', async () => {
    svc.list.mockResolvedValue(response([done()]))
    renderPanel()
    fireEvent.click(await screen.findByRole('link', { name: /فتح الفاتورة DH2580/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/invoices?invoice=55')
  })

  it('another employee cannot complete a record that is not theirs; admin can, and can relink/cancel', async () => {
    auth.user = { id: 8, role: 'employee' }
    svc.list.mockResolvedValue(response([pending(), done()]))
    renderPanel()
    await screen.findByText('1234567890')
    expect(screen.queryByRole('button', { name: /تم تسجيل الفاتورة/ })).not.toBeInTheDocument()
    cleanup()

    auth.user = { id: 1, role: 'admin' }
    renderPanel()
    await screen.findByText('1234567890')
    expect(screen.getByRole('button', { name: /تم تسجيل الفاتورة/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /تعديل الربط/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^إلغاء$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /إضافة فاتورة غير مسجلة/ })).toBeInTheDocument()
  })

  it('empty, error + retry', async () => {
    svc.list.mockResolvedValueOnce(response([]))
    renderPanel()
    expect(await screen.findByText('لا توجد فواتير غير مسجلة حاليًا')).toBeInTheDocument()
    cleanup()

    svc.list.mockRejectedValueOnce(new ApiError('boom', 500))
    renderPanel()
    expect(await screen.findByText('تعذر تحميل الفواتير غير المسجلة')).toBeInTheDocument()
    svc.list.mockResolvedValueOnce(response([pending()]))
    fireEvent.click(screen.getByRole('button', { name: /إعادة المحاولة/ }))
    expect(await screen.findByText('1234567890')).toBeInTheDocument()
  })
})

describe('UnregisteredInvoicesPanel — server query, filters, pages, realtime', () => {
  it('searches on the server, filters by state / "assigned to me" and pages', async () => {
    svc.list.mockResolvedValue(response([pending()], { pagination: { page: 1, limit: 20, total: 25, totalPages: 2 } }))
    renderPanel({ search: 'DH2580' })
    await screen.findByText('1234567890')
    expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'DH2580', state: 'all', page: 1, mine: false }))

    fireEvent.click(screen.getByRole('radio', { name: /^لم يتم/ }))
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'pending', page: 1 })))
    fireEvent.click(screen.getByLabelText('مسندة لي'))
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ mine: true })))
    fireEvent.click(await screen.findByRole('button', { name: 'الصفحة التالية' }))
    await waitFor(() => expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
  })

  it('a notification deep link shows only that record', async () => {
    svc.list.mockResolvedValue(response([pending()]))
    const onClearRecord = vi.fn()
    renderPanel({ recordId: 11, onClearRecord })
    await screen.findByText('1234567890')
    expect(svc.list).toHaveBeenLastCalledWith(expect.objectContaining({ id: 11 }))
    fireEvent.click(screen.getByRole('button', { name: 'عرض كل السجلات' }))
    expect(onClearRecord).toHaveBeenCalled()
  })

  it('re-reads the list when another user changes a record (tasks:updated), without a refresh', async () => {
    svc.list.mockResolvedValueOnce(response([pending()]))
    renderPanel()
    await screen.findByText('لم يتم اتخاذ إجراء')
    const h = realtime.handlers.filter((x) => x.events.includes('tasks:updated')).at(-1)!
    svc.list.mockResolvedValueOnce(response([pending({ state: 'done', action_taken: true, linked_invoice_id: 55, linked_invoice_number: 'DH2580' })]))
    act(() => h.fn())
    expect(await screen.findByText('✓ تم')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /فتح الفاتورة DH2580/ })).toHaveAttribute('href', '/invoices?invoice=55')
  })
})

describe('تم تسجيل الفاتورة — link dialog', () => {
  const invoices = [
    { id: 90, invoice_number: 'DH2590', awb: '9999999999', client_name: 'عميل آخر', invoice_date: '2026-10-22' },
    { id: 91, invoice_number: 'DH2591', awb: null, client_name: 'بدون بوليصة', invoice_date: '2026-10-22' },
    { id: 55, invoice_number: 'DH2580', awb: 'AWB 1234-567-890', client_name: 'أحمد محمد', invoice_date: '2026-10-22' },
  ]
  const openDialog = async () => {
    svc.list.mockResolvedValue(response([pending()]))
    svc.searchInvoices.mockResolvedValue(invoices)
    const onChanged = vi.fn()
    renderPanel({ onChanged })
    fireEvent.click(await screen.findByRole('button', { name: /تم تسجيل الفاتورة/ }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('DH2580')
    return { dialog, onChanged }
  }

  it('searches real invoices starting from the record AWB and flags matches', async () => {
    const { dialog } = await openDialog()
    expect(svc.searchInvoices).toHaveBeenCalledWith('1234567890', expect.anything())
    expect(within(dialog).getByRole('radio', { name: /DH2580/ })).toHaveTextContent('مطابقة')
    expect(within(dialog).getByRole('radio', { name: /DH2590/ })).toHaveTextContent('غير مطابقة')
    expect(within(dialog).getByRole('radio', { name: /DH2591/ })).toHaveTextContent('بدون بوليصة')
  })

  it('a mismatched or AWB-less invoice shows the warning and cannot be confirmed', async () => {
    const { dialog } = await openDialog()
    fireEvent.click(within(dialog).getByRole('radio', { name: /DH2590/ }))
    expect(within(dialog).getByText('رقم البوليصة في الفاتورة المختارة لا يطابق رقم البوليصة في السجل.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /تأكيد/ })).toBeDisabled()
    fireEvent.click(within(dialog).getByRole('radio', { name: /DH2591/ }))
    expect(within(dialog).getByText('الفاتورة المختارة لا تحتوي رقم بوليصة يمكن التحقق منه.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /تأكيد/ })).toBeDisabled()
    expect(svc.complete).not.toHaveBeenCalled()
  })

  it('confirm sends only the invoice id, once even on a double click, then the card shows ✓ تم + the number', async () => {
    const { dialog, onChanged } = await openDialog()
    const d = deferred<unknown>()
    svc.complete.mockReturnValue(d.promise)
    fireEvent.click(within(dialog).getByRole('radio', { name: /DH2580/ }))
    const confirm = within(dialog).getByRole('button', { name: /تأكيد — DH2580/ })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(svc.complete).toHaveBeenCalledTimes(1)
    expect(svc.complete).toHaveBeenCalledWith(11, 55)
    expect(within(dialog).getByRole('button', { name: /جاري الحفظ/ })).toBeDisabled()

    svc.list.mockResolvedValue(response([done({ id: 11, awb: '1234567890' })]))
    await act(async () => d.resolve({ idempotent: false, record: done({ id: 11, awb: '1234567890' }) }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const c = card('1234567890')
    expect(within(c).getByText('✓ تم')).toBeInTheDocument()
    expect(within(c).getByRole('link', { name: /فتح الفاتورة DH2580/ })).toHaveAttribute('href', '/invoices?invoice=55')
    expect(within(c).queryByRole('button', { name: /تم تسجيل الفاتورة/ })).not.toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()
  })

  it('a server rejection is shown and the record stays pending', async () => {
    const { dialog } = await openDialog()
    svc.complete.mockRejectedValue(new ApiError('رقم البوليصة في الفاتورة المختارة لا يطابق رقم البوليصة في السجل.', 422, 'AWB_MISMATCH'))
    fireEvent.click(within(dialog).getByRole('radio', { name: /DH2580/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: /تأكيد/ }))
    expect(await within(dialog).findByText('لم يتم الربط')).toBeInTheDocument()
    expect(within(dialog).getAllByText('رقم البوليصة في الفاتورة المختارة لا يطابق رقم البوليصة في السجل.').length).toBeGreaterThan(0)
    expect(within(card('1234567890')).getByText('لم يتم اتخاذ إجراء')).toBeInTheDocument()
  })
})

describe('add record (manual source)', () => {
  it('validates the AWB in Arabic and sends it normalized', async () => {
    auth.user = { id: 1, role: 'admin' }
    svc.list.mockResolvedValue(response([]))
    svc.create.mockResolvedValue(pending({ id: 30, awb: '1234567890' }))
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /إضافة فاتورة غير مسجلة/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/رقم البوليصة/), { target: { value: '12' } })
    fireEvent.submit(dialog.querySelector('form')!)
    expect(await within(dialog).findByText(/رقم البوليصة غير صالح/)).toBeInTheDocument()
    expect(svc.create).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByLabelText(/رقم البوليصة/), { target: { value: 'AWB 123-456-7890' } })
    fireEvent.submit(dialog.querySelector('form')!)
    await waitFor(() => expect(svc.create).toHaveBeenCalledWith(expect.objectContaining({ awb: '1234567890', assigned_to: 1 })))
  })
})

describe('utils', () => {
  it('formats the stored calendar date without shifting the day', () => {
    expect(formatAwbDate('2026-10-22')).toBe('22/10/2026')
    expect(formatAwbDate(null)).toBe('—')
  })
  it('mirrors the server AWB normalization / match', () => {
    expect(normalizeAwb(' awb 123-456-7890 ')).toBe('1234567890')
    expect(checkInvoiceAwb('1234567890', 'AWB 1234567890, 5555555555')).toBe('match')
    expect(checkInvoiceAwb('1234567890', '9999999999')).toBe('mismatch')
    expect(checkInvoiceAwb('1234567890', '')).toBe('missing')
  })
})
