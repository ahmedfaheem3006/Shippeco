import { expect, test, type Page } from '@playwright/test'

/**
 * After DHL created the shipment: the confirmation page (documents → final
 * confirmation), «جميع الشحنات» (search, filters, Copy, corrected replacement,
 * Cancel Shipment) and «ملصق الشحن الكامل» on the tracking page.
 * Every API answer is mocked here — nothing reaches a server or DHL, no shipment
 * is created, no pickup is cancelled. Desktop, tablet and mobile; Arabic + English.
 */

const SHOTS = process.env.PW_SHOTS_DIR
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
/** A small valid PDF (the Backend streams DHL's merged originals; the browser only downloads it). */
const PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 288 432]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'

/** As the Backend sends it (CORS exposes Content-Disposition to the SHIPPEC frontend — src/config/cors.ts). */
const FILE_HEADERS = { 'content-disposition': 'attachment; filename="DHL-1675565474-documents.pdf"', 'access-control-expose-headers': 'Content-Disposition', 'access-control-allow-origin': '*' }
const management = (over: Record<string, unknown> = {}) => ({
  edit_policy: 'replacement_only', can_copy: true, can_replace: true, replace_blocked: null, replacement_draft_id: null, can_cancel: true, cancel_blocked: null,
  in_dhl_network: false, tracking_status: null, remote_operations: [], pickup: { id: 4, status: 'booked', dispatch_confirmation_number: 'CBJ261126621140', cancel_state: 'none', cancellable: true },
  documents_bundle: { available: true, documents: 3, pages: 4 }, ...over,
})
const doc = (id: number, document_type: string, sequence: number, page_count = 1) => ({ id, document_type, content_type: 'application/pdf', size_bytes: 40000, sha256: 'x', origin: 'dhl_response', sequence, page_count })
const details = (over: Record<string, unknown> = {}) => ({
  id: 12, dhl_env: 'production', status: 'booked', creation_status: 'created', shippec_reference: 'SHIPPEC-5513F39F33A4', awb: '1675565474', client_id: 3,
  product_code: 'P', product_name: 'EXPRESS WORLDWIDE', shipment_date: '2026-11-26', origin_gmt_offset: '+03:00', dhl_created_at: '2026-11-25T21:10:00Z',
  pickup_option: 'schedule', service_point_name: null, invoice_id: 91, invoice_link_status: 'linked', invoice_link_error: null, customs_required: true,
  packages: [{ sequence: 1, weight_kg: '32.000', dhl_piece_id: 'JD014600012896647569' }],
  documents: [doc(1, 'shipping_label', 1), doc(2, 'waybill', 2), doc(3, 'proforma_invoice', 3, 2)],
  pickup: { id: 4, status: 'booked', dispatch_confirmation_number: 'CBJ261126621140', pickup_date: '2026-11-26', earliest_time: '15:00', close_time: '18:00', location: 'Reception', location_type: 'business', instructions: null },
  tracking: { normalized_status: null, current_description: null, estimated_delivery: '2026-11-30T23:59:00', last_synced_at: null, pickup_at: null },
  invoice: { id: 91, invoice_number: 'DH2701', status: 'unpaid', payment_status: 0 },
  supersedes: null, replaced_by: null, copied_from: null, cancellation_reason: null, invoice_reversal_status: 'none',
  management: management(), ...over,
})
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

type Calls = { list: string[]; cancel: unknown[]; copy: number; replacement: number; bundle: number; trackingBundle: number; create: number; pickupDelete: number }

