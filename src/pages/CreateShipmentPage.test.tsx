import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const svc = vi.hoisted(() => ({
  listDrafts: vi.fn(), get: vi.fn(), createDraft: vi.fn(), updateDraft: vi.fn(), cancel: vi.fn(), checkProducts: vi.fn(), selectProduct: vi.fn(),
  validate: vi.fn(), checkRates: vi.fn(), setPricing: vi.fn(), confirm: vi.fn(), unconfirm: vi.fn(), costSummary: vi.fn(), create: vi.fn(), resolve: vi.fn(),
  retryInvoice: vi.fn(), options: vi.fn(), incoterms: vi.fn(), servicePoints: vi.fn(), defaultShipper: vi.fn(), setDefaultShipper: vi.fn(), getPickup: vi.fn(),
  downloadDocument: vi.fn(),
}))
const clients = vi.hoisted(() => ({ searchClients: vi.fn() }))
vi.mock('../services/dhlShipment.service', () => ({ dhlShipmentService: svc, searchClients: clients.searchClients }))
const auth = vi.hoisted(() => ({ role: 'manager' }))
vi.mock('../hooks/useAuthStore', () => ({
  useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel({ user: { id: 1, role: auth.role }, token: 't' }), { getState: () => ({ token: 't' }) }),
}))
vi.mock('react-hot-toast', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))

import { CreateShipmentPage } from './CreateShipmentPage'
import { ApiError } from '../utils/apiClient'

window.scrollTo = vi.fn() as never
Element.prototype.scrollTo = vi.fn() as never

