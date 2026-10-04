import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * LIVE e2e for «نموذج التحصيل» / «المصروفات» / «مطابقة الفواتير»:
 * real browser ↔ local backend ↔ local PostgreSQL test DB. Opt-in, local only:
 *   (Backend) PORT=3100 DATABASE_URL=<local test db> ... npx tsx src/index.ts
 *   VITE_API_URL=http://127.0.0.1:3100/api npx vite --port 4173
 *   E2E_LIVE_API=http://127.0.0.1:3100/api E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... PW_SLOWMO_MS=0 \
 *     npx playwright test collection-expenses-reconcile.live
 */

const API = process.env.E2E_LIVE_API || ''
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL || '', password: process.env.E2E_ADMIN_PASSWORD || '' }
test.skip(!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API) || !ADMIN.email, 'live e2e: local API + admin credentials required')
test.use({ launchOptions: { slowMo: 0 } })
test.describe.configure({ mode: 'serial' })

type Session = { token: string; user: { id: number; email: string; full_name: string; role: string; status: string } }

async function call<T = any>(path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API}${path}`, {
    method: init.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json: any = await res.json().catch(() => ({}))
  return { status: res.status, data: json?.data ?? json }
}
async function ok<T = any>(path: string, init: Parameters<typeof call>[1] = {}): Promise<T> {
  const r = await call<T>(path, init)
  if (r.status >= 300) throw new Error(`${init.method || 'GET'} ${path} → ${r.status} ${JSON.stringify(r.data)}`)
  return r.data
}
const login = (email: string, password: string) => ok<Session>('/auth/login', { method: 'POST', body: { email, password } })

let admin: Session
let viewer: Session
const consoleErrors: string[] = []

async function openAs(browser: Browser, s: Session, path: string, viewport = { width: 1366, height: 860 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true })
  await context.addInitScript(([token, user]) => {
    sessionStorage.setItem('auth_token', token as string)
    sessionStorage.setItem('shippec_session', JSON.stringify(user))
  }, [s.token, { id: s.user.id, username: s.user.email, name: s.user.full_name, role: s.user.role, status: s.user.status }])
  const page = await context.newPage()
  await page.route(/railway\.app|shippec\.com|workers\.dev|anthropic\.com/, (r) => r.abort())
  page.on('console', (m) => {
    if (m.type() === 'error' && !/socket\.io|WebSocket|ERR_ABORTED|Failed to load resource/i.test(m.text())) consoleErrors.push(`${path}: ${m.text()}`)
  })
  page.on('pageerror', (e) => consoleErrors.push(`${path}: ${e.message}`))
  await page.goto(path)
  return page
}
const mainTop = (page: Page) => page.locator('main').evaluate((m) => m.scrollTop)

test.beforeAll(async () => {
  admin = await login(ADMIN.email, ADMIN.password)
  const email = `e2e-viewer-${Date.now()}@example.test`
  await ok('/auth/register', { method: 'POST', body: { email, password: 'Viewer#2026', confirmPassword: 'Viewer#2026', full_name: 'مشاهد تجربة' } })
  const users = await ok<any>('/users?limit=100', { token: admin.token })
  const list = Array.isArray(users) ? users : users.users || users.rows || []
  const u = list.find((x: any) => x.email === email)
  await ok(`/users/${u.id}/approve`, { method: 'PUT', token: admin.token })
  await ok(`/users/${u.id}/role`, { method: 'PUT', token: admin.token, body: { role: 'viewer' } })
  viewer = await login(email, 'Viewer#2026')

  // Collection data: 25 unpaid + 3 partial + 3 paid (+ one id with leading zeros)
  const mk = (n: string, status: string, total: number, paid = 0, extra: object = {}) =>
    ok('/invoices', { method: 'POST', token: admin.token, body: { invoice_number: n, client_name: `عميل ${n}`, phone: '0551234567', total, paid_amount: paid, status, invoice_date: '2026-09-15', ...extra } })
  for (let i = 0; i < 25; i++) await mk(`U-${100 + i}`, 'unpaid', 100)
  for (let i = 0; i < 3; i++) await mk(`P-${i}`, 'partial', 200, 50)
  for (let i = 0; i < 3; i++) await mk(`F-${i}`, 'paid', 80)
  await mk('000777', 'unpaid', 10)
  // Reconciliation data
  await mk('R-1', 'unpaid', 500, 0, { awb: '0012345678', dhl_cost: 300 })
  await mk('R-2', 'unpaid', 400, 0, { awb: '1000000002', dhl_cost: 250 })
})

test.afterAll(() => {
  expect(consoleErrors, consoleErrors.join('\n')).toEqual([])
})

// ═══════════════════════════ Collection ═══════════════════════════
test('collection: correct statuses, real pagination, filter totals over all pages, kept in the URL', async ({ browser }) => {
  const page = await openAs(browser, admin, '/collection-model')
  const table = page.locator('table')
  await expect(table).toContainText('U-')
  // partial vs paid badges (regression: they were swapped)
  await page.getByLabel('حالة السداد').selectOption('partial')
  await expect(page).toHaveURL(/st=partial/)
  await expect(table.locator('tbody tr')).toHaveCount(3)
  await expect(table).toContainText('مسددة جزئيًا')
  await expect(table).not.toContainText('مسددة بالكامل')
  const totals = page.getByTestId('collection-totals')
  await expect(totals).toContainText('3 فاتورة')
  await expect(totals).toContainText('150.00') // 3 × 50 collected
  await expect(totals).toContainText('450.00') // 3 × 150 remaining

  await page.getByLabel('حالة السداد').selectOption('paid')
  await expect(table.locator('tbody tr')).toHaveCount(3)
  // paid invoices show 0 remaining, not their total (regression)
  await expect(table.locator('tbody tr').first()).toContainText('0.00 ر.س')

  await page.getByLabel('حالة السداد').selectOption('unpaid')
  await expect(page.getByTestId('collection-totals')).toContainText('28 فاتورة') // all pages (25 + 000777 + R-1 + R-2), not the 20 shown
  const firstPage = await table.locator('tbody tr td:first-child').allInnerTexts()
  await page.getByRole('button', { name: 'التالي' }).click()
  await expect(page).toHaveURL(/page=2/)
  await expect(table.locator('tbody tr')).toHaveCount(8)
  const secondPage = await table.locator('tbody tr td:first-child').allInnerTexts()
  expect(secondPage.filter((x) => firstPage.includes(x))).toEqual([])

  // filters survive a full reload
  await page.reload()
  await expect(page.getByLabel('حالة السداد')).toHaveValue('unpaid')
  await expect(table.locator('tbody tr')).toHaveCount(8)

  // leading zeros kept when searching an identifier (AWB stored as text)
  await page.getByRole('button', { name: 'مسح الفلاتر' }).click()
  await page.getByLabel('بحث').fill('0012345678')
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await expect(table).toContainText('AWB 0012345678')
  await page.getByLabel('بحث').fill('12345678')
  await expect(table.locator('tbody tr')).toHaveCount(1)
  await page.context().close()
})

test('collection: category is saved, survives reload, conflicts are detected; viewer is read-only', async ({ browser }) => {
  const page = await openAs(browser, admin, '/collection-model?q=U-101')
  const row = page.locator('tbody tr').first()
  await expect(row).toContainText('U-101')
  await row.getByRole('combobox').selectOption('C')
  await row.getByRole('button', { name: 'حفظ' }).click()
  await expect(page.getByText('تم حفظ الفئة (C)')).toBeVisible()
  await page.reload()
  await expect(page.locator('tbody tr').first().getByRole('combobox')).toHaveValue('C')

  // someone else changes it meanwhile → the next save is refused and the new value shown
  const inv = (await ok<any>('/collection/invoices?search=U-101', { token: admin.token }))[0] ?? (await call<any>('/collection/invoices?search=U-101', { token: admin.token })).data
  const id = Array.isArray(inv) ? inv[0].id : inv.id
  await ok(`/collection/invoices/${id}/category`, { method: 'PUT', token: admin.token, body: { category: 'D' } })
  await page.locator('tbody tr').first().getByRole('combobox').selectOption('A')
  await page.locator('tbody tr').first().getByRole('button', { name: 'حفظ' }).click()
  await expect(page.getByText('تم تغيير فئة هذه الفاتورة من مستخدم آخر')).toBeVisible()
  await expect(page.locator('tbody tr').first().getByRole('combobox')).toHaveValue('D')
  await page.context().close()

  const v = await openAs(browser, viewer, '/collection-model?q=U-101')
  await expect(v.locator('tbody tr').first().getByRole('combobox')).toBeDisabled()
  await expect(v.getByRole('button', { name: 'حفظ' })).toHaveCount(0)
  expect((await call(`/collection/invoices/${id}/category`, { method: 'PUT', token: viewer.token, body: { category: 'A' } })).status).toBe(403)
  await v.context().close()
})

test('collection: invoice details open in place from mid-page and closing keeps the scroll', async ({ browser }) => {
  const page = await openAs(browser, admin, '/collection-model', { width: 1366, height: 640 })
  await expect(page.locator('tbody tr')).toHaveCount(20)
  await page.locator('main').evaluate((m) => { (m as HTMLElement).style.scrollBehavior = 'auto' })
  const btn = page.locator('tbody tr').nth(12).getByTitle('عرض تفاصيل الفاتورة')
  await btn.scrollIntoViewIfNeeded() // Playwright would do this inside click(); do it before measuring
  await page.waitForTimeout(200)
  const before = await mainTop(page)
  expect(before).toBeGreaterThan(300)
  const number = (await btn.innerText()).trim()
  await btn.click()
  const modal = page.getByTestId('invoice-view-modal')
  await expect(modal).toBeVisible()
  await expect(modal).toContainText(number)
  await expect(modal).toBeInViewport()
  expect(await mainTop(page)).toBe(before)
  await modal.locator('button[aria-label="Close"]').click()
  await expect(modal).toBeHidden()
  expect(await mainTop(page)).toBe(before)
  await page.context().close()
})

// ═══════════════════════════ Expenses ═══════════════════════════
test('expenses: validation, one expense despite double click and a lost response, exact totals', async ({ browser }) => {
  const page = await openAs(browser, admin, '/expenses')
  await page.getByRole('button', { name: 'إضافة مصروف' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('بيان المصروف *').fill('كراتين شحن')
  await dialog.getByLabel('المبلغ (ر.س) *').fill('1.005')
  await dialog.getByRole('button', { name: 'حفظ المصروف' }).click()
  await expect(dialog).toContainText('بحد أقصى منزلتين عشريتين')

  // First POST reaches the server but the response is lost (network drop).
  let posts = 0
  await page.route(/\/api\/expenses$/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    posts++
    if (posts === 1) {
      await route.fetch() // server processes it…
      return route.abort('failed') // …but the browser never gets the answer
    }
    return route.continue()
  })
  await dialog.getByLabel('المبلغ (ر.س) *').fill('0.10')
  await dialog.getByRole('button', { name: 'حفظ المصروف' }).dblclick()
  await expect(dialog).toContainText('تعذر الاتصال بالخادم')
  await expect(dialog.getByLabel('بيان المصروف *')).toHaveValue('كراتين شحن') // input kept
  await dialog.getByRole('button', { name: 'إعادة المحاولة' }).click()
  await expect(page.getByText('هذا المصروف محفوظ مسبقًا')).toBeVisible()
  await expect(dialog).toBeHidden()
  expect(posts).toBe(2) // the double click did not send a second request

  const list = await call<any>('/expenses?search=' + encodeURIComponent('كراتين شحن'), { token: admin.token })
  expect(list.data).toHaveLength(1)

  // second expense, exact sum 0.10 + 0.20
  await page.getByRole('button', { name: 'إضافة مصروف' }).click()
  await dialog.getByLabel('بيان المصروف *').fill('شريط لاصق')
  await dialog.getByLabel('المبلغ (ر.س) *').fill('0.20')
  await dialog.getByRole('button', { name: 'حفظ المصروف' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByTestId('expenses-filtered-total')).toContainText('0.30 ر.س')
  await page.context().close()
})

test('expenses: edit conflict keeps my input; cancel keeps the record and leaves the totals; viewer cannot write', async ({ browser }) => {
  const page = await openAs(browser, admin, '/expenses')
  const row = page.locator('tbody tr', { hasText: 'شريط لاصق' })
  await row.getByTitle('تعديل').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('المبلغ (ر.س) *').fill('5.55')

  // another user saves first
  const target = (await call<any>('/expenses?search=' + encodeURIComponent('شريط لاصق'), { token: admin.token })).data[0]
  await ok(`/expenses/${target.id}`, { method: 'PUT', token: admin.token, body: { amount: '9.99', expected_updated_at: target.updated_at } })

  await dialog.getByRole('button', { name: 'حفظ المصروف' }).click()
  await expect(dialog).toContainText('عدّل مستخدم آخر هذا المصروف')
  await expect(dialog).toContainText('9.99')
  await expect(dialog.getByLabel('المبلغ (ر.س) *')).toHaveValue('5.55')
  await dialog.getByRole('button', { name: 'حفظ المصروف' }).click() // knowingly overwrite
  await expect(dialog).toBeHidden()
  await expect(row).toContainText('5.55')

  await row.getByTitle('إلغاء المصروف').click()
  const confirm = page.getByRole('dialog')
  await confirm.getByLabel('سبب الإلغاء (اختياري)').fill('مكرر')
  await confirm.getByRole('button', { name: 'تأكيد الإلغاء' }).click()
  await expect(page.locator('tbody tr', { hasText: 'شريط لاصق' })).toHaveCount(0)
  await expect(page.getByTestId('expenses-filtered-total')).toContainText('0.10 ر.س')
  await page.getByLabel('الحالة').selectOption('cancelled')
  await expect(page.locator('tbody tr', { hasText: 'شريط لاصق' })).toContainText('ملغى')
  await page.context().close()

  const v = await openAs(browser, viewer, '/expenses')
  await expect(v.locator('tbody tr').first()).toBeVisible()
  await expect(v.getByRole('button', { name: 'إضافة مصروف' })).toHaveCount(0)
  await expect(v.getByTitle('تعديل')).toHaveCount(0)
  expect((await call('/expenses', { method: 'POST', token: viewer.token, body: { title: 'x', category: 'other', amount: '1', expense_date: '2026-10-01', payment_method: 'cash' } })).status).toBe(403)
  await v.context().close()
})

test('expenses: mobile layout keeps the form inside the screen', async ({ browser }) => {
  const page = await openAs(browser, admin, '/expenses', { width: 390, height: 760 })
  await page.getByRole('button', { name: 'إضافة مصروف' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'حفظ المصروف' })).toBeInViewport()
  await page.context().close()
})

// ═══════════════════════════ Reconciliation ═══════════════════════════
const CSV = [
  'AWB,Total Charge,Weight,Destination',
  '0012345678,300.00,5,AE', // leading zeros kept, matched
  '1000000002,250.01,5,US', // 1 halala difference → discrepancy
  '9990000005,15,1,EG', //      not found
  ',20,1,EG', //                 skipped: no AWB
  '1000000006,abc,1,EG', //      skipped: bad amount
].join('\n')

test('reconciliation: CSV is matched on the server with clear statuses; re-upload is detected', async ({ browser }) => {
  const page = await openAs(browser, admin, '/reconcile')
  await page.getByRole('button', { name: /مطابقة Excel\/CSV/ }).click()
  const upload = async () => {
    await page.locator('#rec-file-input').setInputFiles({ name: 'dhl-sept.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) })
    await page.getByRole('button', { name: 'بدء المطابقة' }).click()
  }
  await upload()
  const table = page.locator('table').first()
  await expect(table).toContainText('0012345678')
  await expect(page.getByText('تم تجاهل 2 صف غير صالح')).toBeVisible()
  await expect(table.locator('tr', { hasText: '0012345678' })).toContainText('متطابق')
  await expect(table.locator('tr', { hasText: '1000000002' })).toContainText('فروقات')
  await expect(table.locator('tr', { hasText: '9990000005' })).toContainText('غير موجود')

  // manual correction is stored on the server (survives reopening)
  await table.locator('tr', { hasText: '1000000002' }).getByTitle('تصحيح يدوي في التقرير').click()
  const edit = page.locator('text=تصحيح في تقرير المطابقة فقط').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
  await edit.locator('input[type="number"]').nth(1).fill('410')
  await page.getByRole('button', { name: /حفظ التصحيح/ }).click()
  await expect(table.locator('tr', { hasText: '1000000002' })).toContainText('يدوي')

  // export = the current filter only
  await page.getByRole('button', { name: 'فروقات' }).click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /تصدير Excel/ }).click()])
  expect(download.suggestedFilename()).toMatch(/_discrepancy_/)

  // same file again → no new record, offer the stored report
  await page.getByRole('button', { name: 'إعادة تعيين' }).click()
  await page.getByRole('button', { name: /مطابقة Excel\/CSV/ }).click()
  await upload()
  await expect(page.getByTestId('reconcile-duplicate')).toContainText('رُفع سابقًا')
  await page.getByRole('button', { name: 'فتح التقرير السابق' }).click()
  await expect(page.locator('table').first().locator('tr', { hasText: '1000000002' })).toContainText('يدوي')

  // invoices were not touched by reconciliation
  const r2 = await call<any>('/collection/invoices?search=R-2', { token: admin.token })
  expect(r2.data[0]).toMatchObject({ payment_status: 0, total: '400.00' })
  await page.context().close()
})

test('reconciliation: a fake PDF is rejected with an Arabic message', async ({ browser }) => {
  const page = await openAs(browser, admin, '/reconcile')
  await page.locator('#rec-file-input').setInputFiles({ name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf at all') })
  await page.getByRole('button', { name: 'بدء التحليل الذكي' }).click()
  await expect(page.getByText('محتوى الملف لا يطابق امتداده أو الملف تالف')).toBeVisible()
  await page.context().close()
})
