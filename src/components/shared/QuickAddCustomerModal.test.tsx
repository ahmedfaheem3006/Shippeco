import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

const clients = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('../../services/clientService', () => ({ clientService: clients }))

import { QuickAddCustomerModal } from './QuickAddCustomerModal'
import { ApiError } from '../../utils/apiClient'

const SAVED = { id: 412, name: 'شركة النخبة', phone: '0551112222', email: 'elite@example.com', company: 'النخبة', city: 'الرياض', address: null, tax_number: null, source: 'manual' }

afterEach(() => { cleanup(); vi.useRealTimers() })
beforeEach(() => { vi.clearAllMocks() })

const open = (over: Partial<Parameters<typeof QuickAddCustomerModal>[0]> = {}) => {
  const onClose = vi.fn()
  const onCreated = vi.fn()
  render(<QuickAddCustomerModal open onClose={onClose} onCreated={onCreated} {...over} />)
  return { onClose, onCreated, dialog: screen.getByRole('dialog') }
}
const type = (dialog: HTMLElement, placeholder: string, value: string) =>
  fireEvent.change(within(dialog).getByPlaceholderText(placeholder), { target: { value } })
const save = (dialog: HTMLElement, name = /حفظ وإضافة/) => fireEvent.click(within(dialog).getByRole('button', { name }))

