import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const svc = vi.hoisted(() => ({ details: vi.fn(), downloadBundle: vi.fn(), downloadDocument: vi.fn(), copy: vi.fn(), replacement: vi.fn(), cancelShipment: vi.fn() }))
vi.mock('../services/dhlShipment.service', () => ({ dhlShipmentService: svc }))
const auth = vi.hoisted(() => ({ role: 'manager' }))
vi.mock('../hooks/useAuthStore', () => ({
  useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel({ user: { id: 1, role: auth.role }, token: 't' }), { getState: () => ({ token: 't', user: { id: 1, role: auth.role } }) }),
}))
vi.mock('react-hot-toast', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
const files = vi.hoisted(() => ({ downloadBlob: vi.fn(), printBlob: vi.fn() }))
vi.mock('../utils/download', () => files)

import { CreateShipmentConfirmationPage } from './CreateShipmentConfirmationPage'
import { ApiError } from '../utils/apiClient'

const management = (over: Record<string, unknown> = {}) => ({
  edit_policy: 'replacement_only', can_copy: true, can_replace: true, replace_blocked: null, replacement_draft_id: null, can_cancel: true, cancel_blocked: null,
  in_dhl_network: false, tracking_status: null, remote_operations: [], pickup: null, documents_bundle: { available: true, documents: 3, pages: 4 }, ...over,
})
const doc = (id: number, document_type: string, sequence: number, page_count = 1) => ({ id, document_type, content_type: 'application/pdf', size_bytes: 1000, sha256: 'x', origin: 'dhl_response', sequence, page_count })
/** The real AWB of the attached DHL package (addresses not reproduced). */
const details = (over: Record<string, unknown> = {}) => ({
  id: 12, dhl_env: 'production', status: 'booked', creation_status: 'created', shippec_reference: 'SHIPPEC-5513F39F33A4', awb: '1675565474',
  product_code: 'P', product_name: 'EXPRESS WORLDWIDE', shipment_date: '2026-11-26', origin_gmt_offset: '+03:00', dhl_created_at: '2026-11-25T21:10:00Z',
  pickup_option: 'schedule', service_point_name: null, invoice_link_status: 'linked', invoice_link_error: null,
  packages: [{ sequence: 1, weight_kg: '32.000', dhl_piece_id: 'JD014600012896647569' }, { sequence: 2, weight_kg: '1.000', dhl_piece_id: 'JD014600012896647570' }],
  documents: [doc(3, 'proforma_invoice', 3, 2), doc(1, 'shipping_label', 1), doc(2, 'waybill', 2)],
  pickup: { id: 4, status: 'booked', dispatch_confirmation_number: 'CBJ261126621140', pickup_date: '2026-11-26', earliest_time: '15:00', close_time: '18:00', location: 'Reception', location_type: 'business', instructions: null },
  tracking: { normalized_status: null, current_description: null, estimated_delivery: '2026-11-30T23:59:00', last_synced_at: null, pickup_at: null },
  invoice: { id: 91, invoice_number: 'DH2701', status: 'unpaid', payment_status: 0 },
  supersedes: null, replaced_by: null, copied_from: null, cancellation_reason: null, invoice_reversal_status: 'none',
  management: management(), ...over,
})

function Where() { const l = useLocation(); return <div data-testid="where">{l.pathname}{l.search}</div> }
const renderAt = (url = '/create-shipment/success/12') => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/create-shipment/success/:id" element={<CreateShipmentConfirmationPage />} />
      <Route path="*" element={<div>elsewhere</div>} />
    </Routes>
    <Where />
  </MemoryRouter>,
)
const en = () => fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'EN' }))

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  try { window.localStorage.clear() } catch { /* jsdom */ }
  auth.role = 'manager'
  svc.details.mockResolvedValue(details())
  svc.downloadBundle.mockResolvedValue({ blob: new Blob(['%PDF']), filename: 'DHL-1675565474-documents.pdf', pages: 4 })
})

