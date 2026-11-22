import { expect, test, type Page } from '@playwright/test'

/**
 * «إنشاء شحنة» → Step 2 «تفاصيل الشحنة / Shipment Details» (DHL's information
 * architecture on SHIPPEC's design): Documents and Packages at 1440 / 1280 /
 * 1024 / 768 / 600 / 390 / 320 px in Arabic (RTL) and English (LTR) — no
 * horizontal scroll, every field inside the step, dropdowns on screen, totals
 * in kg + LB. Every API request is answered here; nothing reaches a real
 * server or DHL. Screenshots → PW_SHOTS_DIR.
 */

const SHOTS = process.env.PW_SHOTS_DIR
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

const draft = (over: Record<string, unknown> = {}) => ({
  id: 5, dhl_env: 'test', status: 'draft', creation_status: 'draft', shippec_reference: 'SHIPPEC-7Q2K9D', idempotency_key: 'auto:x', awb: null, client_id: 3, client_name: 'Gulf Retail Client',
  customer_reference: 'PO-1182', product_code: null, local_product_code: null, product_name: null, service_codes: [], customs_required: true, paperless_trade: false,
  content_description: null, incoterm: 'DAP', currency: 'SAR', declared_value: null, export_reason_type: 'gift', shipment_type: 'personal',
  customs_invoice_number: null, customs_invoice_date: null, dhl_invoice_type: 'commercial', shipment_date: '2026-11-24', origin_gmt_offset: null, shipment_purpose: 'gift',
  transport_payer: 'shipper', transport_payer_account: null, duties_payer: 'receiver', duties_payer_account: null, pickup_option: 'none',
  pickup_earliest_time: null, pickup_latest_time: null, pickup_location: null, pickup_location_type: null, pickup_instructions: null, pickup_address: null,
  service_point_id: null, service_point_name: null, package_count: 1, total_gross_weight: '1.200', validation_issues: [], validation_warnings: [],
  dhl_validation_status: 'not_run', available_products: null, rate_quotes: null, dhl_cost: null, dhl_cost_source: null, selling_price: null, price_currency: 'SAR',
  invoice_id: null, invoice_link_status: 'none', invoice_link_error: null, creation_error_code: null, creation_error_message: null, message_reference: null, uncertain_since: null,
  pickup_id: null, plt_status: 'not_required', tracking_id: null, is_domestic: false, content_type: 'goods', created_at: '2026-11-22T10:00:00Z', updated_at: '2026-11-22T10:00:00Z',
  shipper_company: 'Shippec Trading', shipper_contact: 'Sara Operations', shipper_phone: '+966551234567', shipper_email: 'ops@shippec.invalid', shipper_address_line1: '3456, Prince Sultan Road',
  shipper_address_line2: '7788, Al Olaya', shipper_address_line3: 'ROLA3456', shipper_city: 'Dammam', shipper_postal_code: '31952', shipper_province: null, shipper_country_code: 'SA', shipper_type: 'business',
  receiver_company: 'Gulf Retail Trading LLC', receiver_contact: 'Omar Haddad', receiver_phone: '+971501234567', receiver_email: null, receiver_address_line1: 'Office 1204, Bay Square 7',
  receiver_address_line2: 'Business Bay', receiver_address_line3: null, receiver_city: 'Dubai', receiver_postal_code: '00000', receiver_province: null, receiver_country_code: 'AE', receiver_type: 'business',
  packages: [{ sequence: 1, weight_kg: '1.200', length_cm: '30.00', width_cm: '20.00', height_cm: '10.00', customer_reference: null, dhl_piece_id: null }],
  items: [
    { description: 'Cotton T-shirt', quantity: 20, unit: 'PCS', unit_value: '22.000', country_of_origin: 'SA', outbound_hs_code: '6109.10', inbound_hs_code: '6109.10', unit_net_weight_kg: '0.020', line_gross_weight_kg: '0.500' },
    { description: 'Wool scarf', quantity: 6, unit: 'PCS', unit_value: '33.333', country_of_origin: 'TR', outbound_hs_code: '6117.10', inbound_hs_code: '6117.10', unit_net_weight_kg: '0.100', line_gross_weight_kg: '0.700' },
  ],
  shipment_details_extra: { references: [{ type: 'CU', value: 'PO-1182' }], document_protection: false, insurance: false, estimated_duties: false, precalculated_duties: false, item_entry: 'describe', charges: [{ type: 'freight', description: null, amount: 25 }], items: [] },
  documents: [],
  ...over,
})