describe('QuickAddCustomerModal — the shared «إضافة عميل جديد» form', () => {
  it('renders nothing while closed', () => {
    render(<QuickAddCustomerModal open={false} onClose={vi.fn()} onCreated={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Arabic (RTL): the existing fields, labels and placeholders', () => {
    const { dialog } = open()
    expect(dialog.getAttribute('dir')).toBe('rtl')
    expect(within(dialog).getByRole('heading', { name: 'إضافة عميل جديد' })).toBeTruthy()
    for (const label of ['الاسم الكامل *', 'رقم الجوال', 'البريد الإلكتروني', 'اسم الشركة', 'المدينة', 'العنوان بالتفصيل', 'الرقم الضريبي (إن وجد)']) {
      expect(within(dialog).getByLabelText(label)).toBeTruthy()
    }
    expect(within(dialog).getByPlaceholderText('مثال: أحمد محمد علي')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'إلغاء' })).toBeTruthy()
  })

  it('English (LTR): the same form in English', () => {
    const { dialog } = open({ lang: 'en' })
    expect(dialog.getAttribute('dir')).toBe('ltr')
    expect(within(dialog).getByRole('heading', { name: 'Add New Customer' })).toBeTruthy()
    for (const label of ['Full Name *', 'Mobile Number', 'Email Address', 'Company Name', 'City', 'Detailed Address', 'Tax Number (if any)']) {
      expect(within(dialog).getByLabelText(label)).toBeTruthy()
    }
    expect(within(dialog).getByRole('button', { name: /Save & Add/ })).toBeTruthy()
  })

  it('full name is required — nothing is sent', () => {
    const { dialog, onCreated } = open()
    type(dialog, 'مثال: أحمد محمد علي', '   ')
    save(dialog)
    expect(within(dialog).getByRole('alert').textContent).toContain('الاسم الكامل مطلوب')
    expect(within(dialog).getByLabelText('الاسم الكامل *').getAttribute('aria-invalid')).toBe('true')
    expect(clients.createClient).not.toHaveBeenCalled()
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('an invalid e-mail is refused (same rule as the Backend); an empty one is fine', async () => {
    const { dialog } = open({ lang: 'en' })
    type(dialog, 'e.g. Ahmed Mohammed Ali', 'Elite Co')
    type(dialog, 'customer@example.com', 'not-an-email')
    save(dialog, /Save & Add/)
    expect(within(dialog).getByRole('alert').textContent).toContain('Enter a valid email address')
    expect(clients.createClient).not.toHaveBeenCalled()
    type(dialog, 'customer@example.com', '')
    clients.createClient.mockResolvedValue({ ...SAVED, email: null })
    save(dialog, /Save & Add/)
    await waitFor(() => expect(clients.createClient).toHaveBeenCalledTimes(1))
    expect(clients.createClient.mock.calls[0][0]).toEqual({ name: 'Elite Co', phone: undefined, email: undefined, company: undefined, city: undefined, address: undefined, tax_number: undefined })
  })

  it('saves through the existing endpoint, hands back the real id, then closes', async () => {
    clients.createClient.mockResolvedValue(SAVED)
    const { dialog, onCreated, onClose } = open()
    type(dialog, 'مثال: أحمد محمد علي', '  شركة النخبة ')
    type(dialog, '05xxxxxxxx', '0551112222')
    type(dialog, 'customer@example.com', 'elite@example.com')
    type(dialog, 'مؤسسة الشحن للمقاولات', 'النخبة')
    type(dialog, 'الرياض / جدة...', 'الرياض')
    save(dialog)
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    expect(clients.createClient).toHaveBeenCalledWith({ name: 'شركة النخبة', phone: '0551112222', email: 'elite@example.com', company: 'النخبة', city: 'الرياض', address: undefined, tax_number: undefined })
    expect(onCreated.mock.calls[0][0]).toMatchObject({ id: 412, name: 'شركة النخبة', phone: '0551112222', email: 'elite@example.com' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('one request per click: Save is disabled while saving and a second submit is ignored', async () => {
    let resolve!: (v: unknown) => void
    clients.createClient.mockImplementation(() => new Promise((r) => { resolve = r }))
    const { dialog, onCreated } = open()
    type(dialog, 'مثال: أحمد محمد علي', 'شركة النخبة')
    save(dialog)
    const btn = within(dialog).getByRole('button', { name: /حفظ وإضافة/ }) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(true))
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect((within(dialog).getByRole('button', { name: 'إلغاء' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.submit(btn.closest('form') as HTMLFormElement)
    fireEvent.submit(btn.closest('form') as HTMLFormElement)
    expect(clients.createClient).toHaveBeenCalledTimes(1)
    await act(async () => { resolve(SAVED) })
    expect(onCreated).toHaveBeenCalledTimes(1)
  })

  it('a failure keeps the dialog and the typed values; nothing is handed back', async () => {
    clients.createClient.mockRejectedValue(new ApiError('Access denied', 403))
    const { dialog, onCreated, onClose } = open()
    type(dialog, 'مثال: أحمد محمد علي', 'شركة النخبة')
    type(dialog, '05xxxxxxxx', '0551112222')
    save(dialog)
    expect((await within(dialog).findByRole('alert')).textContent).toContain('ليست لديك صلاحية لإضافة العملاء')
    expect((within(dialog).getByLabelText('الاسم الكامل *') as HTMLInputElement).value).toBe('شركة النخبة')
    expect((within(dialog).getByLabelText('رقم الجوال') as HTMLInputElement).value).toBe('0551112222')
    expect((within(dialog).getByRole('button', { name: /حفظ وإضافة/ }) as HTMLButtonElement).disabled).toBe(false)
    expect(onCreated).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // server down → a plain message, retry allowed
    clients.createClient.mockRejectedValue(new ApiError('boom', 500))
    save(dialog)
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('حدث خطأ في الخادم'))
  })

  it('a Backend validation error on the e-mail is shown as the e-mail message (EN)', async () => {
    clients.createClient.mockRejectedValue(new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [{ field: 'email', message: 'Invalid email' }]))
    const { dialog } = open({ lang: 'en' })
    type(dialog, 'e.g. Ahmed Mohammed Ali', 'Elite')
    type(dialog, 'customer@example.com', 'a@b.co')
    save(dialog, /Save & Add/)
    expect((await within(dialog).findByRole('alert')).textContent).toContain('Enter a valid email address')
  })

  it('a 2xx without an id is never treated as a customer (no blind retry)', async () => {
    clients.createClient.mockResolvedValue({ name: 'x' })
    const { dialog, onCreated } = open()
    type(dialog, 'مثال: أحمد محمد علي', 'x')
    save(dialog)
    expect((await within(dialog).findByRole('alert')).textContent).toContain('ابحث عنه بالاسم')
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('cancel / ✕ / Escape close without saving', () => {
    const a = open()
    fireEvent.click(within(a.dialog).getByRole('button', { name: 'إلغاء' }))
    expect(a.onClose).toHaveBeenCalledTimes(1)
    cleanup()
    const b = open()
    fireEvent.click(within(b.dialog).getByRole('button', { name: 'إغلاق' }))
    expect(b.onClose).toHaveBeenCalledTimes(1)
    cleanup()
    const c = open()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(c.onClose).toHaveBeenCalledTimes(1)
    expect(clients.createClient).not.toHaveBeenCalled()
  })

  it('successScreen (Customers / Invoices pages): the confirmation shows, then the dialog closes', async () => {
    vi.useFakeTimers()
    clients.createClient.mockResolvedValue(SAVED)
    const { dialog, onCreated, onClose } = open({ successScreen: true })
    type(dialog, 'مثال: أحمد محمد علي', 'شركة النخبة')
    await act(async () => { save(dialog) })
    expect(onCreated).toHaveBeenCalledTimes(1)
    expect(screen.getByText('تم تسجيل العميل بنجاح!')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(2000) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
