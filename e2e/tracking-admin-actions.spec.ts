import { expect, test, type Page } from '@playwright/test'

/**
 * «متابعة البوليصة» — the simplified top of the page (admin): only
 * «تحقق البوليصة» and «مزامنة الفواتير», no engineering metrics. Desktop,
 * tablet, 390 px and 320 px. Every API request is answered here; nothing
 * reaches a real server or DHL. Screenshots → PW_SHOTS_DIR.
 */

const SHOTS = process.env.PW_SHOTS_DIR
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
const ok = (data: unknown, status = 200) => json({ success: true, data }, status)

const item = (awb: string, i: number) => ({
  id: i + 1, awb, carrier: 'DHL', invoice_id: 3260 + i, invoice_number: `DH${3260 + i}`, client_id: 5, customer_name: 'شركة الاختبار',
  booking_date: '2026-11-18', invoice_destination: null, raw_status: 'AF', normalized_status: i === 1 ? null : 'IN_TRANSIT', requires_action: false,
  current_description: i === 1 ? null : 'Arrived at DHL Sort Facility RIYADH-SA', current_location: 'RIYADH-SA', current_city: 'RIYADH', current_country_code: 'SA',
  origin: 'RIYADH-SA', origin_city: 'Riyadh', origin_country_code: 'SA', destination: 'DUBAI-AE', destination_city: 'Dubai', destination_country_code: 'AE',
  product_code: 'P', number_of_pieces: 1, estimated_delivery: '2026-11-29T23:59:00', delivered_at: null, delivered_local: null, delivered_gmt_offset: null,
  delivered_location: null, delivered_signed_by: null, last_event_at: '2026-11-19T22:30:00Z', last_event_local: i === 1 ? null : '2026-11-20 01:30:00', last_event_gmt_offset: '+03:00',
  sync_status: i === 1 ? 'pending' : 'ok', last_synced_at: i === 1 ? null : new Date(Date.now() - 20 * 60_000).toISOString(), last_attempt_at: null, next_sync_at: null, consecutive_failures: 0,
  last_error_code: null, last_error_message: null, pickup_local: '2026-11-16 15:15:00', pickup_gmt_offset: '+03:00', freshness: i === 1 ? 'pending' : 'current', sources: ['invoice_awb'],
})
const record = { normalized_status: 'IN_TRANSIT', sync_status: 'ok', current_description: 'Arrived at DHL Sort Facility RIYADH-SA', current_location: 'RIYADH-SA',
  last_event_local: '2026-11-20 10:15:00', last_event_gmt_offset: '+03:00', last_synced_at: new Date().toISOString(), last_attempt_at: null }

type State = { sync: Record<string, unknown>; lists: string[]; verifyBodies: string[][]; starts: number; dhl: string[] }

async function base(page: Page): Promise<State> {
  const st: State = { sync: { eligible: 324, run: null, blocked: null }, lists: [], verifyBodies: [], starts: 0, dhl: [] }
  await page.addInitScript(() => {
    sessionStorage.setItem('shippec_session', JSON.stringify({ id: 1, username: 'admin@test', name: 'Admin', role: 'admin', status: 'approved' }))
    sessionStorage.setItem('auth_token', 'e2e-token')
  })
  page.on('request', (r) => { if (/dhl\.com/i.test(r.url())) st.dhl.push(r.url()) })
  await page.route(/\/api\//, (r) => r.fulfill(ok([])))
  await page.route(/socket\.io/, (r) => r.abort())
  await page.route(/\/api\/shipment-tracking\/summary/, (r) => r.fulfill(ok({
    counts: { total: 13031, active: 13031, in_transit: 46, out_for_delivery: 2, delivered: 4312, delivered_recent: 4312, problem: 112, exception: 12, on_hold: 25, customs: 5,
      pre_transit: 0, not_synced: 8688, waiting_sync: 324, pending_sync: 324, dhl_no_data: 8364, unknown: 0, stale: 0, failed: 37, archived_delivered: 0, all_total: 13031,
      last_synced_at: new Date().toISOString() },
    countries: { origin: [], destination: [] },
    integration: { enabled: true, env: 'production', usable: true, syncEnabled: true, syncIntervalMinutes: 30, features: { tracking: true, trackingLookup: true } },
  })))
  await page.route(/\/api\/shipment-tracking(\?.*)?$/, (r) => {
    st.lists.push(r.request().url())
    r.fulfill(ok({ items: ['6606077671', '0012345678', '9988679120'].map(item), pagination: { page: 1, limit: 20, total: 3, totalPages: 1 } }))
  })
  await page.route(/\/api\/shipment-tracking\/admin\/pending-sync$/, (r) => {
    if (r.request().method() === 'POST') {
      st.starts++
      st.sync = { eligible: 0, run: { id: 9, status: 'running', total: 324, processed: 85, found: 63, no_data: 18, temporary: 4, skipped: 0, started_at: new Date().toISOString(), finished_at: null }, blocked: null }
      return r.fulfill(ok({ started: true, already_running: false, nothing_to_sync: false, run_id: 9, queued: 324, status: st.sync }, 201))
    }
    return r.fulfill(ok(st.sync))
  })
  await page.route(/\/api\/shipment-tracking\/admin\/backfill\/verify$/, (r) => {
    const awbs: string[] = JSON.parse(r.request().postData() ?? '{}').awbs ?? []
    st.verifyBodies.push(awbs)
    r.fulfill(ok({ api_calls: awbs.length, stopped_by: null, results: awbs.map((awb) => awb === '0012345678'
      ? { input: awb, awb, result: 'not_found', registered: true, normalized_status: null, error_code: 'DHL_NOT_FOUND', detail: null, registered_now: false, record: { ...record, normalized_status: null, sync_status: 'not_found', current_description: null, last_synced_at: null } }
      : { input: awb, awb, result: 'success', registered: true, normalized_status: 'IN_TRANSIT', error_code: null, detail: null, registered_now: awb === '2816850120', record }) }))
  })
  return st
}

async function noHorizontalScroll(page: Page, label: string) {
  const r = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }))
  expect(r.scrollW, `${label}: no horizontal page scroll`).toBeLessThanOrEqual(r.innerW + 1)
}