describe('/create-shipment/success/:id — after DHL created the shipment', () => {
  it('documents step: progress, success header, the stored DHL data (AWB, every piece, pickup confirmation + window in the sender\'s time) and DHL\'s documents in order', async () => {
    renderAt()
    const page = await screen.findByTestId('shipment-confirmation')
    expect(page.getAttribute('data-phase')).toBe('documents')
    const steps = within(screen.getByTestId('confirmation-progress')).getAllByRole('listitem').filter((li) => li.hasAttribute('data-done'))
    expect(steps.map((li) => [li.textContent?.replace(/تم|الحالية/g, '').trim(), li.getAttribute('data-done')])).toEqual([['إنشاء الشحنة', 'true'], ['الدفع', 'true'], ['المستندات', 'false']])
    expect(screen.getByRole('heading', { name: 'تم إنشاء الشحنة بنجاح' })).toBeTruthy()
    const card = screen.getByTestId('confirmation-summary')
    expect(within(card).getByTestId('summary-awb').textContent).toBe('1675565474')
    expect(within(card).getByTestId('summary-pieces').textContent).toContain('JD014600012896647569')
    expect(within(card).getByTestId('summary-pieces').textContent).toContain('JD014600012896647570')
    expect(within(card).getByTestId('summary-pickup-dcn').textContent).toBe('CBJ261126621140')
    expect(within(card).getByTestId('summary-pickup-details').textContent).toMatch(/3:00 م.*6:00 م/)
    expect(screen.getByText('SHIPPEC-5513F39F33A4')).toBeTruthy()
    expect(screen.getByText('EXPRESS WORLDWIDE')).toBeTruthy()
    expect(screen.getByText('وقت الإنشاء').parentElement!.textContent).toMatch(/12:10 ص \(GMT\+03:00\)/) // 21:10Z → 00:10 the next day in the sender's time zone
    const docs = within(screen.getByTestId('confirmation-documents')).getAllByRole('listitem')
    expect(docs.map((d) => d.getAttribute('data-document-type'))).toEqual(['shipping_label', 'waybill', 'proforma_invoice'])
    expect(docs[2].textContent).toContain('2 صفحة')
    // EN
    en()
    expect(screen.getByRole('heading', { name: 'Shipment Confirmation' })).toBeTruthy()
    expect(within(screen.getByTestId('confirmation-summary')).getByText('Your Tracking Number')).toBeTruthy()
    expect(screen.getByTestId('summary-pickup-details').textContent).toContain('Thu, Nov 26, 2026')
    expect(screen.getByTestId('summary-pickup-details').textContent).toContain('Between 3:00 pm and 6:00 pm')
    expect(screen.getByTestId('summary-pieces').textContent).toContain('Piece # 1:')
  })

  it('«Download Documents» downloads ONE complete PDF, then the final confirmation: all steps done, pickup reminder, Track / Download / Reprint / Create another / Copy', async () => {
    renderAt()
    await screen.findByTestId('shipment-confirmation')
    fireEvent.click(screen.getByTestId('download-documents'))
    await waitFor(() => expect(files.downloadBlob).toHaveBeenCalledWith('DHL-1675565474-documents.pdf', expect.any(Blob)))
    expect(svc.downloadBundle).toHaveBeenCalledWith(12)
    await waitFor(() => expect(screen.getByTestId('shipment-confirmation').getAttribute('data-phase')).toBe('done'))
    expect(screen.getByTestId('where').textContent).toBe('/create-shipment/success/12?done=1')
    expect(within(screen.getByTestId('confirmation-progress')).getAllByRole('listitem').filter((li) => li.getAttribute('data-done') === 'true')).toHaveLength(3)
    expect(screen.getByTestId('confirmation-important').textContent).toContain('CBJ261126621140')
    // the browser started the download — SHIPPEC never claims the file was saved
    expect(screen.queryByText(/تم حفظ/)).toBeNull()
    const actions = screen.getByTestId('confirmation-actions')
    expect(within(actions).getByRole('link', { name: /متابعة الشحنة/ }).getAttribute('href')).toBe('/shipment-tracking/1675565474')
    expect(within(actions).getByRole('link', { name: /إنشاء شحنة أخرى/ }).getAttribute('href')).toBe('/create-shipment')
    fireEvent.click(within(actions).getByTestId('reprint-documents'))
    await waitFor(() => expect(files.printBlob).toHaveBeenCalledTimes(1))
    svc.copy.mockResolvedValue({ id: 77, replayed: false })
    fireEvent.click(within(actions).getByRole('button', { name: /نسخ الشحنة/ }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/create-shipment?draft=77'))
    expect(svc.copy).toHaveBeenCalledWith(12)
  })

  it('a failed download stays on the documents step with the reason; nothing pretends it was saved', async () => {
    svc.downloadBundle.mockRejectedValue(new ApiError('تعذر تجميع مستندات DHL في ملف واحد — نزّل كل مستند على حدة', 422, 'DOCUMENTS_BUNDLE_UNAVAILABLE'))
    renderAt()
    await screen.findByTestId('shipment-confirmation')
    fireEvent.click(screen.getByTestId('download-documents'))
    const { toast } = await import('react-hot-toast')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('نزّل كل مستند على حدة')))
    expect(screen.getByTestId('shipment-confirmation').getAttribute('data-phase')).toBe('documents')
  })

  it('no courier pickup: says so — never a confirmation number or window; drop-off names the Service Point', async () => {
    svc.details.mockResolvedValue(details({ pickup: null, pickup_option: 'none' }))
    renderAt()
    expect((await screen.findByTestId('summary-no-pickup')).textContent).toBe('لا يوجد استلام مجدول')
    expect(screen.queryByTestId('summary-pickup-dcn')).toBeNull()
    expect(screen.queryByTestId('summary-pickup-details')).toBeNull()
    en()
    expect(screen.getByTestId('summary-no-pickup').textContent).toBe('No courier pickup scheduled')
    cleanup()
    svc.details.mockResolvedValue(details({ pickup: null, pickup_option: 'drop_off', service_point_name: 'DHL Express Service Point Dammam' }))
    renderAt()
    expect((await screen.findByTestId('summary-no-pickup')).textContent).toContain('DHL Express Service Point Dammam')
  })

  it('Cancel Shipment: explicit confirmation with the real DHL limits, a reason, ONE request; the page then shows the cancelled state', async () => {
    renderAt()
    await screen.findByTestId('shipment-confirmation')
    fireEvent.click(screen.getByTestId('cancel-shipment'))
    const dialog = await screen.findByTestId('cancel-shipment-dialog')
    expect(dialog.textContent).toContain('لا توفّر DHL حذف البوليصة')
    expect(dialog.textContent).toContain('يُلغى استلام المندوب المحجوز لدى DHL')
    const confirm = within(dialog).getByTestId('cancel-shipment-confirm') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(dialog).getByLabelText(/سبب الإلغاء/), { target: { value: 'العميل ألغى الطلب' } })
    svc.cancelShipment.mockResolvedValue({ pickup_cancelled: true, invoice_reversal: 'reversed', shipment: details({ status: 'cancelled', cancellation_reason: 'العميل ألغى الطلب', management: management({ can_cancel: false, can_replace: false, cancel_blocked: 'SHIPMENT_CANCELLED', replace_blocked: 'SHIPMENT_CANCELLED' }) }) })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    await waitFor(() => expect(svc.cancelShipment).toHaveBeenCalledTimes(1))
    expect(svc.cancelShipment).toHaveBeenCalledWith(12, 'العميل ألغى الطلب')
    expect(await screen.findByText('هذه الشحنة ملغاة في SHIPPEC')).toBeTruthy()
    expect(screen.getByTestId('shipment-status').getAttribute('data-status')).toBe('cancelled')
    expect(screen.queryByTestId('cancel-shipment')).toBeNull()
  })

  it('in the DHL network: no cancel / replacement — the DHL limitation is stated; an employee sees Copy only', async () => {
    svc.details.mockResolvedValue(details({ management: management({ can_cancel: false, cancel_blocked: 'SHIPMENT_IN_DHL_NETWORK', can_replace: false, replace_blocked: 'SHIPMENT_IN_DHL_NETWORK', in_dhl_network: true }) }))
    renderAt()
    expect((await screen.findByTestId('cancel-blocked')).textContent).toContain('دخلت الشحنة شبكة DHL ولا يمكن إلغاؤها من SHIPPEC')
    expect(screen.queryByTestId('cancel-shipment')).toBeNull()
    expect(screen.queryByTestId('replace-shipment')).toBeNull()
    cleanup()
    auth.role = 'employee'
    svc.details.mockResolvedValue(details({ management: management({ can_cancel: false, cancel_blocked: 'FORBIDDEN', can_replace: false, replace_blocked: 'FORBIDDEN' }) }))
    renderAt()
    await screen.findByTestId('shipment-confirmation')
    expect(screen.queryByTestId('cancel-shipment')).toBeNull()
    expect(screen.queryByTestId('replace-shipment')).toBeNull()
    expect(screen.getByTestId('download-documents')).toBeTruthy()
  })

  it('Create corrected replacement: states that DHL cannot edit a created AWB, then opens the NEW draft', async () => {
    renderAt()
    await screen.findByTestId('shipment-confirmation')
    fireEvent.click(screen.getByTestId('replace-shipment'))
    const dialog = await screen.findByTestId('replacement-dialog')
    expect(dialog.textContent).toContain('لا تسمح DHL بتعديل بوليصة أُنشئت')
    expect(dialog.textContent).toContain('1675565474')
    svc.replacement.mockResolvedValue({ id: 31, replayed: false })
    fireEvent.click(within(dialog).getByTestId('replacement-confirm'))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/create-shipment?draft=31'))
    expect(svc.replacement).toHaveBeenCalledWith(12)
  })

  it('a superseded AWB links to its replacement; a shipment DHL did not create is not shown as confirmed', async () => {
    svc.details.mockResolvedValue(details({ status: 'superseded', replaced_by: { id: 40, awb: '1675565999', shippec_reference: 'SHIPPEC-X', creation_status: 'created', status: 'booked' },
      management: management({ can_cancel: false, can_replace: false, cancel_blocked: 'SHIPMENT_SUPERSEDED', replace_blocked: 'SHIPMENT_SUPERSEDED' }) }))
    renderAt()
    expect(await screen.findByText('استُبدلت هذه الشحنة')).toBeTruthy()
    expect(screen.getByRole('link', { name: '1675565999' }).getAttribute('href')).toBe('/create-shipment/success/40')
    expect(screen.getByTestId('shipment-status').getAttribute('data-status')).toBe('superseded')
    cleanup()
    svc.details.mockResolvedValue(details({ creation_status: 'uncertain', awb: null, status: 'draft' }))
    renderAt()
    expect(await screen.findByText(/لم تُنشئها DHL بعد/)).toBeTruthy()
    expect(screen.queryByTestId('shipment-confirmation')).toBeNull()
  })
})
