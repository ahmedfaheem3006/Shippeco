import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const svc = vi.hoisted(() => ({ listShipments: vi.fn(), facets: vi.fn(), downloadBundle: vi.fn(), copy: vi.fn(), replacement: vi.fn(), cancelShipment: vi.fn() }))
vi.mock('../services/dhlShipment.service', () => ({ dhlShipmentService: svc }))
const auth = vi.hoisted(() => ({ role: 'manager' }))
vi.mock('../hooks/useAuthStore', () => ({
  useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel({ user: { id: 1, role: auth.role }, token: 't' }), { getState: () => ({ token: 't', user: { id: 1, role: auth.role } }) }),
}))
vi.mock('react-hot-toast', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
const files = vi.hoisted(() => ({ downloadBlob: vi.fn(), printBlob: vi.fn() }))
vi.mock('../utils/download', () => files)

import { AllShipmentsPage } from './AllShipmentsPage'

const row = (over: Record<string, unknown> = {}) => ({
  id: 12, dhl_env: 'production', awb: '1675565474', shippec_reference: 'SHIPPEC-5513F39F33A4', status: 'booked', creation_status: 'created', list_status: 'ready_to_ship',
  tracking_status: null, tracking_description: null, estimated_delivery: '2026-11-30T23:59:00', delivered_at: null, shipment_date: '2026-11-26',
  product_code: 'P', product_name: 'EXPRESS WORLDWIDE', content_description: 'Part of car', customs_required: true,
  shipper_company: 'Test Shipper Co', shipper_contact: 'Shipping Desk', shipper_city: 'BARANGAROO', shipper_country_code: 'AU',
  receiver_company: 'SHIPPEC EXPRESS', receiver_contact: 'Operations Management', receiver_city: 'DAMMAM', receiver_country_code: 'SA',
  package_count: 1, total_gross_weight: '32.000', client_id: 3, client_name: 'عميل الاختبار', created_by_name: 'Sara', pickup_option: 'schedule',
  dispatch_confirmation_number: 'CBJ261126621140', pickup_status: 'booked', invoice_id: 91, invoice_number: 'DH2701', supersedes_shipment_id: null,
  replaced_by_shipment_id: null, replaced_by_awb: null, supersedes_awb: null, document_count: 3, dhl_created_at: '2026-11-25T21:10:00Z',
  created_at: '2026-11-25T21:00:00Z', updated_at: '2026-11-25T21:10:00Z', cancelled_at: null, cancellation_reason: null, ...over,
})
const list = (rows: unknown[], total = rows.length) => ({ data: rows, pagination: { page: 1, limit: 20, total } })

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div> }
const renderAt = (url = '/create-shipment/shipments') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/create-shipment/shipments" element={<AllShipmentsPage />} />
      <Route path="*" element={<div>elsewhere</div>} />
    </Routes>
    <Where />
  </MemoryRouter>,
)
const last = () => svc.listShipments.mock.calls[svc.listShipments.mock.calls.length - 1][0]

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  try { window.localStorage.clear() } catch { /* jsdom */ }
  auth.role = 'manager'
  svc.listShipments.mockResolvedValue(list([row(), row({ id: 13, awb: '3822077232', status: 'superseded', list_status: 'cancelled', replaced_by_shipment_id: 14, replaced_by_awb: '3822077999', pickup_status: null, dispatch_confirmation_number: null })]))
  svc.facets.mockResolvedValue({ products: [{ code: 'P', name: 'EXPRESS WORLDWIDE', n: 2 }], customers: [{ id: 3, name: 'عميل الاختبار', n: 2 }] })
  svc.downloadBundle.mockResolvedValue({ blob: new Blob(['%PDF']), filename: 'DHL-1675565474-documents.pdf', pages: 4 })
})

