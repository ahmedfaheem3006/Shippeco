import { expect, test, type Page, type Route } from '@playwright/test'

/**
 * Phase 3D critical flows: «إنشاء شحنة» (resume a draft → every step → review →
 * ONE create after explicit confirmation → success / uncertain) and
 * «متابعة البوليصة» (list → direct AWB search → details timeline).
 * Every request to the API is answered here; nothing reaches a real server or DHL.
 * Screenshots go to PW_SHOTS_DIR when set (outside the repo).
 */

const SHOTS = process.env.PW_SHOTS_DIR
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

const QUOTE = {
  productCode: 'P', localProductCode: 'P', productName: 'EXPRESS WORLDWIDE', isCustomerAgreement: false, amount: 182.4, currency: 'SAR', currencyType: 'BILLC', taxTotal: 0,
  estimatedDelivery: '2026-11-24T23:59:00', totalTransitDays: 2,
  breakdown: [
    { name: 'EXPRESS WORLDWIDE', serviceCode: null, typeCode: null, amount: 138.2, currency: 'SAR', category: 'transportation', tax: 0, isCustomerAgreement: null },
    { name: 'PAPERLESS TRADE', serviceCode: 'WY', typeCode: 'SPL', amount: 0, currency: 'SAR', category: 'optional_service', tax: 0, isCustomerAgreement: null },
    { name: 'FUEL SURCHARGE', serviceCode: 'FF', typeCode: 'SCH', amount: 41.86, currency: 'SAR', category: 'fuel_surcharge', tax: 0, isCustomerAgreement: null },
    { name: 'DEMAND SURCHARGE', serviceCode: 'NX', typeCode: 'SCH', amount: 2.34, currency: 'SAR', category: 'demand_surcharge', tax: 0, isCustomerAgreement: null },
  ],
  weight: { volumetric: 0.6, provided: 1.2, unit: 'metric' }, optionalServices: [{ serviceCode: 'II', name: 'SHIPMENT INSURANCE', serviceTypeCode: 'XCH', isCustomerAgreement: false }],
  pickupCapabilities: { nextBusinessDay: false, localCutoffDateAndTime: '2026-11-22T17:30:00', pickupEarliest: '09:00:00', pickupLatest: '18:30:00', pickupCutoffSameDayOutboundProcessing: '18:30:00', pickupAdditionalDays: 0, originServiceAreaCode: 'DHA' },
  deliveryCapabilities: { deliveryTypeCode: 'QDDC', estimatedDeliveryDateAndTime: '2026-11-24T23:59:00', totalTransitDays: 2, deliveryAdditionalDays: 0, destinationServiceAreaCode: 'DXB' },
}
const QUOTE_8 = { ...QUOTE, productCode: '8', localProductCode: '8', productName: 'EXPRESS EASY', isCustomerAgreement: true, amount: 151.1, totalTransitDays: 3, estimatedDelivery: '2026-11-25T23:59:00' }
const PRODUCTS = [
  { productCode: 'P', localProductCode: 'P', productName: 'EXPRESS WORLDWIDE', isCustomerAgreement: false, pickupCapabilities: QUOTE.pickupCapabilities },
  { productCode: '8', localProductCode: '8', productName: 'EXPRESS EASY', isCustomerAgreement: true, pickupCapabilities: QUOTE.pickupCapabilities },
]