async function base(page: Page, lang: 'ar' | 'en') {
  await page.addInitScript((l) => {
    sessionStorage.setItem('shippec_session', JSON.stringify({ id: 1, username: 'manager@test', name: 'Manager', role: 'manager', status: 'approved' }))
    sessionStorage.setItem('auth_token', 'e2e-token')
    localStorage.setItem('shippec.createShipment.lang', l)
  }, lang)
  await page.route(/\/api\//, (r) => r.fulfill(json({ success: true, data: [] })))
  await page.route(/socket\.io/, (r) => r.abort())
  await page.route(/\/api\/dhl\/shipments(\?.*)?$/, (r) => r.fulfill(json({ success: true, data: [], pagination: { total: 0 } })))
  await page.route(/\/api\/dhl\/shipments\/5$/, (r) => r.fulfill(json({ success: true, data: draft() })))
  await page.route(/\/api\/dhl\/default-shipper$/, (r) => r.fulfill(json({ success: true, data: null })))
}

test.use({ launchOptions: { slowMo: 0 }, video: 'off', trace: 'off', actionTimeout: 10_000 })

/** No horizontal page scroll; every visible field of the step stays inside the step. */
async function fits(page: Page) {
  const r = await page.evaluate(() => {
    const step = document.querySelector('[data-testid="details-step"]') as HTMLElement
    const s = step.getBoundingClientRect()
    const outside = [...step.querySelectorAll('input, select, textarea, button')].filter((el) => {
      const b = el.getBoundingClientRect()
      return b.width > 0 && (b.left < s.left - 1 || b.right > s.right + 1)
    }).map((el) => (el as HTMLElement).getAttribute('aria-label') || el.id || el.tagName)
    return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, outside }
  })
  expect(r.scrollW).toBeLessThanOrEqual(r.innerW + 1)
  expect(r.outside).toEqual([])
}

for (const lang of ['ar', 'en'] as const) {
  const L = (ar: string, en: string) => (lang === 'en' ? en : ar)
  for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [600, 900], [390, 844], [320, 700]] as const) {
    test(`Shipment Details ${lang.toUpperCase()} at ${w}px: Packages + Documents fit, direction, totals in kg + LB`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await base(page, lang)
      await page.goto('/create-shipment?draft=5')
      await expect(page.getByText('Gulf Retail Client').first()).toBeVisible()
      await page.getByRole('button', { name: L('التالي', 'Next') }).click()
      const step = page.getByTestId('details-step')
      await expect(step).toBeVisible()
      await expect(step.getByText(L('ماذا تقوم بشحنه؟', "What are you shipping?"))).toBeVisible()
      expect(await step.evaluate((e) => (e.closest('[dir]') as HTMLElement).dir)).toBe(lang === 'en' ? 'ltr' : 'rtl')

      // Packages (from the draft): both item cards, totals in kg + LB, invoice total with the freight charge
      await expect(page.getByText(L('2. وصف البند', '2. Unique Item Description'))).toBeVisible()
      await expect(page.getByTestId('item-totals')).toContainText('LB')
      await expect(page.getByTestId('invoice-total')).toContainText('665.00') // 20 × 22 + 6 × 33.333 = 640.00 goods + 25 freight
      await expect(page.getByTestId('prohibited-items-card')).toBeVisible()
      await fits(page)
      if (SHOTS) {
        await page.screenshot({ path: `${SHOTS}/details-packages-${lang}-${w}.png`, fullPage: true })
        await page.locator('[data-item="0"]').screenshot({ path: `${SHOTS}/details-item-${lang}-${w}.png` })
      }

      // the unit dropdown opens fully on screen and on top
      const unit = page.locator('[data-item="0"]').getByLabel(/^(الوحدة|الوحدات|Units)/).first()
      await unit.click()
      const option = page.getByRole('option', { name: /PRS/ })
      await expect(option).toBeVisible()
      const ob = (await option.boundingBox())!
      expect(ob.x).toBeGreaterThanOrEqual(0)
      expect(ob.x + ob.width).toBeLessThanOrEqual(w + 1)
      await page.keyboard.press('Escape')

      // Documents: the item form goes away, the description + value + references fit
      await step.getByRole('radio', { name: L('مستندات', 'Documents'), exact: false }).click()
      await expect(page.getByText(L('2. وصف البند', '2. Unique Item Description'))).toHaveCount(0)
      await expect(page.getByTestId('references')).toBeVisible()
      await fits(page)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/details-documents-${lang}-${w}.png`, fullPage: true })

      // back to Packages: the items are kept
      await step.getByRole('radio', { name: L('طرود / بضائع', 'Packages'), exact: false }).click()
      await expect(page.getByText(L('2. وصف البند', '2. Unique Item Description'))).toBeVisible()
    })
  }
}
