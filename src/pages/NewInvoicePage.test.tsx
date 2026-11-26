import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const clients = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock('../services/clientService', () => ({ clientService: clients }))
const invoices = vi.hoisted(() => ({ createInvoice: vi.fn() }))
vi.mock('../services/invoiceService', () => ({ invoiceService: invoices }))
const apiGet = vi.hoisted(() => vi.fn())
vi.mock('../utils/apiClient', async (orig) => ({ ...(await orig<typeof import('../utils/apiClient')>()), api: { get: apiGet, post: vi.fn() } }))
const auth = vi.hoisted(() => ({ role: 'admin' }))
vi.mock('../hooks/useAuthStore', () => ({
  useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel({ user: { id: 1, role: auth.role }, token: 't' }), { getState: () => ({ token: 't', user: { id: 1, role: auth.role } }) }),
}))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('react-hot-toast', () => ({ toast: Object.assign(vi.fn(), toasts) }))

import { NewInvoicePage } from './NewInvoicePage'
import { ApiError } from '../utils/apiClient'

const SAVED = { id: 412, name: 'شركة النخبة', phone: '0551112222', email: 'elite@example.com', company: null, city: 'الرياض', address: null, tax_number: null }

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  auth.role = 'admin'
  apiGet.mockResolvedValue({ invoice_number: 'DH9000' })
  invoices.createInvoice.mockResolvedValue({ id: '1' })
})

const renderPage = () => render(
  <MemoryRouter initialEntries={['/new-invoice']}>
    <Routes>
      <Route path="/new-invoice" element={<NewInvoicePage />} />
      <Route path="/invoices" element={<div data-testid="invoices-list" />} />
    </Routes>
  </MemoryRouter>,
)

/** «إدخال يدوي مباشر» → the invoice form; a few fields typed by hand before the customer is added. */
async function manualEntryWithData() {
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: /إدخال يدوي مباشر/ }))
  const price = screen.getAllByPlaceholderText('0.00')[0] as HTMLInputElement
  fireEvent.change(price, { target: { value: '250' } })
  fireEvent.change(screen.getByPlaceholderText('XXXXXXXXXX'), { target: { value: '1675565474' } })
  fireEvent.change(screen.getByPlaceholderText('الاسم الكامل'), { target: { value: 'Receiver Omar' } })
  fireEvent.change(screen.getByPlaceholderText('المدينة، الحي، الشارع'), { target: { value: 'Dubai Marina' } })
  return price
}
const snapshot = () => ({
  price: (screen.getAllByPlaceholderText('0.00')[0] as HTMLInputElement).value,
  awb: (screen.getByPlaceholderText('XXXXXXXXXX') as HTMLInputElement).value,
  receiver: (screen.getByPlaceholderText('الاسم الكامل') as HTMLInputElement).value,
  address: (screen.getByPlaceholderText('المدينة، الحي، الشارع') as HTMLInputElement).value,
})

describe('الإدخال اليدوي — «+ إضافة عميل جديد»', () => {
  it('sits in the customer section; the modal adds the customer, selects it and keeps every invoice field', async () => {
    await manualEntryWithData()
    const before = snapshot()
    const btn = screen.getByTestId('invoice-add-customer')
    expect(btn.textContent).toContain('إضافة عميل جديد')
    clients.createClient.mockResolvedValue(SAVED)
    fireEvent.click(btn)
    const dialog = screen.getByRole('dialog', { name: 'إضافة عميل جديد' })
    expect(dialog.getAttribute('dir')).toBe('rtl')
    fireEvent.change(within(dialog).getByLabelText('الاسم الكامل *'), { target: { value: 'شركة النخبة' } })
    fireEvent.change(within(dialog).getByLabelText('رقم الجوال'), { target: { value: '0551112222' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /حفظ وإضافة/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(clients.createClient).toHaveBeenCalledTimes(1)
    // selected: name / phone / e-mail from the saved record, linked by id
    expect((screen.getByPlaceholderText('ابحث عن العميل بالاسم...') as HTMLInputElement).value).toBe('شركة النخبة')
    expect((screen.getByPlaceholderText('أو ابحث برقم الجوال...') as HTMLInputElement).value).toBe('0551112222')
    expect((screen.getAllByPlaceholderText('customer@example.com')[0] as HTMLInputElement).value).toBe('elite@example.com')
    expect(screen.getByTestId('invoice-linked-customer').textContent).toContain('#412')
    expect(toasts.success).toHaveBeenCalled()
    expect(snapshot()).toEqual(before)
    // the invoice is issued to that customer id
    fireEvent.click(screen.getByRole('button', { name: /إصدار الفاتورة النهائية/ }))
    await waitFor(() => expect(invoices.createInvoice).toHaveBeenCalledTimes(1))
    expect(invoices.createInvoice.mock.calls[0][0]).toMatchObject({ client: 'شركة النخبة', client_id: 412, phone: '0551112222', price: 250, awb: '1675565474', receiverName: 'Receiver Omar' })
  })

  it('a failed save keeps the invoice untouched; cancel closes without selecting anyone', async () => {
    await manualEntryWithData()
    const before = snapshot()
    clients.createClient.mockRejectedValue(new ApiError('boom', 500))
    fireEvent.click(screen.getByTestId('invoice-add-customer'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('الاسم الكامل *'), { target: { value: 'شركة النخبة' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /حفظ وإضافة/ }))
    expect((await within(dialog).findByRole('alert')).textContent).toContain('حدث خطأ في الخادم')
    fireEvent.click(within(dialog).getByRole('button', { name: 'إلغاء' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(snapshot()).toEqual(before)
    expect((screen.getByPlaceholderText('ابحث عن العميل بالاسم...') as HTMLInputElement).value).toBe('')
    expect(screen.queryByTestId('invoice-linked-customer')).toBeNull()
    expect(invoices.createInvoice).not.toHaveBeenCalled()
  })

  it('typing another name drops the id link (back to the usual name + phone matching)', async () => {
    await manualEntryWithData()
    clients.createClient.mockResolvedValue(SAVED)
    fireEvent.click(screen.getByTestId('invoice-add-customer'))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('الاسم الكامل *'), { target: { value: 'شركة النخبة' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /حفظ وإضافة/ }))
    await screen.findByTestId('invoice-linked-customer')
    fireEvent.change(screen.getByPlaceholderText('ابحث عن العميل بالاسم...'), { target: { value: 'عميل آخر' } })
    expect(screen.queryByTestId('invoice-linked-customer')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /إصدار الفاتورة النهائية/ }))
    await waitFor(() => expect(invoices.createInvoice).toHaveBeenCalledTimes(1))
    expect(invoices.createInvoice.mock.calls[0][0].client_id).toBeUndefined()
  })

  it('roles the Backend does not let create customers do not see the button', async () => {
    auth.role = 'employee'
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /إدخال يدوي مباشر/ }))
    expect(screen.getByPlaceholderText('ابحث عن العميل بالاسم...')).toBeTruthy()
    expect(screen.queryByTestId('invoice-add-customer')).toBeNull()
  })
})