async function mockApi(page: Page) {
  const calls: Calls = { list: [], cancel: [], copy: 0, replacement: 0, bundle: 0, trackingBundle: 0, create: 0, pickupDelete: 0 }
  await page.addInitScript(() => {
    sessionStorage.setItem('shippec_session', JSON.stringify({ id: 1, username: 'manager@test', name: 'مدير العمليات', role: 'manager', status: 'approved' }))
    sessionStorage.setItem('auth_token', 'e2e-token')
  })
  await page.route(/\/api\//, (r) => r.fulfill(json({ success: true, data: [] })))
  await page.route(/socket\.io/, (r) => r.abort())
  // anything that would create a shipment or cancel a pickup is counted (and must stay 0 unless asked)
  await page.route(/\/api\/dhl\/shipments\/\d+\/create$/, (r) => { calls.create++; return r.fulfill(json({ success: false }, 500)) })
  await page.route(/\/api\/dhl\/pickups\/\d+$/, (r) => { if (r.request().method() === 'DELETE') calls.pickupDelete++; return r.fulfill(json({ success: true, data: {} })) })
  await page.route(/\/api\/dhl\/shipments\/12\/details$/, (r) => r.fulfill(json({ success: true, data: details() })))
  await page.route(/\/api\/dhl\/shipments\/12\/documents\/bundle$/, (r) => {
    calls.bundle++
    return r.fulfill({ status: 200, contentType: 'application/pdf', body: PDF, headers: FILE_HEADERS })
  })
  await page.route(/\/api\/dhl\/shipments\/managed\/facets$/, (r) => r.fulfill(json({ success: true, data: { products: [{ code: 'P', name: 'EXPRESS WORLDWIDE', n: 2 }], customers: [{ id: 3, name: 'عميل الاختبار', n: 2 }] } })))
  await page.route(/\/api\/dhl\/shipments\/managed(\?.*)?$/, (r) => {
    const u = new URL(r.request().url())
    calls.list.push(u.search)
    const rows = u.searchParams.get('status') === 'cancelled'
      ? [row({ id: 13, awb: '3822077232', status: 'superseded', list_status: 'cancelled', replaced_by_shipment_id: 14, replaced_by_awb: '3822077999', pickup_status: null, dispatch_confirmation_number: null })]
      : [row(), row({ id: 15, awb: '7899945034', list_status: 'in_transit', tracking_status: 'IN_TRANSIT', tracking_description: 'Shipment has departed from a DHL facility', receiver_company: 'Rand Al-Fawaz', receiver_city: 'MAKKAH' })]
    const q = (u.searchParams.get('q') ?? '').replace(/[\s-]/g, '')
    const data = q ? rows.filter((x) => String(x.awb).includes(q)) : rows
    return r.fulfill(json({ success: true, data, pagination: { page: 1, limit: 20, total: data.length } }))
  })
  await page.route(/\/api\/dhl\/shipments\/12\/cancel-shipment$/, (r) => {
    calls.cancel.push(r.request().postDataJSON())
    return r.fulfill(json({ success: true, data: { pickup_cancelled: true, invoice_reversal: 'reversed', shipment: details({ status: 'cancelled', cancellation_reason: 'Customer cancelled the order', management: management({ can_cancel: false, can_replace: false, cancel_blocked: 'SHIPMENT_CANCELLED', replace_blocked: 'SHIPMENT_CANCELLED' }) }) } }))
  })
  await page.route(/\/api\/dhl\/shipments\/12\/copy$/, (r) => { calls.copy++; return r.fulfill(json({ success: true, data: { id: 77, replayed: false } }, 201)) })
  await page.route(/\/api\/dhl\/shipments\/12\/replacement$/, (r) => { calls.replacement++; return r.fulfill(json({ success: true, data: { id: 31, replayed: false } }, 201)) })
  // tracking page of the same AWB
  await page.route(/\/api\/shipment-tracking\/1675565474$/, (r) => r.fulfill(json({ success: true, data: {
    id: 9, awb: '1675565474', carrier: 'DHL', invoice_id: 91, invoice_number: 'DH2701', client_id: 3, customer_name: 'عميل الاختبار', booking_date: '2026-11-26',
    raw_status: null, normalized_status: 'PRE_TRANSIT', requires_action: false, current_description: null, origin: null, origin_city: 'BARANGAROO', origin_country_code: 'AU',
    destination: null, destination_city: 'DAMMAM', destination_country_code: 'SA', product_code: 'P', number_of_pieces: 1, estimated_delivery: null, delivered_at: null,
    sync_status: 'pending', last_synced_at: null, freshness: 'pending', dhl_shipment_id: 12, shippec_reference: 'SHIPPEC-5513F39F33A4', shipment_status: 'booked',
    shipment_description: 'Part of car', total_weight: 32, weight_unit: 'metric', shipment_timestamp: null, pieces: [], events: [], refresh_cooldown_seconds: 60,
    awb_document: { available: true, type: 'waybill', content_type: 'application/pdf' },
  } })))
  await page.route(/\/api\/dhl\/shipments\/12$/, (r) => r.fulfill(json({ success: true, data: { ...details(), pickup_id: 4 } })))
  await page.route(/\/api\/shipment-tracking\/1675565474\/documents$/, (r) => {
    calls.trackingBundle++
    return r.fulfill({ status: 200, contentType: 'application/pdf', body: PDF, headers: FILE_HEADERS })
  })
  return calls
}

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}
/** The page never scrolls sideways (16px gutters, no overflow) at any width. */
const noSideScroll = async (page: Page) => {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over).toBeLessThanOrEqual(1)
}

