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
const contacts = vi.hoisted(() => ({ search: vi.fn(), create: vi.fn(), update: vi.fn() }))
const lookup = vi.hoisted(() => ({ autocomplete: vi.fn(), cities: vi.fn(), details: vi.fn(), shortAddress: vi.fn(), postalCode: vi.fn() }))
vi.mock('../services/shippingContacts.service', async (orig) => ({
  ...(await orig<typeof import('../services/shippingContacts.service')>()), shippingContactsService: contacts, addressLookupService: lookup,
}))
const auth = vi.hoisted(() => ({ role: 'manager' }))
vi.mock('../hooks/useAuthStore', () => ({
  useAuthStore: Object.assign((sel: (s: unknown) => unknown) => sel({ user: { id: 1, role: auth.role }, token: 't' }), { getState: () => ({ token: 't', user: { id: 1, role: auth.role } }) }),
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

/** The options of a combobox's own listbox (not every <option> on the page). */
const listOf = (box: HTMLElement) => within(document.getElementById(box.getAttribute('aria-controls') ?? '') as HTMLElement).getAllByRole('option')
/** Country/Territory combobox of From (0) / To (1): search, Enter picks the first match. */
const pickCountry = (side: 0 | 1, q: string) => {
  const box = screen.getAllByLabelText(/^(البلد\/الإقليم|Country\/Territory)/)[side]
  fireEvent.focus(box)
  fireEvent.change(box, { target: { value: q } })
  fireEvent.keyDown(box, { key: 'Enter' })
}
const renderAt = (url = '/create-shipment') => render(<MemoryRouter initialEntries={[url]}><CreateShipmentPage /></MemoryRouter>)
const next = () => fireEvent.click(screen.getByRole('button', { name: /التالي/ }))
const goStep = (label: RegExp) => fireEvent.click(screen.getAllByRole('button', { name: label })[0])

afterEach(() => cleanup())
beforeEach(() => {
  vi.clearAllMocks()
  try { window.localStorage.clear() } catch { /* jsdom */ }
  auth.role = 'manager'
  contacts.search.mockResolvedValue([])
  lookup.autocomplete.mockResolvedValue([])
  lookup.cities.mockResolvedValue([])
  lookup.shortAddress.mockResolvedValue([])
  lookup.postalCode.mockResolvedValue([])
  svc.listDrafts.mockResolvedValue({ data: [], pagination: { total: 0 } })
  svc.get.mockResolvedValue(shipment())
  svc.incoterms.mockResolvedValue({ source: 'dhl', items: [{ code: 'DAP', name: 'Delivered At Place' }, { code: 'DDP', name: 'Delivered Duty Paid' }] })
  svc.validate.mockImplementation(async () => ({ ok: true, issues: [], warnings: [], dhl_validation: { status: 'passed', message: null }, shipment: shipment({ creation_status: 'validated', dhl_validation_status: 'passed' }) }))
  svc.setPricing.mockResolvedValue({ shipment: shipment(), warnings: [] })
  svc.confirm.mockResolvedValue(shipment({ creation_status: 'ready' }))
})

describe('«إنشاء شحنة» wizard', () => {
  it('moves forward and back without losing data; customs appears only for international goods', async () => {
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    const contact = screen.getAllByLabelText(/^الاسم/)[1]
    fireEvent.change(contact, { target: { value: 'Omar Receiver' } })
    next()
    expect(await screen.findByText('ماذا تقوم بشحنه؟')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /السابق/ }))
    expect(((await screen.findAllByLabelText(/^الاسم/))[1] as HTMLInputElement).value).toBe('Omar Receiver')
    expect(screen.queryByRole('button', { name: /الجمارك/ })).toBeNull()
    // international goods → «الجمارك» step
    pickCountry(1, 'AE')
    next()
    fireEvent.click(screen.getByRole('radio', { name: /طرود \/ بضائع/ }))
    expect(screen.getByRole('button', { name: /3\. الجمارك/ })).toBeTruthy()
    expect(screen.getByText('1. وصف البند')).toBeTruthy() // the items are entered right here
  })

  it('saves a draft (create, then update) and a Backend field error lands on its field', async () => {
    svc.createDraft.mockResolvedValue(shipment({ id: 9 }))
    renderAt()
    fireEvent.change((await screen.findAllByLabelText(/^الاسم/))[1], { target: { value: 'Omar' } })
    fireEvent.click(screen.getByRole('button', { name: /حفظ المسودة/ }))
    await waitFor(() => expect(svc.createDraft).toHaveBeenCalledTimes(1))
    expect(svc.createDraft.mock.calls[0][0]).toMatchObject({ receiver: { contact: 'Omar' }, customs_required: false })
    // edit → PATCH; the Backend refuses a field
    svc.updateDraft.mockRejectedValue(new ApiError('Validation failed', 400, 'VALIDATION_ERROR', [{ field: 'receiver.phone', message: 'Phone number is required' }]))
    fireEvent.change(screen.getAllByLabelText(/^المدينة/)[1], { target: { value: 'Khobar' } })
    fireEvent.click(await screen.findByRole('button', { name: /حفظ المسودة/ }))
    await waitFor(() => expect(svc.updateDraft).toHaveBeenCalledWith(9, expect.objectContaining({ receiver: expect.objectContaining({ city: 'Khobar' }) })))
    expect(await screen.findByText('حقل مطلوب')).toBeTruthy()
    // the error sits under «إلى» → Phone
    const toPanel = document.querySelector('[data-party="receiver"]') as HTMLElement
    expect(within(toPanel).getByText('حقل مطلوب')).toBeTruthy()
  })

  it('resumes a saved draft with its data', async () => {
    renderAt('/create-shipment?draft=5')
    await waitFor(() => expect(svc.get).toHaveBeenCalledWith(5))
    expect(await screen.findByText('عميل الاختبار')).toBeTruthy()
    expect((screen.getAllByLabelText(/^العنوان 1/)[0] as HTMLInputElement).value).toBe('3456, Prince Sultan Road')
    expect((screen.getAllByLabelText(/^العنوان المختصر/)[0] as HTMLInputElement).value).toBe('ROLA3456')
    expect((screen.getAllByLabelText(/^الهاتف/)[1] as HTMLInputElement).value).toBe('552222222')
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

  it('customs items: repeatable cards for international goods (on Shipment Details); the last item cannot be removed', async () => {
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    pickCountry(1, 'AE')
    goStep(/تفاصيل الشحنة/)
    fireEvent.click(await screen.findByRole('radio', { name: /طرود \/ بضائع/ }))
    expect(await screen.findByText('1. وصف البند')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'حذف البند 1' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /إضافة بند آخر/ }))
    expect(screen.getByText('2. وصف البند')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'حذف البند 2' }))
    expect(screen.queryByText('2. وصف البند')).toBeNull()
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


  // ═════════ Step 1 «الأطراف / Parties» (DHL-like From | Switch | To) ═════════
  const toPanel = () => document.querySelector('[data-party="receiver"]') as HTMLElement
  const fromPanel = () => document.querySelector('[data-party="shipper"]') as HTMLElement
  const fillReceiverSA = () => {
    const p = within(toPanel())
    fireEvent.change(p.getByLabelText(/^الاسم/), { target: { value: 'Omar Receiver' } })
    fireEvent.change(p.getByLabelText(/^الشركة/), { target: { value: 'Omar Co' } })
    pickCountry(1, 'SA')
    fireEvent.change(p.getByLabelText(/^العنوان 1/), { target: { value: '2121 Test Street' } })
    fireEvent.change(p.getByLabelText(/^عنوان 2/), { target: { value: '3434 Al Olaya' } })
    fireEvent.change(p.getByLabelText(/^المدينة/), { target: { value: 'Khobar' } })
    fireEvent.change(p.getByLabelText(/^الرمز البريدي/), { target: { value: '34421' } })
    fireEvent.change(p.getByLabelText(/^الهاتف/), { target: { value: '55 222 2222' } })
  }
  const chooseClient = async () => {
    clients.searchClients.mockResolvedValue([{ id: 3, name: 'عميل الاختبار', phone: '0550000000', email: null, city: 'Dammam' }])
    fireEvent.change(screen.getByLabelText(/عميل SHIPPEC \(صاحب الفاتورة\)/), { target: { value: 'عميل' } })
    fireEvent.click(await screen.findByRole('option', { name: /عميل الاختبار/ }))
  }

  it('Parties: From prefilled with SHIPPEC Operations, To empty; From | Switch | To on one surface; Saudi notice only for Saudi Arabia', async () => {
    renderAt()
    const from = within(await screen.findByTestId('parties-surface'))
    expect(from.getByRole('heading', { name: /^من$/ })).toBeTruthy()
    expect(from.getByRole('heading', { name: /^إلى$/ })).toBeTruthy()
    expect(screen.getByTestId('parties-switch').textContent).toContain('التبديل')
    const f = within(fromPanel())
    expect((f.getByLabelText(/^الاسم/) as HTMLInputElement).value).toBe('Operations Management - SHIPPEC')
    expect((f.getByLabelText(/^الشركة/) as HTMLInputElement).value).toBe('SHIPPEC EXPRESS')
    expect((f.getByLabelText(/^البلد\/الإقليم/) as HTMLInputElement).value).toMatch(/السعودية/)
    expect((f.getByLabelText(/^العنوان 1/) as HTMLInputElement).value).toBe('7540 Prince Mutaib bin Abdulaziz')
    expect((f.getByLabelText(/^عنوان 2/) as HTMLInputElement).value).toBe('3538 Al Rawdah Dist')
    expect((f.getByLabelText(/^العنوان المختصر/) as HTMLInputElement).value).toBe('EDMA7540')
    expect((f.getByLabelText(/^المدينة/) as HTMLInputElement).value).toBe('DAMMAM')
    expect((f.getByLabelText(/^الولاية/) as HTMLInputElement).value).toBe('EASTERN PROVINCE')
    expect((f.getByLabelText(/^عنوان البريد الإلكتروني/) as HTMLInputElement).value).toBe('info@altakamullog.com')
    expect((f.getByLabelText(/^الرمز\*?$/) as HTMLInputElement).value).toBe('966')
    expect((f.getByLabelText(/^الهاتف/) as HTMLInputElement).value).toBe('53 729 9636')
    expect((f.getByLabelText(/بيانات الشركة/) as HTMLInputElement).checked).toBe(true)
    expect(within(fromPanel()).getByTestId('sa-national-address-notice')).toBeTruthy()
    // To: empty, no country → no Saudi notice; office phone by default
    const t = within(toPanel())
    expect((t.getByLabelText(/^الاسم/) as HTMLInputElement).placeholder).toBe('الاسم الأول والاسم الأخير')
    expect(t.queryByTestId('sa-national-address-notice')).toBeNull()
    expect((t.getByLabelText(/^نوع الهاتف/) as HTMLSelectElement).value).toBe('office')
    pickCountry(1, 'SA')
    expect(within(toPanel()).getByTestId('sa-national-address-notice')).toBeTruthy()
    expect((within(toPanel()).getByLabelText(/^الرمز\*?$/) as HTMLInputElement).value).toBe('966') // calling code from the country
    pickCountry(1, 'EG')
    expect((within(toPanel()).getByLabelText(/^الرمز\*?$/) as HTMLInputElement).value).toBe('20')
    expect(within(toPanel()).queryByLabelText(/^العنوان المختصر/)).toBeNull()
  })

  it('Next is blocked until the SHIPPEC customer and every required From / To field is filled; VAT/Tax ID and EORI never block; the stepper cannot jump past it', async () => {
    renderAt()
    await screen.findByTestId('parties-surface')
    next()
    expect(await screen.findByTestId('parties-gate-summary')).toBeTruthy()
    expect(screen.getByText('اختر عميل SHIPPEC (صاحب الفاتورة).')).toBeTruthy()
    for (const msg of ['الاسم مطلوب.', 'اسم الشركة مطلوب.', 'البلد/الإقليم مطلوب.', 'العنوان 1 مطلوب.', 'المدينة مطلوبة.', 'رمز الاتصال الدولي مطلوب.', 'رقم الهاتف مطلوب.']) {
      expect(within(toPanel()).getByText(msg)).toBeTruthy()
    }
    expect(screen.queryByText('نوع المحتوى')).toBeNull()
    goStep(/المراجعة/)
    expect(screen.queryByText('التحقق')).toBeNull() // still on Parties
    expect(svc.validate).not.toHaveBeenCalled()
    // From missing a field blocks too
    fireEvent.change(within(fromPanel()).getByLabelText(/^المدينة/), { target: { value: '' } })
    expect(within(fromPanel()).getByText('المدينة مطلوبة.')).toBeTruthy()
    fireEvent.change(within(fromPanel()).getByLabelText(/^المدينة/), { target: { value: 'DAMMAM' } })
    await chooseClient()
    fillReceiverSA()
    expect(screen.queryByTestId('parties-gate-summary')).toBeNull() // errors clear as the fields are filled
    expect((within(toPanel()).getByLabelText(/^رقم تعريف VAT/) as HTMLInputElement).value).toBe('')
    expect((within(toPanel()).getByLabelText(/^رقم EORI/) as HTMLInputElement).value).toBe('')
    next()
    expect(await screen.findByText('ماذا تقوم بشحنه؟')).toBeTruthy()
  })

  it('AR | EN switch: this page only; English is LTR with English labels, buttons and validation; the data never changes', async () => {
    renderAt()
    await screen.findByTestId('parties-surface')
    fireEvent.change(within(toPanel()).getByLabelText(/^الاسم/), { target: { value: 'Omar Receiver' } })
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'EN' }))
    expect(screen.getByRole('heading', { name: /Create Shipment/ })).toBeTruthy()
    const root = screen.getByTestId('parties-surface').closest('[dir]') as HTMLElement
    expect(root.getAttribute('dir')).toBe('ltr')
    expect(within(fromPanel()).getByRole('heading', { name: /^From$/ })).toBeTruthy()
    expect(within(toPanel()).getByRole('heading', { name: /^To$/ })).toBeTruthy()
    expect(screen.getByTestId('parties-switch').textContent).toContain('Switch')
    for (const l of [/^Name/, /^Company/, /^Country\/Territory/, /^Address 1/, /^Address 2/, /^City/, /^Email address/, /^Phone Type/, /^VAT\/Tax ID/, /^EORI Number/]) {
      expect(within(toPanel()).getAllByLabelText(l).length).toBeGreaterThan(0)
    }
    expect(within(toPanel()).getByText('Notes about this contact')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Save to Database/ })).toHaveLength(2)
    expect(within(fromPanel()).getByText(/National Address structure as a mandatory requirement/)).toBeTruthy()
    // the data stays
    expect((within(toPanel()).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Omar Receiver')
    expect((within(fromPanel()).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Operations Management - SHIPPEC')
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    expect(await screen.findByText('Select the SHIPPEC customer (invoice owner).')).toBeTruthy()
    expect(within(toPanel()).getByText('Company is required.')).toBeTruthy()
    expect(within(toPanel()).getByText('Phone number is required.')).toBeTruthy()
    // back to Arabic: RTL, Arabic labels, the same data
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'AR' }))
    expect((screen.getByTestId('parties-surface').closest('[dir]') as HTMLElement).getAttribute('dir')).toBe('rtl')
    expect((within(toPanel()).getByLabelText(/^الاسم/) as HTMLInputElement).value).toBe('Omar Receiver')
    expect(within(toPanel()).getByText('اسم الشركة مطلوب.')).toBeTruthy()
  })

  it('saved contacts: Name searches SHIPPEC contacts (debounced, by role); selecting fills every field, all editable; nothing is saved by selecting', async () => {
    contacts.search.mockResolvedValue([{
      id: 41, role: 'receiver', saved_name: 'Ahmed Cairo Office', name: 'Ahmed Hassan', business_contact: false, company: 'ABC Trading', country_code: 'EG', country_name: 'Egypt',
      address_line1: '12 Tahrir Street', address_line2: 'Floor 3', short_address: null, building_number: null, street: null, additional_number: null, suburb: 'Downtown',
      city: 'Cairo', province: 'Cairo', postal_code: '11511', residential: true, email: 'ahmed@abc.example', phones: [{ type: 'office', code: '20', number: '100 123 4567', extension: '5', sms: false }],
      phone_normalized: '201001234567', vat_tax_id: 'EG-VAT-1', eori: 'EG-EORI', notes: 'Call first', created_by: 1, created_at: '', updated_at: '',
    }])
    renderAt()
    await screen.findByTestId('parties-surface')
    const name = within(toPanel()).getByLabelText(/^الاسم/)
    fireEvent.change(name, { target: { value: 'Ah' } })
    const option = await screen.findByRole('option', { name: /Ahmed Cairo Office/ })
    expect(contacts.search).toHaveBeenCalledTimes(1)
    expect(contacts.search.mock.calls[0].slice(0, 2)).toEqual(['Ah', 'receiver'])
    // the saved alias first, then the real name, company, phone, city / country
    expect(option.querySelector('[data-saved-name]')?.textContent).toBe('Ahmed Cairo Office')
    expect(option.textContent).toContain('Ahmed Hassan · ABC Trading · +20 100 123 4567')
    expect(option.textContent).toContain('مستلم محفوظ')
    fireEvent.click(option)
    const t = within(toPanel())
    const v = (l: RegExp) => (t.getByLabelText(l) as HTMLInputElement).value
    expect(v(/^الاسم/)).toBe('Ahmed Hassan')
    expect(v(/^الشركة/)).toBe('ABC Trading')
    expect(v(/^البلد\/الإقليم/)).toMatch(/مصر/)
    expect(v(/^العنوان 1/)).toBe('12 Tahrir Street')
    expect(v(/^الضاحية/)).toBe('Downtown')
    expect(v(/^المدينة/)).toBe('Cairo')
    expect(v(/^الرمز البريدي/)).toBe('11511')
    expect(v(/^الرمز\*?$/)).toBe('20')
    expect(v(/^الهاتف/)).toBe('100 123 4567')
    expect(v(/^التحويلة/)).toBe('5')
    expect(v(/^رقم تعريف VAT/)).toBe('EG-VAT-1')
    expect(v(/^رقم EORI/)).toBe('EG-EORI')
    expect((t.getByLabelText(/^ملاحظات حول جهة الاتصال/) as HTMLTextAreaElement).value).toBe('Call first')
    expect((t.getByLabelText(/عنوان سكني/) as HTMLInputElement).checked).toBe(true)
    expect(t.getByText('من قاعدة البيانات')).toBeTruthy()
    fireEvent.change(t.getByLabelText(/^المدينة/), { target: { value: 'Giza' } })
    expect(v(/^المدينة/)).toBe('Giza')
    expect(contacts.create).not.toHaveBeenCalled()
    expect(contacts.update).not.toHaveBeenCalled()
  })

  it('«التبديل» swaps From and To (codes, phones, details) — never the SHIPPEC invoice customer', async () => {
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    const v = (panel: HTMLElement, l: RegExp) => (within(panel).getByLabelText(l) as HTMLInputElement).value
    expect(v(fromPanel(), /^الاسم/)).toBe('Sara Operations')
    expect(v(toPanel(), /^الاسم/)).toBe('Omar')
    fireEvent.change(within(toPanel()).getByLabelText(/^رقم تعريف VAT/), { target: { value: 'VAT-OMAR' } })
    fireEvent.click(screen.getByTestId('parties-switch'))
    expect(v(fromPanel(), /^الاسم/)).toBe('Omar')
    expect(v(toPanel(), /^الاسم/)).toBe('Sara Operations')
    expect(v(fromPanel(), /^رقم تعريف VAT/)).toBe('VAT-OMAR')
    expect(v(fromPanel(), /^الهاتف/)).toBe('552222222')
    expect(v(toPanel(), /^المدينة/)).toBe('Dammam')
    expect(screen.getByText('عميل الاختبار')).toBeTruthy() // invoice owner unchanged
  })

  it('Address 1: suggestions only inside the chosen country; an older slow answer never replaces a newer one; selecting fills city / state / postal code; still editable', async () => {
    const resolvers: Record<string, (v: unknown) => void> = {}
    lookup.autocomplete.mockImplementation((q: string) => new Promise((r) => { resolvers[q] = r }))
    lookup.details.mockResolvedValue({ address_line1: '350 5th Avenue', address_line2: null, short_address: null, building_number: '350', street: '5th Avenue', additional_number: null,
      district: 'Manhattan', city: 'New York', province: 'NY', postal_code: '10118', country_code: 'US' })
    renderAt()
    await screen.findByTestId('parties-surface')
    const addr = within(toPanel()).getByLabelText(/^العنوان 1/)
    fireEvent.change(addr, { target: { value: '350 5' } })
    expect(await within(toPanel()).findByText('اختر البلد/الإقليم أولًا لعرض العناوين المقترحة.')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 450))
    expect(lookup.autocomplete).not.toHaveBeenCalled() // never without a country
    pickCountry(1, 'US')
    fireEvent.change(addr, { target: { value: '350 5th' } })
    await waitFor(() => expect(lookup.autocomplete).toHaveBeenCalledTimes(1))
    expect(lookup.autocomplete.mock.calls[0].slice(0, 2)).toEqual(['350 5th', 'US'])
    fireEvent.change(addr, { target: { value: '350 5th Ave' } })
    await waitFor(() => expect(lookup.autocomplete).toHaveBeenCalledTimes(2))
    // the NEWER answer first, then the older one arrives late
    await act(async () => { resolvers['350 5th Ave']([{ id: 'ChIJ_new_place_01', main: '350 5th Ave', secondary: 'New York, NY, USA', short_address: null, address: null, provider: 'google' }]) })
    await act(async () => { resolvers['350 5th']([{ id: 'ChIJ_old_place_01', main: 'OLD RESULT', secondary: '', short_address: null, address: null, provider: 'google' }]) })
    expect(await screen.findByRole('option', { name: /350 5th Ave/ })).toBeTruthy()
    expect(screen.queryByText('OLD RESULT')).toBeNull()
    fireEvent.click(screen.getByRole('option', { name: /350 5th Ave/ }))
    await waitFor(() => expect(lookup.details).toHaveBeenCalledWith('ChIJ_new_place_01', 'US', expect.any(String)))
    const t = within(toPanel())
    await waitFor(() => expect((t.getByLabelText(/^المدينة/) as HTMLInputElement).value).toBe('New York'))
    expect((t.getByLabelText(/^العنوان 1/) as HTMLInputElement).value).toBe('350 5th Avenue')
    expect((t.getByLabelText(/^الولاية/) as HTMLInputElement).value).toBe('NY')
    expect((t.getByLabelText(/^الرمز البريدي/) as HTMLInputElement).value).toBe('10118')
    fireEvent.change(t.getByLabelText(/^العنوان 1/), { target: { value: '350 Fifth Avenue' } })
    expect((t.getByLabelText(/^العنوان 1/) as HTMLInputElement).value).toBe('350 Fifth Avenue')
  })

  it('Address 1 lookup states: no result and provider not configured are explained; the typed address is kept', async () => {
    lookup.autocomplete.mockResolvedValueOnce([])
    renderAt()
    await screen.findByTestId('parties-surface')
    pickCountry(1, 'EG')
    const addr = within(toPanel()).getByLabelText(/^العنوان 1/)
    fireEvent.change(addr, { target: { value: 'Tahrir Square' } })
    expect(await screen.findByText('لم يتم العثور على عنوان مطابق.')).toBeTruthy()
    lookup.autocomplete.mockRejectedValueOnce(new ApiError('not configured', 503, 'ADDRESS_PROVIDER_NOT_CONFIGURED'))
    fireEvent.change(addr, { target: { value: 'Tahrir Square 1' } })
    expect(await screen.findByText(/البحث التلقائي عن العناوين غير مفعّل/)).toBeTruthy()
    expect((addr as HTMLInputElement).value).toBe('Tahrir Square 1')
  })

  it('Saudi Short Address: normalized to upper case, asked only when well-formed; selecting fills the DHL National Address lines, city, region and postal code', async () => {
    lookup.shortAddress.mockResolvedValue([{ id: null, main: '2519 Prince Mohammed Bin Fahd Road', secondary: '7531 Al Faisaliyah Dist, DAMMAM', short_address: 'KUDA2519', provider: 'spl',
      address: { address_line1: '2519 Prince Mohammed Bin Fahd Road', address_line2: '7531 Al Faisaliyah Dist', short_address: 'KUDA2519', building_number: '2519', street: 'Prince Mohammed Bin Fahd Road',
        additional_number: '7531', district: 'Al Faisaliyah Dist', city: 'DAMMAM', province: 'EASTERN PROVINCE', postal_code: '32272', country_code: 'SA' } }])
    renderAt()
    await screen.findByTestId('parties-surface')
    pickCountry(1, 'SA')
    const t = within(toPanel())
    const short = t.getByLabelText(/^العنوان المختصر/) as HTMLInputElement
    fireEvent.change(short, { target: { value: 'kuda' } })
    expect(short.value).toBe('KUDA')
    await new Promise((r) => setTimeout(r, 400))
    expect(lookup.shortAddress).not.toHaveBeenCalled() // obviously incomplete: no provider call
    fireEvent.change(short, { target: { value: 'kuda2519' } })
    expect(short.value).toBe('KUDA2519')
    const option = await screen.findByRole('option', { name: /2519 Prince Mohammed Bin Fahd Road/ })
    expect(lookup.shortAddress).toHaveBeenCalledTimes(1)
    expect(lookup.shortAddress.mock.calls[0][0]).toBe('KUDA2519')
    fireEvent.click(option)
    const v = (l: RegExp) => (t.getByLabelText(l) as HTMLInputElement).value
    expect(v(/^العنوان 1/)).toBe('2519 Prince Mohammed Bin Fahd Road')
    expect(v(/^عنوان 2/)).toBe('7531 Al Faisaliyah Dist')
    expect(v(/^العنوان المختصر/)).toBe('KUDA2519')
    expect(v(/^المدينة/)).toBe('DAMMAM')
    expect(v(/^الولاية/)).toBe('EASTERN PROVINCE')
    expect(v(/^الرمز البريدي/)).toBe('32272')
    expect(v(/^الرمز\*?$/)).toBe('966')
    // a well-formed code without a match → the national-address no-result message; manual entry stays
    lookup.shortAddress.mockResolvedValueOnce([])
    fireEvent.change(short, { target: { value: 'ABCD1234' } })
    expect(await screen.findByText('لم يتم العثور على عنوان وطني مطابق.')).toBeTruthy()
    expect(v(/^العنوان 1/)).toBe('2519 Prince Mohammed Bin Fahd Road')
    // provider failure: explained, nothing cleared
    lookup.shortAddress.mockRejectedValueOnce(new ApiError('down', 502, 'ADDRESS_PROVIDER_ERROR'))
    fireEvent.change(short, { target: { value: 'ABCD1235' } })
    expect(await screen.findByText(/تعذر البحث الآن/)).toBeTruthy()
    expect(v(/^المدينة/)).toBe('DAMMAM')
  })

  it('«مسح العنوان» clears only the address (name, company, e-mail, phones, VAT/Tax ID, EORI stay)', async () => {
    renderAt()
    await screen.findByTestId('parties-surface')
    const f = within(fromPanel())
    fireEvent.change(f.getByLabelText(/^رقم تعريف VAT/), { target: { value: '310000000000003' } })
    fireEvent.click(f.getByRole('button', { name: /مسح العنوان/ }))
    const v = (l: RegExp) => (f.getByLabelText(l) as HTMLInputElement).value
    for (const l of [/^العنوان 1/, /^عنوان 2/, /^العنوان المختصر/, /^الضاحية/, /^المدينة/, /^الولاية/, /^الرمز البريدي/]) expect(v(l)).toBe('')
    expect(v(/^الاسم/)).toBe('Operations Management - SHIPPEC')
    expect(v(/^الشركة/)).toBe('SHIPPEC EXPRESS')
    expect(v(/^عنوان البريد الإلكتروني/)).toBe('info@altakamullog.com')
    expect(v(/^الهاتف/)).toBe('53 729 9636')
    expect(v(/^رقم تعريف VAT/)).toBe('310000000000003')
    expect(v(/^البلد\/الإقليم/)).toMatch(/السعودية/)
  })



  // ═════════ Parties final fixes ═════════
  it('Country: «United States of America» (US, +1) is found by USA / America / أمريكا; American Samoa stays a separate territory', async () => {
    renderAt()
    await screen.findByTestId('parties-surface')
    const box = within(toPanel()).getByLabelText(/^البلد\/الإقليم/) as HTMLInputElement
    for (const q of ['USA', 'U.S.A.', 'America', 'أمريكا', 'الولايات المتحدة', 'united states of america']) {
      fireEvent.focus(box)
      fireEvent.change(box, { target: { value: q } })
      expect([q, listOf(box)[0].textContent]).toEqual([q, expect.stringContaining('الولايات المتحدة الأمريكية')])
      fireEvent.keyDown(box, { key: 'Escape' })
    }
    pickCountry(1, 'USA')
    expect(box.value).toBe('الولايات المتحدة الأمريكية')
    expect((within(toPanel()).getByLabelText(/^الرمز\*?$/) as HTMLInputElement).value).toBe('1')
    pickCountry(1, 'American Samoa')
    expect(box.value).toMatch(/ساموا/)
    expect(box.value).not.toBe('الولايات المتحدة الأمريكية')
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'EN' }))
    pickCountry(1, 'usa')
    expect((within(toPanel()).getByLabelText(/^Country\/Territory/) as HTMLInputElement).value).toBe('United States of America')
  })

  it('US ZIP → City + State: asked only for a complete ZIP (debounced), a choice fills City + State and keeps the ZIP; no result is explained', async () => {
    lookup.postalCode.mockResolvedValue([{ postal_code: '48126', city: 'Dearborn', province: 'MI', province_name: 'Michigan', country_code: 'US', provider: 'google' }])
    renderAt()
    await screen.findByTestId('parties-surface')
    pickCountry(1, 'USA')
    const t = within(toPanel())
    const zip = t.getByLabelText(/^الرمز البريدي/) as HTMLInputElement
    fireEvent.change(t.getByLabelText(/^المدينة/), { target: { value: 'typed city' } })
    fireEvent.change(zip, { target: { value: '4812' } })
    await new Promise((r) => setTimeout(r, 400))
    expect(lookup.postalCode).not.toHaveBeenCalled() // never on every digit
    expect((t.getByLabelText(/^المدينة/) as HTMLInputElement).value).toBe('typed city') // nothing overwritten by typing
    fireEvent.change(zip, { target: { value: '48126' } })
    const opt = await screen.findByRole('option', { name: /DEARBORN, MI 48126/ })
    expect(lookup.postalCode).toHaveBeenCalledTimes(1)
    expect(lookup.postalCode.mock.calls[0].slice(0, 2)).toEqual(['48126', 'US'])
    expect(opt.textContent).toContain('Michigan')
    fireEvent.click(opt)
    expect((t.getByLabelText(/^المدينة/) as HTMLInputElement).value).toBe('Dearborn')
    expect((t.getByLabelText(/^الولاية/) as HTMLInputElement).value).toBe('MI')
    expect(zip.value).toBe('48126')
    expect((t.getByLabelText(/^الرمز\*?$/) as HTMLInputElement).value).toBe('1')
    lookup.postalCode.mockResolvedValueOnce([])
    fireEvent.change(zip, { target: { value: '00000' } })
    expect(await screen.findByText('لم يتم العثور على مدينة مطابقة لهذا الرمز البريدي.')).toBeTruthy()
    expect((t.getByLabelText(/^المدينة/) as HTMLInputElement).value).toBe('Dearborn') // kept
  })

  // ═════════ City autocomplete ═════════
  const cityOpt = (id: string, main: string, secondary: string) => ({ id, main, secondary, short_address: null, address: null, provider: 'google' })
  it('City: no country → no lookup; fewer than 2 characters → no lookup; debounced to one request for the last text, inside the chosen country', async () => {
    renderAt()
    await screen.findByTestId('parties-surface')
    const t = within(toPanel())
    const city = t.getByLabelText(/^المدينة/)
    fireEvent.change(city, { target: { value: 'Dear' } })
    expect(await t.findByText('اختر البلد/الإقليم أولًا لعرض المدن المقترحة.')).toBeTruthy()
    await new Promise((r) => setTimeout(r, 400))
    expect(lookup.cities).not.toHaveBeenCalled() // never without a country
    pickCountry(1, 'USA')
    fireEvent.change(city, { target: { value: 'D' } })
    await new Promise((r) => setTimeout(r, 400))
    expect(lookup.cities).not.toHaveBeenCalled() // 2-character minimum
    for (const v of ['De', 'Dea', 'Dear']) fireEvent.change(city, { target: { value: v } })
    await waitFor(() => expect(lookup.cities).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 400))
    expect(lookup.cities).toHaveBeenCalledTimes(1) // one pause in typing → one request
    expect(lookup.cities.mock.calls[0].slice(0, 2)).toEqual(['Dear', 'US'])
    // Egypt: the request names EG
    pickCountry(1, 'EG')
    fireEvent.change(city, { target: { value: 'Cai' } })
    await waitFor(() => expect(lookup.cities).toHaveBeenCalledTimes(2))
    expect(lookup.cities.mock.calls[1].slice(0, 2)).toEqual(['Cai', 'EG'])
  })

  it('City: «Dearborn / Michigan, United States of America»; selecting fills City + State (MI, shown as Michigan), keeps the country and the postal code; keyboard works; still editable', async () => {
    lookup.cities.mockResolvedValue([cityOpt('ChIJ_dearborn_city01', 'Dearborn', 'MI, USA'), cityOpt('ChIJ_dearborn_hts_01', 'Dearborn Heights', 'MI, USA')])
    lookup.details.mockResolvedValue({ address_line1: null, address_line2: null, short_address: null, building_number: null, street: null, additional_number: null,
      district: null, city: 'Dearborn', province: 'MI', postal_code: null, country_code: 'US' })
    renderAt()
    await screen.findByTestId('parties-surface')
    pickCountry(1, 'USA')
    const t = within(toPanel())
    const v = (l: RegExp) => (t.getByLabelText(l) as HTMLInputElement).value
    fireEvent.change(t.getByLabelText(/^الولاية/), { target: { value: 'CA' } }) // an older state — replaced, never kept
    fireEvent.change(t.getByLabelText(/^الرمز البريدي/), { target: { value: '48126' } })
    const city = t.getByLabelText(/^المدينة/)
    fireEvent.change(city, { target: { value: 'Dear' } })
    const first = await screen.findByRole('option', { name: /^Dearborn ?Michigan, United States of America$/ })
    expect(first.textContent).toBe('DearbornMichigan, United States of America')
    expect(within(document.getElementById(city.getAttribute('aria-controls')!)!).getByTestId('google-attribution')).toBeTruthy()
    fireEvent.keyDown(city, { key: 'ArrowDown' })
    fireEvent.keyDown(city, { key: 'ArrowUp' })
    fireEvent.keyDown(city, { key: 'Enter' })
    await waitFor(() => expect(lookup.details).toHaveBeenCalledWith('ChIJ_dearborn_city01', 'US', lookup.cities.mock.calls[0][2]))
    await waitFor(() => expect(v(/^المدينة/)).toBe('Dearborn'))
    expect(v(/^الولاية/)).toBe('MI')
    expect(t.getByTestId('state-name').textContent).toBe('Michigan')
    expect(v(/^الرمز البريدي/)).toBe('48126') // a city never overwrites the postal code
    expect(v(/^البلد\/الإقليم/)).toBe('الولايات المتحدة الأمريكية')
    expect(v(/^الرمز\*?$/)).toBe('1')
    expect(screen.queryByRole('option', { name: /Dearborn/ })).toBeNull()
    fireEvent.change(t.getByLabelText(/^الولاية/), { target: { value: 'OH' } })
    expect(t.getByTestId('state-name').textContent).toBe('Ohio')
    // Escape closes the list; the text typed stays
    fireEvent.change(city, { target: { value: 'Dearb' } })
    await screen.findByRole('option', { name: /Dearborn Heights/ })
    fireEvent.keyDown(city, { key: 'Escape' })
    expect(screen.queryByRole('option', { name: /Dearborn Heights/ })).toBeNull()
    expect(v(/^المدينة/)).toBe('Dearb')
  })

  it('City: an older slow answer never replaces a newer one; no result / provider failure are explained and manual entry stays', async () => {
    const resolvers: Record<string, (v: unknown) => void> = {}
    lookup.cities.mockImplementation((q: string) => new Promise((r) => { resolvers[q] = r }))
    renderAt()
    await screen.findByTestId('parties-surface')
    pickCountry(1, 'EG')
    const city = within(toPanel()).getByLabelText(/^المدينة/) as HTMLInputElement
    fireEvent.change(city, { target: { value: 'Ca' } })
    await waitFor(() => expect(lookup.cities).toHaveBeenCalledTimes(1))
    fireEvent.change(city, { target: { value: 'Cai' } })
    await waitFor(() => expect(lookup.cities).toHaveBeenCalledTimes(2))
    await act(async () => { resolvers.Cai([cityOpt('ChIJ_cairo_city_001', 'Cairo', 'Cairo Governorate, Egypt')]) })
    await act(async () => { resolvers.Ca([cityOpt('ChIJ_old_city_0001', 'OLD CITY', 'Egypt')]) })
    const opt = await screen.findByRole('option', { name: /Cairo/ })
    expect(opt.textContent).toBe('CairoCairo Governorate, Egypt')
    expect(screen.queryByText('OLD CITY')).toBeNull()
    lookup.cities.mockReset()
    lookup.cities.mockResolvedValueOnce([])
    fireEvent.change(city, { target: { value: 'Zzzz' } })
    expect(await screen.findByText('لم يتم العثور على مدينة مطابقة في هذا البلد.')).toBeTruthy()
    lookup.cities.mockRejectedValueOnce(new ApiError('down', 502, 'ADDRESS_PROVIDER_ERROR'))
    fireEvent.change(city, { target: { value: 'Zzzzy' } })
    expect(await screen.findByText(/تعذر البحث الآن/)).toBeTruthy()
    lookup.cities.mockRejectedValueOnce(new ApiError('not configured', 503, 'ADDRESS_PROVIDER_NOT_CONFIGURED'))
    fireEvent.change(city, { target: { value: 'Giza' } })
    expect(await screen.findByText(/اقتراح المدن غير مفعّل/)).toBeTruthy()
    expect(city.value).toBe('Giza') // typed by hand, kept
  })

  it('Google suggestions carry the «Powered by Google» attribution; SPL ones do not', async () => {
    lookup.autocomplete.mockResolvedValue([{ id: 'ChIJ_osborne_0001', main: '13051 Osborne Street', secondary: 'Dearborn, MI, USA', short_address: null, address: null, provider: 'google' }])
    renderAt()
    await screen.findByTestId('parties-surface')
    pickCountry(1, 'USA')
    fireEvent.change(within(toPanel()).getByLabelText(/^العنوان 1/), { target: { value: '13051 Osborne' } })
    expect(await screen.findByRole('option', { name: /13051 Osborne Street/ })).toBeTruthy()
    expect(screen.getByTestId('google-attribution').textContent).toBe('Powered by Google')
  })

  it('«حفظ في قاعدة البيانات» asks for a saved name (alias, not sent to DHL); only that alias can clash → update existing / choose another name / cancel', async () => {
    const existing = {
      id: 7, role: 'sender', saved_name: 'Omar Khobar', name: 'Omar Receiver', business_contact: false, company: 'Omar Co', country_code: 'SA', country_name: 'Saudi Arabia',
      address_line1: '2121 Test Street', address_line2: '3434 Al Olaya', short_address: null, building_number: '2121', street: 'Test Street', additional_number: '3434', suburb: null,
      city: 'Khobar', province: null, postal_code: '34421', residential: false, email: null, phones: [], phone_normalized: null, vat_tax_id: null, eori: null, notes: null,
      created_by: 2, created_at: '', updated_at: '',
    }
    const { toast } = await import('react-hot-toast')
    renderAt()
    await screen.findByTestId('parties-surface')
    fillReceiverSA()
    fireEvent.click(within(toPanel()).getByRole('button', { name: /حفظ في قاعدة البيانات/ }))
    const dialog = await screen.findByTestId('save-contact-dialog')
    expect(dialog.textContent).toContain('حفظ جهة الاتصال')
    expect(dialog.textContent).toContain('بأي اسم تريد حفظ هذه البيانات؟')
    const nameBox = within(dialog).getByLabelText(/^اسم الحفظ/) as HTMLInputElement
    expect(nameBox.value).toBe('Omar Receiver')
    expect(contacts.create).not.toHaveBeenCalled() // not before «حفظ»
    fireEvent.change(nameBox, { target: { value: ' ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^حفظ$/ }))
    expect(within(dialog).getByText('اسم الحفظ مطلوب.')).toBeTruthy()
    // the alias is taken → conflict choices
    contacts.create.mockRejectedValueOnce(new ApiError('توجد جهة اتصال محفوظة بهذا الاسم بالفعل.', 409, 'CONTACT_NAME_EXISTS', undefined, { success: false, data: { duplicates: [existing] } }))
    fireEvent.change(nameBox, { target: { value: 'Omar Khobar' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^حفظ$/ }))
    await waitFor(() => expect(contacts.create).toHaveBeenCalledWith('receiver', 'Omar Khobar', expect.objectContaining({ name: 'Omar Receiver', company: 'Omar Co' })))
    const conflict = await screen.findByTestId('save-contact-conflict')
    expect(conflict.textContent).toContain('توجد جهة اتصال محفوظة بهذا الاسم بالفعل.')
    // «اختيار اسم آخر» → back to the name, then a new alias saves
    fireEvent.click(within(conflict).getByRole('button', { name: 'اختيار اسم آخر' }))
    contacts.create.mockResolvedValueOnce({ ...existing, id: 8, saved_name: 'Omar Khobar 2' })
    fireEvent.change(within(screen.getByTestId('save-contact-dialog')).getByLabelText(/^اسم الحفظ/), { target: { value: 'Omar Khobar 2' } })
    fireEvent.click(within(screen.getByTestId('save-contact-dialog')).getByRole('button', { name: /^حفظ$/ }))
    await waitFor(() => expect(screen.queryByTestId('save-contact-dialog')).toBeNull())
    expect(toast.success).toHaveBeenCalledWith('تم حفظ جهة الاتصال في قاعدة البيانات بنجاح.')
    expect(within(toPanel()).getByText('من قاعدة البيانات')).toBeTruthy()
    // a manager may update the contact holding the alias; never a silent overwrite
    contacts.create.mockRejectedValueOnce(new ApiError('x', 409, 'CONTACT_NAME_EXISTS', undefined, { success: false, data: { duplicates: [existing] } }))
    contacts.update.mockResolvedValueOnce({ ...existing, role: 'both' })
    fireEvent.click(within(toPanel()).getByRole('button', { name: /حفظ في قاعدة البيانات/ }))
    fireEvent.change(within(await screen.findByTestId('save-contact-dialog')).getByLabelText(/^اسم الحفظ/), { target: { value: 'Omar Khobar' } })
    fireEvent.click(within(screen.getByTestId('save-contact-dialog')).getByRole('button', { name: /^حفظ$/ }))
    fireEvent.click(within(await screen.findByTestId('save-contact-conflict')).getByRole('button', { name: 'تحديث الموجود' }))
    await waitFor(() => expect(contacts.update).toHaveBeenCalledWith(7, 'receiver', 'Omar Khobar', expect.objectContaining({ name: 'Omar Receiver' })))
    // an employee cannot update a contact someone else saved: another name or cancel only
    cleanup()
    auth.role = 'employee'
    contacts.create.mockRejectedValueOnce(new ApiError('x', 409, 'CONTACT_NAME_EXISTS', undefined, { success: false, data: { duplicates: [existing] } }))
    renderAt()
    await screen.findByTestId('parties-surface')
    fillReceiverSA()
    fireEvent.click(within(toPanel()).getByRole('button', { name: /حفظ في قاعدة البيانات/ }))
    fireEvent.click(within(await screen.findByTestId('save-contact-dialog')).getByRole('button', { name: /^حفظ$/ }))
    const c2 = await screen.findByTestId('save-contact-conflict')
    expect(within(c2).queryByRole('button', { name: 'تحديث الموجود' })).toBeNull()
    fireEvent.click(within(c2).getByRole('button', { name: 'إلغاء' }))
    await waitFor(() => expect(screen.queryByTestId('save-contact-dialog')).toBeNull())
  })

  // ═════════ Screen 2 «تفاصيل الشحنة / Shipment Details» ═════════
  const openDetails = async (receiverCountry?: string) => {
    renderAt('/create-shipment?draft=5'); await screen.findByText('عميل الاختبار')
    if (receiverCountry) pickCountry(1, receiverCountry)
    goStep(/تفاصيل الشحنة/)
    return screen.findByTestId('details-step')
  }

  it('Documents: description required (Next blocked), list or free text, value > 0 with an ISO currency, references (first on the label), protection saved but not sent; AR ↔ EN keeps the data', async () => {
    svc.get.mockResolvedValue(shipment({ content_description: null }))
    const step = within(await openDetails())
    expect(step.getByText('تفاصيل الشحنة')).toBeTruthy()
    expect(step.getByText('ماذا تقوم بشحنه؟')).toBeTruthy()
    expect(step.getByRole('radio', { name: /مستندات/ }).getAttribute('aria-checked')).toBe('true')
    expect(step.queryByText('1. وصف البند')).toBeNull() // no customs item form for documents
    expect(screen.getByTestId('prohibited-items-card').textContent).toContain('السعودية') // the receiver's country, not hard-coded
    next()
    expect(await screen.findByText('وصف المحتوى مطلوب.')).toBeTruthy()
    expect(screen.getByTestId('parties-gate-summary')).toBeTruthy()
    // choose from the list
    const desc = screen.getByLabelText(/^اختر وصفًا/) as HTMLInputElement
    fireEvent.focus(desc)
    fireEvent.click(screen.getByRole('option', { name: /مستندات قانونية/ }))
    expect(desc.value).toBe('Legal documents')
    // value + currency
    const value = screen.getByLabelText(/^القيمة/) as HTMLInputElement
    fireEvent.change(value, { target: { value: '0' } })
    expect(await screen.findByText('القيمة رقم أكبر من صفر.')).toBeTruthy()
    fireEvent.change(value, { target: { value: '150' } })
    const cur = screen.getByLabelText(/^العملة/) as HTMLInputElement
    fireEvent.focus(cur)
    fireEvent.change(cur, { target: { value: 'USD' } })
    fireEvent.keyDown(cur, { key: 'Enter' })
    expect(cur.value).toMatch(/^USD — /)
    // references: the first on the label, more kept
    fireEvent.click(screen.getByRole('button', { name: /إضافة مرجع/ }))
    fireEvent.change(screen.getByLabelText(/^المرجع 1/), { target: { value: 'PO-1001' } })
    fireEvent.click(screen.getByRole('button', { name: /إضافة مرجع/ }))
    fireEvent.change(screen.getByLabelText(/^المرجع 2/), { target: { value: 'INTERNAL-7' } })
    fireEvent.click(screen.getByRole('button', { name: 'حذف المرجع 2' }))
    expect(screen.queryByLabelText(/^المرجع 2/)).toBeNull()
    // protection: saved, clearly not sent
    fireEvent.click(screen.getByLabelText(/خدمة المسؤولية الممتدة للمستندات/))
    expect(screen.getByText(/خدمة الحماية\/التأمين لدى DHL غير مربوطة بعد/)).toBeTruthy()
    // English: same data
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'EN' }))
    expect(screen.getByText('Describe the documents in your shipment')).toBeTruthy()
    expect((screen.getByLabelText(/^Select a description/) as HTMLInputElement).value).toBe('Legal documents')
    expect((screen.getByLabelText(/^Value/) as HTMLInputElement).value).toBe('150')
    expect((screen.getByLabelText(/^Reference 1/) as HTMLInputElement).value).toBe('PO-1001')
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'AR' }))
    // saved: first reference = DHL customer reference, the choices in details_extra
    svc.updateDraft.mockResolvedValue(shipment())
    fireEvent.click(screen.getByRole('button', { name: /حفظ المسودة/ }))
    await waitFor(() => expect(svc.updateDraft).toHaveBeenCalled())
    expect(svc.updateDraft.mock.calls[0][1]).toMatchObject({
      content_description: 'Legal documents', customer_reference: 'PO-1001', declared_value: '150', currency: 'USD', customs_required: false,
      details_extra: { references: [{ value: 'PO-1001' }], document_protection: true },
    })
    next()
    expect(await screen.findByText('الطرد 1')).toBeTruthy()
  })

  it('Packages (international): every purpose, explicit DHL reason when needed, item card fields with validation, units, LB, totals, charges and invoice total, insurance; Documents ↔ Packages keeps the data', async () => {
    await openDetails('AE')
    fireEvent.click(await screen.findByRole('radio', { name: /طرود \/ بضائع/ }))
    // purposes: DHL's eight, in Arabic
    const purpose = screen.getByLabelText(/^غرض الشحنة/)
    fireEvent.focus(purpose)
    expect(listOf(purpose).map((o) => o.textContent)).toEqual(['هدية', 'تجاري (بيع)', 'شخصي — ليس للبيع', 'عيّنة', 'إرجاع للإصلاح', 'إرجاع بعد الإصلاح', 'مطالبة', 'إرجاع إلى البائع'])
    fireEvent.click(screen.getByRole('option', { name: 'مطالبة' }))
    expect(screen.getByLabelText(/^سبب التصدير لدى DHL/)).toBeTruthy()
    // Next with an empty item: field errors, blocked
    next()
    expect(await screen.findByText('وصف البند مطلوب.')).toBeTruthy()
    for (const m of ['قيمة البند رقم أكبر من صفر.', 'وزن البند رقم أكبر من صفر.', 'اختر بلد الصنع.', 'رمز HS للتصدير مطلوب.', 'رمز HS للاستيراد مطلوب.', 'اختر سبب التصدير لدى DHL.']) {
      expect(screen.getByText(m)).toBeTruthy()
    }
    fireEvent.change(screen.getByLabelText(/^سبب التصدير لدى DHL/), { target: { value: 'return' } })
    const card = within(document.querySelector('[data-item="0"]') as HTMLElement)
    const d = card.getByLabelText(/^ما هو البند؟/) as HTMLInputElement
    fireEvent.change(d, { target: { value: 'x'.repeat(200) } })
    expect(d.value).toHaveLength(170)
    fireEvent.change(d, { target: { value: 'قميص' } })
    expect(card.getByText('الوصف بالإنجليزية فقط (DHL تقبل الأحرف اللاتينية).')).toBeTruthy()
    fireEvent.change(d, { target: { value: "Men's cotton T-shirt" } })
    fireEvent.change(card.getByLabelText(/^الكمية/), { target: { value: '0' } })
    expect(card.getByText('الكمية رقم صحيح من 1 فأكثر.')).toBeTruthy()
    fireEvent.change(card.getByLabelText(/^الكمية/), { target: { value: '2' } })
    const unit = card.getByLabelText(/^الوحدة/)
    fireEvent.focus(unit)
    fireEvent.click(screen.getByRole('option', { name: /أزواج \(PRS\)/ }))
    fireEvent.change(card.getByLabelText(/^القيمة \(لكل بند\)/), { target: { value: '10' } })
    fireEvent.change(card.getByLabelText(/^الوزن \(لكل بند\)/), { target: { value: '0.5' } })
    expect(card.getByText('1.102 LB')).toBeTruthy()
    const origin = card.getByLabelText(/^أين صُنع البند؟/)
    fireEvent.focus(origin)
    fireEvent.change(origin, { target: { value: 'CN' } })
    fireEvent.keyDown(origin, { key: 'Enter' })
    fireEvent.change(card.getByLabelText(/للتصدير/), { target: { value: '6109.10' } })
    fireEvent.change(card.getByLabelText(/للاستيراد/), { target: { value: '6109.10' } })
    // totals
    const totals = screen.getByTestId('item-totals')
    expect(totals.textContent).toContain('2')
    expect(totals.textContent).toContain('1.000 kg')
    expect(totals.textContent).toContain('2.205 LB')
    expect(totals.textContent).toContain('20.00 SAR')
    // charges → invoice total
    fireEvent.click(screen.getByRole('button', { name: /إضافة رسوم/ }))
    fireEvent.change(screen.getByLabelText('المبلغ'), { target: { value: '25' } })
    expect(screen.getByTestId('invoice-total').textContent).toBe('45.00 SAR')
    expect((screen.getByLabelText(/رسوم وضرائب محسوبة مسبقًا/) as HTMLInputElement).disabled).toBe(true)
    // add / copy / remove items; insurance
    fireEvent.click(card.getByRole('button', { name: 'نسخ البند 1' }))
    expect(screen.getByText('2. وصف البند')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'حذف البند 2' }))
    fireEvent.click(screen.getByLabelText('أرغب في تأمين شحنتي'))
    expect(screen.getByText(/غير مربوطة بعد/)).toBeTruthy()
    // switching to Documents and back keeps everything
    fireEvent.click(screen.getByRole('radio', { name: /مستندات/ }))
    expect(screen.queryByText('1. وصف البند')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /طرود \/ بضائع/ }))
    expect((within(document.querySelector('[data-item="0"]') as HTMLElement).getByLabelText(/^ما هو البند؟/) as HTMLInputElement).value).toBe("Men's cotton T-shirt")
    // the draft: DHL items + purpose; the extras apart
    svc.updateDraft.mockResolvedValue(shipment())
    fireEvent.click(screen.getByRole('button', { name: /حفظ المسودة/ }))
    await waitFor(() => expect(svc.updateDraft).toHaveBeenCalled())
    const sent = svc.updateDraft.mock.calls[0][1]
    expect(sent).toMatchObject({ customs_required: true, shipment_purpose: 'claim', export_reason_type: 'return' })
    expect(sent.items).toEqual([expect.objectContaining({ description: "Men's cotton T-shirt", quantity: '2', unit: 'PRS', unit_value: '10', country_of_origin: 'CN', unit_net_weight_kg: '0.5' })])
    expect(sent.details_extra).toMatchObject({ insurance: true, charges: [{ type: 'freight', amount: 25 }] })
    next()
    expect(await screen.findByText('الفاتورة الجمركية')).toBeTruthy()
  })

  it('Create Description: a deterministic English helper (no AI) fills the item description', async () => {
    await openDetails('AE')
    fireEvent.click(await screen.findByRole('radio', { name: /طرود \/ بضائع/ }))
    fireEvent.click(screen.getByRole('button', { name: /إنشاء وصف/ }))
    const h = within(await screen.findByTestId('description-helper'))
    fireEvent.change(h.getByLabelText(/^ما هو البند؟/), { target: { value: 'T-shirt' } })
    fireEvent.change(h.getByLabelText(/^المادة/), { target: { value: "Men's 100% cotton" } })
    fireEvent.change(h.getByLabelText(/^الاستخدام/), { target: { value: 'personal use' } })
    expect(h.getByTestId('description-preview').textContent).toBe("Men's 100% cotton T-shirt for personal use")
    fireEvent.click(h.getByRole('button', { name: /استخدام الوصف/ }))
    expect((within(document.querySelector('[data-item="0"]') as HTMLElement).getByLabelText(/^ما هو البند؟/) as HTMLInputElement).value).toBe("Men's 100% cotton T-shirt for personal use")
  })

})
