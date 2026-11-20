import { expect, test, type Page } from '@playwright/test'

/**
 * «تنزيل البوليصة» next to «طباعة البوليصة» on /shipment-tracking/:awb, and the
 * route-aware header / browser-tab title — desktop (1440) and mobile (390).
 * Every API request is answered here; nothing reaches a real server or DHL.
 * Screenshots go to PW_SHOTS_DIR when set (outside the repo).
 */

const SHOTS = process.env.PW_SHOTS_DIR
const AWB = '6606077671'
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')

const details = (over: Record<string, unknown> = {}) => ({
  id: 9, awb: AWB, carrier: 'DHL', invoice_id: 3267, invoice_number: 'DH3267', client_id: 5, customer_name: 'بنين الإبراهيم',
  booking_date: '2026-11-18', invoice_destination: null, raw_status: 'DF', normalized_status: 'IN_TRANSIT', requires_action: false,
  current_description: 'Shipment has departed from a DHL facility LEIPZIG-GERMANY', current_location: 'LEIPZIG-DE', current_city: 'LEIPZIG', current_country_code: 'DE',
  origin: 'ROMULUS-US', origin_city: 'Romulus', origin_country_code: 'US', destination: 'RIYADH-SA', destination_city: 'Riyadh', destination_country_code: 'SA',
  product_code: 'P', number_of_pieces: 1, estimated_delivery: '2026-11-29T23:59:00', delivered_at: null, delivered_local: null, delivered_gmt_offset: null,
  delivered_location: null, delivered_signed_by: null, last_event_at: '2026-11-19T22:30:00Z', last_event_local: '2026-11-20 00:30:00', last_event_gmt_offset: '+01:00',
  sync_status: 'ok', last_synced_at: new Date(Date.now() - 48 * 60_000).toISOString(), last_attempt_at: null, next_sync_at: null, consecutive_failures: 0,
  last_error_code: null, last_error_message: null, pickup_local: '2026-11-16 15:15:00', pickup_gmt_offset: '-05:00', freshness: 'current',
  shipment_description: 'Parts', total_weight: 71.54, weight_unit: 'imperial', shipment_timestamp: '2026-11-16T05:40:00', pieces: [],
  events: [
    { id: 1, raw_status: 'DF', normalized_status: 'IN_TRANSIT', description: 'Shipment has departed from a DHL facility LEIPZIG-GERMANY', remark: null, next_steps: null, location: 'LEIPZIG-DE', location_code: 'LEJ', city: 'LEIPZIG', country_code: 'DE', event_date: '2026-11-20', event_time: '00:30:00', gmt_offset: '+01:00', event_at: '2026-11-19T23:30:00Z', signed_by: null, sequence: 0 },
  ],
  refresh_cooldown_seconds: 60,
  awb_document: { available: true, type: 'waybill', content_type: 'application/pdf' },
  ...over,
})

async function base(page: Page, role = 'admin') {
  await page.addInitScript((r) => {
    sessionStorage.setItem('shippec_session', JSON.stringify({ id: 1, username: 'admin@test', name: 'System Admin', role: r, status: 'approved' }))
    sessionStorage.setItem('auth_token', 'e2e-token')
  }, role)
  await page.route(/\/api\//, (r) => r.fulfill(json({ success: true, data: [] })))
  await page.route(/socket\.io/, (r) => r.abort())
  await page.route(/\/api\/shipment-tracking\/summary/, (r) => r.fulfill(json({ success: true, data: {
    counts: { total: 0, in_transit: 0, out_for_delivery: 0, delivered: 0, problem: 0, exception: 0, on_hold: 0, customs: 0, pre_transit: 0, not_synced: 0, unknown: 0, stale: 0, failed: 0, last_synced_at: null },
    countries: { origin: [], destination: [] },
    integration: { enabled: true, env: 'production', usable: true, syncEnabled: true, syncIntervalMinutes: 30, features: { tracking: true, trackingLookup: true } },
  } })))
  await page.route(/\/api\/shipment-tracking(\?.*)?$/, (r) => r.fulfill(json({ success: true, data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } })))
  await page.route(/\/api\/shipment-tracking\/admin\/backfill\/status/, (r) => r.fulfill(json({ success: false, error: { message: 'x' } }, 500)))
}

