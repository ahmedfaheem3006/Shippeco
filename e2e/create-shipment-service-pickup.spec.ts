import { expect, test, type Page } from '@playwright/test'

/**
 * «إنشاء شحنة» → Step 6 «الخدمة والسعر / Service» and Step 7 «الاستلام / Pickup» (the MyDHL+
 * screens on SHIPPEC's design) at 1440 / 1024 / 768 / 390 / 320 px, Arabic (RTL) and English (LTR):
 * date cards (Today / Tomorrow) + «More +», DHL's result card (delivery date, delivered by, price,
 * Details with DHL's breakdown and VAT), optional services DHL listed (ticking one re-rates through the
 * Backend), the pickup choice, DHL's window, Reception / Front / Back / Other, the pickup address and
 * the Shipment Cost Summary. Every API request is answered here — nothing reaches a server or DHL,
 * and no pickup endpoint is ever called. Screenshots → PW_SHOTS_DIR.
 */

const SHOTS = process.env.PW_SHOTS_DIR
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

const PICKUP_CAP = { nextBusinessDay: false, localCutoffDateAndTime: '2026-11-26T17:30:00', pickupEarliest: '09:00:00', pickupLatest: '18:30:00', pickupCutoffSameDayOutboundProcessing: '18:30:00', pickupAdditionalDays: 0, originServiceAreaCode: 'DHA' }
const line = (name: string, serviceCode: string | null, amount: number, tax: number, net: number, category: string) => ({ name, serviceCode, typeCode: serviceCode ? 'SCH' : null, amount, currency: 'SAR', category, tax, net, isCustomerAgreement: null })
/** DHL TEST 2026-11-18 (domestic N) shape, with DHL's optional services listed unpriced. */
const quote = (withSf: boolean) => ({
  productCode: 'N', localProductCode: 'N', productName: 'EXPRESS DOMESTIC', isCustomerAgreement: false, amount: withSf ? 100.73 : 75.73, currency: 'SAR', currencyType: 'BILLC', taxTotal: 9.88,
  estimatedDelivery: '2026-11-29T23:59:00', totalTransitDays: 3, pricingDate: '2026-11-25',
  breakdown: [
    line('EXPRESS DOMESTIC', null, 57.56, 7.51, 50.05, 'transportation'), line('DEMAND SURCHARGE', 'NX', 0.69, 0.09, 0.6, 'demand_surcharge'), line('FUEL SURCHARGE', 'FF', 17.48, 2.28, 15.2, 'fuel_surcharge'),
    ...(withSf ? [line('DIRECT SIGNATURE', 'SF', 25, 0, 25, 'other')] : []),
  ],
  weight: { volumetric: 1.2, provided: 1.5, unit: 'metric' },
  optionalServices: ['SF', 'SD', 'NN', 'II', 'HE', 'CT'].filter((c) => !(withSf && c === 'SF')).map((serviceCode) => ({ serviceCode, name: serviceCode, serviceTypeCode: 'XCH', isCustomerAgreement: false, isMarketedService: true })),
  pickupCapabilities: PICKUP_CAP,
  deliveryCapabilities: { deliveryTypeCode: 'QDDF', estimatedDeliveryDateAndTime: '2026-11-29T23:59:00', totalTransitDays: 3, deliveryAdditionalDays: 0, destinationServiceAreaCode: 'DHA' },
})
const PRODUCTS = [{ productCode: 'N', localProductCode: 'N', productName: 'EXPRESS DOMESTIC', isCustomerAgreement: false, pickupCapabilities: PICKUP_CAP }]

