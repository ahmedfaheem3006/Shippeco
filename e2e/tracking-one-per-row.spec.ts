import { expect, test, type Page } from '@playwright/test'

/**
 * Final layout rule of «متابعة البوليصة»: EXACTLY ONE shipment per row at
 * every viewport width (desktop table row / one full-width card), never two
 * shipments side by side — also while the window is resized continuously.
 * The AWB is never split into digit groups. Every API request is answered
 * here; nothing reaches a real server or DHL. Screenshots → PW_SHOTS_DIR.
 */

const SHOTS = process.env.PW_SHOTS_DIR
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
const AWBS = ['6606077671', '3641367601', '0012345678', '9988679120', '3342710475']

const item = (awb: string, i: number) => ({
  id: i + 1, awb, carrier: 'DHL', invoice_id: 3260 + i, invoice_number: `DH${3260 + i}`, client_id: 5, customer_name: ['بنين الإبراهيم', 'شركة حلول كميت للصناعة', 'Aisha hussain', 'ندى ( Adorable - أدورابل )', 'سعود عالم'][i],
  booking_date: '2026-11-18', invoice_destination: null, raw_status: 'DF', normalized_status: i === 4 ? 'DELIVERED' : i === 2 ? null : 'IN_TRANSIT', requires_action: false,
  current_description: i === 2 ? null : 'Shipment has departed from a DHL facility LEIPZIG-GERMANY', current_location: 'LEIPZIG-DE', current_city: 'LEIPZIG', current_country_code: 'DE',
  origin: 'ROMULUS-US', origin_city: 'Romulus', origin_country_code: 'US', destination: 'RIYADH-SA', destination_city: 'Riyadh', destination_country_code: 'SA',
  product_code: 'P', number_of_pieces: 1, estimated_delivery: '2026-11-29T23:59:00', delivered_at: i === 4 ? '2026-11-10T10:00:00Z' : null, delivered_local: i === 4 ? '2026-11-10 13:00:00' : null, delivered_gmt_offset: i === 4 ? '+03:00' : null,
  delivered_location: null, delivered_signed_by: null, last_event_at: '2026-11-19T22:30:00Z', last_event_local: i === 2 ? null : '2026-11-20 00:30:00', last_event_gmt_offset: '+01:00',
  sync_status: i === 2 ? 'pending' : 'ok', last_synced_at: i === 2 ? null : new Date(Date.now() - 48 * 60_000).toISOString(), last_attempt_at: null, next_sync_at: null, consecutive_failures: 0,
  last_error_code: null, last_error_message: null, pickup_local: '2026-11-16 15:15:00', pickup_gmt_offset: '-05:00', freshness: i === 2 ? 'pending' : 'current', sources: ['invoice_awb'],
})

const lists: string[] = []
async function base(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('shippec_session', JSON.stringify({ id: 1, username: 'emp@test', name: 'Employee', role: 'employee', status: 'approved' }))
    sessionStorage.setItem('auth_token', 'e2e-token')
  })
  await page.route(/\/api\//, (r) => r.fulfill(json({ success: true, data: [] })))
  await page.route(/socket\.io/, (r) => r.abort())
  await page.route(/\/api\/shipment-tracking\/summary/, (r) => r.fulfill(json({ success: true, data: {
    counts: { total: 13031, active: 13031, in_transit: 46, out_for_delivery: 0, delivered: 1246, delivered_recent: 1246, problem: 38, exception: 12, on_hold: 25, customs: 5, pre_transit: 112,
      not_synced: 12835, waiting_sync: 12835, unknown: 0, stale: 0, failed: 37, archived_delivered: 0, all_total: 13031, last_synced_at: new Date().toISOString() },
    countries: { origin: [], destination: [] },
    integration: { enabled: true, env: 'production', usable: true, syncEnabled: true, syncIntervalMinutes: 30, features: { tracking: true, trackingLookup: true } },
  } })))
  await page.route(/\/api\/shipment-tracking(\?.*)?$/, (r) => {
    lists.push(r.request().url())
    r.fulfill(json({ success: true, data: { items: AWBS.map(item), pagination: { page: 1, limit: 20, total: 13031, totalPages: 652 } } }))
  })
}