const shot = async (page: Page, name: string) => {
  if (!SHOTS) return
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${SHOTS}/${name}.png` })
}

const boxesOverlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

test.use({ launchOptions: { slowMo: 0 }, video: 'off', trace: 'off' })

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'mobile', viewport: { width: 390, height: 844 } },
] as const

for (const vp of VIEWPORTS) {
  test.describe(`AWB download + page title — ${vp.name}`, () => {
    test.use({ viewport: vp.viewport, locale: 'ar-SA' })

    test('header and browser tab follow the route', async ({ page }) => {
      await base(page)
      await page.route(new RegExp(`/api/shipment-tracking/${AWB}$`), (r) => r.fulfill(json({ success: true, data: details() })))
      const title = page.getByRole('banner').locator('h1:visible')
      for (const [url, name] of [
        ['/shipment-tracking', 'متابعة البوليصة'],
        [`/shipment-tracking/${AWB}`, 'تفاصيل البوليصة'],
        ['/create-shipment', 'إنشاء شحنة'],
        ['/dashboard', 'الرئيسية'],
      ] as const) {
        await page.goto(url)
        await expect(title).toHaveText(name)
        await expect(page).toHaveTitle(`${name} | SHIPPEC`)
        // the title stays inside the header (no overflow), the controls stay visible
        const header = (await page.getByRole('banner').boundingBox())!
        const h1 = (await title.boundingBox())!
        expect(h1.x).toBeGreaterThanOrEqual(header.x - 1)
        expect(h1.x + h1.width).toBeLessThanOrEqual(header.x + header.width + 1)
        await expect(page.getByRole('banner').getByTitle('الإشعارات')).toBeVisible()
        await expect(page.getByRole('banner').getByTitle('تبديل المظهر')).toBeVisible()
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    })

    test('«تنزيل البوليصة» downloads DHL-AWB-<AWB>.pdf from the SHIPPEC Backend, once, next to «طباعة البوليصة»', async ({ page }) => {
      await base(page)
      let downloads = 0
      const dhlCalls: string[] = []
      page.on('request', (req) => { if (/dhl\.com/i.test(req.url())) dhlCalls.push(req.url()) })
      await page.route(new RegExp(`/api/shipment-tracking/${AWB}$`), (r) => r.fulfill(json({ success: true, data: details() })))
      await page.route(new RegExp(`/api/shipment-tracking/${AWB}/waybill$`), async (r) => {
        downloads++
        expect(r.request().headers().authorization).toBe('Bearer e2e-token')
        await new Promise((res) => setTimeout(res, 600))
        return r.fulfill({ status: 200, body: PDF, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="DHL-AWB-${AWB}.pdf"` } })
      })
      await page.goto(`/shipment-tracking/${AWB}`)
      const print = page.getByRole('button', { name: /طباعة البوليصة/ })
      const download = page.getByRole('button', { name: /تنزيل البوليصة/ })
      const refresh = page.getByRole('button', { name: /تحديث الحالة من DHL/ })
      await expect(print).toBeVisible()
      await expect(download).toBeVisible()
      await expect(refresh).toBeVisible()
      const [bp, bd, br] = [(await print.boundingBox())!, (await download.boundingBox())!, (await refresh.boundingBox())!]
      expect(boxesOverlap(bp, bd)).toBe(false)
      expect(boxesOverlap(bd, br)).toBe(false)
      for (const b of [bp, bd, br]) {
        expect(b.height).toBeGreaterThanOrEqual(43) // touch target
        expect(b.x).toBeGreaterThanOrEqual(0)
        expect(b.x + b.width).toBeLessThanOrEqual(vp.viewport.width)
      }
      expect(Math.abs(bp.y - bd.y)).toBeLessThan(4) // side by side
      await shot(page, `awb-actions-${vp.name}`)

      const dl = page.waitForEvent('download')
      await download.click()
      await expect(page.getByRole('button', { name: /جاري التنزيل/ })).toBeDisabled()
      await page.getByRole('button', { name: /جاري التنزيل/ }).click({ force: true }).catch(() => undefined) // a second click is ignored
      const file = await dl
      expect(file.suggestedFilename()).toBe(`DHL-AWB-${AWB}.pdf`)
      await expect(download).toBeEnabled()
      expect(downloads).toBe(1)
      expect(dhlCalls).toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    })

    test('no stored document → Arabic "unavailable" message, no request', async ({ page }) => {
      await base(page)
      let downloads = 0
      await page.route(new RegExp(`/api/shipment-tracking/${AWB}$`), (r) => r.fulfill(json({ success: true, data: details({ awb_document: { available: false, type: null, content_type: null } }) })))
      await page.route(new RegExp(`/api/shipment-tracking/${AWB}/waybill$`), (r) => { downloads++; return r.fulfill(json({ success: false }, 404)) })
      await page.goto(`/shipment-tracking/${AWB}`)
      await page.getByRole('button', { name: /تنزيل البوليصة/ }).click()
      await expect(page.getByText(/مستند البوليصة غير متاح/)).toBeVisible()
      expect(downloads).toBe(0)
      await shot(page, `awb-unavailable-${vp.name}`)
    })
  })
}