const QUOTE = {
  productCode: 'N', localProductCode: 'N', productName: 'EXPRESS DOMESTIC', isCustomerAgreement: false, amount: 66.18, currency: 'SAR', currencyType: 'BILLC', taxTotal: 8.63,
  estimatedDelivery: '2026-11-22T23:59:00', totalTransitDays: 3,
  breakdown: [
    { name: 'EXPRESS DOMESTIC', serviceCode: null, typeCode: null, amount: 50.45, currency: 'SAR', category: 'transportation', tax: 6.58, isCustomerAgreement: null },
    { name: 'DEMAND SURCHARGE', serviceCode: 'NX', typeCode: 'SCH', amount: 0.46, currency: 'SAR', category: 'demand_surcharge', tax: 0.06, isCustomerAgreement: null },
    { name: 'FUEL SURCHARGE', serviceCode: 'FF', typeCode: 'SCH', amount: 15.27, currency: 'SAR', category: 'fuel_surcharge', tax: 1.99, isCustomerAgreement: null },
  ],
  weight: { volumetric: 0.6, provided: 1, unit: 'metric' }, optionalServices: [{ serviceCode: 'II', name: 'SHIPMENT INSURANCE', serviceTypeCode: 'XCH', isCustomerAgreement: false }],
  pickupCapabilities: { nextBusinessDay: false, localCutoffDateAndTime: '2026-11-19T17:30:00', pickupEarliest: '09:00:00', pickupLatest: '18:30:00', pickupCutoffSameDayOutboundProcessing: '18:30:00', pickupAdditionalDays: 0, originServiceAreaCode: 'DHA' },
  deliveryCapabilities: { deliveryTypeCode: 'QDDF', estimatedDeliveryDateAndTime: '2026-11-22T23:59:00', totalTransitDays: 3, deliveryAdditionalDays: 0, destinationServiceAreaCode: 'DHA' },
}
const PRODUCTS = [
  { productCode: 'N', localProductCode: 'N', productName: 'EXPRESS DOMESTIC', isCustomerAgreement: false, pickupCapabilities: QUOTE.pickupCapabilities },
  { productCode: '7', localProductCode: '7', productName: 'EXPRESS EASY', isCustomerAgreement: true },
]
const shipment = (over: Record<string, unknown> = {}) => ({
  id: 5, dhl_env: 'test', status: 'draft', creation_status: 'draft', shippec_reference: 'SHIPPEC-ABC123', idempotency_key: 'auto:x', awb: null, client_id: 3, client_name: 'عميل الاختبار',
  customer_reference: null, product_code: 'N', local_product_code: 'N', product_name: 'EXPRESS DOMESTIC', service_codes: [], customs_required: false, paperless_trade: false,
  content_description: 'Business documents', incoterm: null, currency: null, declared_value: null, export_reason_type: null, shipment_type: null,
  customs_invoice_number: null, customs_invoice_date: null, dhl_invoice_type: null, shipment_date: '2026-11-19', origin_gmt_offset: null, shipment_purpose: null,
  transport_payer: 'shipper', transport_payer_account: null, duties_payer: 'receiver', duties_payer_account: null, pickup_option: 'none',
  pickup_earliest_time: null, pickup_latest_time: null, pickup_location: null, pickup_location_type: null, pickup_instructions: null, pickup_address: null,
  service_point_id: null, service_point_name: null, package_count: 1, total_gross_weight: '0.400', validation_issues: [], validation_warnings: [],
  dhl_validation_status: 'not_run', available_products: PRODUCTS, rate_quotes: [QUOTE], dhl_cost: '66.18', dhl_cost_source: 'dhl_quote', selling_price: '116.18', price_currency: 'SAR',
  invoice_id: null, invoice_link_status: 'none', invoice_link_error: null, creation_error_code: null, creation_error_message: null, message_reference: null, uncertain_since: null,
  pickup_id: null, plt_status: 'not_required', tracking_id: null, is_domestic: true, content_type: 'documents', created_at: '2026-11-18T10:00:00Z', updated_at: '2026-11-18T10:00:00Z',
  shipper_company: 'Shippec Trading', shipper_contact: 'Sara Operations', shipper_phone: '+966551234567', shipper_email: null, shipper_address_line1: '3456, Prince Sultan Road',
  shipper_address_line2: '7788, Al Olaya', shipper_address_line3: 'ROLA3456', shipper_city: 'Dammam', shipper_postal_code: '31952', shipper_province: null, shipper_country_code: 'SA', shipper_type: 'business',
  receiver_company: 'Omar', receiver_contact: 'Omar', receiver_phone: '+966552222222', receiver_email: null, receiver_address_line1: '2121, Test Street', receiver_address_line2: '3434, Al Olaya',
  receiver_address_line3: 'TSTA2121', receiver_city: 'Khobar', receiver_postal_code: '34421', receiver_province: null, receiver_country_code: 'SA', receiver_type: 'private',
  packages: [{ sequence: 1, weight_kg: '0.400', length_cm: '30.00', width_cm: '20.00', height_cm: '5.00', customer_reference: null, dhl_piece_id: null }],
  items: [], documents: [],
  ...over,
})
const created = (over: Record<string, unknown> = {}) => ({
  outcome: 'created', replayed: false, message: 'ok', awb: '4614961120', shippec_reference: 'SHIPPEC-ABC123', message_reference: 'ref-1', creation_error: null,
  invoice: { id: 91, number: 'DH2601', link_status: 'linked', error: null },
  documents: [{ id: 1, document_type: 'shipping_label', content_type: 'application/pdf', size_bytes: 1000, sha256: 'x' }, { id: 2, document_type: 'waybill', content_type: 'application/pdf', size_bytes: 900, sha256: 'y' }],
  documents_failed: 0, tracking_id: 4, pickup: null, paperless_trade: { status: 'not_required', due_at: null, error: null },
  shipment: shipment({ creation_status: 'created', awb: '4614961120', invoice_id: 91 }), ...over,
})

const renderAt = (url = '/create-shipment') => render(<MemoryRouter initialEntries={[url]}><CreateShipmentPage /></MemoryRouter>)
const next = () => fireEvent.click(screen.getByRole('button', { name: /التالي/ }))
const goStep = (label: RegExp) => fireEvent.click(screen.getAllByRole('button', { name: label })[0])

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  auth.role = 'manager'
  svc.listDrafts.mockResolvedValue({ data: [], pagination: { total: 0 } })
  svc.get.mockResolvedValue(shipment())
  svc.incoterms.mockResolvedValue({ source: 'dhl', items: [{ code: 'DAP', name: 'Delivered At Place' }, { code: 'DDP', name: 'Delivered Duty Paid' }] })
  svc.validate.mockImplementation(async () => ({ ok: true, issues: [], warnings: [], dhl_validation: { status: 'passed', message: null }, shipment: shipment({ creation_status: 'validated', dhl_validation_status: 'passed' }) }))
  svc.setPricing.mockResolvedValue({ shipment: shipment(), warnings: [] })
  svc.confirm.mockResolvedValue(shipment({ creation_status: 'ready' }))
})