/** Every visible shipment occupies its own row: no two overlap vertically, each spans (almost) the list width, no page h-scroll. */
async function assertOnePerRow(page: Page, label: string) {
  const r = await page.evaluate(() => {
    const items = [...document.querySelectorAll<HTMLElement>('[data-tracking-awb]')].filter((e) => e.offsetParent !== null && e.getClientRects().length > 0)
    const boxes = items.map((e) => { const b = e.getBoundingClientRect(); return { awb: e.dataset.trackingAwb!, top: b.top, bottom: b.bottom, left: b.left, width: b.width } })
    const container = items[0]?.closest('table, [data-testid="tracking-card-list"]') as HTMLElement | null
    return {
      boxes,
      containerWidth: container?.getBoundingClientRect().width ?? 0,
      kind: container?.tagName === 'TABLE' ? 'table' : 'cards',
      scrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      awbTexts: items.map((e) => (e.querySelector('[data-testid="tracking-awb"]') as HTMLElement | null)?.textContent ?? ''),
    }
  })
  expect(r.boxes.length, `${label}: shipments visible`).toBe(AWBS.length)
  for (let i = 1; i < r.boxes.length; i++) {
    // the next shipment starts at or below the previous one's bottom → never side by side
    expect(r.boxes[i].top, `${label}: ${r.boxes[i].awb} must be below ${r.boxes[i - 1].awb}`).toBeGreaterThanOrEqual(r.boxes[i - 1].bottom - 1)
  }
  for (const b of r.boxes) expect(b.width, `${label}: ${b.awb} spans the list`).toBeGreaterThanOrEqual(r.containerWidth * 0.95)
  expect(r.scrollW, `${label}: no horizontal page scroll`).toBeLessThanOrEqual(r.innerW + 1)
  expect(r.awbTexts, `${label}: AWBs never split`).toEqual(AWBS)
  return r.kind
}

test.use({ launchOptions: { slowMo: 0 }, video: 'off', trace: 'off', locale: 'ar-SA' })

for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [600, 900], [390, 844], [320, 700]] as const) {
  test(`one shipment per row at ${w}px; AWB unspaced`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await base(page)
    await page.goto('/shipment-tracking')
    await expect(page.locator('[data-tracking-awb]:visible').first()).toBeVisible()
    const kind = await assertOnePerRow(page, `${w}px`)
    expect(kind).toBe(w >= 1280 ? 'table' : 'cards')
    await expect(page.locator('[data-tracking-awb="6606077671"]:visible [data-testid="tracking-awb"]')).toHaveText('6606077671')
    await expect(page.getByText('660 607 7671')).toHaveCount(0)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/tracking-${w}.png`, fullPage: false })
  })
}

test('browser resized continuously 1440 → 320 → 1440: never two shipments side by side', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await base(page)
  await page.goto('/shipment-tracking')
  await expect(page.locator('[data-tracking-awb]:visible').first()).toBeVisible()
  const widths = [...Array.from({ length: 23 }, (_, i) => 1440 - i * 50), 330, 320, ...Array.from({ length: 12 }, (_, i) => 360 + i * 97)]
  for (const w of widths) {
    await page.setViewportSize({ width: w, height: 900 })
    await page.waitForTimeout(30)
    await assertOnePerRow(page, `resize ${w}px`)
  }
})

test('the list asks the Backend for the ACTIVE dataset by default (server-side, paginated)', async ({ page }) => {
  lists.length = 0
  await page.setViewportSize({ width: 390, height: 844 })
  await base(page)
  await page.goto('/shipment-tracking')
  await expect(page.locator('[data-tracking-awb]:visible').first()).toBeVisible()
  const u = new URL(lists[0])
  expect(u.searchParams.get('view')).toBe('active')
  expect(u.searchParams.get('limit')).toBe('20')
  await expect(page.getByTestId('tracking-counters').getByRole('radio', { name: /المسلّمة القديمة/ })).toBeVisible()
})
