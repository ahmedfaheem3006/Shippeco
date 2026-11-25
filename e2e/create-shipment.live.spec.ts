import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page, type Request } from '@playwright/test'

/**
 * LIVE QA of «إنشاء شحنة» + «متابعة البوليصة» through the real UI:
 * browser → local SHIPPEC Backend → DHL **TEST** → local PostgreSQL.
 * Never DHL Production, never a deployed API: the API must be a loopback URL
 * and the Backend must report DHL env=test. Party/customs data come from an
 * approved TEST profile on disk (E2E_DHL_PROFILE) and are never written here.
 *
 *   E2E_LIVE_API=http://127.0.0.1:3100/api E2E_DHL_PROFILE=<profile.json> E2E_QA_STATE=<state.json>
 *   E2E_SHOTS=<dir> E2E_STAGE=prepare|create|after E2E_EMPLOYEE=<email> E2E_MANAGER=<email> E2E_PASSWORD=<pw>
 *   PW_SLOWMO_MS=0 npx playwright test e2e/create-shipment.live.spec.ts --workers=1
 *
 * Stages: prepare (employee: every step, errors, stale products, pickup options, saved draft — nothing created),
 * create (manager: exactly ONE create), after (tracking list, direct AWB search, details).
 */

const API = process.env.E2E_LIVE_API || ''
const STAGE = process.env.E2E_STAGE || ''
const PROFILE = process.env.E2E_DHL_PROFILE || ''
const STATE = process.env.E2E_QA_STATE || ''
const SHOTS = process.env.E2E_SHOTS || ''
const REMOTE_AWB = process.env.E2E_REMOTE_AWB || '9356579890' // a DHL TEST sample AWB
const PASSWORD = process.env.E2E_PASSWORD || ''
const MOBILE = process.env.E2E_MOBILE === '1'

test.skip(!/^http:\/\/(127\.0\.0\.1|localhost):\d+\/api$/.test(API) || !PROFILE || !STATE || !STAGE, 'live DHL TEST QA: set E2E_LIVE_API (loopback), E2E_DHL_PROFILE, E2E_QA_STATE and E2E_STAGE')
test.use({ launchOptions: { slowMo: 0 }, actionTimeout: 30_000, video: 'off', trace: 'off', locale: 'ar-SA', viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 900 } })
test.setTimeout(30 * 60_000)

const SUFFIX = MOBILE ? 'mobile' : 'desktop'
type QaState = { draftId?: number; mobileDraftId?: number; awb?: string; invoiceId?: number; invoiceNumber?: string; requests?: Record<string, number>; notes?: string[] }
const readState = (): QaState => { try { return JSON.parse(fs.readFileSync(STATE, 'utf8')) } catch { return {} } }
const writeState = (s: QaState) => fs.writeFileSync(STATE, JSON.stringify({ ...readState(), ...s }, null, 2))
const note = (m: string) => { const s = readState(); writeState({ notes: [...(s.notes ?? []), `[${STAGE}/${SUFFIX}] ${m}`] }); console.log(`[QA] ${m}`) }

async function shot(page: Page, name: string) {
  if (!SHOTS) return
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.waitForTimeout(300)
  const size = page.viewportSize()!
  const tallest = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, ...Array.from(document.querySelectorAll<HTMLElement>('*'))
    .filter((e) => e.scrollHeight > e.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowY))
    .map((e) => e.scrollHeight + e.getBoundingClientRect().top)))
  await page.setViewportSize({ width: size.width, height: Math.min(Math.ceil(tallest) + 24, 7000) })
  await page.waitForTimeout(250)
  await page.screenshot({ path: path.join(SHOTS, `${name}-${SUFFIX}.png`) })
  await page.setViewportSize(size)
}

async function login(page: Page, email: string) {
  const res = await page.request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } })
  expect(res.ok()).toBe(true)
  const { data } = await res.json()
  const u = data.user
  await page.addInitScript(([user, token]) => {
    sessionStorage.setItem('shippec_session', JSON.stringify(user))
    sessionStorage.setItem('auth_token', token as string)
  }, [{ id: u.id, username: u.email, name: u.full_name ?? u.name, role: u.role, status: u.status ?? 'approved' }, data.token] as const)
  return data.token as string
}