const draft = (over: Record<string, unknown> = {}) => ({
  id: 5, dhl_env: 'test', status: 'draft', creation_status: 'draft', shippec_reference: 'SHIPPEC-7Q2K9D', idempotency_key: 'auto:x', awb: null, client_id: 3, client_name: 'Gulf Retail Client',
  customer_reference: null, product_code: 'N', local_product_code: 'N', product_name: 'EXPRESS DOMESTIC', service_codes: [], customs_required: false, paperless_trade: false,
  content_description: 'Business documents', incoterm: null, currency: null, declared_value: null, export_reason_type: null, shipment_type: null,
  customs_invoice_number: null, customs_invoice_date: null, dhl_invoice_type: null, shipment_date: '2026-11-26', origin_gmt_offset: null, shipment_purpose: null,
  invoice_remarks: [], declaration_statements: [], customs_documents: [],
  transport_payer: 'shipper', transport_payer_account: null, duties_payer: 'receiver', duties_payer_account: null, pickup_option: 'none',
  pickup_earliest_time: null, pickup_latest_time: null, pickup_location: null, pickup_location_type: null, pickup_instructions: null, pickup_address: null,
  service_point_id: null, service_point_name: null, package_count: 1, total_gross_weight: '1.500', validation_issues: [], validation_warnings: [],
  dhl_validation_status: 'not_run', available_products: PRODUCTS, rate_quotes: [quote(false)], rates_checked_at: '2026-11-25T07:04:00Z',
  dhl_cost: null, dhl_cost_source: null, selling_price: null, price_currency: 'SAR',
  invoice_id: null, invoice_link_status: 'none', invoice_link_error: null, creation_error_code: null, creation_error_message: null, message_reference: null, uncertain_since: null,
  pickup_id: null, plt_status: 'not_required', tracking_id: null, is_domestic: true, content_type: 'documents', created_at: '2026-11-25T06:00:00Z', updated_at: '2026-11-25T06:00:00Z',
  shipper_company: 'SHIPPEC EXPRESS', shipper_contact: 'Operations Management - SHIPPEC', shipper_phone: '+966537299636', shipper_email: 'ops@shippec.invalid', shipper_address_line1: '7540 Prince Mutaib bin Abdulaziz',
  shipper_address_line2: '3538 Al Rawdah Dist', shipper_address_line3: 'EDMA7540', shipper_city: 'Dammam', shipper_postal_code: '32256', shipper_province: 'Eastern Province', shipper_country_code: 'SA', shipper_type: 'business',
  receiver_company: 'Omar Haddad', receiver_contact: 'Omar Haddad', receiver_phone: '+966552222222', receiver_email: null, receiver_address_line1: '2121, Test Street', receiver_address_line2: '3434, Al Olaya',
  receiver_address_line3: 'TSTA2121', receiver_city: 'Khobar', receiver_postal_code: '34421', receiver_province: null, receiver_country_code: 'SA', receiver_type: 'private',
  packages: [{ sequence: 1, weight_kg: '1.500', length_cm: '30.00', width_cm: '20.00', height_cm: '10.00', customer_reference: null, dhl_piece_id: null }],
  items: [], documents: [],
  ...over,
})

async function base(page: Page, lang: 'ar' | 'en', pickupBooking = true) {
  const sent = { patches: [] as Array<Record<string, any>>, rates: 0, pickups: 0 }
  let current = draft()
  await page.addInitScript((l) => {
    sessionStorage.setItem('shippec_session', JSON.stringify({ id: 1, username: 'manager@test', name: 'Manager', role: 'manager', status: 'approved' }))
    sessionStorage.setItem('auth_token', 'e2e-token')
    localStorage.setItem('shippec.createShipment.lang', l)
  }, lang)
  await page.route(/\/api\//, (r) => r.fulfill(json({ success: true, data: [] })))
  await page.route(/socket\.io/, (r) => r.abort())
  await page.route(/\/api\/dhl\/pickups/, (r) => { sent.pickups += 1; return r.fulfill(json({ success: false }, 500)) })
  await page.route(/\/api\/dhl\/shipments(\?.*)?$/, (r) => r.fulfill(json({ success: true, data: [], pagination: { total: 0 } })))
  await page.route(/\/api\/dhl\/shipments\/5$/, async (r) => {
    if (r.request().method() === 'PATCH') {
      const body = r.request().postDataJSON() as Record<string, any>
      sent.patches.push(body)
      current = draft({ shipment_date: body.shipment_date, service_codes: body.service_codes ?? [], pickup_option: body.pickup_option, rate_quotes: current.rate_quotes })
    }
    return r.fulfill(json({ success: true, data: current }))
  })
  await page.route(/\/api\/dhl\/shipments\/5\/products$/, (r) => r.fulfill(json({ success: true, data: { products: PRODUCTS } })))
  await page.route(/\/api\/dhl\/shipments\/5\/rates$/, (r) => {
    sent.rates += 1
    const q = quote((current.service_codes as string[]).includes('SF'))
    current = { ...current, rate_quotes: [q] }
    return r.fulfill(json({ success: true, data: { quotes: [q], quoted_at: '2026-11-25T08:10:00Z' } }))
  })
  await page.route(/\/api\/dhl\/default-shipper$/, (r) => r.fulfill(json({ success: true, data: null })))
  await page.route(/\/api\/dhl\/options$/, (r) => r.fulfill(json({ success: true, data: {
    purposes: [], transport_payers: ['shipper', 'receiver', 'third_party'], duties_payers: ['receiver', 'shipper', 'third_party'], pickup_options: ['none', 'schedule', 'drop_off'], document_refetch_types: [],
    features: { paperless_upload: false, pickup_booking: pickupBooking }, declaration_statements: [], customs_document_types: [], payment: { shipper_account_masked: '*****2611' },
  } })))
  return sent
}

test.use({ launchOptions: { slowMo: 0 }, video: 'off', trace: 'off', actionTimeout: 10_000 })

/** No horizontal page scroll; every visible control of the step stays inside the step (the date strip scrolls inside itself). */
async function fits(page: Page, testId: string) {
  const r = await page.evaluate((id) => {
    const step = document.querySelector(`[data-testid="${id}"]`) as HTMLElement
    const s = step.getBoundingClientRect()
    const outside = [...step.querySelectorAll('input, select, textarea, button')].filter((el) => {
      if (el.closest('[role="radiogroup"][class*="overflow-x-auto"]')) return false
      const b = el.getBoundingClientRect()
      return b.width > 0 && (b.left < s.left - 1 || b.right > s.right + 1)
    }).map((el) => (el as HTMLElement).getAttribute('aria-label') || el.id || el.tagName)
    return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, outside }
  }, testId)
  expect(r.scrollW).toBeLessThanOrEqual(r.innerW + 1)
  expect(r.outside).toEqual([])
}