describe('/create-shipment/shipments — All Shipments (SHIPPEC\'s created DHL shipments)', () => {
  it('rows with AWB, status, dates, product, description, From / To, pieces, customer, creator; superseded shows its replacement; AR + EN', async () => {
    renderAt()
    const rows = await screen.findAllByTestId('shipment-row')
    expect(svc.listShipments).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20, q: '', status: '' }))
    expect(rows.map((r) => r.getAttribute('data-awb'))).toEqual(['1675565474', '3822077232'])
    const r0 = rows[0]
    expect(within(r0).getByRole('link', { name: '1675565474' }).getAttribute('href')).toBe('/create-shipment/success/12')
    expect(within(r0).getByTestId('shipment-status').textContent).toBe('جاهزة للشحن')
    for (const txt of ['EXPRESS WORLDWIDE', 'Part of car', 'Test Shipper Co', 'SHIPPEC EXPRESS', 'عميل الاختبار', 'Sara', 'CBJ261126621140', 'DH2701']) expect(r0.textContent).toContain(txt)
    expect(r0.textContent).toContain('32 كغ')
    expect(within(rows[1]).getByTestId('shipment-status').textContent).toBe('مستبدلة ببوليصة مصححة')
    expect(within(rows[1]).getByRole('link', { name: '3822077999' }).getAttribute('href')).toBe('/create-shipment/success/14')
    // no «delete» anywhere — only cancellation with its real meaning
    expect(screen.queryByText(/حذف|Delete/)).toBeNull()
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'EN' }))
    expect(screen.getByRole('heading', { name: /All Shipments/ })).toBeTruthy()
    expect(within(screen.getAllByTestId('shipment-row')[0]).getByTestId('shipment-status').textContent).toBe('Ready to ship')
    expect(screen.getAllByTestId('shipment-row')[0].textContent).toContain('Ship From')
  })

  it('search (AWB with spaces / hyphens is sent as typed — the Backend normalizes it) and MyDHL-style filters live in the URL', async () => {
    renderAt()
    await screen.findAllByTestId('shipment-row')
    fireEvent.change(screen.getByTestId('shipments-search'), { target: { value: '167 556-5474' } })
    await waitFor(() => expect(last()).toMatchObject({ q: '167 556-5474', page: 1 }))
    expect(screen.getByTestId('where').textContent).toBe('/create-shipment/shipments?q=167+556-5474')
    fireEvent.change(screen.getByLabelText('الحالة'), { target: { value: 'cancelled' } })
    await waitFor(() => expect(last()).toMatchObject({ status: 'cancelled' }))
    fireEvent.change(screen.getByLabelText('نوع الشحنة'), { target: { value: 'packages' } })
    fireEvent.change(screen.getByLabelText('الاستلام'), { target: { value: 'scheduled' } })
    fireEvent.change(screen.getByLabelText('خدمة DHL'), { target: { value: 'P' } })
    fireEvent.change(screen.getByLabelText('العميل'), { target: { value: '3' } })
    await waitFor(() => expect(last()).toMatchObject({ content: 'packages', pickup: 'scheduled', product: 'P', client_id: 3 }))
    // only products / customers SHIPPEC really has
    expect([...(screen.getByLabelText('خدمة DHL') as HTMLSelectElement).options].map((o) => o.value)).toEqual(['', 'P'])
    fireEvent.change(screen.getByLabelText('تاريخ الشحن'), { target: { value: 'range' } })
    fireEvent.change(screen.getByLabelText('من'), { target: { value: '2026-11-01' } })
    fireEvent.change(screen.getByLabelText('إلى'), { target: { value: '2026-11-30' } })
    await waitFor(() => expect(last()).toMatchObject({ date: 'range', from: '2026-11-01', to: '2026-11-30' }))
    fireEvent.click(screen.getByRole('button', { name: /مسح البحث والتصفية/ }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/create-shipment/shipments'))
    // a link from elsewhere opens with its filter (e.g. «View all scheduled pickups»)
    cleanup()
    renderAt('/create-shipment/shipments?pickup=scheduled')
    await screen.findAllByTestId('shipment-row')
    expect(last()).toMatchObject({ pickup: 'scheduled' })
  })

  it('actions: View / Track / Documents (ONE PDF) / Copy → new draft; manager: corrected replacement and Cancel (confirmed, reason) → list reloaded', async () => {
    renderAt()
    const r0 = (await screen.findAllByTestId('shipment-row'))[0]
    expect(within(r0).getByRole('link', { name: /تتبع/ }).getAttribute('href')).toBe('/shipment-tracking/1675565474')
    fireEvent.click(within(r0).getByRole('button', { name: /المستندات/ }))
    await waitFor(() => expect(files.downloadBlob).toHaveBeenCalledWith('DHL-1675565474-documents.pdf', expect.any(Blob)))
    expect(svc.downloadBundle).toHaveBeenCalledWith(12)

    fireEvent.click(within(r0).getByRole('button', { name: /إلغاء الشحنة/ }))
    const dialog = await screen.findByTestId('cancel-shipment-dialog')
    expect(dialog.textContent).toContain('يُلغى استلام المندوب المحجوز لدى DHL')
    fireEvent.change(within(dialog).getByLabelText(/سبب الإلغاء/), { target: { value: 'Customer cancelled' } })
    svc.cancelShipment.mockResolvedValue({ pickup_cancelled: true, invoice_reversal: 'reversed', shipment: {} })
    const calls = svc.listShipments.mock.calls.length
    fireEvent.click(within(dialog).getByTestId('cancel-shipment-confirm'))
    await waitFor(() => expect(svc.cancelShipment).toHaveBeenCalledWith(12, 'Customer cancelled'))
    await waitFor(() => expect(svc.listShipments.mock.calls.length).toBeGreaterThan(calls))

    fireEvent.click(within(screen.getAllByTestId('shipment-row')[0]).getByRole('button', { name: /تعديل ببوليصة بديلة/ }))
    svc.replacement.mockResolvedValue({ id: 31, replayed: false })
    fireEvent.click(within(await screen.findByTestId('replacement-dialog')).getByTestId('replacement-confirm'))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/create-shipment?draft=31'))
  })

  it('Copy opens the NEW draft; a superseded / in-transit row offers no cancel or replacement; employee: Copy only; viewer: neither', async () => {
    svc.listShipments.mockResolvedValue(list([row({ list_status: 'in_transit', tracking_status: 'IN_TRANSIT' })]))
    renderAt()
    const r0 = (await screen.findAllByTestId('shipment-row'))[0]
    expect(within(r0).queryByRole('button', { name: /إلغاء الشحنة/ })).toBeNull()
    expect(within(r0).queryByRole('button', { name: /تعديل ببوليصة بديلة/ })).toBeNull()
    svc.copy.mockResolvedValue({ id: 88, replayed: false })
    fireEvent.click(within(r0).getByRole('button', { name: /نسخ/ }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/create-shipment?draft=88'))
    cleanup()
    auth.role = 'employee'
    svc.listShipments.mockResolvedValue(list([row()]))
    renderAt()
    const e0 = (await screen.findAllByTestId('shipment-row'))[0]
    expect(within(e0).getByRole('button', { name: /نسخ/ })).toBeTruthy()
    expect(within(e0).queryByRole('button', { name: /إلغاء الشحنة/ })).toBeNull()
    expect(within(e0).queryByRole('button', { name: /تعديل ببوليصة بديلة/ })).toBeNull()
    cleanup()
    auth.role = 'viewer'
    renderAt()
    const v0 = (await screen.findAllByTestId('shipment-row'))[0]
    expect(within(v0).queryByRole('button', { name: /نسخ/ })).toBeNull()
    expect(within(v0).queryByRole('button', { name: /المستندات/ })).toBeNull()
  })

  it('empty result and server error are told apart', async () => {
    svc.listShipments.mockResolvedValue(list([]))
    renderAt('/create-shipment/shipments?q=0000000000')
    expect((await screen.findByTestId('shipments-empty')).textContent).toBe('لا توجد شحنات تطابق البحث.')
    cleanup()
    svc.listShipments.mockRejectedValue(new Error('boom'))
    renderAt()
    expect(await screen.findByText(/تعذر تحميل الشحنات|boom/)).toBeTruthy()
  })
})
