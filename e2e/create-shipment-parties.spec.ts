import { expect, test, type Page } from '@playwright/test'

/**
 * «إنشاء شحنة» → Step 1 «الأطراف / Parties» (DHL-like From | Switch | To on
 * SHIPPEC's design): layout at 1440 / 1280 / 1024 / 768 / 600 / 390 / 320 px
 * in Arabic (RTL) and English (LTR), dropdowns never clipped, saved-contact
 * autofill, address suggestion, the Next gate. Every API request is answered
 * here; nothing reaches a real server, an address provider or DHL.
 * Screenshots → PW_SHOTS_DIR.
 */

const SHOTS = process.env.PW_SHOTS_DIR
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
const ok = (data: unknown, status = 200) => json({ success: true, data }, status)

const CONTACT = {
  id: 41, role: 'receiver', name: 'Ahmed Hassan', business_contact: true, company: 'ABC Trading', country_code: 'EG', country_name: 'Egypt',
  address_line1: '12 Tahrir Street', address_line2: 'Floor 3', short_address: null, building_number: null, street: null, additional_number: null, suburb: 'Downtown',
  city: 'Cairo', province: 'Cairo', postal_code: '11511', residential: false, email: 'ahmed@abc.example', phones: [{ type: 'office', code: '20', number: '100 123 4567', extension: null, sms: false }],
  phone_normalized: '201001234567', vat_tax_id: null, eori: null, notes: null, created_by: 1, created_at: '', updated_at: '',
}

async function base(page: Page, lang: 'ar' | 'en' = 'ar') {
  await page.addInitScript((l) => {
    sessionStorage.setItem('shippec_session', JSON.stringify({ id: 1, username: 'manager@test', name: 'Manager', role: 'manager', status: 'approved' }))
    sessionStorage.setItem('auth_token', 'e2e-token')
    localStorage.setItem('shippec.createShipment.lang', l)
  }, lang)
  const calls = { contacts: [] as string[], autocomplete: [] as string[] }
  await page.route(/\/api\//, (r) => r.fulfill(ok([])))
  await page.route(/socket\.io/, (r) => r.abort())
  await page.route(/\/api\/dhl\/shipments(\?.*)?$/, (r) => r.fulfill(json({ success: true, data: [], pagination: { total: 0 } })))
  await page.route(/\/api\/clients\?search=/, (r) => r.fulfill(ok([{ id: 3, name: 'Gulf Retail Client', phone: '0550000000', email: null, city: 'Dammam' }])))
  await page.route(/\/api\/shipping-contacts\?/, (r) => { calls.contacts.push(r.request().url()); return r.fulfill(ok([CONTACT])) })
  await page.route(/\/api\/address-lookup\/autocomplete\?/, (r) => {
    calls.autocomplete.push(r.request().url())
    return r.fulfill(ok([{ id: 'ChIJ_tahrir_00001', main: '15 Tahrir Square', secondary: 'Cairo, Egypt', short_address: null, address: null, provider: 'google' }]))
  })
  await page.route(/\/api\/address-lookup\/details\?/, (r) => r.fulfill(ok({
    address_line1: '15 Tahrir Square', address_line2: null, short_address: null, building_number: '15', street: 'Tahrir Square', additional_number: null,
    district: 'Downtown', city: 'Cairo', province: 'C', postal_code: '11519', country_code: 'EG',
  })))
  return calls
}

test.use({ launchOptions: { slowMo: 0 }, video: 'off', trace: 'off', actionTimeout: 10_000 })

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!

for (const lang of ['ar', 'en'] as const) {
  for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768], [768, 1024], [600, 900], [390, 844], [320, 700]] as const) {
    test(`Parties layout ${lang.toUpperCase()} at ${w}px: one connected From | Switch | To surface, direction, no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await base(page, lang)
      await page.goto('/create-shipment')
      const surface = page.getByTestId('parties-surface')
      await expect(surface).toBeVisible()
      expect(await surface.evaluate((e) => (e.closest('[dir]') as HTMLElement).dir)).toBe(lang === 'en' ? 'ltr' : 'rtl')
      // the page's own title follows the page language (the global top bar keeps the app language)
      await expect(page.locator('div[lang] h1')).toHaveText(lang === 'en' ? 'Create Shipment' : 'إنشاء شحنة')
      const from = await box(page, '[data-party="shipper"]')
      const to = await box(page, '[data-party="receiver"]')
      const sw = await box(page, '[data-testid="parties-switch"]')
      if (w >= 768) {
        // side by side: From first in reading order (right in Arabic, left in English), Switch between them
        expect(Math.abs(from.y - to.y)).toBeLessThan(4)
        if (lang === 'en') { expect(from.x).toBeLessThan(sw.x); expect(sw.x).toBeLessThan(to.x) } else { expect(from.x).toBeGreaterThan(sw.x); expect(sw.x).toBeGreaterThan(to.x) }
      } else {
        // stacked: From, Switch, To
        expect(sw.y).toBeGreaterThanOrEqual(from.y + from.height - 2)
        expect(to.y).toBeGreaterThanOrEqual(sw.y + sw.height - 2)
      }
      const overflow = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }))
      expect(overflow.scrollW).toBeLessThanOrEqual(overflow.innerW + 1)
      // every input fits inside its panel
      const outside = await page.evaluate(() => [...document.querySelectorAll('[data-party] input, [data-party] select, [data-party] textarea')].filter((el) => {
        const r = el.getBoundingClientRect(); const p = (el.closest('[data-party]') as HTMLElement).getBoundingClientRect()
        return r.width > 0 && (r.left < p.left - 1 || r.right > p.right + 1)
      }).length)
      expect(outside).toBe(0)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/parties-${lang}-${w}.png`, fullPage: false })
    })
  }
}

