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
    expect(within(card).getByText('نهاية اليوم')).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: /التفاصيل/ }))
    expect(await within(card).findByText('رسوم الوقود')).toBeTruthy()
    expect(within(card).getByText('رسوم الطلب')).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: /التفاصيل/ }))
    expect(within(card).queryByText('رسوم الوقود')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: 'اختيار' }))
    await waitFor(() => expect(svc.selectProduct).toHaveBeenCalledWith(5, 'N'))
    fireEvent.change(screen.getByLabelText(/سعر البيع للعميل/), { target: { value: '100' } })
    expect(screen.getByText('33.82 ر.س')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/سعر البيع للعميل/), { target: { value: '50' } })
    expect(screen.getByText('سعر البيع أقل من تكلفة DHL')).toBeTruthy()
  })

  it('Service (regression, EN): only the products DHL returns (no hard-coded P), badges only from DHL, the exact DHL product code persists; a shipment-changing edit marks the list stale — no selection until «Refresh services and prices»', async () => {
    const products = [
      { productCode: 'U', localProductCode: 'U', productName: 'EXPRESS WORLDWIDE', isCustomerAgreement: false },
      { productCode: '8', localProductCode: '8', productName: 'EXPRESS EASY', isCustomerAgreement: true },
    ]
    const green = { name: 'GOGREEN CLIMATE NEUTRAL', serviceCode: 'EE', typeCode: 'XCH', amount: 1.2, currency: 'SAR', category: 'gogreen', tax: 0, isCustomerAgreement: null }
    const ww = { ...QUOTE, productCode: 'U', localProductCode: 'U', productName: 'EXPRESS WORLDWIDE', amount: 210.5, breakdown: [...QUOTE.breakdown, green] }
    const easy = { ...QUOTE, productCode: '8', localProductCode: '8', productName: 'EXPRESS EASY', amount: 180, isCustomerAgreement: true }
    const fresh = shipment({ available_products: null, rate_quotes: null, product_code: null, local_product_code: null, product_name: null, selling_price: null, dhl_cost: null })
    svc.get.mockResolvedValue(fresh)
    svc.updateDraft.mockResolvedValue(fresh)
    svc.checkProducts.mockResolvedValue({ products })
    svc.checkRates.mockResolvedValue({ quotes: [ww, easy] })
    svc.selectProduct.mockResolvedValue(shipment({ product_code: '8', local_product_code: '8', product_name: 'EXPRESS EASY' }))
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'EN' }))
    goStep(/Service/)
    await waitFor(() => expect(svc.checkProducts).toHaveBeenCalledTimes(1))
    const cardOf = async (name: string) => (await screen.findByText(name)).closest('article') as HTMLElement
    const wwCard = await cardOf('EXPRESS WORLDWIDE')
    const easyCard = await cardOf('EXPRESS EASY')
    // exactly DHL's list: nothing added (no Product P / EXPRESS DOMESTIC that DHL did not return)
    expect(document.querySelectorAll('[data-product]').length).toBe(2)
    expect(document.querySelector('[data-product="P"]')).toBeNull()
    expect(screen.queryByText('EXPRESS DOMESTIC')).toBeNull()
    // badges only where DHL says so: GoGreen from DHL's rate breakdown, the agreement from DHL's product flag
    expect(within(wwCard).getByText('GoGreen')).toBeTruthy()
    expect(within(wwCard).queryByText('DHL customer agreement')).toBeNull()
    expect(within(easyCard).getByText('DHL customer agreement')).toBeTruthy()
    expect(within(easyCard).queryByText('GoGreen')).toBeNull()
    // the selection stores DHL's own code (the Backend checks it against its stored product list)
    fireEvent.click(within(easyCard).getByRole('button', { name: 'Select' }))
    await waitFor(() => expect(svc.selectProduct).toHaveBeenCalledWith(5, '8'))
    // a shipment-changing edit (package weight) → the list is stale: no selection until refreshed
    goStep(/Packages/)
    fireEvent.change(screen.getAllByLabelText(/^Weight \(kg\)/)[0], { target: { value: '2.5' } })
    goStep(/Service/)
    expect(await screen.findByText('The shipment data changed')).toBeTruthy()
    for (const b of within(await cardOf('EXPRESS WORLDWIDE')).getAllByRole('button', { name: /Select/ })) expect((b as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: /Refresh services and prices/ }))
    await waitFor(() => expect(svc.checkProducts).toHaveBeenCalledTimes(2))
    expect(svc.updateDraft).toHaveBeenCalled() // the changed shipment is saved first, then DHL is asked again
    await waitFor(() => expect(screen.queryByText('The shipment data changed')).toBeNull())
  })

  it('Sender time zone & US state (EN): a Saudi sender shows «Sender time zone: Saudi Arabia (UTC+03:00)» read-only — no time-zone input; an older draft stored «Oregon» shows «OR» with «Oregon» and is saved as «OR»; a typed full name becomes the code when the field is left', async () => {
    svc.get.mockResolvedValue(shipment({ receiver_country_code: 'US', receiver_province: 'Oregon', receiver_city: 'Corvallis', receiver_postal_code: '97330', receiver_address_line1: '2464 Northwest Garryanna Street', receiver_address_line2: 'Apt 16', receiver_address_line3: null, is_domestic: false }))
    svc.updateDraft.mockImplementation(async () => shipment())
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'EN' }))
    const to = within(document.querySelector('[data-party="receiver"]') as HTMLElement)
    const state = to.getByLabelText(/^State/) as HTMLInputElement
    expect(state.value).toBe('OR')
    expect(to.getByTestId('state-name').textContent).toBe('Oregon')
    fireEvent.change(state, { target: { value: 'Michigan' } })
    fireEvent.blur(state)
    expect((to.getByLabelText(/^State/) as HTMLInputElement).value).toBe('MI')
    expect(to.getByTestId('state-name').textContent).toBe('Michigan')
    fireEvent.click(screen.getByRole('button', { name: /Save draft/ }))
    await waitFor(() => expect(svc.updateDraft).toHaveBeenCalled())
    const sent = svc.updateDraft.mock.calls[0][1]
    expect(sent.receiver.province).toBe('MI')
    expect(sent.party_details.receiver.province_name).toBe('Michigan')
    expect(sent.origin_gmt_offset).toBeNull()
    goStep(/Service/)
    expect((await screen.findByTestId('sender-time-zone')).textContent).toMatch(/Sender time zone: Saudi Arabia \(UTC\+03:00\)/)
    expect(screen.queryByLabelText(/^Sender time zone/)).toBeNull()
  })

  const freshDraft = () => shipment({ available_products: null, rate_quotes: null, product_code: null, local_product_code: null, product_name: null, selling_price: null, dhl_cost: null })

  it('Service lifecycle (EN): SHIPPEC\'s own rules first — a local problem is shown as such, rates are never asked and nothing is retried; DHL\'s own answer is shown as DHL\'s (never «deleted item»); only a missing draft says so', async () => {
    svc.get.mockResolvedValue(freshDraft())
    svc.checkProducts.mockRejectedValueOnce(new ApiError('أكمل بيانات المسار والطرود قبل الاستعلام من DHL', 422, 'ROUTE_INCOMPLETE', [{ field: 'receiver.provinceCode', message: 'United States: the 2-letter state code is required, e.g. "DE"' }]))
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'EN' }))
    goStep(/Service/)
    const err = await screen.findByTestId('services-error')
    expect(err.getAttribute('data-kind')).toBe('local')
    expect(err.textContent).toMatch(/Correct the shipment data — nothing was sent to DHL/)
    expect(err.textContent).toMatch(/2-letter state code/)
    expect(svc.checkProducts).toHaveBeenCalledTimes(1)
    expect(svc.checkRates).not.toHaveBeenCalled() // rates only after products succeeded
    // DHL answers "no data" (the Backend's 422 DHL_NOT_FOUND): DHL's text, once, no retry
    svc.checkProducts.mockRejectedValueOnce(new ApiError('DHL: 404 Not Found: Product(s) not found', 422, 'DHL_NOT_FOUND'))
    fireEvent.click(screen.getByRole('button', { name: /Show available DHL services/ }))
    await waitFor(() => expect(screen.getByTestId('services-error').getAttribute('data-kind')).toBe('provider'))
    expect(screen.getByTestId('services-error').textContent).toMatch(/DHL's answer.*Product\(s\) not found/)
    expect(screen.queryByText(/العنصر غير موجود/)).toBeNull()
    expect(svc.checkProducts).toHaveBeenCalledTimes(2)
    expect(svc.checkRates).not.toHaveBeenCalled()
    // a draft that really no longer exists
    svc.checkProducts.mockRejectedValueOnce(new ApiError('DHL shipment not found', 404, 'NOT_FOUND'))
    fireEvent.click(screen.getByRole('button', { name: /Show available DHL services/ }))
    await waitFor(() => expect(screen.getByTestId('services-error').textContent).toMatch(/This shipment draft no longer exists\./))
    expect(svc.checkProducts).toHaveBeenCalledTimes(3)
  })

  it('Service lifecycle (AR): a stale list blocks «التالي» and «اختيار»; «تحديث الخدمات والأسعار» saves, asks DHL again and clears the warning and the old error', async () => {
    svc.updateDraft.mockImplementation(async () => shipment())
    svc.checkProducts.mockResolvedValue({ products: PRODUCTS })
    svc.checkRates.mockResolvedValue({ quotes: [QUOTE], quoted_at: '2026-11-25T08:00:00Z' })
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/الطرود/)
    fireEvent.change(screen.getAllByLabelText(/^الوزن/)[0], { target: { value: '2.5' } })
    goStep(/الخدمة/)
    expect(await screen.findByText('تغيّرت بيانات الشحنة')).toBeTruthy()
    for (const b of screen.getAllByRole('button', { name: /^اختيار$|تم الاختيار/ })) expect((b as HTMLButtonElement).disabled).toBe(true)
    next()
    expect(await screen.findByText('تغيّرت بيانات الشحنة — اضغط «تحديث الخدمات والأسعار» قبل المتابعة.')).toBeTruthy()
    expect(screen.getByTestId('service-step')).toBeTruthy() // still on the Service step
    fireEvent.click(screen.getByRole('button', { name: /تحديث الخدمات والأسعار/ }))
    await waitFor(() => expect(svc.checkRates).toHaveBeenCalledTimes(1))
    expect(svc.updateDraft).toHaveBeenCalled()
    expect(svc.updateDraft.mock.invocationCallOrder[0]).toBeLessThan(svc.checkProducts.mock.invocationCallOrder[0])
    expect(svc.checkProducts.mock.invocationCallOrder[0]).toBeLessThan(svc.checkRates.mock.invocationCallOrder[0])
    await waitFor(() => expect(screen.queryByText('تغيّرت بيانات الشحنة')).toBeNull())
    expect(screen.queryByTestId('services-error')).toBeNull()
    next()
    await waitFor(() => expect(screen.queryByTestId('service-step')).toBeNull())
  })

  it('Service lifecycle: an answer for a replaced draft («New») is ignored — it never fills the new shipment; no rates are asked for the old draft', async () => {
    let release!: (v: unknown) => void
    svc.get.mockResolvedValue(freshDraft())
    svc.checkProducts.mockImplementationOnce(() => new Promise((r) => { release = r }))
    svc.checkRates.mockResolvedValue({ quotes: [QUOTE] })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/الخدمة/)
    await waitFor(() => expect(svc.checkProducts).toHaveBeenCalledTimes(1))
    fireEvent.click(screen.getByRole('button', { name: /جديدة/ }))
    release({ products: PRODUCTS })
    await act(async () => { await Promise.resolve() })
    goStep(/الخدمة/)
    expect(document.querySelectorAll('[data-product]').length).toBe(0)
    expect(svc.checkRates).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  /** DHL TEST 2026-11-18 (domestic N), with DHL's lines before tax (basePrice). */
  const NET_QUOTE = {
    ...QUOTE, amount: 75.73, taxTotal: 9.88,
    breakdown: [
      { name: 'EXPRESS DOMESTIC', serviceCode: null, typeCode: null, amount: 57.56, currency: 'SAR', category: 'transportation', tax: 7.51, net: 50.05, isCustomerAgreement: null },
      { name: 'DEMAND SURCHARGE', serviceCode: 'NX', typeCode: 'SCH', amount: 0.69, currency: 'SAR', category: 'demand_surcharge', tax: 0.09, net: 0.6, isCustomerAgreement: null },
      { name: 'FUEL SURCHARGE', serviceCode: 'FF', typeCode: 'SCH', amount: 17.48, currency: 'SAR', category: 'fuel_surcharge', tax: 2.28, net: 15.2, isCustomerAgreement: null },
    ],
    optionalServices: ['SF', 'SD', 'NN', 'II', 'HE', 'CT'].map((serviceCode) => ({ serviceCode, name: serviceCode, serviceTypeCode: 'XCH', isCustomerAgreement: false, isMarketedService: true })),
  }
  const ymdOf = (el: Element) => el.getAttribute('data-date') as string

  it('Service (EN, MyDHL+): «I\'m sending my shipment on» date cards (Today / Tomorrow / weekday, «More +» limited to DHL\'s range); a new date is saved and DHL asked again; the result card shows DHL\'s delivery date, delivered-by, price, product; Details shows the booking cut-off, latest pickup, code and DHL\'s breakdown with VAT and DHL\'s total; the rate time is DHL\'s quote time', async () => {
    svc.get.mockResolvedValue(shipment({ rate_quotes: [NET_QUOTE], rates_checked_at: '2026-11-24T19:04:00Z' }))
    svc.updateDraft.mockImplementation(async (_id: number, c: Record<string, unknown>) => shipment({ shipment_date: c.shipment_date }))
    svc.checkProducts.mockResolvedValue({ products: PRODUCTS })
    svc.checkRates.mockResolvedValue({ quotes: [NET_QUOTE], quoted_at: '2026-11-24T20:10:00Z' })
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'EN' }))
    goStep(/Service/)
    expect(await screen.findByText("I'm sending my shipment on")).toBeTruthy()
    const dates = within(screen.getByRole('radiogroup', { name: "I'm sending my shipment on" })).getAllByRole('radio')
    expect(dates).toHaveLength(7)
    expect(dates[0].textContent).toContain('Today')
    expect(dates[1].textContent).toContain('Tomorrow')
    // «More +»: a calendar limited to the dates DHL accepts (no past date)
    fireEvent.click(screen.getByTestId('ship-date-more'))
    const cal = screen.getByLabelText(/^Shipment date/) as HTMLInputElement
    expect(cal.min).toBe(ymdOf(dates[0]))
    expect(cal.max > ymdOf(dates[6])).toBe(true)
    expect(screen.getByText(/the saved shipment date has passed/i)).toBeTruthy()
    // the card: DHL's estimated delivery 2026-11-22T23:59 → «November 22 · Sunday · End of Day», DHL's total
    const card = (await screen.findByText('EXPRESS DOMESTIC')).closest('article') as HTMLElement
    expect(within(card).getByTestId('delivery-date').textContent).toBe('November 22Sunday')
    expect(within(card).getByTestId('delivered-by').textContent).toBe('End of Day')
    expect(within(card).getByTestId('estimated-price').textContent).toBe('75.73 SAR')
    expect(within(card).getByRole('button', { name: /Selected/ })).toBeTruthy()
    fireEvent.click(within(card).getByRole('button', { name: /Details/ }))
    const details = within(within(card).getByTestId('service-details'))
    expect(details.getByText('Book Shipment By').nextElementSibling?.textContent).toBe('November 19, 17:30')
    expect(details.getByText('Latest Courier Pickup').nextElementSibling?.textContent).toBe('18:30')
    expect(details.getByText('QDDF')).toBeTruthy()
    const rows = [...card.querySelectorAll('[data-charge]')].map((r) => r.textContent)
    expect(rows).toEqual(['Transportation ChargesExpress Domestic50.05 SAR', 'Demand Surcharge0.60 SAR', 'Fuel Surcharge15.20 SAR', 'VAT/Tax9.88 SAR', 'Total75.73 SAR'])
    expect(screen.getByTestId('rate-timestamp').textContent).toMatch(/DHL rate estimate as of .*2026/)
    // another date: saved with that date, then DHL's products and prices for it
    fireEvent.click(dates[1])
    await waitFor(() => expect(svc.updateDraft).toHaveBeenCalledWith(5, expect.objectContaining({ shipment_date: ymdOf(dates[1]) })))
    await waitFor(() => expect(svc.checkProducts).toHaveBeenCalledTimes(1))
    expect(svc.checkRates).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(within(screen.getByRole('radiogroup', { name: "I'm sending my shipment on" })).getAllByRole('radio')[1].getAttribute('aria-checked')).toBe('true'))
    expect(screen.queryByText('The shipment data changed')).toBeNull()
  })

  it('Service (AR): optional services only as DHL lists them for the chosen product («السعر تحسبه DHL» until DHL prices it); ticking one saves it and DHL re-rates; one signature option; GoGreen only from DHL', async () => {
    const withSf = { ...NET_QUOTE, amount: 100.73, optionalServices: NET_QUOTE.optionalServices.filter((s) => s.serviceCode !== 'SF'),
      breakdown: [...NET_QUOTE.breakdown, { name: 'DIRECT SIGNATURE', serviceCode: 'SF', typeCode: 'XCH', amount: 25, currency: 'SAR', category: 'other', tax: 0, net: 25, isCustomerAgreement: false }] }
    svc.get.mockResolvedValue(shipment({ rate_quotes: [NET_QUOTE] }))
    svc.updateDraft.mockImplementation(async (_id: number, c: Record<string, unknown>) => shipment({ service_codes: c.service_codes }))
    svc.checkProducts.mockResolvedValue({ products: PRODUCTS })
    svc.checkRates.mockResolvedValueOnce({ quotes: [withSf], quoted_at: '2026-11-24T20:10:00Z' })
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/الخدمة/)
    const list = within(await screen.findByTestId('optional-services'))
    // DHL listed SF, SD, NN (offered here) and II / HE / CT (need more data or technical — not offered)
    expect([...screen.getByTestId('optional-services').querySelectorAll('[data-service]')].map((e) => e.getAttribute('data-service'))).toEqual(['NN', 'SD', 'SF'])
    expect(list.getByText('توقيع مباشر')).toBeTruthy()
    expect(screen.getByTestId('service-price-SF').textContent).toBe('السعر تحسبه DHL')
    expect(screen.queryByText(/0\.00/)).toBeNull()
    expect(screen.queryByTestId('gogreen-card')).toBeNull()
    fireEvent.click(list.getByRole('checkbox', { name: /توقيع مباشر/ }))
    await waitFor(() => expect(svc.updateDraft).toHaveBeenCalledWith(5, expect.objectContaining({ service_codes: ['SF'] })))
    await waitFor(() => expect(svc.checkRates).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByTestId('service-price-SF').textContent).toBe('رسوم إضافية 25.00 ر.س'))
    expect(((await screen.findByText('EXPRESS DOMESTIC')).closest('article') as HTMLElement).querySelector('[data-testid="estimated-price"]')?.textContent).toBe('100.73 ر.س')
    // adult signature replaces direct signature (one signature option)
    svc.checkRates.mockResolvedValueOnce({ quotes: [NET_QUOTE], quoted_at: '2026-11-24T20:12:00Z' })
    fireEvent.click(within(screen.getByTestId('optional-services')).getByRole('checkbox', { name: /توقيع شخص بالغ/ }))
    await waitFor(() => expect(svc.updateDraft).toHaveBeenLastCalledWith(5, expect.objectContaining({ service_codes: ['SD'] })))
    await waitFor(() => expect(svc.checkRates).toHaveBeenCalledTimes(2))
  })

  it('Service: no optional services when DHL lists none; GoGreen card when DHL\'s quote has GoGreen', async () => {
    const green = { ...NET_QUOTE, optionalServices: [], breakdown: [...NET_QUOTE.breakdown, { name: 'GOGREEN PLUS - CARBON REDUCED', serviceCode: 'FD', typeCode: 'SCH', amount: 3.12, currency: 'SAR', category: 'gogreen', tax: 0, net: 3.12, isCustomerAgreement: true }] }
    svc.get.mockResolvedValue(shipment({ rate_quotes: [green] }))
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/الخدمة/)
    expect(await screen.findByTestId('optional-services-none')).toBeTruthy()
    expect(screen.getByTestId('gogreen-card').textContent).toMatch(/GoGreen Plus — شحن بانبعاثات كربونية أقل.*3\.12 ر\.س/)
  })

  const POINTS = [
    { id: 'DHA014', name: 'DHL Express Service Point', localName: 'DHL SERVICE POINT - Ibn Khaldoun', type: 'STATION', address: { line1: 'IBN Khaldoun street', line2: null, line3: null, city: 'DAMMAM', postalCode: null, country: 'SA' }, distance: '0.13 km', distanceKm: 0.13, shippingCutoff: '17:00:00.000', openingHours: [{ day: 'SUNDAY', open: '09:00', close: '22:00' }], capabilities: { dropOff: true }, limits: { maxPieces: 5, maxShipmentWeightKg: 70, maxPieceWeightKg: 70, pieceSizeCm: [] } },
    { id: 'DHAFZ3', name: 'Collection only', localName: 'Sahel - Fodel - Collection only', type: 'PARTNER', address: { line1: 'x', line2: null, line3: null, city: 'DAMMAM', postalCode: null, country: 'SA' }, distance: '0.58 km', distanceKm: 0.58, shippingCutoff: null, openingHours: [], capabilities: { dropOff: false }, limits: { maxPieces: null, maxShipmentWeightKg: null, maxPieceWeightKg: null, pieceSizeCm: [] } },
  ]
  const pickupRadio = (name: RegExp) => within(screen.getByRole('radiogroup', { name: /هل تريد جدولة استلام الشحنة|Do you want to schedule a courier pickup/ })).getByRole('radio', { name })
  const saved = () => svc.updateDraft.mock.calls[svc.updateDraft.mock.calls.length - 1][1]

  it('Pickup (AR, MyDHL+): «نعم — جدولة استلام / لا / التسليم في نقطة خدمة DHL»; the shipment date with «تعديل» to the Service step; DHL\'s window (09:00–18:30) prefilled and enforced; Reception / Front / Back / Other (+ details, required); the sender address by default; the pickup weight from the packages; courier instructions; what is saved', async () => {
    svc.updateDraft.mockImplementation(async () => shipment())
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/الاستلام/)
    expect(await screen.findByText('هل تريد جدولة استلام الشحنة بواسطة مندوب DHL؟')).toBeTruthy()
    expect(pickupRadio(/^لا/)).toBeTruthy()
    expect(pickupRadio(/التسليم في نقطة خدمة DHL/)).toBeTruthy()
    fireEvent.click(pickupRadio(/نعم — جدولة استلام/))
    // the shipment date of the draft, editable only on the Service step
    const dateBox = within(screen.getByTestId('pickup-date'))
    expect(dateBox.getByText('سأرسل شحنتي في')).toBeTruthy()
    expect(dateBox.getByText('19')).toBeTruthy()
    // DHL's window for the chosen product, both times prefilled from it (visible, changeable)
    const win = within(screen.getByTestId('pickup-window'))
    expect(win.getByText('09:00')).toBeTruthy()
    expect(win.getByText('18:30')).toBeTruthy()
    const earliest = screen.getByLabelText(/^جاهزة للاستلام من/) as HTMLSelectElement
    const latest = screen.getByLabelText(/^آخر وقت للاستلام/) as HTMLSelectElement
    expect([earliest.value, latest.value]).toEqual(['09:00', '18:30'])
    const values = [...earliest.querySelectorAll('option')].map((o) => o.value).filter(Boolean)
    expect([values[0], values[values.length - 1], values.includes('19:00')]).toEqual(['09:00', '18:30', false])
    fireEvent.change(earliest, { target: { value: '12:00' } })
    fireEvent.change(latest, { target: { value: '11:00' } })
    expect(await screen.findByText('آخر وقت يجب أن يكون بعد أبكر وقت.')).toBeTruthy()
    fireEvent.change(latest, { target: { value: '17:00' } })
    expect(screen.queryByText('آخر وقت يجب أن يكون بعد أبكر وقت.')).toBeNull()
    // where the courier picks up: the three named places + Other
    const where = screen.getByLabelText(/^من أين يستلم المندوب الشحنة؟/) as HTMLSelectElement
    expect([...where.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['اختر', 'الاستقبال', 'الواجهة / المدخل الأمامي', 'الخلف / المدخل الخلفي', 'مكان آخر'])
    fireEvent.change(where, { target: { value: 'other' } })
    next()
    expect(await screen.findByText('اكتب تفاصيل مكان الاستلام.')).toBeTruthy()
    expect(screen.getByTestId('pickup-step')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/^تفاصيل مكان الاستلام/), { target: { value: 'Security gate 2' } })
    // the pickup address = the sender address (read-only); the weight from the packages
    const addr = screen.getByTestId('pickup-address').textContent ?? ''
    for (const x of ['Sara Operations', 'Shippec Trading', 'السعودية', '3456, Prince Sultan Road', '7788, Al Olaya', 'ROLA3456', 'Dammam', '31952', '+966551234567']) expect(addr).toContain(x)
    expect(screen.getByTestId('pickup-weight').textContent).toBe('0.4 كغ · 1 طرد')
    fireEvent.change(screen.getByLabelText(/^تعليمات للمندوب/), { target: { value: 'Call on arrival' } })
    fireEvent.click(screen.getByRole('button', { name: /حفظ المسودة/ }))
    await waitFor(() => expect(svc.updateDraft).toHaveBeenCalled())
    expect(saved()).toMatchObject({ pickup_option: 'schedule', pickup_earliest_time: '12:00', pickup_latest_time: '17:00', pickup_location: 'Security gate 2', pickup_instructions: 'Call on arrival', pickup_address: null })
    // «تعديل» → the Service step's date cards
    fireEvent.click(dateBox.getByRole('button', { name: /تعديل/ }))
    expect(await screen.findByTestId('ship-date')).toBeTruthy()
  })

  it('Pickup (EN): Reception / Front / Back are sent as those words; another pickup address never changes From; «No» and drop-off send no pickup; the Shipment Cost Summary shows DHL\'s figures only (no invented chargeable weight)', async () => {
    svc.updateDraft.mockImplementation(async () => shipment())
    svc.servicePoints.mockResolvedValue({ points: POINTS })
    svc.get.mockResolvedValue(shipment({ pickup_option: 'schedule', pickup_earliest_time: '10:00', pickup_latest_time: '17:00', pickup_location: 'Front' }))
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'EN' }))
    goStep(/Pickup/)
    expect(await screen.findByText('Do you want to schedule a courier pickup?')).toBeTruthy()
    expect(pickupRadio(/Yes — Schedule Pickup/).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('Pickup Window — When courier may arrive and shipment is ready')).toBeTruthy()
    const where = screen.getByLabelText(/^Where should the courier pick up the shipment\?/) as HTMLSelectElement
    expect(where.value).toBe('front') // the stored DHL location comes back as its choice
    expect([...where.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Select One', 'Reception', 'Front', 'Back', 'Other'])
    for (const [choice, sent] of [['reception', 'Reception'], ['back', 'Back']]) {
      fireEvent.change(where, { target: { value: choice } })
      expect(screen.queryByLabelText(/^Pickup location details/)).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: /Save draft/ }))
      await waitFor(() => expect(saved()).toMatchObject({ pickup_location: sent }))
    }
    expect((screen.getByLabelText(/^Instructions for the courier/) as HTMLTextAreaElement).placeholder).toBe("Provide other instructions you'd like the courier to receive")
    expect(screen.getByText('Total Pickup Weight')).toBeTruthy()
    // another pickup address (Edit): starts from the sender's, saved separately, From unchanged
    fireEvent.click(within(screen.getByText('Pickup Address').closest('section') as HTMLElement).getByRole('button', { name: /Edit/ }))
    const pa = within(document.querySelector('[data-party="pickup_address"]') as HTMLElement)
    expect((pa.getByLabelText(/^City/) as HTMLInputElement).value).toBe('Dammam')
    fireEvent.change(pa.getByLabelText(/^City/), { target: { value: 'Khobar' } })
    fireEvent.change(pa.getByLabelText(/^Address line 1/), { target: { value: '9 Warehouse Road' } })
    fireEvent.click(screen.getByRole('button', { name: /Save draft/ }))
    await waitFor(() => expect(saved()).toMatchObject({ pickup_address: expect.objectContaining({ city: 'Khobar', address_line1: '9 Warehouse Road' }) }))
    expect(saved().shipper).toMatchObject({ city: 'Dammam', address_line1: '3456, Prince Sultan Road' })
    fireEvent.click(screen.getByRole('button', { name: /Use the sender address/ }))
    // Shipment Cost Summary: DHL's product, weights and charges
    const cs = within(screen.getByTestId('cost-summary'))
    expect(screen.getByText('Shipment Cost Summary')).toBeTruthy()
    expect(cs.getByText('EXPRESS DOMESTIC')).toBeTruthy()
    expect(cs.getByTestId('cs-volumetric').textContent).toBe('0.6 kg')
    expect(cs.getByTestId('cs-total-weight').textContent).toBe('0.4 kg')
    expect(cs.getByTestId('cs-chargeable').textContent).toBe('Not returned by the DHL API')
    expect(screen.getByTestId('cost-summary-charges').querySelector('[data-charge="total"]')?.textContent).toBe('Total (VAT included)66.18 SAR')
    expect(screen.queryByText(/Expected profit/)).toBeNull()
    // «No»: nothing about a pickup is sent
    fireEvent.click(pickupRadio(/^No/))
    fireEvent.click(screen.getByRole('button', { name: /Save draft/ }))
    await waitFor(() => expect(saved()).toMatchObject({ pickup_option: 'none', pickup_earliest_time: null, pickup_latest_time: null, pickup_location: null, pickup_instructions: null, pickup_address: null }))
    // drop-off: a DHL Service Point that accepts drop-off; no pickup
    fireEvent.click(pickupRadio(/Drop off at DHL Service Point/))
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('DHL SERVICE POINT - Ibn Khaldoun')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Not available for drop-off' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Choose this point' }))
    expect(screen.getByRole('button', { name: 'Selected point' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Save draft/ }))
    await waitFor(() => expect(saved()).toMatchObject({ pickup_option: 'drop_off', service_point_id: 'DHA014', pickup_location: null, pickup_earliest_time: null }))
  })

  it('Pickup: with DHL_PROD_PICKUP_ENABLED off the choice stays visible with a clear notice (validation refuses it — nothing is booked)', async () => {
    svc.options.mockResolvedValue({ purposes: [], transport_payers: [], duties_payers: [], pickup_options: [], document_refetch_types: [], features: { paperless_upload: false, pickup_booking: false } })
    renderAt('/create-shipment?draft=5')
    await screen.findByText('عميل الاختبار')
    goStep(/الاستلام/)
    expect((await screen.findByTestId('pickup-gate-off')).textContent).toMatch(/DHL_PROD_PICKUP_ENABLED/)
    expect((pickupRadio(/نعم — جدولة استلام/) as HTMLButtonElement).disabled).toBe(false)
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
    // left over from an earlier address — replaced by the selection, never kept
    fireEvent.change(within(toPanel()).getByLabelText(/^عنوان 2/), { target: { value: 'Old line 2' } })
    fireEvent.change(within(toPanel()).getByLabelText(/^الضاحية/), { target: { value: 'Old suburb' } })
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
    // Place Details closes the same Autocomplete session
    await waitFor(() => expect(lookup.details).toHaveBeenCalledWith('ChIJ_new_place_01', 'US', lookup.autocomplete.mock.calls[1][2]))
    expect(lookup.autocomplete.mock.calls[0][2]).toBe(lookup.autocomplete.mock.calls[1][2])
    const t = within(toPanel())
    await waitFor(() => expect((t.getByLabelText(/^المدينة/) as HTMLInputElement).value).toBe('New York'))
    expect((t.getByLabelText(/^العنوان 1/) as HTMLInputElement).value).toBe('350 5th Avenue')
    expect((t.getByLabelText(/^عنوان 2/) as HTMLInputElement).value).toBe('')
    expect((t.getByLabelText(/^الضاحية/) as HTMLInputElement).value).toBe('Manhattan')
    expect((t.getByLabelText(/^الولاية/) as HTMLInputElement).value).toBe('NY')
    expect(t.getByTestId('state-name').textContent).toBe('New York')
    expect((t.getByLabelText(/^الرمز البريدي/) as HTMLInputElement).value).toBe('10118')
    expect((t.getByLabelText(/^البلد\/الإقليم/) as HTMLInputElement).value).toBe('الولايات المتحدة الأمريكية')
    expect((t.getByLabelText(/^الرمز\*?$/) as HTMLInputElement).value).toBe('1')
    // the next search starts a new session
    fireEvent.change(addr, { target: { value: '1 Main St' } })
    await waitFor(() => expect(lookup.autocomplete).toHaveBeenCalledTimes(3))
    expect(lookup.autocomplete.mock.calls[2][2]).not.toBe(lookup.autocomplete.mock.calls[1][2])
    fireEvent.keyDown(addr, { key: 'Escape' })
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

  const KUDA = { id: null, main: '2519 Prince Mohammed Bin Fahd Road', secondary: '7531 Al Faisaliyah Dist, DAMMAM, EASTERN PROVINCE, 32272, Saudi Arabia', short_address: 'KUDA2519', provider: 'spl',
    address: { address_line1: '2519 Prince Mohammed Bin Fahd Road', address_line2: '7531 Al Faisaliyah Dist', short_address: 'KUDA2519', building_number: '2519', street: 'Prince Mohammed Bin Fahd Road',
      additional_number: '7531', district: 'Al Faisaliyah Dist', city: 'DAMMAM', province: 'EASTERN PROVINCE', province_name: 'EASTERN PROVINCE', postal_code: '32272', country_code: 'SA' } }
  const rfga = (building: string, additional: string) => ({ id: null, main: `${building} King Saud Road`, secondary: '', short_address: 'RFGA4056', provider: 'spl',
    address: { address_line1: `${building} King Saud Road`, address_line2: `${additional} Al Rawdah Dist`, short_address: 'RFGA4056', building_number: building, street: 'King Saud Road',
      additional_number: additional, district: 'Al Rawdah Dist', city: 'KHOBAR', province: 'Eastern Province', province_name: 'Eastern Province', postal_code: '34421', country_code: 'SA' } })

  it('Saudi Short Address: first in the Saudi form; normalized («kuda 2519» → KUDA2519), asked only when complete; one exact result fills the whole National Address at once — nothing stale, +966, still editable', async () => {
    lookup.shortAddress.mockResolvedValue([KUDA])
    renderAt()
    await screen.findByTestId('parties-surface')
    pickCountry(1, 'SA')
    const t = within(toPanel())
    const v = (l: RegExp) => (t.getByLabelText(l) as HTMLInputElement).value
    // order: Short Address, then Address 1
    const labels = Array.from(toPanel().querySelectorAll('label')).map((l) => l.textContent ?? '')
    expect(labels.findIndex((l) => l.startsWith('العنوان المختصر'))).toBeLessThan(labels.findIndex((l) => l.startsWith('العنوان 1')))
    // an earlier, manually typed address — replaced entirely by the SPL answer
    for (const [l, x] of [[/^عنوان 2/, 'old line 2'], [/^المدينة/, 'Riyadh'], [/^الولاية/, 'Riyadh Region'], [/^الرمز البريدي/, '11111'], [/^الضاحية/, 'Old District']] as const) {
      fireEvent.change(t.getByLabelText(l), { target: { value: x } })
    }
    await new Promise((r) => setTimeout(r, 450))
    const googleBefore = lookup.cities.mock.calls.length + lookup.autocomplete.mock.calls.length
    const short = t.getByLabelText(/^العنوان المختصر/) as HTMLInputElement
    fireEvent.change(short, { target: { value: 'kuda' } })
    expect(short.value).toBe('KUDA')
    await new Promise((r) => setTimeout(r, 450))
    expect(lookup.shortAddress).not.toHaveBeenCalled() // incomplete: no SPL call
    fireEvent.change(short, { target: { value: ' kuda 2519 ' } })
    expect(short.value).toBe('KUDA2519')
    await waitFor(() => expect(v(/^العنوان 1/)).toBe('2519 Prince Mohammed Bin Fahd Road'))
    expect(lookup.shortAddress).toHaveBeenCalledTimes(1)
    expect(lookup.shortAddress.mock.calls[0][0]).toBe('KUDA2519')
    expect(v(/^عنوان 2/)).toBe('7531 Al Faisaliyah Dist')
    expect(v(/^العنوان المختصر/)).toBe('KUDA2519')
    expect(v(/^الضاحية/)).toBe('Al Faisaliyah Dist')
    expect(v(/^المدينة/)).toBe('DAMMAM')
    expect(v(/^الولاية/)).toBe('EASTERN PROVINCE')
    expect(v(/^الرمز البريدي/)).toBe('32272')
    expect(v(/^البلد\/الإقليم/)).toMatch(/السعودية/)
    expect(v(/^الرمز\*?$/)).toBe('966')
    expect(t.getByTestId('spl-autofill-note').textContent).toMatch(/تمت تعبئة العنوان الوطني تلقائيًا من العنوان المختصر KUDA2519/)
    expect(screen.queryByRole('option', { name: /KUDA2519/ })).toBeNull() // no needless click
    await new Promise((r) => setTimeout(r, 450))
    expect(lookup.cities.mock.calls.length + lookup.autocomplete.mock.calls.length).toBe(googleBefore) // SPL already gave the city — no Google call
    // still editable; a hand edit ends the «filled automatically» note
    fireEvent.change(t.getByLabelText(/^العنوان 1/), { target: { value: '2519 Prince Mohammed Road' } })
    expect(v(/^العنوان 1/)).toBe('2519 Prince Mohammed Road')
    expect(t.queryByTestId('spl-autofill-note')).toBeNull()
  })

  it('Saudi Short Address: several SPL results → «RFGA4056 / line 1 / Address 2 · city · region · postal code» choices; no result / SPL failure explained, manual entry kept; an older answer never wins', async () => {
    const resolvers: Record<string, (v: unknown) => void> = {}
    lookup.shortAddress.mockImplementation((code: string) => new Promise((r) => { resolvers[code] = r }))
    renderAt()
    await screen.findByTestId('parties-surface')
    pickCountry(1, 'SA')
    const t = within(toPanel())
    const v = (l: RegExp) => (t.getByLabelText(l) as HTMLInputElement).value
    const short = t.getByLabelText(/^العنوان المختصر/) as HTMLInputElement
    fireEvent.change(short, { target: { value: 'KUDA2519' } })
    await waitFor(() => expect(lookup.shortAddress).toHaveBeenCalledTimes(1))
    fireEvent.change(short, { target: { value: 'rfga4056' } })
    await waitFor(() => expect(lookup.shortAddress).toHaveBeenCalledTimes(2))
    await act(async () => { resolvers.RFGA4056([rfga('4056', '8123'), rfga('4058', '8124')]) })
    await act(async () => { resolvers.KUDA2519([KUDA]) }) // late, older
    const opts = await screen.findAllByRole('option', { name: /RFGA4056/ })
    expect(opts.map((o) => o.textContent)).toEqual([
      'RFGA40564056 King Saud Road8123 Al Rawdah Dist · KHOBAR · Eastern Province · 34421',
      'RFGA40564058 King Saud Road8124 Al Rawdah Dist · KHOBAR · Eastern Province · 34421',
    ])
    expect(v(/^العنوان 1/)).toBe('') // never the older KUDA answer, nothing chosen for the person
    fireEvent.click(opts[1])
    expect(v(/^العنوان 1/)).toBe('4058 King Saud Road')
    expect(v(/^عنوان 2/)).toBe('8124 Al Rawdah Dist')
    expect(v(/^المدينة/)).toBe('KHOBAR')
    expect(v(/^الولاية/)).toBe('Eastern Province')
    expect(v(/^الرمز البريدي/)).toBe('34421')
    expect(v(/^العنوان المختصر/)).toBe('RFGA4056')
    lookup.shortAddress.mockReset()
    lookup.shortAddress.mockResolvedValueOnce([])
    fireEvent.change(short, { target: { value: 'ABCD1234' } })
    expect(await screen.findByText('لم يتم العثور على عنوان وطني مطابق.')).toBeTruthy()
    expect(v(/^العنوان 1/)).toBe('4058 King Saud Road') // nothing erased
    lookup.shortAddress.mockRejectedValueOnce(new ApiError('down', 502, 'ADDRESS_PROVIDER_ERROR'))
    fireEvent.change(short, { target: { value: 'ABCD1235' } })
    expect(await screen.findByText('البحث في العنوان الوطني غير متاح مؤقتًا — أدخل العنوان يدويًا.')).toBeTruthy()
    lookup.shortAddress.mockRejectedValueOnce(new ApiError('busy', 503, 'ADDRESS_PROVIDER_BUSY'))
    fireEvent.change(short, { target: { value: 'ABCD1236' } })
    expect(await screen.findByText('البحث في العنوان الوطني غير متاح مؤقتًا — أدخل العنوان يدويًا.')).toBeTruthy()
    expect(v(/^المدينة/)).toBe('KHOBAR')
    fireEvent.change(t.getByLabelText(/^المدينة/), { target: { value: 'Dammam' } })
    expect(v(/^المدينة/)).toBe('Dammam') // manual entry
  })

  it('Saudi Short Address answered by the fallback provider (MyShortAddress): the same autofill — City / Region / Postal Code, SA, +966, editable; null fields stay empty; typed in Address 1 it replaces the old address too', async () => {
    const rcda = { id: null, main: '6608 Anas Ibn Malik Road', secondary: '', short_address: 'RCDA6608', provider: 'myshortaddress',
      address: { address_line1: '6608 Anas Ibn Malik Road', address_line2: '2745 Al Aqiq', short_address: 'RCDA6608', building_number: '6608', street: 'Anas Ibn Malik Road',
        additional_number: '2745', district: 'Al Aqiq', city: 'Riyadh', province: 'Riyadh', province_name: 'Riyadh', postal_code: '13515', country_code: 'SA' } }
    lookup.shortAddress.mockResolvedValue([rcda])
    renderAt()
    await screen.findByTestId('parties-surface')
    pickCountry(1, 'SA')
    const t = within(toPanel())
    const v = (l: RegExp) => (t.getByLabelText(l) as HTMLInputElement).value
    fireEvent.change(t.getByLabelText(/^الرمز البريدي/), { target: { value: '11111' } })
    fireEvent.change(t.getByLabelText(/^العنوان المختصر/), { target: { value: 'rcda 6608' } })
    await waitFor(() => expect(v(/^العنوان 1/)).toBe('6608 Anas Ibn Malik Road'))
    expect(lookup.shortAddress.mock.calls[0][0]).toBe('RCDA6608')
    expect(v(/^عنوان 2/)).toBe('2745 Al Aqiq')
    expect(v(/^المدينة/)).toBe('Riyadh')
    expect(v(/^الولاية/)).toBe('Riyadh')
    expect(v(/^الرمز البريدي/)).toBe('13515')
    expect(v(/^البلد\/الإقليم/)).toMatch(/السعودية/)
    expect(v(/^الرمز\*?$/)).toBe('966')
    expect(t.getByTestId('spl-autofill-note').textContent).toMatch(/تمت تعبئة العنوان الوطني تلقائيًا من العنوان المختصر RCDA6608/)
    expect(t.getByTestId('spl-autofill-note').textContent).not.toMatch(/SPL/)
    fireEvent.change(t.getByLabelText(/^المدينة/), { target: { value: 'Riyadh City' } })
    expect(v(/^المدينة/)).toBe('Riyadh City')
    // the provider sent no postal code / additional number → those stay empty (never invented, never stale)
    lookup.shortAddress.mockResolvedValue([{ ...rcda, short_address: 'RCDA6609', address: { ...rcda.address, short_address: 'RCDA6609', postal_code: null, additional_number: null, address_line2: 'Al Aqiq' } }])
    fireEvent.change(t.getByLabelText(/^العنوان المختصر/), { target: { value: 'RCDA6609' } })
    await waitFor(() => expect(v(/^العنوان المختصر/)).toBe('RCDA6609'))
    await waitFor(() => expect(v(/^الرمز البريدي/)).toBe(''))
    expect(v(/^عنوان 2/)).toBe('Al Aqiq')
    // a short address typed in Address 1 (Backend answers with the fallback) replaces the old address the same way
    lookup.autocomplete.mockResolvedValue([rcda])
    fireEvent.change(t.getByLabelText(/^الرمز البريدي/), { target: { value: '99999' } })
    fireEvent.change(t.getByLabelText(/^العنوان 1/), { target: { value: 'RCDA6608' } })
    fireEvent.click(await screen.findByRole('option', { name: /6608 Anas Ibn Malik Road/ }))
    await waitFor(() => expect(v(/^الرمز البريدي/)).toBe('13515'))
    expect(v(/^العنوان المختصر/)).toBe('RCDA6608')
  })

  it('Saudi Arabia: a Google Address 1 chosen after an SPL short address drops that short address (it is no longer verified) and the SPL note', async () => {
    lookup.shortAddress.mockResolvedValue([KUDA])
    lookup.autocomplete.mockResolvedValue([{ id: 'ChIJ_khobar_place_01', main: '12 King Fahd Road', secondary: 'Khobar, Saudi Arabia', short_address: null, address: null, provider: 'google' }])
    lookup.details.mockResolvedValue({ address_line1: '12 King Fahd Road', address_line2: null, short_address: null, building_number: '12', street: 'King Fahd Road', additional_number: null,
      district: 'Al Ulaya', city: 'Khobar', province: 'Eastern Province', province_name: 'Eastern Province', postal_code: '34447', country_code: 'SA' })
    renderAt()
    await screen.findByTestId('parties-surface')
    pickCountry(1, 'SA')
    const t = within(toPanel())
    const v = (l: RegExp) => (t.getByLabelText(l) as HTMLInputElement).value
    fireEvent.change(t.getByLabelText(/^العنوان المختصر/), { target: { value: 'KUDA2519' } })
    await waitFor(() => expect(t.getByTestId('spl-autofill-note')).toBeTruthy())
    fireEvent.change(t.getByLabelText(/^العنوان 1/), { target: { value: '12 King Fahd' } })
    fireEvent.click(await screen.findByRole('option', { name: /12 King Fahd Road/ }))
    await waitFor(() => expect(v(/^المدينة/)).toBe('Khobar'))
    expect(v(/^العنوان المختصر/)).toBe('')
    expect(v(/^عنوان 2/)).toBe('')
    expect(v(/^الرمز البريدي/)).toBe('34447')
    expect(t.queryByTestId('spl-autofill-note')).toBeNull()
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

  const DEARBORN_ZIP = { postal_code: '48126', city: 'Dearborn', province: 'MI', province_name: 'Michigan', country_code: 'US', provider: 'google' }
  it('US ZIP 48126: asked only for a complete ZIP (debounced); exactly one locality → City + State filled straight away (with a note), ZIP kept; no result / failure explained, manual entry stays', async () => {
    lookup.postalCode.mockResolvedValue([DEARBORN_ZIP])
    renderAt()
    await screen.findByTestId('parties-surface')
    pickCountry(1, 'USA')
    const t = within(toPanel())
    const v = (l: RegExp) => (t.getByLabelText(l) as HTMLInputElement).value
    const zip = t.getByLabelText(/^الرمز البريدي/) as HTMLInputElement
    fireEvent.change(t.getByLabelText(/^المدينة/), { target: { value: 'typed city' } })
    fireEvent.change(zip, { target: { value: '4812' } })
    await new Promise((r) => setTimeout(r, 400))
    expect(lookup.postalCode).not.toHaveBeenCalled() // never on every digit
    expect(v(/^المدينة/)).toBe('typed city') // nothing overwritten by typing
    fireEvent.change(zip, { target: { value: '48126' } })
    await waitFor(() => expect(v(/^المدينة/)).toBe('Dearborn'))
    expect(lookup.postalCode).toHaveBeenCalledTimes(1)
    expect(lookup.postalCode.mock.calls[0].slice(0, 2)).toEqual(['48126', 'US'])
    expect(v(/^الولاية/)).toBe('MI')
    expect(t.getByTestId('state-name').textContent).toBe('Michigan')
    expect(zip.value).toBe('48126')
    expect(v(/^الرمز\*?$/)).toBe('1')
    expect(v(/^البلد\/الإقليم/)).toBe('الولايات المتحدة الأمريكية')
    expect(t.getByTestId('postal-autofill-note').textContent).toMatch(/تمت تعبئة المدينة والولاية تلقائيًا من الرمز البريدي 48126/)
    expect(screen.queryByRole('option', { name: /48126/ })).toBeNull() // no needless click
    // editing the city by hand: the note goes, the value stays the person's
    fireEvent.change(t.getByLabelText(/^المدينة/), { target: { value: 'Dearborn MI' } })
    expect(t.queryByTestId('postal-autofill-note')).toBeNull()
    lookup.postalCode.mockResolvedValueOnce([])
    fireEvent.change(zip, { target: { value: '00000' } })
    expect(await screen.findByText('لم يتم العثور على مدينة مطابقة لهذا الرمز البريدي.')).toBeTruthy()
    expect(v(/^المدينة/)).toBe('Dearborn MI') // kept
    lookup.postalCode.mockRejectedValueOnce(new ApiError('down', 502, 'ADDRESS_PROVIDER_ERROR'))
    fireEvent.change(zip, { target: { value: '00001' } })
    expect(await screen.findByText(/تعذر البحث الآن/)).toBeTruthy()
    fireEvent.change(t.getByLabelText(/^الولاية/), { target: { value: 'NY' } })
    expect(v(/^الولاية/)).toBe('NY')
    expect(zip.value).toBe('00001')
  })

  it('US ZIP with several localities → «48126 / Dearborn · Michigan · United States of America» choices; a choice fills City + State + ZIP; ZIP+4 is asked by its 5 digits and kept', async () => {
    lookup.postalCode.mockResolvedValue([DEARBORN_ZIP, { ...DEARBORN_ZIP, city: 'Dearborn Heights' }])
    renderAt()
    await screen.findByTestId('parties-surface')
    pickCountry(1, 'USA')
    const t = within(toPanel())
    const v = (l: RegExp) => (t.getByLabelText(l) as HTMLInputElement).value
    const zip = t.getByLabelText(/^الرمز البريدي/) as HTMLInputElement
    fireEvent.change(zip, { target: { value: '48126-1234' } })
    const opts = await screen.findAllByRole('option', { name: /^48126/ })
    expect(lookup.postalCode.mock.calls[0].slice(0, 2)).toEqual(['48126', 'US'])
    expect(opts.map((o) => o.textContent)).toEqual(['48126Dearborn · Michigan · United States of America', '48126Dearborn Heights · Michigan · United States of America'])
    expect(v(/^المدينة/)).toBe('') // several → nothing chosen for the person
    fireEvent.keyDown(zip, { key: 'ArrowDown' })
    fireEvent.keyDown(zip, { key: 'Enter' })
    expect(v(/^المدينة/)).toBe('Dearborn Heights')
    expect(v(/^الولاية/)).toBe('MI')
    expect(zip.value).toBe('48126-1234')
    expect(screen.queryByRole('option', { name: /^48126/ })).toBeNull()
    // letters are never typed into a US ZIP; an incomplete ZIP+4 is never sent
    fireEvent.change(zip, { target: { value: '48126-12ab' } })
    expect(zip.value).toBe('48126-12')
    await new Promise((r) => setTimeout(r, 400))
    expect(lookup.postalCode).toHaveBeenCalledTimes(1)
    fireEvent.blur(zip)
    expect(t.getByTestId('postal-format').textContent).toMatch(/48126-1234/)
  })

  it('Postal code outside the US: no lookup is pretended (typed by hand, never sent); a format note never blocks', async () => {
    renderAt()
    await screen.findByTestId('parties-surface')
    pickCountry(1, 'EG')
    const t = within(toPanel())
    const zip = t.getByLabelText(/^الرمز البريدي/) as HTMLInputElement
    fireEvent.change(zip, { target: { value: '11511' } })
    await new Promise((r) => setTimeout(r, 400))
    expect(lookup.postalCode).not.toHaveBeenCalled()
    expect(zip.value).toBe('11511')
    expect(screen.queryByRole('listbox', { name: /المدن المطابقة للرمز البريدي/ })).toBeNull()
    fireEvent.change(zip, { target: { value: '115' } })
    fireEvent.blur(zip)
    expect(t.getByTestId('postal-format').textContent).toBe('صيغة الرمز البريدي: 5 أرقام، مثل 11511')
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
    for (const m of ['قيمة البند رقم أكبر من صفر.', 'وزن البند رقم أكبر من صفر.', 'اختر بلد الصنع.', 'اختر سبب التصدير لدى DHL.']) {
      expect(screen.getByText(m)).toBeTruthy()
    }
    // HS codes are optional: never part of the blocked-Next errors
    expect(screen.queryByText(/رمز HS .*مطلوب/)).toBeNull()
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
    expect(await screen.findByText('تفاصيل الفاتورة الجمركية')).toBeTruthy()
  })

  it('HS codes are optional (AR + EN): no required star, Next works with both blank, a typed code persists, a DHL route-specific «HS required» refusal lands on that item field', async () => {
    const intl = shipment({
      customs_required: true, content_type: 'goods', is_domestic: false, receiver_country_code: 'AE', receiver_city: 'Dubai', receiver_postal_code: null,
      currency: 'SAR', incoterm: 'DAP', shipment_purpose: 'gift', content_description: "Men's cotton T-shirt", dhl_invoice_type: 'proforma',
      items: [{ line_number: 1, description: "Men's cotton T-shirt", quantity: 2, unit: 'PCS', unit_value: '10.000', currency: 'SAR', country_of_origin: 'CN',
        outbound_hs_code: null, inbound_hs_code: null, unit_net_weight_kg: '0.200', unit_gross_weight_kg: null, line_gross_weight_kg: '0.400' }],
    })
    svc.get.mockResolvedValue(intl)
    await openDetails()
    const card = () => within(document.querySelector('[data-item="0"]') as HTMLElement)
    const labelOf = (el: HTMLElement) => (document.querySelector(`label[for="${el.id}"]`) as HTMLElement).textContent ?? ''
    const exp = card().getByLabelText(/^رمز HS للتصدير \/ Schedule B/) as HTMLInputElement
    const imp = card().getByLabelText(/^رمز HS للاستيراد في بلد الوجهة/) as HTMLInputElement
    expect([exp.value, imp.value]).toEqual(['', ''])
    for (const el of [exp, imp]) expect(labelOf(el)).not.toContain('*')
    // Next with both codes blank: allowed (no gate summary, the next step opens)
    next()
    await waitFor(() => expect(screen.queryByTestId('details-step')).toBeNull())
    expect(screen.queryByTestId('parties-gate-summary')).toBeNull()
    // a typed code stays in the draft; the blank one is sent as null (omitted by the Backend), never a placeholder
    goStep(/تفاصيل الشحنة/)
    await screen.findByTestId('details-step')
    fireEvent.change(card().getByLabelText(/^رمز HS للتصدير/), { target: { value: '6109.10' } })
    svc.updateDraft.mockResolvedValue(intl)
    fireEvent.click(screen.getByRole('button', { name: /حفظ المسودة/ }))
    await waitFor(() => expect(svc.updateDraft).toHaveBeenCalled())
    expect(svc.updateDraft.mock.calls[0][1].items[0]).toMatchObject({ outbound_hs_code: '6109.10', inbound_hs_code: null })
    // DHL's validateDataOnly says this route needs the import code of line 1 → shown at that item field
    svc.validate.mockResolvedValue({ ok: false, issues: [{ field: 'items[1].inbound_hs_code', message: '998 : Commodity code is mandatory for this destination' }], warnings: [],
      dhl_validation: { status: 'failed', message: 'x' }, shipment: intl })
    goStep(/المراجعة/)
    await waitFor(() => expect(svc.validate).toHaveBeenCalled())
    goStep(/تفاصيل الشحنة/)
    await screen.findByTestId('details-step')
    expect(card().getByText('DHL تطلب رمز HS لهذا البند على هذا المسار — أدخله قبل الإنشاء (DHL 998)')).toBeTruthy()
    // English: the same labels without a star, DHL's own text, the data unchanged
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'EN' }))
    const expEn = card().getByLabelText(/^Schedule B \/ export HS code/) as HTMLInputElement
    const impEn = card().getByLabelText(/^HS code \(import, destination\)/) as HTMLInputElement
    for (const el of [expEn, impEn]) expect(labelOf(el)).not.toContain('*')
    expect(expEn.value).toBe('6109.10')
    expect(card().getByText('998 : Commodity code is mandatory for this destination')).toBeTruthy()
  })

  const intlDraft = (over: Record<string, unknown> = {}) => shipment({
    customs_required: true, content_type: 'goods', is_domestic: false, receiver_country_code: 'AE', receiver_city: 'Dubai', receiver_postal_code: null,
    currency: 'SAR', incoterm: 'DAP', shipment_purpose: 'gift', content_description: "Men's cotton T-shirt", dhl_invoice_type: null, customs_invoice_number: null,
    items: [{ line_number: 1, description: "Men's cotton T-shirt", quantity: 2, unit: 'PCS', unit_value: '10.000', currency: 'SAR', country_of_origin: 'CN',
      outbound_hs_code: null, inbound_hs_code: null, unit_net_weight_kg: '0.200', unit_gross_weight_kg: null, line_gross_weight_kg: '0.400' }],
    ...over,
  })
  const OPTIONS = (paperless: boolean) => ({ purposes: [], transport_payers: [], duties_payers: [], pickup_options: [], document_refetch_types: [], features: { paperless_upload: paperless },
    declaration_statements: [{ id: 'certificate_of_origin', supported: true }, { id: 'usmca', supported: false }], customs_document_types: ['COO'] })
  const openCustoms = async (draft: ReturnType<typeof shipment>) => {
    svc.get.mockResolvedValue(draft)
    renderAt('/create-shipment?draft=5'); await screen.findByText('عميل الاختبار')
    goStep(/الجمارك/)
    return screen.findByTestId('customs-step')
  }

  it('Customs Invoice (AR): Create Invoice by default; invoice type required (suggested from the purpose, never silent); optional invoice number; remarks; Certificate of Origin; documents; no US filing / USMCA for a Saudi origin; saved in the draft', async () => {
    svc.options.mockResolvedValue(OPTIONS(true))
    const step = within(await openCustoms(intlDraft()))
    expect(step.getByText('تفاصيل الفاتورة الجمركية')).toBeTruthy()
    expect(step.getByRole('radio', { name: /إنشاء فاتورة/ }).getAttribute('aria-checked')).toBe('true')
    expect(step.getByRole('radio', { name: /استخدام فاتورتي الخاصة/ }).getAttribute('aria-checked')).toBe('false')
    // the invoice type is not chosen silently: a suggestion from «هدية» → Proforma, and Next is blocked until chosen
    expect(step.getByRole('radio', { name: /فاتورة مبدئية/ }).getAttribute('aria-checked')).toBe('false')
    expect(step.getByTestId('invoice-type-suggestion').textContent).toMatch(/هدية.*فاتورة مبدئية/)
    next()
    expect(await screen.findByText('اختر نوع الفاتورة التي تُنشئها DHL.')).toBeTruthy()
    expect(screen.getByTestId('customs-step')).toBeTruthy()
    fireEvent.click(step.getByRole('button', { name: 'استخدامها' }))
    expect(step.getByRole('radio', { name: /فاتورة مبدئية/ }).getAttribute('aria-checked')).toBe('true')
    // the invoice number: hidden until «أرغب في إضافة رقم فاتورة»; then required for Next
    expect(step.queryByLabelText(/^رقم الفاتورة/)).toBeNull()
    fireEvent.click(step.getByLabelText('أرغب في إضافة رقم فاتورة'))
    next()
    expect(await screen.findByText('أدخل رقم الفاتورة أو ألغِ الخيار.')).toBeTruthy()
    fireEvent.change(step.getByLabelText(/^رقم الفاتورة/), { target: { value: 'INV-2026-77' } })
    fireEvent.change(step.getByLabelText(/^معلومات إضافية على الفاتورة/), { target: { value: 'Goods for exhibition\nReturn within 30 days' } })
    // declarations: Certificate of Origin with the exact printed text; no NAFTA / USMCA, no US export filing on SA → AE
    expect(step.getByTestId('declaration-certificate_of_origin').textContent).toContain('We hereby certify that the goods described in this invoice are of China origin.')
    expect(step.queryByTestId('declaration-usmca')).toBeNull()
    expect(step.queryByText(/NAFTA/)).toBeNull()
    expect(step.queryByTestId('us-export-filing')).toBeNull()
    expect(step.queryByText(/30\.37/)).toBeNull()
    fireEvent.click(within(step.getByTestId('declaration-certificate_of_origin')).getByRole('checkbox'))
    // additional parties: «No», «Yes» unavailable (not wired)
    const parties = within(step.getByTestId('additional-parties'))
    expect((parties.getByRole('radio', { name: 'نعم' }) as HTMLInputElement).disabled).toBe(true)
    expect((parties.getByRole('radio', { name: 'لا' }) as HTMLInputElement).checked).toBe(true)
    // additional customs documents
    fireEvent.click(step.getByRole('button', { name: /إضافة مستند آخر/ }))
    const doc = within(step.getByTestId('customs-documents').querySelector('[data-document="0"]') as HTMLElement)
    fireEvent.change(doc.getByLabelText('نوع المستند'), { target: { value: 'COO' } })
    fireEvent.change(doc.getByLabelText('رقم المستند'), { target: { value: 'COO-2026-118' } })
    // Paperless (the server may upload): selectable
    const wy = within(step.getByTestId('paperless-box')).getByRole('checkbox') as HTMLInputElement
    await waitFor(() => expect(wy.disabled).toBe(false))
    fireEvent.click(wy)
    // summary from Details / Packages (read only)
    expect(step.getByTestId('customs-summary').textContent).toContain('20.00 SAR')
    // saved: what DHL receives
    svc.updateDraft.mockResolvedValue(intlDraft())
    fireEvent.click(screen.getByRole('button', { name: /حفظ المسودة/ }))
    await waitFor(() => expect(svc.updateDraft).toHaveBeenCalled())
    expect(svc.updateDraft.mock.calls[0][1]).toMatchObject({
      dhl_invoice_type: 'proforma', customs_invoice_number: 'INV-2026-77', invoice_remarks: ['Goods for exhibition', 'Return within 30 days'],
      declaration_statements: ['certificate_of_origin'], customs_documents: [{ type_code: 'COO', value: 'COO-2026-118' }], paperless_trade: true, service_codes: ['WY'],
      details_extra: expect.objectContaining({ customs_invoice_mode: 'create' }),
    })
    next()
    await waitFor(() => expect(screen.queryByTestId('customs-step')).toBeNull())
  })

  it('Customs Invoice: Paperless follows the server switch (unavailable → cannot be chosen, never pretended); Use My Own Invoice (EN) asks «My Invoice Number» and drops DHL-invoice fields; AR ↔ EN keeps the data', async () => {
    svc.options.mockResolvedValue(OPTIONS(false))
    const step = within(await openCustoms(intlDraft({ dhl_invoice_type: 'commercial' })))
    const wy = within(step.getByTestId('paperless-box')).getByRole('checkbox') as HTMLInputElement
    await waitFor(() => expect(step.getByTestId('paperless-unavailable').textContent).toMatch(/غير مفعّل على هذا الخادم/))
    expect(wy.disabled).toBe(true)
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'EN' }))
    expect(step.getByText('Customs Invoice Details')).toBeTruthy()
    expect(step.getByText(/use your own customs invoice/)).toBeTruthy()
    fireEvent.change(step.getByLabelText(/^Additional Invoice Information/), { target: { value: 'Keep dry' } })
    fireEvent.click(step.getByRole('radio', { name: /Use My Own Invoice/ }))
    expect(step.queryByTestId('create-invoice')).toBeNull()
    expect(step.queryByLabelText(/^Additional Invoice Information/)).toBeNull()
    expect(step.queryByTestId('declaration-statements')).toBeNull()
    expect(step.getByText('Additional Parties')).toBeTruthy()
    expect(step.getByRole('button', { name: /Add Another/ })).toBeTruthy()
    fireEvent.change(step.getByLabelText(/^My Invoice Number/), { target: { value: 'ACME-5501' } })
    // back to Arabic and back to Create Invoice: what was typed is still there
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'AR' }))
    expect((step.getByLabelText(/^رقم فاتورتي/) as HTMLInputElement).value).toBe('ACME-5501')
    svc.updateDraft.mockResolvedValue(intlDraft())
    fireEvent.click(screen.getByRole('button', { name: /حفظ المسودة/ }))
    await waitFor(() => expect(svc.updateDraft).toHaveBeenCalled())
    expect(svc.updateDraft.mock.calls[0][1]).toMatchObject({
      customs_invoice_number: 'ACME-5501', dhl_invoice_type: null, paperless_trade: false, invoice_remarks: [], declaration_statements: [],
      details_extra: expect.objectContaining({ customs_invoice_mode: 'own' }),
    })
    fireEvent.click(step.getByRole('radio', { name: /إنشاء فاتورة/ }))
    expect((step.getByLabelText(/^معلومات إضافية على الفاتورة/) as HTMLTextAreaElement).value).toBe('Keep dry')
  })

  it('Customs Invoice: a US-origin shipment shows Electronic Export Filing (not wired, says so); a US → CA route lists NAFTA / USMCA as unavailable; a reloaded draft shows its stored choices', async () => {
    svc.options.mockResolvedValue(OPTIONS(true))
    const us = intlDraft({
      shipper_country_code: 'US', shipper_city: 'Newark', shipper_postal_code: '19711', shipper_province: 'DE', shipper_address_line1: '742 Test Lane', shipper_address_line2: null,
      shipper_address_line3: null, shipper_phone: '+13025550100', receiver_country_code: 'CA', receiver_city: 'Toronto', receiver_postal_code: 'M5V 2T6',
      customs_invoice_number: 'INV-9', dhl_invoice_type: 'commercial', invoice_remarks: ['Line A'], declaration_statements: ['certificate_of_origin'],
      customs_documents: [{ type_code: 'EXL', value: 'EL-4471' }], shipment_details_extra: { customs_invoice_mode: 'create' },
    })
    const step = within(await openCustoms(us))
    expect(step.getByTestId('us-export-filing').textContent).toMatch(/30\.37\(a\).*غير مربوط/)
    const usmca = within(step.getByTestId('declaration-usmca')).getByRole('checkbox') as HTMLInputElement
    expect(usmca.disabled).toBe(true)
    expect(usmca.checked).toBe(false)
    // reloaded: Create Invoice, number shown, remarks, statement, document
    expect((step.getByLabelText('أرغب في إضافة رقم فاتورة') as HTMLInputElement).checked).toBe(true)
    expect((step.getByLabelText(/^رقم الفاتورة/) as HTMLInputElement).value).toBe('INV-9')
    expect((step.getByLabelText(/^معلومات إضافية على الفاتورة/) as HTMLTextAreaElement).value).toBe('Line A')
    expect((within(step.getByTestId('declaration-certificate_of_origin')).getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
    expect((within(step.getByTestId('customs-documents')).getByLabelText('رقم المستند') as HTMLInputElement).value).toBe('EL-4471')
  })

  const openPayment = async (draft: ReturnType<typeof shipment>) => {
    svc.get.mockResolvedValue(draft)
    svc.options.mockResolvedValue({ ...OPTIONS(true), payment: { shipper_account_masked: '*****2611' } })
    renderAt('/create-shipment?draft=5'); await screen.findByText('عميل الاختبار')
    goStep(/الدفع/)
    return screen.findByTestId('payment-step')
  }

  it('Payment (AR): «كيف ستدفع؟» — SHIPPEC account shown masked; receiver / third-party transport account required for Next and never carried over; duties payer separate; DAP / DDP set visibly; an incompatible Incoterm is explained, not silently changed; review masks the accounts', async () => {
    const step = within(await openPayment(intlDraft({ dhl_invoice_type: 'commercial' })))
    expect(step.getByText('كيف ستدفع؟')).toBeTruthy()
    expect(within(step.getByTestId('transport-payer')).getByRole('radio', { name: /SHIPPEC \/ حساب المرسل/ }).getAttribute('aria-checked')).toBe('true')
    await waitFor(() => expect(within(step.getByTestId('transport-payer')).getByRole('radio', { name: /SHIPPEC/ }).textContent).toContain('*****2611'))
    expect(document.body.textContent).not.toMatch(/460112611/)
    // receiver pays transport → «رقم حساب DHL للمستلم», required for Next, digits only
    fireEvent.click(within(step.getByTestId('transport-payer')).getByRole('radio', { name: /حساب DHL للمستلم/ }))
    next()
    expect(await screen.findByText('رقم حساب DHL للمستلم مطلوب.')).toBeTruthy()
    expect(screen.getByTestId('payment-step')).toBeTruthy()
    const recv = step.getByLabelText(/^رقم حساب DHL للمستلم/) as HTMLInputElement
    fireEvent.change(recv, { target: { value: '12-34 56ab789' } })
    expect(recv.value).toBe('123456789')
    // switching to a third party never re-uses the receiver's number
    fireEvent.click(within(step.getByTestId('transport-payer')).getByRole('radio', { name: /حساب DHL لطرف ثالث/ }))
    expect((step.getByLabelText(/^رقم حساب DHL للطرف الثالث/) as HTMLInputElement).value).toBe('')
    fireEvent.change(step.getByLabelText(/^رقم حساب DHL للطرف الثالث/), { target: { value: '123456789' } })
    // duties: SHIPPEC → DDP set with its reason; back to the receiver → DAP
    const duties = within(step.getByTestId('duties-payer'))
    const inco = () => (step.getByLabelText(/^Incoterm/) as HTMLSelectElement).value
    expect(inco()).toBe('DAP')
    fireEvent.click(duties.getByRole('radio', { name: /SHIPPEC \/ حساب المرسل/ }))
    expect(inco()).toBe('DDP')
    expect(step.getByTestId('incoterm-auto').textContent).toMatch(/DDP لأن SHIPPEC يدفع الرسوم/)
    fireEvent.click(duties.getByRole('radio', { name: /المستلم سيدفع/ }))
    expect(inco()).toBe('DAP')
    // a manual incompatible choice: kept, explained, one click to fix
    await waitFor(() => expect(step.getByLabelText(/^Incoterm/).querySelectorAll('option').length).toBe(2))
    fireEvent.change(step.getByLabelText(/^Incoterm/), { target: { value: 'DDP' } })
    expect(inco()).toBe('DDP')
    expect(step.getByTestId('incoterm-warning').textContent).toMatch(/مع «المستلم سيدفع» لا يُستخدم DDP عادةً/)
    fireEvent.click(within(step.getByTestId('incoterm-warning')).getByRole('button', { name: /استخدام DAP/ }))
    expect(inco()).toBe('DAP')
    expect(step.queryByTestId('incoterm-warning')).toBeNull()
    // duties by a third party: its own account field (not the transport one), required
    fireEvent.click(duties.getByRole('radio', { name: /حساب DHL لطرف ثالث/ }))
    expect(inco()).toBe('DDP')
    next()
    expect(await screen.findByText(/^رقم حساب DHL للطرف الثالث مطلوب\./)).toBeTruthy()
    fireEvent.change(step.getByLabelText(/^رقم حساب DHL للطرف الثالث \(الرسوم والضرائب\)/), { target: { value: '555555555' } })
    // saved: separate accounts as DHL receives them
    svc.updateDraft.mockResolvedValue(intlDraft({ dhl_invoice_type: 'commercial' }))
    fireEvent.click(screen.getByRole('button', { name: /حفظ المسودة/ }))
    await waitFor(() => expect(svc.updateDraft).toHaveBeenCalled())
    expect(svc.updateDraft.mock.calls[0][1]).toMatchObject({ transport_payer: 'third_party', transport_payer_account: '123456789', duties_payer: 'third_party', duties_payer_account: '555555555', incoterm: 'DDP' })
    next()
    await waitFor(() => expect(screen.queryByTestId('payment-step')).toBeNull())
    // the payers changed → DHL's quote is stale: the way to the review stops at the Service step until it is refreshed
    goStep(/المراجعة/)
    expect(await screen.findByText('تغيّرت بيانات الشحنة — اضغط «تحديث الخدمات والأسعار» قبل المتابعة.')).toBeTruthy()
    expect(svc.validate).not.toHaveBeenCalled()
    svc.checkProducts.mockResolvedValue({ products: PRODUCTS })
    svc.checkRates.mockResolvedValue({ quotes: [QUOTE] })
    fireEvent.click(screen.getByRole('button', { name: /تحديث الخدمات والأسعار/ }))
    await waitFor(() => expect(svc.checkRates).toHaveBeenCalled())
    await waitFor(() => expect(screen.queryByText('تغيّرت بيانات الشحنة')).toBeNull())
    // the review shows the payers with masked accounts only
    goStep(/المراجعة/)
    await waitFor(() => expect(svc.validate).toHaveBeenCalled())
    expect(await screen.findByText(/طرف ثالث · \*{5}6789/)).toBeTruthy()
    expect(screen.getByText(/طرف ثالث · \*{5}5555/)).toBeTruthy()
    expect(screen.queryByText(/123456789|555555555/)).toBeNull()
  })

  it('Payment (EN): MyDHL wording, DDP advice for a third-party duties payer on DAP; a reloaded draft keeps its payers and accounts; documents have no duties question', async () => {
    const step = within(await openPayment(intlDraft({ dhl_invoice_type: 'commercial', transport_payer: 'receiver', transport_payer_account: '123456789', duties_payer: 'third_party', duties_payer_account: '555555555', incoterm: 'DAP' })))
    fireEvent.click(within(screen.getByTestId('cs-lang-toggle')).getByRole('radio', { name: 'EN' }))
    expect(step.getByText('How will you pay?')).toBeTruthy()
    expect(step.getByText('How will you pay for transportation charges?')).toBeTruthy()
    expect(step.getAllByText('How will duties and taxes be paid?').length).toBeGreaterThan(0)
    expect(step.getByText('Terms of trade (Incoterm)')).toBeTruthy()
    expect(within(step.getByTestId('duties-payer')).getByRole('radio', { name: /Receiver will pay/ })).toBeTruthy()
    // reloaded: the stored payers and accounts
    expect(within(step.getByTestId('transport-payer')).getByRole('radio', { name: /Receiver DHL Account/ }).getAttribute('aria-checked')).toBe('true')
    expect((step.getByLabelText(/^Receiver DHL Account Number/) as HTMLInputElement).value).toBe('123456789')
    expect((step.getByLabelText(/^Third Party DHL Account Number \(duties/) as HTMLInputElement).value).toBe('555555555')
    // stored DAP with a third party paying duties: explained (the server decides), not silently changed
    expect(step.getByTestId('incoterm-warning').textContent).toContain('This payment selection normally requires DDP.')
    expect((step.getByLabelText(/^Incoterm/) as HTMLSelectElement).value).toBe('DAP')
  })

  it('Payment: documents shipments have no duties question and no Incoterm', async () => {
    const step = within(await openPayment(shipment()))
    expect(step.queryByTestId('duties-payer')).toBeNull()
    expect(step.queryByLabelText(/^Incoterm/)).toBeNull()
    expect(step.getByText(/لا رسوم جمركية على هذه الشحنة/)).toBeTruthy()
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
