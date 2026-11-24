import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * «إنشاء شحنة» → Parties: address intelligence at 1440 / 1024 / 768 / 390 / 320 px,
 * Arabic (RTL) and English (LTR) — City suggestions (country-limited) → State,
 * US ZIP → City + State (several localities offered), Saudi Short Address →
 * the whole National Address. Dropdowns open under their input, fully on
 * screen, on top; no horizontal scroll. Every API request is answered here;
 * nothing reaches a real server, Google, SPL or DHL. Screenshots → PW_SHOTS_DIR.
 */

const SHOTS = process.env.PW_SHOTS_DIR
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
const ok = (data: unknown, status = 200) => json({ success: true, data }, status)
const KUDA = {
  id: null, main: '2519 Prince Mohammed Bin Fahd Road', secondary: '', short_address: 'KUDA2519', provider: 'spl',
  address: { address_line1: '2519 Prince Mohammed Bin Fahd Road', address_line2: '7531 Al Faisaliyah Dist', short_address: 'KUDA2519', building_number: '2519', street: 'Prince Mohammed Bin Fahd Road',
    additional_number: '7531', district: 'Al Faisaliyah Dist', city: 'DAMMAM', province: 'EASTERN PROVINCE', province_name: 'EASTERN PROVINCE', postal_code: '32272', country_code: 'SA' },
}

async function base(page: Page, lang: 'ar' | 'en') {
  await page.addInitScript((l) => {
    sessionStorage.setItem('shippec_session', JSON.stringify({ id: 1, username: 'manager@test', name: 'Manager', role: 'manager', status: 'approved' }))
    sessionStorage.setItem('auth_token', 'e2e-token')
    localStorage.setItem('shippec.createShipment.lang', l)
  }, lang)
  const calls = { cities: [] as string[], postal: [] as string[], short: [] as string[] }
  await page.route(/\/api\//, (r) => r.fulfill(ok([])))
  await page.route(/socket\.io/, (r) => r.abort())
  await page.route(/\/api\/dhl\/shipments(\?.*)?$/, (r) => r.fulfill(json({ success: true, data: [], pagination: { total: 0 } })))
  await page.route(/\/api\/address-lookup\/cities\?/, (r) => {
    calls.cities.push(r.request().url())
    return r.fulfill(ok([
      { id: 'ChIJ_dearborn_city01', main: 'Dearborn', secondary: 'MI, USA', short_address: null, address: null, provider: 'google' },
      { id: 'ChIJ_dearborn_hts_01', main: 'Dearborn Heights', secondary: 'MI, USA', short_address: null, address: null, provider: 'google' },
    ]))
  })
  await page.route(/\/api\/address-lookup\/details\?/, (r) => r.fulfill(ok({
    address_line1: null, address_line2: null, short_address: null, building_number: null, street: null, additional_number: null,
    district: null, city: 'Dearborn', province: 'MI', province_name: 'Michigan', postal_code: null, country_code: 'US',
  })))
  await page.route(/\/api\/address-lookup\/postal-code\?/, (r) => {
    calls.postal.push(r.request().url())
    return r.fulfill(ok([
      { postal_code: '48126', city: 'Dearborn', province: 'MI', province_name: 'Michigan', country_code: 'US', provider: 'google' },
      { postal_code: '48126', city: 'Dearborn Heights', province: 'MI', province_name: 'Michigan', country_code: 'US', provider: 'google' },
    ]))
  })
  await page.route(/\/api\/address-lookup\/short-address\//, (r) => { calls.short.push(r.request().url()); return r.fulfill(ok([KUDA])) })
  return calls
}

test.use({ launchOptions: { slowMo: 0 }, video: 'off', trace: 'off', actionTimeout: 10_000 })

/** A field brought to the middle of the screen before typing (the list opens under it). */
const centre = (l: Locator) => l.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior }))
/** The option is inside the viewport horizontally and nothing covers its centre. */
async function fits(option: Locator, w: number) {
  // centred, as a person scrolls to it (the mobile Back / Next bar and bottom navigation stay fixed at the bottom)
  await option.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior }))
  const b = (await option.boundingBox())!
  expect(b.x).toBeGreaterThanOrEqual(0)
  expect(b.x + b.width).toBeLessThanOrEqual(w + 1)
  expect(await option.evaluate((el) => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!top && el.contains(top) })).toBe(true)
  const o = await option.page().evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }))
  expect(o.scrollW).toBeLessThanOrEqual(o.innerW + 1)
}