for (const lang of ['ar', 'en'] as const) {
  const L = (ar: string, en: string) => (lang === 'en' ? en : ar)
  for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 700]] as const) {
    test(`Service + Pickup ${lang.toUpperCase()} at ${w}px: MyDHL workflow, DHL data only, fits, direction`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      const sent = await base(page, lang)
      await page.goto('/create-shipment?draft=5')
      await expect(page.getByText('Gulf Retail Client').first()).toBeVisible()

      // ── Service ──
      await page.getByRole('button', { name: L('الخدمة', 'Service') }).first().click()
      const svc = page.getByTestId('service-step')
      await expect(svc).toBeVisible()
      expect(await svc.evaluate((e) => (e.closest('[dir]') as HTMLElement).dir)).toBe(lang === 'en' ? 'ltr' : 'rtl')
      const dates = svc.getByRole('radiogroup', { name: L('سأرسل شحنتي في', "I'm sending my shipment on") }).getByRole('radio')
      await expect(dates).toHaveCount(7)
      await expect(dates.nth(0)).toContainText(L('اليوم', 'Today'))
      await expect(dates.nth(1)).toContainText(L('غدًا', 'Tomorrow'))
      // the Saudi sender's time zone: derived, read-only — never a typed offset
      await expect(svc.getByTestId('sender-time-zone')).toContainText('UTC+03:00')
      await expect(svc.getByLabel(new RegExp(`^${L('المنطقة الزمنية للمرسل', 'Sender time zone')}`))).toHaveCount(0)
      const card = svc.locator('[data-product="N"]')
      await expect(card.getByTestId('delivered-by')).toHaveText(L('نهاية اليوم', 'End of Day'))
      await expect(card.getByTestId('estimated-price')).toHaveText(L('75.73 ر.س', '75.73 SAR'))
      await card.getByRole('button', { name: L('التفاصيل', 'Details') }).click()
      await expect(card.getByTestId('service-details').locator('[data-charge="tax"]')).toContainText('9.88')
      await expect(card.getByTestId('service-details').locator('[data-charge="total"]')).toContainText('75.73')
      await expect(svc.getByTestId('rate-timestamp')).toContainText(L('تقدير سعر DHL بتاريخ', 'DHL rate estimate as of'))
      // optional services: only what DHL listed and SHIPPEC can request (no insurance / dangerous goods / technical codes)
      const opt = svc.getByTestId('optional-services')
      await expect(opt.locator('[data-service]')).toHaveCount(3)
      await expect(svc.getByTestId('service-price-SF')).toHaveText(L('السعر تحسبه DHL', 'Price calculated by DHL'))
      await opt.locator('[data-service="SF"]').getByRole('checkbox').check()
      await expect(svc.getByTestId('service-price-SF')).toContainText(L('رسوم إضافية', 'Charges apply'))
      await expect(card.getByTestId('estimated-price')).toContainText('100.73')
      expect(sent.patches.at(-1)?.service_codes).toEqual(['SF'])
      expect(sent.rates).toBeGreaterThanOrEqual(1)
      await fits(page, 'service-step')
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/service-${lang}-${w}.png`, fullPage: true })
      // another date (not the draft's): saved, then DHL asked again
      const other = await dates.nth(2).getAttribute('data-date')
      const before = sent.rates
      await dates.nth(2).click()
      await expect(dates.nth(2)).toHaveAttribute('aria-checked', 'true')
      await expect.poll(() => sent.patches.at(-1)?.shipment_date).toBe(other)
      await expect.poll(() => sent.rates).toBeGreaterThan(before)
      await expect(svc.getByRole('status', { name: L('جاري جلب خدمات DHL', 'Loading DHL services') })).toHaveCount(0)

      // ── Pickup ──
      await page.getByRole('button', { name: L('الاستلام', 'Pickup') }).first().click()
      const pk = page.getByTestId('pickup-step')
      await expect(pk.getByText(L('هل تريد جدولة استلام الشحنة بواسطة مندوب DHL؟', 'Do you want to schedule a courier pickup?')).first()).toBeVisible()
      await pk.getByRole('radio', { name: L('نعم — جدولة استلام', 'Yes — Schedule Pickup') }).click()
      await expect(pk.getByTestId('pickup-window')).toContainText('09:00')
      await expect(pk.getByTestId('pickup-window')).toContainText('18:30')
      const where = pk.getByLabel(new RegExp(`^${L('من أين يستلم المندوب الشحنة؟', 'Where should the courier pick up the shipment\\?')}`))
      await expect(where.locator('option')).toHaveText([L('اختر', 'Select One'), L('الاستقبال', 'Reception'), L('الواجهة / المدخل الأمامي', 'Front'), L('الخلف / المدخل الخلفي', 'Back'), L('مكان آخر', 'Other')])
      await where.selectOption('other')
      await pk.getByLabel(new RegExp(`^${L('تفاصيل مكان الاستلام', 'Pickup location details')}`)).fill('Security gate 2')
      await expect(pk.getByTestId('pickup-address')).toContainText('7540 Prince Mutaib bin Abdulaziz')
      await expect(pk.getByTestId('pickup-address')).toContainText('EDMA7540')
      await expect(pk.getByTestId('pickup-weight')).toContainText('1.5')
      await expect(pk.getByTestId('cost-summary')).toContainText('EXPRESS DOMESTIC')
      await expect(pk.getByTestId('cs-chargeable')).toHaveText(L('لا تعيده DHL عبر الواجهة البرمجية', 'Not returned by the DHL API'))
      await fits(page, 'pickup-step')
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/pickup-${lang}-${w}.png`, fullPage: true })
      await page.getByRole('button', { name: L('حفظ المسودة', 'Save draft') }).click()
      await expect.poll(() => sent.patches.at(-1)?.pickup_location).toBe('Security gate 2')
      expect(sent.patches.at(-1)).toMatchObject({ pickup_option: 'schedule', pickup_earliest_time: '09:00', pickup_latest_time: '18:30', pickup_address: null })
      // «No»: no pickup data; nothing ever reaches a pickup endpoint
      await pk.getByRole('radio', { name: new RegExp(`^${L('لا', 'No')}`) }).click()
      await page.getByRole('button', { name: L('حفظ المسودة', 'Save draft') }).click()
      await expect.poll(() => sent.patches.at(-1)?.pickup_option).toBe('none')
      expect(sent.patches.at(-1)).toMatchObject({ pickup_location: null, pickup_earliest_time: null })
      expect(sent.pickups).toBe(0)
    })
  }
}