describe('«إنشاء شحنة» wizard', () => {
  it('moves forward and back without losing data; customs appears only for international goods', async () => {
    renderAt()
    const contact = (await screen.findAllByLabelText(/اسم جهة الاتصال/))[1]
    fireEvent.change(contact, { target: { value: 'Omar Receiver' } })
    next()
    expect(await screen.findByText('نوع المحتوى')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /السابق/ }))
    expect(((await screen.findAllByLabelText(/اسم جهة الاتصال/))[1] as HTMLInputElement).value).toBe('Omar Receiver')
    expect(screen.queryByRole('button', { name: /الجمارك/ })).toBeNull()
    // international goods → «الجمارك» step
    fireEvent.change(screen.getAllByLabelText(/^الدولة/)[1], { target: { value: 'AE' } })
    next()
    fireEvent.click(screen.getByRole('radio', { name: /طرود \/ بضائع/ }))
    expect(screen.getByRole('button', { name: /3\. الجمارك/ })).toBeTruthy()
    expect(screen.getByText(/ستظهر خطوة «الجمارك»/)).toBeTruthy()
  })

  it('saves a draft (create, then update) and a Backend field error lands on its field', async () => {
    svc.createDraft.mockResolvedValue(shipment({ id: 9 }))
    renderAt()
    fireEvent.change((await screen.findAllByLabelText(/اسم جهة الاتصال/))[1], { target: { value: 'Omar' } })
    fireEvent.click(screen.getByRole('button', { name: /حفظ المسودة/ }))
    await waitFor(() => expect(svc.createDraft).toHaveBeenCalledTimes(1))
    expect(svc.createDraft.mock.calls[0][0]).toMatchObject({ receiver: { contact: 'Omar' }, customs_required: false })
    // edit → PATCH; the Backend refuses a field
    svc.updateDraft.mockRejectedValue(new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [{ field: 'receiver.phone', message: 'Phone number is required' }]))
    fireEvent.change(screen.getAllByLabelText(/^المدينة/)[1], { target: { value: 'Khobar' } })
    fireEvent.click(await screen.findByRole('button', { name: /حفظ المسودة/ }))
    await waitFor(() => expect(svc.updateDraft).toHaveBeenCalledWith(9, expect.objectContaining({ receiver: expect.objectContaining({ city: 'Khobar' }) })))
    expect(await screen.findByText('حقل مطلوب')).toBeTruthy()
  })

  it('resumes a saved draft with its data', async () => {
    renderAt('/create-shipment?draft=5')
    await waitFor(() => expect(svc.get).toHaveBeenCalledWith(5))
    expect(await screen.findByText('عميل الاختبار')).toBeTruthy()
    expect((screen.getAllByLabelText(/^رقم المبنى/)[0] as HTMLInputElement).value).toBe('3456')
    expect(screen.getByText('SHIPPEC-ABC123')).toBeTruthy()
  })

  it('QA 3D.1: a resumed draft shows the client NAME (GET /clients/:id answers { client: {...} }), not "#id"', async () => {
    const { api } = await import('../utils/apiClient')
    const spy = vi.spyOn(api, 'get').mockResolvedValue({ client: { id: 3, name: 'QA Test Client' }, invoices: [] } as never)
    svc.get.mockResolvedValue(shipment({ client_name: undefined }))
    renderAt('/create-shipment?draft=5')
    expect(await screen.findByText('QA Test Client')).toBeTruthy()
    expect(spy).toHaveBeenCalledWith('/clients/3')
    expect(screen.queryByText('#3')).toBeNull()
    spy.mockRestore()
  })

  it('packages: add, copy and remove with live totals', async () => {
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/الطرود/)
    expect(await screen.findByText('الطرد 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'نسخ الطرد 1' }))
    expect(screen.getByText('الطرد 2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /إضافة طرد/ }))
    expect(screen.getByText('الطرد 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'حذف الطرد 3' }))
    expect(screen.queryByText('الطرد 3')).toBeNull()
    expect(screen.getByText('0.8 كغ')).toBeTruthy()
    // DHL weights shown as DHL returned them
    expect(screen.getByText('0.6 كغ')).toBeTruthy()
  })

  it('customs items: repeatable cards for international goods', async () => {
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    fireEvent.change(screen.getAllByLabelText(/^الدولة/)[1], { target: { value: 'AE' } })
    goStep(/تفاصيل الشحنة/)
    fireEvent.click(await screen.findByRole('radio', { name: /طرود \/ بضائع/ }))
    goStep(/الجمارك/)
    expect(await screen.findByText('البند 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /إضافة بند/ }))
    expect(screen.getByText('البند 2')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'حذف البند 2' }))
    expect(screen.queryByText('البند 2')).toBeNull()
  })

  it('DHL products and rates: cards with DHL prices, details, selection; SHIPPEC price and profit kept apart', async () => {
    svc.get.mockResolvedValue(shipment({ available_products: null, rate_quotes: null, product_code: null, local_product_code: null, selling_price: null, dhl_cost: null }))
    svc.checkProducts.mockResolvedValue({ products: PRODUCTS })
    svc.checkRates.mockResolvedValue({ quotes: [QUOTE] })
    svc.selectProduct.mockResolvedValue(shipment())
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/الخدمة/)
    await waitFor(() => expect(svc.checkProducts).toHaveBeenCalledWith(5))
    const card = (await screen.findByText('EXPRESS DOMESTIC')).closest('article') as HTMLElement
    expect(within(card).getByText('66.18 ر.س')).toBeTruthy()
    expect(within(card).getByText(/بنهاية اليوم/)).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: 'عرض التفاصيل' }))
    expect(await screen.findByText('رسوم الوقود')).toBeTruthy()
    expect(screen.getByText('رسوم الطلب')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }))
    fireEvent.click(within(card).getByRole('button', { name: 'اختيار' }))
    await waitFor(() => expect(svc.selectProduct).toHaveBeenCalledWith(5, 'N'))
    fireEvent.change(screen.getByLabelText(/سعر البيع للعميل/), { target: { value: '100' } })
    expect(screen.getByText('33.82 ر.س')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/سعر البيع للعميل/), { target: { value: '50' } })
    expect(screen.getByText('سعر البيع أقل من تكلفة DHL')).toBeTruthy()
  })

  it('pickup: three choices; service points that do not accept drop-off cannot be chosen', async () => {
    svc.servicePoints.mockResolvedValue({ points: [
      { id: 'DHA014', name: 'DHL Express Service Point', localName: 'DHL SERVICE POINT - Ibn Khaldoun', type: 'STATION', address: { line1: 'IBN Khaldoun street', line2: null, line3: null, city: 'DAMMAM', postalCode: null, country: 'SA' }, distance: '0.13 km', distanceKm: 0.13, shippingCutoff: '17:00:00.000', openingHours: [{ day: 'SUNDAY', open: '09:00', close: '22:00' }], capabilities: { dropOff: true }, limits: { maxPieces: 5, maxShipmentWeightKg: 70, maxPieceWeightKg: 70, pieceSizeCm: [] } },
      { id: 'DHAFZ3', name: 'Collection only', localName: 'Sahel - Fodel - Collection only', type: 'PARTNER', address: { line1: 'x', line2: null, line3: null, city: 'DAMMAM', postalCode: null, country: 'SA' }, distance: '0.58 km', distanceKm: 0.58, shippingCutoff: null, openingHours: [], capabilities: { dropOff: false }, limits: { maxPieces: null, maxShipmentWeightKg: null, maxPieceWeightKg: null, pieceSizeCm: [] } },
    ] })
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/الاستلام/)
    fireEvent.click(await screen.findByRole('radio', { name: /جدولة مندوب DHL/ }))
    expect(screen.getByText(/نافذة DHL لهذه الخدمة: من 09:00 حتى 18:30/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/أبكر وقت/), { target: { value: '19:00' } })
    fireEvent.change(screen.getByLabelText(/آخر وقت/), { target: { value: '20:00' } })
    expect(screen.getByText(/الموعد خارج نافذة DHL/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: /التسليم في نقطة خدمة DHL/ }))
    fireEvent.click(screen.getByRole('button', { name: 'بحث' }))
    expect(await screen.findByText('DHL SERVICE POINT - Ibn Khaldoun')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'غير متاحة للتسليم' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'اختيار هذه النقطة' }))
    expect(screen.getByText(/النقطة المختارة:/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'النقطة المختارة' })).toBeTruthy()
  })

  it('review validates with DHL on entry; «إنشاء الشحنة» asks for confirmation and sends ONE create; success shows AWB, invoice and documents', async () => {
    let release!: () => void
    svc.create.mockImplementation(() => new Promise((r) => { release = () => r(created()) }))
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/المراجعة/)
    await waitFor(() => expect(svc.validate).toHaveBeenCalledTimes(1))
    expect(await screen.findByText(/اجتازت البيانات التحقق المحلي وتحقق DHL/)).toBeTruthy()
    expect(svc.create).not.toHaveBeenCalled()
    const btn = screen.getByRole('button', { name: /^إنشاء الشحنة$/ })
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(btn)
    const yes = await screen.findByRole('button', { name: /نعم، أنشئ الشحنة/ })
    fireEvent.click(yes)
    fireEvent.click(yes)
    await waitFor(() => expect(svc.create).toHaveBeenCalledTimes(1))
    expect(svc.setPricing).toHaveBeenCalledWith(5, { selling_price: 116.18, price_currency: 'SAR', dhl_cost_source: 'dhl_quote' })
    expect(svc.confirm).toHaveBeenCalledWith(5)
    expect(await screen.findByText(/إرسال طلب الإنشاء إلى DHL/)).toBeTruthy()
    await act(async () => { release() })
    expect(await screen.findByText('تم إنشاء الشحنة لدى DHL')).toBeTruthy()
    expect(screen.getByText('4614961120')).toBeTruthy() // the AWB exactly as DHL issued it, never split
    expect(screen.getByText('DH2601')).toBeTruthy()
    expect(screen.getByRole('button', { name: /ملصق الشحن/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /بوليصة الشحن/ })).toBeTruthy()
    expect(svc.create).toHaveBeenCalledTimes(1)
  })

  it('uncertain outcome: never shown as failed; only admin / manager can settle it', async () => {
    svc.create.mockResolvedValue(created({ outcome: 'uncertain', awb: null, invoice: { id: null, number: null, link_status: 'none', error: null }, documents: [] }))
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/المراجعة/)
    const btn = await screen.findByRole('button', { name: /^إنشاء الشحنة$/ })
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(btn)
    fireEvent.click(await screen.findByRole('button', { name: /نعم، أنشئ الشحنة/ }))
    expect(await screen.findByText(/لم نستطع تأكيد النتيجة بعد/)).toBeTruthy()
    expect(screen.getByText(/لا تحاول إنشاء الشحنة مرة أخرى/)).toBeTruthy()
    expect(screen.getByText('SHIPPEC-ABC123')).toBeTruthy()
    expect(screen.queryByText(/رفضت DHL/)).toBeNull()
    expect(screen.getByRole('button', { name: 'تسوية الشحنة' })).toBeTruthy()
  })

  it('rejected outcome shows DHL\'s reason; an employee cannot send the creation', async () => {
    svc.create.mockResolvedValue(created({ outcome: 'failed', awb: null, creation_error: { code: 'DHL_BAD_REQUEST', message: '420505 : The destination location is invalid' } }))
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/المراجعة/)
    const btn = await screen.findByRole('button', { name: /^إنشاء الشحنة$/ })
    await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(btn)
    fireEvent.click(await screen.findByRole('button', { name: /نعم، أنشئ الشحنة/ }))
    expect(await screen.findByText('رفضت DHL إنشاء الشحنة')).toBeTruthy()
    expect(screen.getByText('420505 : The destination location is invalid')).toBeTruthy()
    cleanup()
    auth.role = 'employee'
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/المراجعة/)
    await waitFor(() => expect(svc.validate).toHaveBeenCalled())
    expect((screen.getByRole('button', { name: /^إنشاء الشحنة$/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText(/إنشاء الشحنة لدى DHL للمدير أو المسؤول فقط/)).toBeTruthy()
  })

  it('QA 3D.1: the price an employee sets travels with the draft (stored on review), so the manager who creates finds it', async () => {
    auth.role = 'employee'
    svc.get.mockResolvedValue(shipment({ selling_price: null, dhl_cost: null, dhl_cost_source: null }))
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/الخدمة/)
    fireEvent.change(await screen.findByLabelText(/سعر البيع للعميل/), { target: { value: '150' } })
    goStep(/المراجعة/)
    await waitFor(() => expect(svc.setPricing).toHaveBeenCalledWith(5, { selling_price: 150, price_currency: 'SAR', dhl_cost_source: 'dhl_quote' }))
    await waitFor(() => expect(svc.validate).toHaveBeenCalled())
    expect(svc.create).not.toHaveBeenCalled()
  })

  it('a viewer cannot open a new shipment', async () => {
    auth.role = 'viewer'
    renderAt()
    expect(await screen.findByText(/إنشاء الشحنات متاح للموظفين والمدراء/)).toBeTruthy()
  })
})