test.use({ launchOptions: { slowMo: 0 }, video: 'off', trace: 'off', locale: 'ar-SA' })

for (const [w, h] of [[1440, 900], [768, 1024], [390, 844], [320, 700]] as const) {
  test(`top of the page at ${w}px: only the two actions; verification, sync confirmation, progress and the normal search work`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    const st = await base(page)
    await page.goto('/shipment-tracking')
    const bar = page.getByTestId('tracking-actions')
    await expect(bar).toBeVisible()
    await expect(page.locator('[data-tracking-awb]:visible').first()).toBeVisible()
    // exactly the two primary actions, fully visible inside the viewport, and none of the old metrics
    const buttons = bar.getByRole('button')
    await expect(buttons).toHaveText(['تحقق البوليصة', 'مزامنة الفواتير'])
    for (const b of await buttons.all()) {
      const box = (await b.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(w + 0.5)
      expect(box.height).toBeGreaterThanOrEqual(44) // touch target
      expect(await b.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true) // label never clipped
    }
    for (const gone of ['تم تسجيل', 'فحص الفواتير', 'تحقق تجريبي', 'حجم الدفعة', 'فاصل الطلبات', 'طلبات DHL اليوم', 'بدء المزامنة الأولية']) {
      await expect(page.getByText(gone)).toHaveCount(0)
    }
    await noHorizontalScroll(page, `${w}px`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/actions-${w}-top.png` })

    // «تحقق البوليصة»
    await bar.getByRole('button', { name: 'تحقق البوليصة' }).click()
    const panel = page.getByTestId('verify-panel')
    await expect(panel).toBeVisible()
    await panel.getByLabel('أرقام البوالص').fill('6606077671\n2816850120, 0012345678\n6606077671')
    await expect(panel).toContainText('3 بوالص — حُذف المكرر (1)')
    await panel.getByRole('button', { name: /تحقق الآن/ }).click()
    const results = panel.getByTestId('verify-results')
    await expect(results).toContainText('تم التحقق من 3 بوالص')
    await expect(results).toContainText('وجدت بيانات: 2')
    await expect(results).toContainText('لا تتوفر بيانات: 1')
    expect(st.verifyBodies).toEqual([['6606077671', '2816850120', '0012345678']])
    await results.locator('[data-verify-awb="6606077671"] summary').click()
    await expect(results.locator('[data-verify-awb="6606077671"]')).toContainText('تم العثور على بيانات البوليصة وتحديثها بنجاح.')
    await results.locator('[data-verify-awb="0012345678"] summary').click()
    await expect(results.locator('[data-verify-awb="0012345678"]')).toContainText('لا تتوفر بيانات تتبع من DHL لهذه البوليصة.')
    await noHorizontalScroll(page, `${w}px verify`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/actions-${w}-verify.png`, fullPage: true })
    await panel.getByRole('button', { name: 'إغلاق التحقق' }).click()
    await expect(panel).toHaveCount(0)

    // «مزامنة الفواتير»: confirmation → start → minimal progress
    await bar.getByRole('button', { name: 'مزامنة الفواتير' }).click()
    const dialog = page.getByTestId('sync-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('sync-eligible')).toContainText('عدد البوالص المؤهلة للمزامنة: 324')
    const dbox = (await dialog.boundingBox())!
    expect(dbox.x).toBeGreaterThanOrEqual(0)
    expect(dbox.x + dbox.width).toBeLessThanOrEqual(w + 0.5)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/actions-${w}-dialog.png` })
    await dialog.getByRole('button', { name: /بدء المزامنة/ }).click()
    await expect(dialog).toHaveCount(0)
    const progress = page.getByTestId('pending-sync-progress')
    await expect(progress).toContainText('تمت معالجة 85 من 324')
    await expect(bar.getByRole('button', { name: /جاري المزامنة/ })).toBeDisabled()
    expect(st.starts).toBe(1)
    await noHorizontalScroll(page, `${w}px progress`)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/actions-${w}-progress.png` })

    // completion (next poll) → result + page refreshed
    const lists = st.lists.length
    st.sync = { eligible: 0, run: { id: 9, status: 'completed', total: 324, processed: 324, found: 270, no_data: 46, temporary: 8, skipped: 0, started_at: new Date().toISOString(), finished_at: new Date().toISOString() }, blocked: null }
    const done = page.getByTestId('pending-sync-done')
    await expect(done).toContainText('اكتملت المزامنة', { timeout: 15_000 })
    await expect(done).toContainText('270')
    await expect.poll(() => st.lists.length).toBeGreaterThan(lists)
    await expect(bar.getByRole('button', { name: 'مزامنة الفواتير' })).toBeEnabled()
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/actions-${w}-done.png` })

    // the normal SHIPPEC search is unchanged (searches SHIPPEC records, not DHL)
    await page.getByPlaceholder('رقم البوليصة، رقم الفاتورة، اسم العميل أو الجوال').fill('DH3260')
    await expect.poll(() => st.lists.some((u) => new URL(u).searchParams.get('q') === 'DH3260')).toBe(true)
    expect(st.dhl).toEqual([]) // the browser never called DHL
  })
}