/** Every browser request is recorded: the page must never talk to DHL (or any non-local API) itself. */
function watchNetwork(page: Page) {
  const hosts: Record<string, number> = {}
  const dhlDirect: string[] = []
  page.on('request', (r: Request) => {
    const u = new URL(r.url())
    hosts[u.host] = (hosts[u.host] ?? 0) + 1
    if (/dhl\.com$/i.test(u.hostname)) dhlDirect.push(r.url())
  })
  return { hosts, dhlDirect }
}

async function backendIsDhlTest(page: Page, token: string) {
  const r = await page.request.get(`${API}/shipment-tracking/summary`, { headers: { Authorization: `Bearer ${token}` } })
  const s = (await r.json()).data
  expect(s.integration.env).toBe('test') // refuse to run against anything but DHL TEST
}

const profile = () => JSON.parse(fs.readFileSync(PROFILE, 'utf8'))
const na = (p: any) => {
  const l1 = /^(\d{4}),?\s+(.+)$/.exec(p.addressLine1 ?? '')
  const l2 = /^(\d{4}),?\s+(.+)$/.exec(p.addressLine2 ?? '')
  return l1 && l2 ? { building: l1[1], street: l1[2], additional: l2[1], district: l2[2], short: p.addressLine3 ?? '' } : null
}
/** Next business day at the shipper's origin (Sat/Sun weekend for the US profile). */
const nextOriginBusinessDay = (weekend: number[]) => {
  const d = new Date(Date.now() + 86_400_000)
  while (weekend.includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
const next = (page: Page) => page.getByRole('button', { name: /التالي/ }).click()
const goStep = (page: Page, label: RegExp) => page.getByRole('button', { name: label }).first().click()

async function fillParty(page: Page, who: 'shipper' | 'receiver', p: any, phoneOverride?: string) {
  const box = page.locator(`[data-party="${who}"]`)
  await box.getByLabel('الدولة').selectOption(p.countryCode)
  await box.getByLabel('اسم جهة الاتصال').fill(p.fullName)
  await box.getByLabel('الشركة').fill(p.companyName ?? p.fullName)
  await box.getByLabel('نوع العنوان').selectOption(p.typeCode === 'private' ? 'private' : 'business')
  const parts = p.countryCode === 'SA' ? na(p) : null
  if (parts) {
    await box.getByLabel('رقم المبنى').fill(parts.building)
    await box.getByLabel('اسم الشارع').fill(parts.street)
    await box.getByLabel('الرقم الإضافي').fill(parts.additional)
    await box.getByLabel(/^الحي/).fill(parts.district)
    if (parts.short) await box.getByLabel('العنوان المختصر').fill(parts.short)
  } else {
    if (p.countryCode === 'SA') await box.getByRole('button', { name: 'إدخال أسطر العنوان يدويًا' }).click()
    await box.getByLabel('سطر العنوان 1').fill(p.addressLine1)
    if (p.addressLine2) await box.getByLabel('سطر العنوان 2').fill(p.addressLine2)
    if (p.addressLine3) await box.getByLabel('الحي / المنطقة').fill(p.addressLine3)
  }
  await box.getByLabel('المدينة').fill(p.cityName)
  if (p.provinceCode) await box.getByLabel('الولاية / المقاطعة').fill(p.provinceCode)
  if (p.postalCode) await box.getByLabel('الرمز البريدي').fill(p.postalCode)
  await box.getByLabel('الجوال').fill(phoneOverride ?? p.phone)
  if (p.email) await box.getByLabel('البريد الإلكتروني').fill(p.email)
}

async function waitProducts(page: Page) {
  await expect(page.locator('article[data-product]').first()).toBeVisible({ timeout: 120_000 })
  return page.locator('article[data-product]').evaluateAll((els) => els.map((e) => e.getAttribute('data-product')!))
}

// ─────────────────────────── Stage 1: prepare (employee) ───────────────────────────
test('prepare: an employee fills every step with real DHL TEST products, rates and validation — nothing is created', async ({ page }) => {
  test.skip(STAGE !== 'prepare')
  const token = await login(page, process.env.E2E_EMPLOYEE || '')
  await backendIsDhlTest(page, token)
  const net = watchNetwork(page)
  const createCalls: string[] = []
  page.on('request', (r) => { if (/\/dhl\/shipments\/\d+\/create$/.test(r.url())) createCalls.push(r.url()) })
  const P = profile()

  await page.goto('/create-shipment')
  await expect(page.getByRole('heading', { name: /إنشاء شحنة/ })).toBeVisible()

  // 1. From / To — client, sender (US), receiver (SA National Address); a LOCAL validation error first
  const client = page.getByLabel('عميل SHIPPEC (صاحب الفاتورة)')
  await client.fill('QA Test')
  await page.getByRole('option').first().getByRole('button').first().click()
  await expect(page.getByText(/تُنشأ فاتورة SHIPPEC باسم هذا العميل/)).toBeVisible()
  await fillParty(page, 'shipper', P.shipper)
  await fillParty(page, 'receiver', P.receiver, '+96655') // deliberately invalid: caught by the local validation at review
  await page.getByRole('button', { name: /حفظ المسودة/ }).click() // a draft is saved before packages / items exist
  await expect(page).toHaveURL(/draft=\d+/, { timeout: 30_000 })
  const draftId = Number(new URL(page.url()).searchParams.get('draft'))
  if (MOBILE) writeState({ mobileDraftId: draftId }); else writeState({ draftId })
  note(`draft #${draftId} saved`)
  await shot(page, '01-from-to')

  // 2. Shipment details
  await next(page)
  await page.getByRole('radio', { name: /طرود \/ بضائع/ }).click()
  await page.getByLabel('وصف المحتوى').fill(P.description)
  await page.getByLabel('مرجع العميل (اختياري)').fill(`QA-3D1-${SUFFIX}`)
  const purpose = P.customs.exportReasonType === 'sample' ? 'عيّنة' : P.customs.exportReasonType === 'gift' ? 'هدية' : 'تجاري (بيع)'
  await page.getByRole('radio', { name: purpose }).click()
  await shot(page, '02-details')

  // 3. Customs
  await next(page)
  await page.getByLabel('رقم الفاتورة').fill(`PROFORMA-QA-20261119-${MOBILE ? 'M' : 'D'}`)
  await page.getByLabel('تاريخ الفاتورة').fill(new Date().toISOString().slice(0, 10))
  await page.getByLabel('العملة').fill(P.customs.currency)
  await page.getByLabel('فاتورة تُنشئها DHL').selectOption(P.customs.dhlInvoiceType)
  if (P.paperlessTrade) await page.getByRole('checkbox', { name: /Paperless Trade/ }).check()
  const L = P.customs.lineItems[0]
  const item = page.locator('[data-item="0"]')
  await item.getByLabel('الوصف').fill(L.description)
  await item.getByLabel('الكمية').fill(String(L.quantity))
  await item.getByLabel('الوحدة', { exact: true }).selectOption(L.quantityUnit)
  await item.getByLabel('سعر الوحدة').fill(String(L.unitPrice))
  await item.getByLabel('بلد المنشأ').selectOption(L.manufacturerCountry)
  await item.getByLabel('رمز HS للتصدير').fill(L.hsCode)
  await item.getByLabel('رمز HS للاستيراد').fill(L.inboundHsCode)
  await item.getByLabel('الوزن الصافي للوحدة (كغ)').fill(String(L.netWeightKg / L.quantity))
  await item.getByLabel('الوزن الإجمالي (كغ)').fill(String(L.lineGrossWeightKg))
  await shot(page, '03-customs')

  // 4. Packages
  await next(page)
  const pkg = page.locator('[data-package="0"]')
  await pkg.getByLabel('الوزن (كغ)').fill(String(P.package.weightKg))
  await pkg.getByLabel('الطول (سم)').fill(String(P.package.dimensionsCm.length))
  await pkg.getByLabel('العرض (سم)').fill(String(P.package.dimensionsCm.width))
  await pkg.getByLabel('الارتفاع (سم)').fill(String(P.package.dimensionsCm.height))
  await shot(page, '04-packages')

  // 5. Payment & Incoterm (DHL's own Incoterm list)
  await next(page)
  await expect.poll(() => page.getByLabel('Incoterm').locator('option').count(), { timeout: 30_000 }).toBeGreaterThan(1)
  await page.getByLabel('Incoterm').selectOption(P.customs.incoterm)
  note(`incoterms from DHL: ${(await page.getByLabel('Incoterm').locator('option').allInnerTexts()).length} options`)
  await shot(page, '05a-payment')

  // 6. Products & rates from DHL TEST. The automatic fetch on entry needs the US sender's time zone first:
  //    the step must say exactly that; the default date (Saudi calendar) is a US weekend day → warning + one-click fix.
  await next(page)
  const routeMsg = page.getByText(/قبل سؤال DHL أكمل|أكمل بيانات المسار/).first()
  await expect(routeMsg).toBeVisible({ timeout: 60_000 })
  note(`service step before the time zone: "${(await routeMsg.innerText()).trim()}"`)
  const weekendWarn = page.getByText('تاريخ الشحن يوم عطلة في بلد المرسل')
  const wasWeekend = await weekendWarn.isVisible().catch(() => false)
  note(`default shipment date ${await page.getByLabel('تاريخ الشحن').inputValue()} — weekend warning shown: ${wasWeekend}`)
  await shot(page, '05x-service-needs-timezone')
  if (wasWeekend) await page.getByRole('button', { name: 'نقل إلى أقرب يوم عمل' }).click()
  else await page.getByLabel('تاريخ الشحن').fill(nextOriginBusinessDay(P.weekendDays ?? [0, 6]))
  await expect(weekendWarn).toHaveCount(0)
  await page.getByLabel('المنطقة الزمنية لبلد المرسل').fill(P.originGmtOffset)
  await page.getByRole('button', { name: /عرض خدمات DHL المتاحة|تحديث الخدمات والأسعار/ }).click()
  const loading = page.getByRole('status', { name: 'جاري جلب خدمات DHL' })
  const sawSkeleton = await loading.waitFor({ timeout: 5_000 }).then(() => true, () => false)
  const codes = await waitProducts(page)
  note(`loading skeleton shown while DHL answered: ${sawSkeleton}; shipment date ${await page.getByLabel('تاريخ الشحن').inputValue()}`)
  note(`DHL TEST products: ${codes.join(', ')}`)
  const code = codes.includes(P.productCode) ? P.productCode : codes[0]
  const card = page.locator(`article[data-product="${code}"]`)
  await card.getByRole('button', { name: 'عرض التفاصيل' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  note(`rate details (${code}): ${(await dialog.innerText()).replace(/\s+/g, ' ').slice(0, 900)}`)
  await shot(page, '05b-rate-details')
  await dialog.getByRole('button', { name: 'إغلاق' }).click()
  await card.getByRole('button', { name: 'اختيار' }).click()
  await expect(card.getByRole('button', { name: 'مختارة' })).toBeVisible({ timeout: 60_000 })

  // stale selection: a package change invalidates the shown products; refresh restores them
  await goStep(page, /الطرود/)
  await page.locator('[data-package="0"]').getByLabel('الوزن (كغ)').fill(String(P.package.weightKg + 0.1))
  await goStep(page, /الخدمة/)
  await expect(page.getByText('تغيّرت بيانات الشحنة')).toBeVisible()
  const staleSelectDisabled = await page.locator(`article[data-product]:not([data-product="${code}"])`).first().getByRole('button', { name: 'اختيار' }).isDisabled().catch(() => null)
  note(`after a package change: stale warning shown, other products selectable=${staleSelectDisabled === false}`)
  await shot(page, '05c-stale-products')
  await goStep(page, /الطرود/)
  await page.locator('[data-package="0"]').getByLabel('الوزن (كغ)').fill(String(P.package.weightKg))
  await goStep(page, /الخدمة/)
  await page.getByRole('button', { name: /تحديث الخدمات والأسعار/ }).click()
  await expect(page.getByText('تغيّرت بيانات الشحنة')).toHaveCount(0, { timeout: 120_000 })
  await waitProducts(page)
  const selectedAfter = await page.locator(`article[data-product="${code}"]`).getByRole('button', { name: 'مختارة' }).isVisible().catch(() => false)
  note(`after refresh the earlier selection is ${selectedAfter ? 'still selected' : 'cleared (must choose again)'}`)
  if (!selectedAfter) {
    await page.locator(`article[data-product="${code}"]`).getByRole('button', { name: 'اختيار' }).click()
    await expect(page.locator(`article[data-product="${code}"]`).getByRole('button', { name: 'مختارة' })).toBeVisible({ timeout: 60_000 })
  }

  // SHIPPEC price, kept apart from DHL's
  const pricing = page.locator('section[aria-labelledby="shippec-pricing"]')
  const costText = (await pricing.locator('div.text-lg').first().innerText()).match(/[\d,]+(?:\.\d+)?/)?.[0] ?? ''
  const cost = Number(costText.replace(/,/g, ''))
  expect(cost).toBeGreaterThan(0)
  const selling = Math.ceil(cost) + 75
  await pricing.getByLabel('سعر البيع للعميل (ريال)').fill(String(selling))
  const profit = Math.round((selling - cost) * 100) / 100
  await expect(pricing.getByText(`${profit.toFixed(2)} ر.س`)).toBeVisible()
  writeState({ ...(MOBILE ? {} : { requests: {} }) })
  note(`DHL cost ${cost.toFixed(2)} SAR, selling ${selling}.00, expected profit ${profit.toFixed(2)}`)
  await shot(page, '05-product-rate')

  // 7. Pickup — the three options; service points that do not accept drop-off cannot be chosen
  await next(page)
  await page.getByRole('radio', { name: /جدولة مندوب DHL/ }).click()
  await expect(page.getByText(/نافذة DHL لهذه الخدمة/)).toBeVisible()
  note(`pickup window: ${(await page.getByText(/نافذة DHL لهذه الخدمة/).innerText()).trim()}`)
  await shot(page, '06a-pickup-schedule')
  await page.getByRole('radio', { name: /التسليم في نقطة خدمة DHL/ }).click()
  await page.getByRole('button', { name: 'بحث', exact: true }).click()
  const points = page.locator('article[data-service-point]')
  const spError = page.locator('section').filter({ has: page.getByRole('heading', { name: 'نقاط خدمة DHL', exact: true }) }).getByText(/تعذر|غير|خطأ/).first()
  await Promise.race([points.first().waitFor({ timeout: 90_000 }), spError.waitFor({ timeout: 90_000 })]).catch(() => undefined)
  const nPoints = await points.count()
  const nBlocked = await page.getByRole('button', { name: 'غير متاحة للتسليم' }).count()
  if (nBlocked) await expect(page.getByRole('button', { name: 'غير متاحة للتسليم' }).first()).toBeDisabled()
  note(`service points: ${nPoints} returned, ${nBlocked} without drop-off (disabled)${nPoints ? '' : ` — message: ${(await page.locator('section').filter({ has: page.getByRole('heading', { name: 'نقاط خدمة DHL', exact: true }) }).innerText()).replace(/\s+/g, ' ').slice(0, 300)}`}`)
  await shot(page, '06b-pickup-service-points')
  await page.getByRole('radio', { name: /بدون استلام/ }).click()
  await shot(page, '06-pickup')

  // 8. Review — validation on entry: first the LOCAL error (invalid receiver phone, DHL not asked), corrected;
  //    then a DHL refusal on purpose (validateDataOnly), corrected
  await next(page)
  const verdictBox = page.locator('section').filter({ has: page.getByRole('heading', { name: 'التحقق', exact: true }) })
  await expect(verdictBox.getByText(/اجتازت البيانات التحقق|المرسل والمستلم|حقل|الجوال|رقم/).first()).toBeVisible({ timeout: 120_000 })
  await page.waitForTimeout(1000)
  note(`review with an invalid receiver phone: ${(await verdictBox.innerText()).replace(/\s+/g, ' ').slice(0, 600)}`)
  await shot(page, '07a-local-error')
  await goStep(page, /الأطراف|المرسل والمستلم/)
  const phoneErr = await page.locator('[data-party="receiver"]').getByRole('alert').allInnerTexts()
  note(`errors shown on the receiver fields: ${JSON.stringify(phoneErr)}`)
  await shot(page, '07a-local-error-field')
  await page.locator('[data-party="receiver"]').getByLabel('الجوال').fill(P.receiver.phone)
  await goStep(page, /المراجعة/)
  await page.getByRole('button', { name: 'إعادة التحقق' }).click()
  await expect(page.getByText(/اجتازت البيانات التحقق/)).toBeVisible({ timeout: 120_000 })
  await shot(page, '07-review')

  await goStep(page, /الأطراف|المرسل والمستلم/)
  const city = page.locator('[data-party="receiver"]').getByLabel('المدينة')
  await city.fill('Qzxwvk')
  await goStep(page, /المراجعة/)
  await page.getByRole('button', { name: 'إعادة التحقق' }).click()
  const verdict = page.locator('section').filter({ has: page.getByRole('heading', { name: 'التحقق', exact: true }) })
  await expect(verdict.getByText(/اجتازت البيانات التحقق/)).toHaveCount(0, { timeout: 120_000 })
  await page.waitForTimeout(1500)
  note(`with an invalid receiver city the review says: ${(await verdict.innerText()).replace(/\s+/g, ' ').slice(0, 700)}`)
  await shot(page, '07b-dhl-error')
  const goLink = verdict.getByRole('button', { name: /المرسل والمستلم|الأطراف|انتقل/ }).first()
  if (await goLink.isVisible().catch(() => false)) await goLink.click(); else await goStep(page, /الأطراف|المرسل والمستلم/)
  const cityErr = await page.locator('[data-party="receiver"]').getByRole('alert').allInnerTexts()
  note(`errors shown on the receiver fields: ${JSON.stringify(cityErr)}`)
  await shot(page, '07c-dhl-error-field')
  await page.locator('[data-party="receiver"]').getByLabel('المدينة').fill(P.receiver.cityName)
  await goStep(page, /الخدمة/)
  if (await page.getByText('تغيّرت بيانات الشحنة').isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /تحديث الخدمات والأسعار/ }).click()
    await expect(page.getByText('تغيّرت بيانات الشحنة')).toHaveCount(0, { timeout: 120_000 })
  }
  await waitProducts(page)
  const sel = page.locator(`article[data-product="${code}"]`)
  if (!(await sel.getByRole('button', { name: 'مختارة' }).isVisible().catch(() => false))) {
    await sel.getByRole('button', { name: 'اختيار' }).click()
    await expect(sel.getByRole('button', { name: 'مختارة' })).toBeVisible({ timeout: 60_000 })
  }
  await goStep(page, /المراجعة/)
  await page.getByRole('button', { name: 'إعادة التحقق' }).click()
  await expect(page.getByText(/اجتازت البيانات التحقق/)).toBeVisible({ timeout: 120_000 })
  // (validation saved the draft and its price — no extra save click)
  const stored = (await (await page.request.get(`${API}/dhl/shipments/${draftId}`, { headers: { Authorization: `Bearer ${token}` } })).json()).data
  note(`draft #${draftId} as stored: status=${stored.creation_status}, DHL validation=${stored.dhl_validation_status}, product=${stored.product_code}, selling=${stored.selling_price}, cost=${stored.dhl_cost} (${stored.dhl_cost_source})`)
  expect(Number(stored.selling_price)).toBe(selling)

  // an employee cannot send the creation
  await expect(page.getByRole('button', { name: /^إنشاء الشحنة$/ })).toBeDisabled()
  expect(createCalls).toHaveLength(0)
  expect(net.dhlDirect).toEqual([])
  note(`browser request hosts: ${JSON.stringify(net.hosts)}`)
})

// ─────────────────────────── Stage 2: create (manager) — exactly ONE ───────────────────────────
test('create: a manager sends exactly ONE create; success screen; documents through SHIPPEC', async ({ page }) => {
  test.skip(STAGE !== 'create')
  const s = readState()
  expect(s.draftId).toBeTruthy()
  expect(s.awb, 'a shipment was already created in this QA run').toBeFalsy()
  const token = await login(page, process.env.E2E_MANAGER || '')
  await backendIsDhlTest(page, token)
  const net = watchNetwork(page)
  const createCalls: string[] = []
  page.on('request', (r) => { if (r.method() === 'POST' && /\/dhl\/shipments\/\d+\/create$/.test(r.url())) createCalls.push(r.url()) })

  await page.goto(`/create-shipment?draft=${s.draftId}`)
  await expect(page.getByText('QA Test Client 3D1').first()).toBeVisible({ timeout: 30_000 })
  await goStep(page, /المراجعة/)
  await expect(page.getByText(/اجتازت البيانات التحقق/)).toBeVisible({ timeout: 120_000 })
  const storedPrice = (await (await page.request.get(`${API}/dhl/shipments/${s.draftId}`, { headers: { Authorization: `Bearer ${token}` } })).json()).data
  await expect(page.getByText(`${Number(storedPrice.selling_price).toFixed(2)} ر.س`).first()).toBeVisible()
  note(`manager opens draft #${s.draftId}: SHIPPEC price ${storedPrice.selling_price} SAR already there (set by the employee)`)
  await shot(page, '07-review-manager')
  const createBtn = page.getByRole('button', { name: /^إنشاء الشحنة$/ })
  await expect(createBtn).toBeEnabled()
  await createBtn.click()
  const yes = page.getByRole('button', { name: /نعم، أنشئ الشحنة/ })
  await expect(yes).toBeVisible()
  expect(createCalls).toHaveLength(0)
  await shot(page, '07d-confirm-dialog')
  await yes.click()
  await yes.click({ timeout: 500 }).catch(() => undefined) // an impatient double click must not send a second request

  // created → the confirmation page (/create-shipment/success/:id); uncertain / refused stay on the wizard
  const outcome = page.getByText(/تم إنشاء الشحنة بنجاح|لا تحاول إنشاء الشحنة مرة أخرى|رفضت DHL إنشاء الشحنة/)
  await expect(outcome.first()).toBeVisible({ timeout: 180_000 })
  expect(createCalls).toHaveLength(1)
  await expect(page.getByRole('heading', { name: 'تم إنشاء الشحنة بنجاح' })).toBeVisible()
  const awb = (await page.getByTestId('summary-awb').innerText()).replace(/\D/g, '')
  const invLink = page.getByRole('link', { name: /^DH\d+/ }).first()
  const invoiceNumber = (await invLink.innerText()).trim()
  const invoiceId = Number(new URL(await invLink.getAttribute('href') ?? '', 'http://x').searchParams.get('invoice'))
  writeState({ awb, invoiceId, invoiceNumber })
  note(`created AWB ${awb}; invoice ${invoiceNumber} (#${invoiceId}); success screen: ${(await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 900)}`)
  await shot(page, '08-create-success')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(300)
  if (SHOTS) {
    const tallest = await page.evaluate(() => Math.max(...Array.from(document.querySelectorAll<HTMLElement>('*')).filter((e) => e.scrollHeight > e.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(e).overflowY)).map((e) => e.scrollHeight + e.getBoundingClientRect().top), document.documentElement.scrollHeight))
    await page.setViewportSize({ width: 390, height: Math.min(Math.ceil(tallest) + 24, 7000) })
    await page.waitForTimeout(250)
    await page.screenshot({ path: path.join(SHOTS, '08-create-success-mobile.png') })
  }
  await page.setViewportSize({ width: 1440, height: 900 })

  // documents download through the SHIPPEC Backend (authenticated), never from DHL
  const dir = path.join(SHOTS || path.dirname(STATE), 'downloads')
  fs.mkdirSync(dir, { recursive: true })
  const docButtons = page.locator('section, div').filter({ has: page.getByRole('heading', { name: 'المستندات' }) }).last().getByRole('button')
  const n = await docButtons.count()
  const got: string[] = []
  for (let i = 0; i < n; i++) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), docButtons.nth(i).click()])
    const file = path.join(dir, dl.suggestedFilename())
    await dl.saveAs(file)
    const head = fs.readFileSync(file).subarray(0, 5).toString('latin1')
    got.push(`${dl.suggestedFilename()} (${fs.statSync(file).size} bytes, ${head === '%PDF-' ? 'PDF' : head})`)
  }
  note(`documents downloaded: ${got.join('; ')}`)
  expect(got.length).toBeGreaterThan(0)

  await expect(page.getByRole('link', { name: /فتح الفاتورة/ })).toHaveAttribute('href', `/invoices?invoice=${invoiceId}`)
  await expect(page.getByRole('link', { name: /متابعة الشحنة/ })).toHaveAttribute('href', `/shipment-tracking/${awb}`)
  expect(createCalls).toHaveLength(1)
  expect(net.dhlDirect).toEqual([])
  note(`browser request hosts: ${JSON.stringify(net.hosts)}`)
})