for (const [w, h] of [[1440, 900], [390, 844]] as const) {
  test(`Parties flow at ${w}px: country dropdown not clipped, saved contact fills To, address suggestion, Next gate`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    const calls = await base(page)
    await page.goto('/create-shipment')
    const to = page.locator('[data-party="receiver"]')
    await expect(to).toBeVisible()

    // Next first: blocked, the missing fields are marked
    await page.getByRole('button', { name: /التالي/ }).click()
    await expect(page.getByTestId('parties-gate-summary')).toBeVisible()
    await expect(to.getByText('الاسم مطلوب.')).toBeVisible()
    await expect(page.getByText('اختر عميل SHIPPEC (صاحب الفاتورة).')).toBeVisible()

    // Country dropdown: opens under the input, fully on screen, on top
    const country = to.getByLabel(/^البلد\/الإقليم/)
    await country.click()
    await country.fill('Egy')
    const option = page.getByRole('option', { name: /مصر/ })
    await expect(option).toBeVisible()
    const ob = (await option.boundingBox())!
    expect(ob.x).toBeGreaterThanOrEqual(0)
    expect(ob.x + ob.width).toBeLessThanOrEqual(w + 1)
    expect(await option.evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && el.contains(top) })).toBe(true)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/parties-country-dropdown-${w}.png` })
    await option.click()
    await expect(to.getByLabel(/^الرمز\*?$/)).toHaveValue('20')

    // Saved contact: typing the name suggests it; choosing fills every field
    await to.getByLabel(/^الاسم/).fill('Ahm')
    const saved = page.getByRole('option', { name: /Ahmed Hassan/ })
    await expect(saved).toBeVisible()
    expect(await saved.evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && el.contains(top) })).toBe(true)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/parties-contact-dropdown-${w}.png` })
    await saved.click()
    await expect(to.getByLabel(/^الشركة/)).toHaveValue('ABC Trading')
    await expect(to.getByLabel(/^المدينة/)).toHaveValue('Cairo')
    await expect(to.getByLabel(/^الهاتف/)).toHaveValue('100 123 4567')
    expect(new URL(calls.contacts[0]).searchParams.get('role')).toBe('receiver')

    // Address 1 suggestion (Egypt only)
    await to.getByLabel(/^العنوان 1/).fill('15 Tahrir')
    const addr = page.getByRole('option', { name: /15 Tahrir Square/ })
    await expect(addr).toBeVisible()
    expect(new URL(calls.autocomplete.at(-1)!).searchParams.get('country')).toBe('EG')
    await addr.click()
    await expect(to.getByLabel(/^الرمز البريدي/)).toHaveValue('11519')

    // the SHIPPEC customer, then Next goes on
    await page.getByLabel(/عميل SHIPPEC \(صاحب الفاتورة\)/).fill('Gulf')
    await page.getByRole('option', { name: /Gulf Retail Client/ }).click()
    await expect(page.getByTestId('parties-gate-summary')).toHaveCount(0)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/parties-filled-${w}.png`, fullPage: true })
    await page.getByRole('button', { name: /التالي/ }).click()
    await expect(page.getByText('نوع المحتوى')).toBeVisible()
  })
}