const shipment = (over: Record<string, unknown> = {}) => ({
  id: 5, dhl_env: 'test', status: 'draft', creation_status: 'draft', shippec_reference: 'SHIPPEC-7Q2K9D', idempotency_key: 'auto:x', awb: null, client_id: 3, client_name: 'مؤسسة الخليج للتجارة',
  customer_reference: 'PO-1182', product_code: 'P', local_product_code: 'P', product_name: 'EXPRESS WORLDWIDE', service_codes: ['WY'], customs_required: true, paperless_trade: true,
  content_description: 'Cotton T-shirts and scarves', incoterm: 'DAP', currency: 'SAR', declared_value: '640', export_reason_type: 'gift', shipment_type: 'personal',
  customs_invoice_number: 'INV-2026-118', customs_invoice_date: '2026-11-18', dhl_invoice_type: 'commercial', shipment_date: '2026-11-22', origin_gmt_offset: null, shipment_purpose: 'gift',
  transport_payer: 'shipper', transport_payer_account: null, duties_payer: 'receiver', duties_payer_account: null, pickup_option: 'schedule',
  pickup_earliest_time: '10:00', pickup_latest_time: '16:00', pickup_location: 'reception', pickup_location_type: 'business', pickup_instructions: 'Call on arrival', pickup_address: null,
  service_point_id: null, service_point_name: null, package_count: 2, total_gross_weight: '1.200', validation_issues: [], validation_warnings: [],
  dhl_validation_status: 'not_run', available_products: PRODUCTS, rate_quotes: [QUOTE, QUOTE_8], dhl_cost: '182.40', dhl_cost_source: 'dhl_quote', selling_price: '250.00', price_currency: 'SAR',
  invoice_id: null, invoice_link_status: 'none', invoice_link_error: null, creation_error_code: null, creation_error_message: null, message_reference: null, uncertain_since: null,
  pickup_id: null, plt_status: 'not_required', tracking_id: null, is_domestic: false, content_type: 'goods', created_at: '2026-11-18T10:00:00Z', updated_at: '2026-11-18T10:00:00Z',
  shipper_company: 'Shippec Trading', shipper_contact: 'Sara Operations', shipper_phone: '+966551234567', shipper_email: 'ops@shippec.invalid', shipper_address_line1: '3456, Prince Sultan Road',
  shipper_address_line2: '7788, Al Olaya', shipper_address_line3: 'ROLA3456', shipper_city: 'Dammam', shipper_postal_code: '31952', shipper_province: null, shipper_country_code: 'SA', shipper_type: 'business',
  receiver_company: 'Gulf Retail Trading LLC', receiver_contact: 'Omar Haddad', receiver_phone: '+971501234567', receiver_email: null, receiver_address_line1: 'Office 1204, Bay Square 7',
  receiver_address_line2: 'Business Bay', receiver_address_line3: null, receiver_city: 'Dubai', receiver_postal_code: '00000', receiver_province: null, receiver_country_code: 'AE', receiver_type: 'business',
  packages: [
    { sequence: 1, weight_kg: '0.600', length_cm: '30.00', width_cm: '20.00', height_cm: '10.00', customer_reference: null, dhl_piece_id: null },
    { sequence: 2, weight_kg: '0.600', length_cm: '30.00', width_cm: '20.00', height_cm: '10.00', customer_reference: null, dhl_piece_id: null },
  ],
  items: [
    { description: 'Cotton T-shirt', quantity: 20, unit: 'PCS', unit_value: '22.000', country_of_origin: 'SA', outbound_hs_code: '6109.10', inbound_hs_code: '6109.10', unit_net_weight_kg: '0.020', line_gross_weight_kg: '0.500' },
    { description: 'Wool scarf', quantity: 6, unit: 'PCS', unit_value: '33.333', country_of_origin: 'TR', outbound_hs_code: '6117.10', inbound_hs_code: '6117.10', unit_net_weight_kg: '0.100', line_gross_weight_kg: '0.700' },
  ],
  documents: [],
  ...over,
})
const created = (over: Record<string, unknown> = {}) => ({
  outcome: 'created', replayed: false, message: 'ok', awb: '4614961175', shippec_reference: 'SHIPPEC-7Q2K9D', message_reference: 'ref-1', creation_error: null,
  invoice: { id: 91, number: 'DH2601', link_status: 'linked', error: null },
  documents: [
    { id: 1, document_type: 'shipping_label', content_type: 'application/pdf', size_bytes: 41000, sha256: 'x' },
    { id: 2, document_type: 'waybill', content_type: 'application/pdf', size_bytes: 38000, sha256: 'y' },
    { id: 3, document_type: 'commercial_invoice', content_type: 'application/pdf', size_bytes: 52000, sha256: 'z' },
  ],
  documents_failed: 0, tracking_id: 4,
  pickup: { id: 7, status: 'booked', dispatch_confirmation_number: 'CBJ261119000561', error_message: null },
  paperless_trade: { status: 'pending', due_at: '2026-11-18T10:10:00Z', error: null },
  shipment: shipment({ creation_status: 'created', status: 'created', awb: '4614961175', invoice_id: 91, pickup_id: 7, plt_status: 'pending' }), ...over,
})

