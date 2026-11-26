import { expect, test, type Page } from '@playwright/test'

/**
 * «إضافة عميل جديد / Add New Customer» without leaving the workflow — the one
 * shared customer form (QuickAddCustomerModal) in:
 *   - الإدخال اليدوي (/new-invoice): the new customer is selected and the invoice is issued to its id;
 *   - إنشاء شحنة (/create-shipment): the new customer becomes the SHIPPEC invoice owner,
 *     sender / receiver and the rest of the wizard stay as typed.
 * Every API answer is mocked — nothing reaches a server, no customer / invoice /
 * shipment / draft is really created, nothing reaches DHL.
 */

const SHOTS = process.env.PW_SHOTS_DIR
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
const ok = (data: unknown, status = 200) => json({ success: true, data }, status)
const SAVED = { id: 412, name: 'شركة النخبة', phone: '0551112222', email: null, company: null, city: 'الرياض', address: null, tax_number: null, source: 'manual' }

type Calls = { createClient: unknown[]; createInvoice: unknown[]; shipmentWrites: string[] }

async function base(page: Page, opts: { lang?: 'ar' | 'en'; clientStatus?: number } = {}) {
  const calls: Calls = { createClient: [], createInvoice: [], shipmentWrites: [] }
  await page.addInitScript((l) => {
    sessionStorage.setItem('shippec_session', JSON.stringify({ id: 1, username: 'admin@test', name: 'Admin', role: 'admin', status: 'approved' }))
    sessionStorage.setItem('auth_token', 'e2e-token')
    localStorage.setItem('shippec.createShipment.lang', l)
  }, opts.lang ?? 'ar')
  await page.route(/\/api\//, (r) => r.fulfill(ok([])))
  await page.route(/socket\.io/, (r) => r.abort())
  await page.route(/\/api\/invoices\/next-number/, (r) => r.fulfill(ok({ invoice_number: 'DH9000' })))
  // any write to a DHL shipment / draft is recorded — a customer quick add must not cause one
  await page.route(/\/api\/dhl\/shipments(\/.*)?(\?.*)?$/, (r) => {
    if (r.request().method() !== 'GET') calls.shipmentWrites.push(`${r.request().method()} ${new URL(r.request().url()).pathname}`)
    return r.fulfill(json({ success: true, data: [], pagination: { total: 0 } }))
  })
  await page.route(/\/api\/clients$/, (r) => {
    if (r.request().method() !== 'POST') return r.fulfill(ok([]))
    calls.createClient.push(r.request().postDataJSON())
    const status = opts.clientStatus ?? 201
    return status >= 400
      ? r.fulfill(json({ success: false, error: { code: 'INTERNAL', message: 'Internal server error' } }, status))
      : r.fulfill(ok({ ...SAVED, ...(r.request().postDataJSON() as object) }, 201))
  })
  await page.route(/\/api\/invoices$/, (r) => {
    if (r.request().method() !== 'POST') return r.fulfill(ok([]))
    calls.createInvoice.push(r.request().postDataJSON())
    return r.fulfill(ok({ id: 9001, invoice_number: 'DH9000', client_id: 412 }, 201))
  })
  return calls
}

test.use({ launchOptions: { slowMo: 0 }, video: 'off', trace: 'off', actionTimeout: 10_000 })

async function noHorizontalScroll(page: Page) {
  const o = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }))
  expect(o.scrollW).toBeLessThanOrEqual(o.innerW + 1)
}
/** Screenshots after the modal's fade / zoom-in has finished. */
const settled = (page: Page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
async function dialogFits(page: Page, w: number) {
  const b = (await page.getByTestId('quick-add-customer-modal').boundingBox())!
  expect(b.x).toBeGreaterThanOrEqual(0)
  expect(b.x + b.width).toBeLessThanOrEqual(w + 1)
}

for (const [w, h] of [[1280, 800], [390, 844]] as const) {
  test(`Manual invoice at ${w}px: add a customer, it is selected, the invoice keeps its data and is issued to that customer id`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    const calls = await base(page)
    await page.goto('/new-invoice')
    await page.getByRole('button', { name: /إدخال يدوي مباشر/ }).click()
    const price = page.getByPlaceholder('0.00').first()
    await price.fill('250')
    await page.getByPlaceholder('XXXXXXXXXX').fill('1675565474')
    await page.getByPlaceholder('الاسم الكامل').fill('Receiver Omar')

    const btn = page.getByTestId('invoice-add-customer')
    await expect(btn).toBeVisible()
    await expect(btn).toContainText('إضافة عميل جديد')
    await btn.click()
    const dialog = page.getByRole('dialog', { name: 'إضافة عميل جديد' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('dir', 'rtl')
    await dialogFits(page, w)
    if (SHOTS) { await settled(page); await page.screenshot({ path: `${SHOTS}/quick-add-invoice-modal-${w}.png` }) }
    await dialog.getByLabel('الاسم الكامل *').fill('شركة النخبة')
    await dialog.getByLabel('رقم الجوال').fill('0551112222')
    await dialog.getByRole('button', { name: /حفظ وإضافة/ }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByPlaceholder('ابحث عن العميل بالاسم...')).toHaveValue('شركة النخبة')
    await expect(page.getByPlaceholder('أو ابحث برقم الجوال...')).toHaveValue('0551112222')
    await expect(page.getByTestId('invoice-linked-customer')).toContainText('#412')
    await expect(price).toHaveValue('250')
    await expect(page.getByPlaceholder('XXXXXXXXXX')).toHaveValue('1675565474')
    await expect(page.getByPlaceholder('الاسم الكامل')).toHaveValue('Receiver Omar')
    await noHorizontalScroll(page)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/quick-add-invoice-selected-${w}.png`, fullPage: true })
    expect(calls.createClient).toEqual([{ name: 'شركة النخبة', phone: '0551112222' }])

    await page.getByRole('button', { name: /إصدار الفاتورة النهائية/ }).click()
    await expect.poll(() => calls.createInvoice.length).toBe(1)
    expect(calls.createInvoice[0]).toMatchObject({ client_id: 412, client_name: 'شركة النخبة', phone: '0551112222', awb: '1675565474' })
  })
}

for (const lang of ['ar', 'en'] as const) {
  for (const [w, h] of [[1280, 800], [390, 844]] as const) {
    test(`Create Shipment ${lang.toUpperCase()} at ${w}px: add a customer next to the search; it becomes the invoice owner, the wizard is untouched`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      const calls = await base(page, { lang })
      await page.goto('/create-shipment')
      const to = page.locator('[data-party="receiver"]')
      await expect(to).toBeVisible()
      await to.getByLabel(lang === 'ar' ? /^الاسم/ : /^Name/).fill('Omar Receiver')
      await to.getByLabel(lang === 'ar' ? /^المدينة/ : /^City/).fill('Khobar')

      const btn = page.getByTestId('shipment-add-customer')
      await expect(btn).toBeVisible()
      await expect(btn).toContainText(lang === 'ar' ? 'إضافة عميل جديد' : 'Add New Customer')
      // next to the customer search: same row on desktop, right under it on a phone
      const search = page.getByLabel(lang === 'ar' ? /^عميل SHIPPEC/ : /^SHIPPEC Customer/)
      // both rects in one frame (the page may still be smooth-scrolling after the typing above)
      const [sb, bb] = await search.evaluate((s) => {
        const b = document.querySelector('[data-testid="shipment-add-customer"]') as HTMLElement
        return [s.getBoundingClientRect().toJSON(), b.getBoundingClientRect().toJSON()] as { y: number; height: number }[]
      })
      if (w >= 640) expect(Math.abs((sb.y + sb.height / 2) - (bb.y + bb.height / 2))).toBeLessThan(6)
      else expect(bb.y).toBeGreaterThanOrEqual(sb.y + sb.height - 1)

      await btn.click()
      const dialog = page.getByRole('dialog', { name: lang === 'ar' ? 'إضافة عميل جديد' : 'Add New Customer' })
      await expect(dialog).toBeVisible()
      await expect(dialog).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
      await dialogFits(page, w)
      if (SHOTS) { await settled(page); await page.screenshot({ path: `${SHOTS}/quick-add-shipment-modal-${lang}-${w}.png` }) }
      await dialog.getByLabel(lang === 'ar' ? 'الاسم الكامل *' : 'Full Name *').fill('شركة النخبة')
      await dialog.getByRole('button', { name: lang === 'ar' ? /حفظ وإضافة/ : /Save & Add/ }).click()
      await expect(dialog).toBeHidden()

      await expect(page.getByText('شركة النخبة', { exact: true })).toBeVisible()
      await expect(btn).toBeHidden()
      await expect(to.getByLabel(lang === 'ar' ? /^الاسم/ : /^Name/)).toHaveValue('Omar Receiver')
      await expect(to.getByLabel(lang === 'ar' ? /^المدينة/ : /^City/)).toHaveValue('Khobar')
      await noHorizontalScroll(page)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/quick-add-shipment-selected-${lang}-${w}.png` })
      expect(calls.createClient).toEqual([{ name: 'شركة النخبة' }])
      expect(calls.shipmentWrites).toEqual([]) // no draft created or saved by adding a customer
    })
  }
}