for (const lang of ['ar', 'en'] as const) {
  const L = (ar: string, en: string) => (lang === 'en' ? en : ar)
  for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 700]] as const) {
    test(`Pickup OFF ${lang.toUpperCase()} at ${w}px: «Schedule Pickup» disabled, «No» kept, read-only flow reaches Review, no pickup call`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      const sent = await base(page, lang, false)
      await page.goto('/create-shipment?draft=5')
      await expect(page.getByText('Gulf Retail Client').first()).toBeVisible()
      await page.getByRole('button', { name: L('الاستلام', 'Pickup') }).first().click()
      const pk = page.getByTestId('pickup-step')
      const yes = pk.getByRole('radio', { name: new RegExp(L('نعم — جدولة استلام', 'Yes — Schedule Pickup')) })
      await expect(yes).toBeDisabled()
      await expect(yes).toContainText(L('حجز مندوب DHL غير مفعّل حاليًا.', 'Courier pickup booking is not enabled yet.'))
      await expect(pk.getByRole('radio', { name: new RegExp(`^${L('لا', 'No')}`) })).toHaveAttribute('aria-checked', 'true')
      await expect(pk.getByTestId('pickup-gate-off')).toContainText(L('استلام الشحنة بواسطة مندوب DHL غير متاح حاليًا.', 'Courier pickup is not currently available.'))
      expect(await page.evaluate(() => document.body.innerText)).not.toMatch(/DHL_PROD_PICKUP_ENABLED/)
      await fits(page, 'pickup-step')
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/pickup-off-${lang}-${w}.png`, fullPage: true })
      await page.getByRole('button', { name: L('التالي', 'Next') }).click()
      await expect(pk).toHaveCount(0) // Pickup = No → on to the review
      expect(sent.pickups).toBe(0)
    })
  }
}