type Calls = { create: number; confirm: number; pricing: number; validate: number }

async function base(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('shippec_session', JSON.stringify({ id: 1, username: 'manager@test', name: 'مدير العمليات', role: 'manager', status: 'approved' }))
    sessionStorage.setItem('auth_token', 'e2e-token')
  })
  // Catch-all first (Playwright matches the most recently added route first).
  await page.route(/\/api\//, (r) => r.fulfill(json({ success: true, data: [] })))
  await page.route(/socket\.io/, (r) => r.abort())
}

async function wizardApi(page: Page, createAnswer: (r: Route) => Promise<void>) {
  const calls: Calls = { create: 0, confirm: 0, pricing: 0, validate: 0 }
  let state = shipment()
  await page.route(/\/api\/dhl\/shipments(\?.*)?$/, (r) => r.request().method() === 'GET'
    ? r.fulfill(json({ success: true, data: [], pagination: { total: 0 } }))
    : r.fulfill(json({ success: true, data: { ...state, replayed: false } }, 201)))
  await page.route(/\/api\/dhl\/shipments\/5$/, (r) => r.fulfill(json({ success: true, data: state })))
  await page.route(/\/api\/dhl\/shipments\/5\/products$/, (r) => r.fulfill(json({ success: true, data: { products: PRODUCTS } })))
  await page.route(/\/api\/dhl\/shipments\/5\/product$/, (r) => r.fulfill(json({ success: true, data: state })))
  await page.route(/\/api\/dhl\/shipments\/5\/rates$/, (r) => r.fulfill(json({ success: true, data: { quotes: [QUOTE, QUOTE_8] } })))
  await page.route(/\/api\/dhl\/shipments\/5\/validate$/, (r) => {
    calls.validate++
    state = shipment({ creation_status: 'validated', dhl_validation_status: 'passed' })
    return r.fulfill(json({ success: true, data: { ok: true, issues: [], warnings: [], dhl_validation: { status: 'passed', message: null }, shipment: state } }))
  })
  await page.route(/\/api\/dhl\/shipments\/5\/pricing$/, (r) => { calls.pricing++; return r.fulfill(json({ success: true, data: { shipment: state, warnings: [] } })) })
  await page.route(/\/api\/dhl\/shipments\/5\/confirm$/, (r) => { calls.confirm++; state = shipment({ creation_status: 'ready' }); return r.fulfill(json({ success: true, data: { ...state, replayed: false } })) })
  await page.route(/\/api\/dhl\/shipments\/5\/create$/, async (r) => { calls.create++; await new Promise((res) => setTimeout(res, 400)); return createAnswer(r) })
  await page.route(/\/api\/dhl\/incoterms$/, (r) => r.fulfill(json({ success: true, data: { source: 'dhl', items: [{ code: 'DAP', name: 'Delivered At Place', description: null }, { code: 'DDP', name: 'Delivered Duty Paid', description: null }, { code: 'EXW', name: 'Ex Works', description: null }] } })))
  await page.route(/\/api\/dhl\/default-shipper$/, (r) => r.fulfill(json({ success: true, data: null })))
  await page.route(/\/api\/dhl\/pickups\/7$/, (r) => r.fulfill(json({ success: true, data: { id: 7, status: 'booked', dispatch_confirmation_number: 'CBJ261119000561', pickup_date: '2026-11-22', earliest_time: '10:00', latest_time: '16:00' } })))
  // after DHL created it: the confirmation page reads the stored record (GET /:id/details)
  await page.route(/\/api\/dhl\/shipments\/5\/details$/, (r) => r.fulfill(json({ success: true, data: {
    ...created().shipment, status: 'booked', dhl_created_at: '2026-11-18T10:05:00Z', origin_gmt_offset: '+03:00',
    packages: [{ sequence: 1, weight_kg: '0.600', dhl_piece_id: 'JD014600004614961175001' }, { sequence: 2, weight_kg: '0.600', dhl_piece_id: 'JD014600004614961175002' }],
    documents: created().documents.map((d, i) => ({ ...d, origin: 'dhl_response', sequence: i + 1, page_count: 1 })),
    pickup: { id: 7, status: 'booked', dispatch_confirmation_number: 'CBJ261119000561', pickup_date: '2026-11-22', earliest_time: '10:00', close_time: '16:00', location: 'reception', location_type: 'business', instructions: 'Call on arrival' },
    tracking: null, invoice: { id: 91, invoice_number: 'DH2601', status: 'unpaid', payment_status: 0 }, supersedes: null, replaced_by: null, copied_from: null,
    management: { edit_policy: 'replacement_only', can_copy: true, can_replace: true, replace_blocked: null, replacement_draft_id: null, can_cancel: true, cancel_blocked: null,
      in_dhl_network: false, tracking_status: null, remote_operations: [], pickup: null, documents_bundle: { available: true, documents: 3, pages: 3 } },
  } })))
  return calls
}

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return
  await page.waitForTimeout(250) // let entrance animations settle
  // The app scrolls inside its layout, not the document: grow the viewport to the content for a full capture.
  const size = page.viewportSize()!
  const tallest = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, ...Array.from(document.querySelectorAll<HTMLElement>('*'))
    .filter((e) => e.scrollHeight > e.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowY))
    .map((e) => e.scrollHeight + e.getBoundingClientRect().top)))
  await page.setViewportSize({ width: size.width, height: Math.min(Math.ceil(tallest) + 24, 7000) })
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
  await page.setViewportSize(size)
}