test('Create Shipment: a failed customer save keeps the wizard and selects nobody', async ({ page }) => {
  const calls = await base(page, { clientStatus: 500 })
  await page.goto('/create-shipment')
  const to = page.locator('[data-party="receiver"]')
  await to.getByLabel(/^الاسم/).fill('Omar Receiver')
  await page.getByTestId('shipment-add-customer').click()
  const dialog = page.getByRole('dialog', { name: 'إضافة عميل جديد' })
  await dialog.getByLabel('الاسم الكامل *').fill('شركة النخبة')
  await dialog.getByRole('button', { name: /حفظ وإضافة/ }).click()
  await expect(dialog.getByRole('alert')).toContainText('حدث خطأ في الخادم')
  await expect(dialog.getByLabel('الاسم الكامل *')).toHaveValue('شركة النخبة')
  await dialog.getByRole('button', { name: 'إلغاء' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('shipment-add-customer')).toBeVisible()
  await expect(to.getByLabel(/^الاسم/)).toHaveValue('Omar Receiver')
  expect(calls.createClient).toHaveLength(1)
  expect(calls.shipmentWrites).toEqual([])
})

for (const path of ['/clients', '/invoices'] as const) {
  test(`${path}: the page's own «إضافة عميل جديد» now opens the same shared form (2-second confirmation kept)`, async ({ page }) => {
    const calls = await base(page)
    const listLoads: string[] = []
    page.on('request', (req) => { if (req.method() === 'GET' && /\/api\/clients\?/.test(req.url())) listLoads.push(req.url()) })
    await page.goto(path)
    await page.getByRole('button', { name: 'إضافة عميل جديد' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'إضافة عميل جديد' })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('الاسم الكامل *').fill('شركة النخبة')
    await dialog.getByLabel('المدينة').fill('الرياض')
    const loadsBefore = listLoads.length
    await dialog.getByRole('button', { name: /حفظ وإضافة/ }).click()
    await expect(page.getByText('تم تسجيل العميل بنجاح!')).toBeVisible()
    await expect(page.getByTestId('quick-add-customer-modal')).toBeHidden({ timeout: 5_000 })
    expect(calls.createClient).toEqual([{ name: 'شركة النخبة', city: 'الرياض' }])
    if (path === '/clients') expect(listLoads.length).toBeGreaterThan(loadsBefore) // the list is reloaded with the new customer
  })
}