test.use({ launchOptions: { slowMo: 0 }, video: 'off', trace: 'off' })

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'tablet', viewport: { width: 820, height: 1180 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
] as const

for (const vp of VIEWPORTS) {
  test.describe(`created shipments — ${vp.name}`, () => {
    test.use({ viewport: vp.viewport, locale: 'ar-SA' })

    test('confirmation: stored DHL data → Download Documents (ONE PDF) → final Shipment Confirmation; AR + EN', async ({ page }) => {
      const calls = await mockApi(page)
      await page.goto('/create-shipment/success/12')
      await expect(page.getByRole('heading', { name: 'تم إنشاء الشحنة بنجاح' })).toBeVisible()
      await expect(page.getByTestId('summary-awb')).toHaveText('1675565474')
      await expect(page.getByTestId('summary-pieces')).toContainText('JD014600012896647569')
      await expect(page.getByTestId('summary-pickup-dcn')).toHaveText('CBJ261126621140')
      await expect(page.getByTestId('summary-pickup-details')).toContainText('3:00 م')
      await expect(page.locator('[data-document-type]')).toHaveCount(3)
      await noSideScroll(page)
      await shot(page, `manage-01-documents-${vp.name}`)
      const download = page.waitForEvent('download')
      await page.getByTestId('download-documents').click()
      expect((await download).suggestedFilename()).toBe('DHL-1675565474-documents.pdf')
      await expect(page.getByTestId('shipment-confirmation')).toHaveAttribute('data-phase', 'done')
      await expect(page).toHaveURL(/\/create-shipment\/success\/12\?done=1$/)
      await expect(page.getByTestId('confirmation-important')).toContainText('CBJ261126621140')
      await expect(page.getByTestId('confirmation-actions').getByRole('link', { name: /متابعة الشحنة/ })).toHaveAttribute('href', '/shipment-tracking/1675565474')
      await noSideScroll(page)
      await shot(page, `manage-02-final-ar-${vp.name}`)
      await page.getByTestId('cs-lang-toggle').getByRole('radio', { name: 'EN' }).click()
      await expect(page.getByRole('heading', { name: 'Shipment Confirmation' })).toBeVisible()
      await expect(page.getByTestId('summary-pickup-details')).toContainText('Between 3:00 pm and 6:00 pm')
      await expect(page.getByTestId('summary-pickup-details')).toContainText('Thu, Nov 26, 2026')
      await noSideScroll(page)
      await shot(page, `manage-03-final-en-${vp.name}`)
      expect(calls).toMatchObject({ bundle: 1, create: 0, pickupDelete: 0 })
    })

    test('All Shipments: opened from Create Shipment, search by AWB with spaces, filters, Copy → new draft, Cancel with reason, corrected replacement', async ({ page }) => {
      const calls = await mockApi(page)
      await page.goto('/create-shipment/success/12')
      await page.getByTestId('all-shipments-link').click()
      await expect(page).toHaveURL(/\/create-shipment\/shipments$/)
      await expect(page.getByRole('heading', { name: /كل الشحنات/ })).toBeVisible()
      await expect(page.getByTestId('shipment-row')).toHaveCount(2)
      await expect(page.getByTestId('shipment-row').nth(1).getByTestId('shipment-status')).toHaveText('في الطريق')
      // in the DHL network: no cancel / replacement offered
      await expect(page.getByTestId('shipment-row').nth(1).getByRole('button', { name: /إلغاء الشحنة/ })).toHaveCount(0)
      await noSideScroll(page)
      await shot(page, `manage-04-list-${vp.name}`)
      await page.getByTestId('shipments-search').fill('167 556-5474')
      await expect(page.getByTestId('shipment-row')).toHaveCount(1)
      expect(calls.list.at(-1)).toContain('q=167+556-5474')
      await page.getByRole('button', { name: /مسح البحث والتصفية/ }).click()
      await expect(page.getByTestId('shipment-row')).toHaveCount(2)
      if (vp.name === 'mobile') await page.getByTestId('filters-toggle').click()
      await page.getByLabel('الحالة').selectOption('cancelled')
      await expect(page.getByTestId('shipment-row')).toHaveCount(1)
      await expect(page.getByTestId('shipment-row').first().getByTestId('shipment-status')).toHaveText('مستبدلة ببوليصة مصححة')
      await page.getByRole('button', { name: /مسح البحث والتصفية/ }).click()
      await expect(page.getByTestId('shipment-row')).toHaveCount(2)

      // Cancel Shipment: explicit dialog, reason, ONE request
      const first = page.getByTestId('shipment-row').first()
      await first.getByRole('button', { name: /إلغاء الشحنة/ }).click()
      const dialog = page.getByTestId('cancel-shipment-dialog')
      await expect(dialog).toContainText('لا توفّر DHL حذف البوليصة')
      await expect(dialog.getByTestId('cancel-shipment-confirm')).toBeDisabled()
      await dialog.getByLabel(/سبب الإلغاء/).fill('Customer cancelled the order')
      await shot(page, `manage-05-cancel-${vp.name}`)
      await dialog.getByTestId('cancel-shipment-confirm').click()
      await expect(dialog).toHaveCount(0)
      expect(calls.cancel).toEqual([{ reason: 'Customer cancelled the order' }])

      // corrected replacement → the new draft
      await page.getByTestId('shipment-row').first().getByRole('button', { name: /تعديل ببوليصة بديلة/ }).click()
      await expect(page.getByTestId('replacement-dialog')).toContainText('لا تسمح DHL بتعديل بوليصة أُنشئت')
      await page.getByTestId('replacement-confirm').click()
      await expect(page).toHaveURL(/\/create-shipment\?draft=31$/)

      // Copy → a new draft
      await page.goto('/create-shipment/shipments')
      await page.getByTestId('shipment-row').first().getByRole('button', { name: /نسخ/ }).click()
      await expect(page).toHaveURL(/\/create-shipment\?draft=77$/)
      expect(calls).toMatchObject({ copy: 1, replacement: 1, create: 0, pickupDelete: 0 })
    })

    test('tracking page: «ملصق الشحن الكامل» is the first document button and downloads the complete PDF (no new shipment)', async ({ page }) => {
      const calls = await mockApi(page)
      await page.goto('/shipment-tracking/1675565474')
      const box = page.getByTestId('tracking-documents')
      await expect(box.getByRole('button').first()).toHaveText(/ملصق الشحن الكامل/)
      await expect(box.getByRole('button')).toHaveCount(4)
      const download = page.waitForEvent('download')
      await box.getByTestId('full-shipping-documents').click()
      expect((await download).suggestedFilename()).toBe('DHL-1675565474-documents.pdf')
      await noSideScroll(page)
      await shot(page, `manage-06-tracking-${vp.name}`)
      expect(calls).toMatchObject({ trackingBundle: 1, create: 0, pickupDelete: 0 })
    })
  })
}