for (const lang of ['ar', 'en'] as const) {
  const L = lang === 'en'
    ? { country: /^Country\/Territory/, city: /^City/, state: /^State/, postal: /^Postal Code/, short: /^Short Address/, a1: /^Address 1/, a2: /^Address 2/, code: /^Code\*?$/ }
    : { country: /^البلد\/الإقليم/, city: /^المدينة/, state: /^الولاية/, postal: /^الرمز البريدي/, short: /^العنوان المختصر/, a1: /^العنوان 1/, a2: /^عنوان 2/, code: /^الرمز\*?$/ }
  for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 700]] as const) {
    test(`Address intelligence ${lang.toUpperCase()} at ${w}px: City → State, ZIP → City + State, Short Address → National Address`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      const calls = await base(page, lang)
      await page.goto('/create-shipment')
      const to = page.locator('[data-party="receiver"]')
      await expect(to).toBeVisible()
      const pickCountry = async (q: string, name: RegExp) => {
        const c = to.getByLabel(L.country)
        await c.click()
        await c.fill(q)
        await page.getByRole('option', { name }).first().click()
      }

      // ── United States: City suggestions → State
      await pickCountry('USA', lang === 'en' ? /United States of America/ : /الولايات المتحدة الأمريكية/)
      await centre(to.getByLabel(L.city))
      await to.getByLabel(L.city).fill('Dear')
      const dearborn = page.getByRole('option', { name: /^Dearborn ?Michigan, United States of America$/ })
      await expect(dearborn).toBeVisible()
      await fits(dearborn, w)
      await expect(to.getByTestId('google-attribution')).toBeVisible()
      expect(new URL(calls.cities[0]).searchParams.get('country')).toBe('US')
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/address-city-${lang}-${w}.png` })
      await dearborn.click()
      await expect(to.getByLabel(L.state)).toHaveValue('MI')
      await expect(to.getByTestId('state-name')).toHaveText('Michigan')
      await expect(to.getByLabel(L.city)).toHaveValue('Dearborn')

      // ── US ZIP with two localities → choose one
      const zip = to.getByLabel(L.postal)
      await centre(zip)
      await zip.fill('48126')
      const heights = page.getByRole('option', { name: /^48126 ?Dearborn Heights · Michigan · United States of America$/ })
      await expect(heights).toBeVisible()
      await fits(heights, w)
      expect(new URL(calls.postal[0]).searchParams.get('code')).toBe('48126')
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/address-zip-${lang}-${w}.png` })
      await heights.click()
      await expect(to.getByLabel(L.city)).toHaveValue('Dearborn Heights')
      await expect(to.getByLabel(L.state)).toHaveValue('MI')
      await expect(zip).toHaveValue('48126')
      expect(calls.cities).toHaveLength(1) // filled by the ZIP, not typed → no new city request

      // ── Saudi Arabia: Short Address first; one exact SPL result fills everything
      await pickCountry('SA', lang === 'en' ? /Saudi Arabia/ : /السعودية/)
      const short = to.getByLabel(L.short)
      const sb = (await short.boundingBox())!
      const ab = (await to.getByLabel(L.a1).boundingBox())!
      expect(sb.y).toBeLessThan(ab.y)
      await short.fill('kuda2519')
      await expect(short).toHaveValue('KUDA2519')
      await expect(to.getByLabel(L.a1)).toHaveValue('2519 Prince Mohammed Bin Fahd Road')
      await expect(to.getByLabel(L.a2)).toHaveValue('7531 Al Faisaliyah Dist')
      await expect(to.getByLabel(L.city)).toHaveValue('DAMMAM')
      await expect(to.getByLabel(L.state)).toHaveValue('EASTERN PROVINCE')
      await expect(to.getByLabel(L.postal)).toHaveValue('32272')
      await expect(to.getByLabel(L.code)).toHaveValue('966')
      await expect(to.getByTestId('spl-autofill-note')).toBeVisible()
      expect(calls.short).toHaveLength(1)
      expect(calls.cities).toHaveLength(1) // SPL gave the city → no Google request
      const o = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }))
      expect(o.scrollW).toBeLessThanOrEqual(o.innerW + 1)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/address-spl-${lang}-${w}.png`, fullPage: true })
    })
  }
}