test.use({ launchOptions: { slowMo: 0 }, video: 'off', trace: 'off' }) // tall full-page captures make video encoding very slow

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
] as const

for (const vp of VIEWPORTS) {
  test.describe(`Phase 3D — ${vp.name}`, () => {
    test.use({ viewport: vp.viewport, locale: 'ar-SA' })

    test('create shipment: every step, review, explicit confirmation, ONE create → success', async ({ page }) => {
      await base(page)
      const calls = await wizardApi(page, (r) => r.fulfill(json({ success: true, data: created() }, 201)))
      await page.goto('/create-shipment?draft=5')
      const next = page.getByRole('button', { name: /التالي/ })

      await expect(page.getByText('مؤسسة الخليج للتجارة').first()).toBeVisible()
      await shot(page, `01-from-to-${vp.name}`)
      await next.click()
      await expect(page.getByText('ماذا تقوم بشحنه؟')).toBeVisible()
      await expect(page.getByText('2. وصف البند')).toBeVisible() // the customs items live on Shipment Details
      await shot(page, `02-details-${vp.name}`)
      await next.click()
      await expect(page.getByText('الفاتورة الجمركية').first()).toBeVisible()
      await shot(page, `03-customs-${vp.name}`)
      await next.click()
      await expect(page.getByText(/الطرد 1|طرد 1/).first()).toBeVisible()
      await shot(page, `04-packages-${vp.name}`)
      await next.click() // payment
      await expect(page.getByText(/الرسوم والضرائب|الجمارك والضرائب|الرسوم الجمركية/).first()).toBeVisible()
      await next.click() // service
      const card = page.locator('article', { hasText: 'EXPRESS WORLDWIDE' }).first()
      await expect(card).toBeVisible()
      await expect(card.getByText('182.40 ر.س')).toBeVisible()
      await expect(page.getByText('67.60 ر.س').first()).toBeVisible() // SHIPPEC profit, shown apart from DHL's price
      await shot(page, `05-product-rate-${vp.name}`)
      await next.click() // pickup
      await expect(page.getByTestId('pickup-window')).toContainText('09:00') // DHL's pickup window for the product
      await expect(page.getByTestId('pickup-window')).toContainText('18:30')
      await shot(page, `06-pickup-${vp.name}`)
      await next.click() // review
      await expect(page.getByText(/اجتازت البيانات التحقق المحلي وتحقق DHL/)).toBeVisible()
      expect(calls.create).toBe(0)
      await shot(page, `07-review-${vp.name}`)

      await page.getByRole('button', { name: /^إنشاء الشحنة$/ }).click()
      const yes = page.getByRole('button', { name: /نعم، أنشئ الشحنة/ })
      await expect(yes).toBeVisible()
      expect(calls.create).toBe(0) // nothing is sent before the explicit confirmation
      await yes.click()
      // success → the dedicated confirmation page of THIS shipment (never back to a blank wizard)
      await expect(page).toHaveURL(/\/create-shipment\/success\/5$/)
      await expect(page.getByRole('heading', { name: 'تم إنشاء الشحنة بنجاح' })).toBeVisible()
      await expect(page.getByTestId('summary-awb')).toHaveText('4614961175')
      await expect(page.getByText('DH2601')).toBeVisible()
      await expect(page.getByTestId('summary-pickup-dcn')).toHaveText('CBJ261119000561')
      await expect(page.locator('[data-document-type]')).toHaveCount(3)
      await expect(page.locator('[data-document-type="commercial_invoice"]')).toContainText('الفاتورة التجارية')
      expect(calls).toMatchObject({ create: 1, confirm: 1 })
      expect(calls.pricing).toBeGreaterThanOrEqual(1) // the price travels with the draft (stored on review) and is approved again at creation
      await shot(page, `08-create-success-${vp.name}`)
    })

    test('create shipment: an unknown DHL answer is «uncertain» — never «failed», no second attempt offered', async ({ page }) => {
      await base(page)
      const calls = await wizardApi(page, (r) => r.fulfill(json({ success: true, data: created({
        outcome: 'uncertain', awb: null, invoice: { id: null, number: null, link_status: 'none', error: null }, documents: [], pickup: null,
        creation_error: { code: 'DHL_TIMEOUT', message: 'DHL did not answer in time' }, shipment: shipment({ creation_status: 'uncertain', uncertain_since: '2026-11-18T10:05:00Z', message_reference: 'ref-1' }),
      }) }, 202)))
      await page.goto('/create-shipment?draft=5')
      await expect(page.getByText('مؤسسة الخليج للتجارة').first()).toBeVisible()
      await page.getByRole('button', { name: /المراجعة/ }).first().click()
      await expect(page.getByText(/اجتازت البيانات التحقق المحلي وتحقق DHL/)).toBeVisible()
      await page.getByRole('button', { name: /^إنشاء الشحنة$/ }).click()
      await page.getByRole('button', { name: /نعم، أنشئ الشحنة/ }).click()
      await expect(page.getByText('لا تحاول إنشاء الشحنة مرة أخرى — قد تكون DHL أنشأتها بالفعل.')).toBeVisible()
      await expect(page.getByText('رفضت DHL إنشاء الشحنة')).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^إنشاء الشحنة$/ })).toHaveCount(0)
      expect(calls.create).toBe(1)
      if (vp.name === 'desktop') await shot(page, `08b-create-uncertain-${vp.name}`)
    })

    test('tracking: full-width list, direct AWB search, details timeline', async ({ page }) => {
      await base(page)
      const now = Date.now()
      const item = (awb: string, over: Record<string, unknown> = {}) => ({
        id: Number(awb.slice(-4)), awb, carrier: 'DHL', invoice_id: 77, invoice_number: 'DH2580', client_id: 5, customer_name: 'مؤسسة الخليج للتجارة',
        booking_date: '2026-11-10', invoice_destination: null, raw_status: 'AF', normalized_status: 'IN_TRANSIT', requires_action: false,
        current_description: 'Arrived at DHL Sort Facility - RIYADH-SA', current_location: 'RIYADH-SA', current_city: 'RIYADH', current_country_code: 'SA',
        origin: 'DAMMAM-SA', origin_city: 'DAMMAM', origin_country_code: 'SA', destination: 'DUBAI-AE', destination_city: 'DUBAI', destination_country_code: 'AE',
        product_code: 'P', number_of_pieces: 2, estimated_delivery: '2026-11-20T23:59:00', delivered_at: null, delivered_local: null, delivered_gmt_offset: null,
        delivered_location: null, delivered_signed_by: null, last_event_at: '2026-11-17T09:00:00Z', last_event_local: '2026-11-17 12:00:00', last_event_gmt_offset: '+03:00',
        sync_status: 'ok', last_synced_at: new Date(now - 12 * 60_000).toISOString(), last_attempt_at: null, next_sync_at: null, consecutive_failures: 0,
        last_error_code: null, last_error_message: null, pickup_local: '2026-11-16 15:10:00', pickup_gmt_offset: '+03:00', freshness: 'current', ...over,
      })
      const items = [
        item('4614961175', { invoice_number: 'DH2601', dhl_shipment_id: 5, shippec_reference: 'SHIPPEC-7Q2K9D', sources: ['shippec_created'] }),
        item('9988679120', { normalized_status: 'DELIVERED', raw_status: 'OK', current_description: 'Delivered', delivered_local: '2026-11-15 10:00:00', delivered_gmt_offset: '+04:00', delivered_signed_by: 'AHMED', current_city: 'DUBAI', current_country_code: 'AE' }),
        item('5521004431', { normalized_status: 'OUT_FOR_DELIVERY', raw_status: 'WC', current_description: 'With delivery courier', customer_name: 'شركة النخبة', invoice_number: 'DH2577', destination: 'JEDDAH-SA', destination_city: 'JEDDAH', destination_country_code: 'SA' }),
        item('7310045520', { normalized_status: 'CUSTOMS', raw_status: 'CR', requires_action: true, current_description: 'Clearance event', freshness: 'stale', last_synced_at: new Date(now - 30 * 3600_000).toISOString(), destination: 'LONDON-GB', destination_city: 'LONDON', destination_country_code: 'GB' }),
        item('1234567890', { normalized_status: null, raw_status: null, current_description: null, last_event_local: null, pickup_local: null, freshness: 'pending', last_synced_at: null, invoice_id: null, invoice_number: null, client_id: null, customer_name: null, receiver_name: 'Gulf Retail Trading LLC' }),
      ]
      const details = {
        ...items[0], shipment_description: 'Cotton T-shirts and scarves', total_weight: 1.2, weight_unit: 'metric', shipment_timestamp: '2026-11-16T14:00:00',
        pieces: [
          { number: 1, trackingNumber: 'JD014600004617230779', typeCode: 'SMF', description: null, weight: 0.6, actualWeight: 0.6, dimensions: { length: 30, width: 20, height: 10 }, eventCount: 3, lastEvent: null },
          { number: 2, trackingNumber: 'JD014600004617230780', typeCode: 'SMF', description: null, weight: 0.6, actualWeight: 0.6, dimensions: { length: 30, width: 20, height: 10 }, eventCount: 3, lastEvent: null },
        ],
        events: [
          { id: 4, raw_status: 'AF', normalized_status: 'IN_TRANSIT', description: 'Arrived at DHL Sort Facility - RIYADH-SA', remark: 'The shipment has arrived at a DHL facility', next_steps: 'Please continue to monitor', location: 'RIYADH-SA', location_code: 'RUH', city: 'RIYADH', country_code: 'SA', event_date: '2026-11-17', event_time: '12:00:00', gmt_offset: '+03:00', event_at: '2026-11-17T09:00:00Z', signed_by: null, sequence: 3 },
          { id: 3, raw_status: 'DF', normalized_status: 'IN_TRANSIT', description: 'Departed Facility in DAMMAM-SA', remark: null, next_steps: null, location: 'DAMMAM-SA', location_code: 'DMM', city: 'DAMMAM', country_code: 'SA', event_date: '2026-11-16', event_time: '22:40:00', gmt_offset: '+03:00', event_at: '2026-11-16T19:40:00Z', signed_by: null, sequence: 2 },
          { id: 2, raw_status: 'PL', normalized_status: 'IN_TRANSIT', description: 'Processed at DAMMAM-SA', remark: null, next_steps: null, location: 'DAMMAM-SA', location_code: 'DMM', city: 'DAMMAM', country_code: 'SA', event_date: '2026-11-16', event_time: '19:05:00', gmt_offset: '+03:00', event_at: '2026-11-16T16:05:00Z', signed_by: null, sequence: 1 },
          { id: 1, raw_status: 'PU', normalized_status: 'PICKED_UP', description: 'Shipment picked up', remark: null, next_steps: null, location: 'DAMMAM-SA', location_code: 'DMM', city: 'DAMMAM', country_code: 'SA', event_date: '2026-11-16', event_time: '15:10:00', gmt_offset: '+03:00', event_at: '2026-11-16T12:10:00Z', signed_by: null, sequence: 0 },
        ],
        refresh_cooldown_seconds: 60,
      }
      let lookups = 0
      await page.route(/\/api\/shipment-tracking(\?.*)?$/, (r) => r.fulfill(json({ success: true, data: { items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } } })))
      await page.route(/\/api\/shipment-tracking\/summary/, (r) => r.fulfill(json({ success: true, data: {
        counts: { total: 5, in_transit: 1, out_for_delivery: 1, delivered: 1, not_delivered: 4, problem: 1, exception: 0, on_hold: 0, customs: 1, pre_transit: 0, not_synced: 1, unknown: 0, stale: 1, failed: 0, last_synced_at: new Date(now).toISOString() },
        countries: { origin: [{ code: 'SA', count: 5 }], destination: [{ code: 'AE', count: 3 }, { code: 'SA', count: 1 }, { code: 'GB', count: 1 }] },
        integration: { enabled: true, env: 'test', usable: true, syncEnabled: true, syncIntervalMinutes: 30, features: { tracking: true, trackingLookup: true } },
      } })))
      await page.route(/\/api\/shipment-tracking\/lookup\/\d+$/, (r) => { lookups++; return r.fulfill(json({ success: true, data: { result: 'local', awb: '4614961175', record: details } })) })
      await page.route(/\/api\/shipment-tracking\/4614961175$/, (r) => r.fulfill(json({ success: true, data: details })))
      await page.route(/\/api\/dhl\/shipments\/5$/, (r) => r.fulfill(json({ success: true, data: created().shipment })))
      await page.route(/\/api\/dhl\/pickups\/7$/, (r) => r.fulfill(json({ success: true, data: { id: 7, status: 'booked', dispatch_confirmation_number: 'CBJ261119000561', pickup_date: '2026-11-16', earliest_time: '10:00', latest_time: '16:00' } })))

      await page.goto('/shipment-tracking')
      const container = vp.name === 'desktop' ? page.locator('[data-tracking-awb="9988679120"]').first() : page.getByRole('article').filter({ hasText: '9988679120' })
      await expect(container).toBeVisible()
      await expect(page.getByTestId('tracking-counters').getByText(/بانتظار المزامنة/)).toBeVisible()
      await shot(page, `09-tracking-main-${vp.name}`)

      await page.getByPlaceholder('1234567890').fill('4614961175')
      await page.getByRole('button', { name: 'بحث', exact: true }).click()
      await expect(page).toHaveURL(/\/shipment-tracking\/4614961175$/)
      expect(lookups).toBe(1)
      await expect(page.getByRole('heading', { name: /4614961175/ })).toBeVisible()
      await expect(page.getByRole('heading', { name: /رحلة الشحنة \(4\)/ })).toBeVisible()
      await expect(page.getByText('SHIPPEC-7Q2K9D')).toBeVisible()
      await expect(page.getByText(/^\s*\{/)).toHaveCount(0) // no raw JSON anywhere
      await shot(page, `10-tracking-details-${vp.name}`)
    })
  })
}