// ─────────────────────────── Stage 3: tracking ───────────────────────────
test('after: tracking list, filters, direct AWB search (local + remote DHL TEST), details timeline', async ({ page }) => {
  test.skip(STAGE !== 'after')
  const s = readState()
  expect(s.awb).toBeTruthy()
  const token = await login(page, process.env.E2E_EMPLOYEE || '')
  await backendIsDhlTest(page, token)
  const net = watchNetwork(page)
  const spaced = `${s.awb!.slice(0, 3)} ${s.awb!.slice(3, 6)} ${s.awb!.slice(6)}`

  await page.goto('/shipment-tracking')
  const row = MOBILE ? page.getByRole('article').filter({ hasText: spaced }) : page.locator(`[data-tracking-awb="${s.awb}"]`)
  await expect(row.first()).toBeVisible({ timeout: 30_000 })
  note(`list row: ${(await row.first().innerText()).replace(/\s+/g, ' ')}`)
  await shot(page, '09-tracking-main')

  // search box + filters
  await page.getByPlaceholder(/رقم البوليصة، رقم الفاتورة/).fill(s.invoiceNumber!)
  await expect(row.first()).toBeVisible({ timeout: 15_000 })
  const nByInvoice = MOBILE ? await page.getByRole('article').count() : await page.locator('[data-tracking-awb]').count()
  await page.getByPlaceholder(/رقم البوليصة، رقم الفاتورة/).fill('')
  await page.getByRole('button', { name: /الفلاتر/ }).click()
  await page.getByLabel('الحالة الحالية').selectOption('delivered')
  await expect(row).toHaveCount(0, { timeout: 15_000 })
  await page.getByLabel('الحالة الحالية').selectOption('not_delivered')
  await expect(row.first()).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('السنة').selectOption(String(new Date().getFullYear()))
  await expect(row.first()).toBeVisible({ timeout: 15_000 })
  note(`search by invoice → ${nByInvoice} row(s); status=delivered hides it, not_delivered + year shows it`)
  await shot(page, '09b-tracking-filters')

  // A. direct search: the new local AWB
  await page.goto('/shipment-tracking')
  await page.getByPlaceholder('1234567890').fill(s.awb!)
  await page.getByRole('button', { name: 'بحث', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/shipment-tracking/${s.awb}$`), { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: new RegExp(spaced) })).toBeVisible()
  note(`details (local AWB): ${(await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 900)}`)
  await shot(page, '10a-tracking-details-created')

  // documents of the created shipment: downloaded through the SHIPPEC Backend (authenticated), never from DHL
  const panel = page.locator('section, div').filter({ has: page.getByRole('heading', { name: /شحنة SHIPPEC/ }) }).last()
  const docButtons = panel.getByRole('button', { name: /ملصق الشحن|بوليصة الشحن|الفاتورة المبدئية|الفاتورة التجارية/ })
  await expect(docButtons.first()).toBeVisible({ timeout: 30_000 })
  const dir = path.join(SHOTS || path.dirname(STATE), 'downloads')
  fs.mkdirSync(dir, { recursive: true })
  const got: string[] = []
  const docRequests: string[] = []
  page.on('request', (r) => { if (/\/documents\/\d+$/.test(r.url())) docRequests.push(new URL(r.url()).host + new URL(r.url()).pathname) })
  for (let i = 0; i < await docButtons.count(); i++) {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), docButtons.nth(i).click()])
    const file = path.join(dir, dl.suggestedFilename())
    await dl.saveAs(file)
    const head = fs.readFileSync(file).subarray(0, 5).toString('latin1')
    got.push(`${(await docButtons.nth(i).innerText()).trim()} → ${dl.suggestedFilename()} (${fs.statSync(file).size} bytes, ${head === '%PDF-' ? 'PDF' : head})`)
  }
  note(`documents downloaded: ${got.join('; ')} via ${[...new Set(docRequests)].join(', ')}`)
  expect(got.length).toBeGreaterThanOrEqual(2)
  expect(docRequests.every((u) => u.startsWith('127.0.0.1:3100/api/dhl/shipments/'))).toBe(true)

  // B. direct search: a DHL TEST AWB that SHIPPEC does not hold → ONE call to DHL TEST through the Backend
  const before = await page.request.get(`${API}/shipment-tracking/${REMOTE_AWB}`, { headers: { Authorization: `Bearer ${token}` } })
  note(`before search: GET /shipment-tracking/${REMOTE_AWB} → ${before.status()}`)
  await page.goto('/shipment-tracking')
  await page.getByPlaceholder('1234567890').fill(REMOTE_AWB)
  await page.getByRole('button', { name: 'بحث', exact: true }).click()
  const opened = await page.waitForURL(new RegExp(`/shipment-tracking/${REMOTE_AWB}$`), { timeout: 90_000 }).then(() => true, () => false)
  if (!opened) {
    note(`remote search did not open details: ${(await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 400)}`)
    await shot(page, '10x-remote-search')
  } else {
    await expect(page.getByRole('heading', { name: /رحلة الشحنة \(\d+\)/ })).toBeVisible({ timeout: 30_000 })
    const events = await page.locator('li[data-event-code]').count()
    const raw = await page.locator('main').innerText()
    expect(raw).not.toMatch(/"\w+"\s*:/) // no raw JSON
    note(`remote AWB ${REMOTE_AWB}: ${events} events rendered; ${raw.replace(/\s+/g, ' ').slice(0, 700)}`)
    await shot(page, '10-tracking-details')
    const after = await page.request.get(`${API}/shipment-tracking/${REMOTE_AWB}`, { headers: { Authorization: `Bearer ${token}` } })
    const rec = (await after.json()).data
    note(`after search: stored locally (${after.status()}), sources=${JSON.stringify(rec?.sources)}, events stored=${rec?.events?.length}`)
  }
  expect(net.dhlDirect).toEqual([])
  note(`browser request hosts: ${JSON.stringify(net.hosts)}`)
})
