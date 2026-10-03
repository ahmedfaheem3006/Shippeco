import { createHmac } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * LIVE end-to-end: real browser ↔ real local backend ↔ real PostgreSQL, with
 * Paymob replaced by e2e/support/fake-paymob.mjs. Signed callbacks are sent
 * to the backend exactly like Paymob would. Opt-in, never touches production:
 *
 *   node e2e/support/fake-paymob.mjs 4599
 *   (Backend) PORT=3100 DATABASE_URL=<local test db> PAYMOB_BASE_URL=http://127.0.0.1:4599
 *             PAYMOB_HMAC_SECRET=e2e-hmac-secret PAYMOB_INTEGRATION_IDS=111 ... npx tsx src/index.ts
 *   VITE_API_URL=http://127.0.0.1:3100/api npx vite --port 4173
 *   E2E_LIVE_API=http://127.0.0.1:3100/api E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... \
 *     PW_SLOWMO_MS=0 npx playwright test payments-notifications.live
 */

const API = process.env.E2E_LIVE_API || ''
const HMAC = process.env.E2E_HMAC_SECRET || 'e2e-hmac-secret'
const INTEGRATION = Number(process.env.E2E_INTEGRATION_ID || 111)
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL || '', password: process.env.E2E_ADMIN_PASSWORD || '' }

test.skip(!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API) || !ADMIN.email, 'live e2e: set E2E_LIVE_API (local only) and admin credentials')
test.use({ launchOptions: { slowMo: 0 } })
test.describe.configure({ mode: 'serial' })

// ───────────── API helpers (node side) ─────────────
type Session = { token: string; user: { id: number; email: string; full_name: string; role: string; status: string } }

async function call<T = any>(path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json: any = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} → ${res.status} ${JSON.stringify(json)}`)
  return (json?.data ?? json) as T
}

const login = (email: string, password: string) => call<Session>('/auth/login', { method: 'POST', body: { email, password } })

const HMAC_FIELDS = ['amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id', 'integration_id',
  'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending',
  'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success']
const sign = (obj: any) =>
  createHmac('sha512', HMAC).update(HMAC_FIELDS.map((f) => f.split('.').reduce((v: any, k) => (v == null ? undefined : v[k]), obj) ?? '').join('')).digest('hex')

let txSeq = Math.floor(Date.now() / 1000)
function transaction(orderId: number, cents: number) {
  return {
    id: ++txSeq, amount_cents: cents, created_at: new Date().toISOString(), currency: 'SAR', error_occured: false,
    has_parent_transaction: false, integration_id: INTEGRATION, is_3d_secure: true, is_auth: false, is_capture: false,
    is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: orderId }, owner: 1, pending: false,
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' }, success: true,
  }
}
async function sendWebhook(obj: any) {
  const res = await fetch(`${API}/paymob/webhook?hmac=${sign(obj)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'TRANSACTION', obj }),
  })
  expect(res.status).toBe(200)
}

async function newInvoice(token: string, total: number, date: string, label: string) {
  return call<{ id: number; invoice_number: string }>('/invoices', {
    method: 'POST', token,
    body: { client_name: `عميل ${label}`, phone: '0551234567', total, status: 'unpaid', invoice_date: date, carrier: 'DHL' },
  })
}

/** Payment link for an invoice + a customer checkout (fake Paymob order). */
async function linkWithCheckout(token: string, amount: number, extra: Record<string, unknown>) {
  const link = await call<{ id: number }>('/paymob/create-link', {
    method: 'POST', token, body: { amount, client_name: 'عميل اختبار', client_phone: '0551234567', ...extra },
  })
  const pay = await call<{ paymob_order_id: string }>(`/paymob/public-link/${link.id}/pay`, {
    method: 'POST', body: { email: 'customer@example.test', phone: '0551234567' },
  })
  return { linkId: link.id, orderId: Number(pay.paymob_order_id) }
}

async function openAs(browser: Browser, s: Session, path: string, viewport = { width: 1366, height: 860 }) {
  const context = await browser.newContext({ viewport })
  await context.addInitScript(([token, user]) => {
    sessionStorage.setItem('auth_token', token as string)
    sessionStorage.setItem('shippec_session', JSON.stringify(user))
  }, [s.token, { id: s.user.id, username: s.user.email, name: s.user.full_name, role: s.user.role, status: s.user.status }])
  const page = await context.newPage()
  // Belt and braces: this test must never reach a production host.
  await page.route(/railway\.app|shippec\.com|workers\.dev/, (r) => r.abort())
  await page.goto(path)
  return page
}

async function openBell(page: Page) {
  await page.getByTestId('notifications-bell').click()
  await expect(page.getByTestId('notification-item').first()).toBeVisible()
}

let admin: Session
let employee: Session
const ctx: Record<string, any> = {}

test.beforeAll(async () => {
  admin = await login(ADMIN.email, ADMIN.password)

  // Employee account (register → approve) for permission checks.
  const email = `e2e-employee-${Date.now()}@example.test`
  await call('/auth/register', { method: 'POST', body: { email, password: 'Employee#2026', confirmPassword: 'Employee#2026', full_name: 'موظف تجربة' } })
  const users = await call<any>('/users?limit=100', { token: admin.token })
  const list = Array.isArray(users) ? users : users.users || users.rows || []
  const emp = list.find((u: any) => u.email === email)
  await call(`/users/${emp.id}/approve`, { method: 'PUT', token: admin.token })
  employee = await login(email, 'Employee#2026')

  // 60 recent invoices push the target well past the first page (50/page).
  const today = new Date().toISOString().slice(0, 10)
  for (let i = 0; i < 60; i++) await newInvoice(admin.token, 100 + i, today, `حديث ${i}`)
  ctx.target = await newInvoice(admin.token, 203, '2021-01-15', 'قديم')
})

test('1+5. payment recorded while every UI is closed; its notification opens the exact invoice (not on page 1)', async ({ browser }) => {
  const { orderId } = await linkWithCheckout(admin.token, 203, { invoice_id: ctx.target.id })
  await sendWebhook(transaction(orderId, 20300)) // no browser open at all

  // Precondition: the invoice is not on the first page of the default list.
  const firstPage = await call<any>('/invoices/light?page=1&limit=50', { token: admin.token })
  expect((firstPage.invoices || []).map((i: any) => i.id)).not.toContain(ctx.target.id)

  const page = await openAs(browser, admin, '/dashboard')
  const badge = page.getByTestId('notifications-bell')
  await openBell(page)
  const item = page.getByTestId('notification-item').filter({ hasText: 'تم تحصيل دفعة إلكترونية' }).first()
  await expect(item).toContainText('203')
  await item.click()

  await expect(page).toHaveURL(new RegExp(`/invoices\\?invoice=${ctx.target.id}$`))
  const modal = page.getByTestId('invoice-view-modal')
  await expect(modal).toBeVisible()
  await expect(modal).toContainText(ctx.target.invoice_number)
  await expect(modal).toContainText('مدفوعة بالكامل')
  await expect(badge).toBeVisible()

  // Close → URL cleaned (back/refresh won't reopen); Back leaves to dashboard.
  await modal.locator('button[aria-label="Close"]').click()
  await expect(page).toHaveURL(/\/invoices$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.context().close()
})

test('2. read and unread notifications both open; "read all" never navigates', async ({ browser }) => {
  const page = await openAs(browser, admin, '/reports')
  await openBell(page)
  const readItem = page.getByTestId('notification-item').filter({ hasText: 'تم تحصيل دفعة إلكترونية' }).first()
  await readItem.click() // already read in test 1 — must still open
  await expect(page).toHaveURL(/\/invoices\?invoice=\d+$/)
  await expect(page.getByTestId('invoice-view-modal')).toBeVisible()
  await page.getByTestId('invoice-view-modal').locator('button[aria-label="Close"]').click()

  const before = page.url()
  await openBell(page)
  const readAll = page.getByTestId('notifications-read-all')
  if (await readAll.isVisible()) {
    await readAll.click()
    await page.waitForTimeout(500)
    expect(page.url()).toBe(before)
    await expect(readAll).toBeHidden()
  }
  await page.context().close()
})

test('6+12. invoice open during payment updates live, once, without reload — also after a socket drop', async ({ browser }) => {
  const inv = await newInvoice(admin.token, 150, '2021-02-01', 'مفتوحة')
  const { orderId } = await linkWithCheckout(admin.token, 150, { invoice_id: inv.id })
  const page = await openAs(browser, admin, `/invoices?invoice=${inv.id}`)
  const modal = page.getByTestId('invoice-view-modal')
  await expect(modal).toContainText('بانتظار الدفع')
  let loads = 0
  page.on('load', () => loads++)

  // Navigate around inside the SPA (no reload) and back: listeners must not stack up.
  const spaGo = (path: string) => page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')) }, path)
  for (const p of ['/dashboard', '/paymob-links', `/invoices`, '/reports', `/invoices?invoice=${inv.id}`]) {
    await spaGo(p)
    await page.waitForTimeout(400)
  }
  await expect(modal).toContainText('بانتظار الدفع')
  loads = 0
  const lightCalls: number[] = []
  page.on('request', (r) => { if (r.url().includes('/invoices/light')) lightCalls.push(Date.now()) })

  const t0 = Date.now()
  await sendWebhook(transaction(orderId, 15000))
  await expect(modal).toContainText('مدفوعة بالكامل', { timeout: 5000 })
  console.log(`[e2e] callback → invoice window shows paid: ${Date.now() - t0} ms`)
  await expect(page.getByText('تم تحصيل دفعة بنجاح')).toHaveCount(1)
  expect(loads).toBe(0)
  await page.waitForTimeout(800)
  expect(lightCalls.length).toBe(1) // one list refresh for the whole burst of events

  // Socket drop: payment arrives while offline → shown after reconnect.
  const inv2 = await newInvoice(admin.token, 90, '2021-02-02', 'انقطاع')
  const second = await linkWithCheckout(admin.token, 90, { invoice_id: inv2.id })
  await page.goto(`/invoices?invoice=${inv2.id}`)
  await expect(modal).toContainText('بانتظار الدفع')
  const socketLog: string[] = []
  page.on('console', (m) => { if (m.text().startsWith('[Socket]')) socketLog.push(m.text()) })
  await page.context().setOffline(true)
  await expect.poll(() => socketLog.some((l) => l.includes('Disconnected')), { timeout: 30_000 }).toBe(true)
  await sendWebhook(transaction(second.orderId, 9000)) // emitted while this tab is offline → lost
  await page.waitForTimeout(500)
  await expect(modal).toContainText('بانتظار الدفع')
  await page.context().setOffline(false)
  await expect(modal).toContainText('مدفوعة بالكامل', { timeout: 30_000 }) // resync after reconnect
  expect(socketLog.findIndex((l) => l.includes('Connected to server'))).toBeGreaterThan(socketLog.findIndex((l) => l.includes('Disconnected')))
  await page.context().close()
})

test('1b. task notification opens the task and its discussion; collection/user types route correctly', async ({ browser }) => {
  const inv = await newInvoice(admin.token, 75, '2021-03-01', 'مهمة')
  await call('/notifications/send', {
    method: 'POST', token: admin.token,
    body: { recipientId: employee.user.id, message: 'راجع هذه الفاتورة من فضلك', data: { invoiceId: inv.id, invoiceNumber: inv.invoice_number } },
  })
  const page = await openAs(browser, employee, '/dashboard', { width: 390, height: 844 }) // mobile
  await openBell(page)
  await page.getByTestId('notification-item').filter({ hasText: 'رسالة جديدة' }).first().click()
  await expect(page).toHaveURL(/\/tasks\?task=\d+$/)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('راجع هذه الفاتورة من فضلك')
  await expect(dialog).toContainText(`مراجعة فاتورة #${inv.invoice_number}`)
  await page.context().close()
})

test('3. permissions: a task / invoice outside the user\'s access shows an Arabic message, never a blank screen', async ({ browser }) => {
  const own = await call<{ id: number }>('/tasks', { method: 'POST', token: admin.token, body: { title: 'مهمة الإدارة فقط', assigned_to: admin.user.id } })
  const page = await openAs(browser, employee, `/tasks?task=${own.id}`)
  await expect(page.getByRole('dialog')).toContainText(/صلاحية|غير موجودة/)

  await page.goto('/invoices?invoice=2147480000')
  await expect(page.getByText('الفاتورة غير موجودة أو تم حذفها')).toBeVisible()
  await expect(page).toHaveURL(/\/invoices$/)

  // Employees do not receive admin payment broadcasts.
  const list = await call<any[]>('/notifications?limit=100', { token: employee.token })
  expect(list.some((n) => n.type === 'payment_received')).toBe(false)
  await page.context().close()
})

test('10. multi-invoice payment notification opens the payment link details', async ({ browser }) => {
  const a = await newInvoice(admin.token, 60, '2021-04-01', 'مجمعة أ')
  const b = await newInvoice(admin.token, 40, '2021-04-01', 'مجمعة ب')
  const { linkId, orderId } = await linkWithCheckout(admin.token, 100, { invoice_ids: [a.id, b.id] })
  await sendWebhook(transaction(orderId, 10000))
  const page = await openAs(browser, admin, '/clients')
  await openBell(page)
  await page.getByTestId('notification-item').filter({ hasText: '2 فواتير' }).first().click()
  await expect(page).toHaveURL(new RegExp(`/paymob-links\\?link=${linkId}$`))
  const details = page.getByTestId('payment-link-details')
  await expect(details).toContainText(a.invoice_number)
  await expect(details).toContainText(b.invoice_number)
  await expect(page.getByTestId('payment-link-paid-amount')).toContainText('100')
  await details.getByRole('button', { name: 'فتح الفاتورة' }).first().click()
  await expect(page).toHaveURL(/\/invoices\?invoice=\d+$/)
  await expect(page.getByTestId('invoice-view-modal')).toContainText('مدفوعة بالكامل')
  await page.context().close()
})

test('opening from a notification keeps the list scroll position (no jump) and closing restores it', async ({ browser }) => {
  const page = await openAs(browser, admin, '/invoices')
  await expect(page.locator('main')).toContainText('عميل حديث')
  await page.locator('main').evaluate((m) => { (m as HTMLElement).style.scrollBehavior = 'auto'; m.scrollTop = 900 })
  await page.waitForTimeout(300)
  const before = await page.locator('main').evaluate((m) => m.scrollTop)
  expect(before).toBeGreaterThan(500)

  await openBell(page)
  // a single-invoice payment notification ("… — فاتورة #DH…")
  await page.getByTestId('notification-item').filter({ hasText: 'تم تحصيل دفعة إلكترونية' }).filter({ hasText: 'فاتورة #' }).first().click()
  const modal = page.getByTestId('invoice-view-modal')
  await expect(modal).toBeVisible()
  await page.waitForTimeout(800) // list refresh + enrichment settle
  expect(await page.locator('main').evaluate((m) => m.scrollTop)).toBe(before)
  await expect(modal).toBeInViewport()

  await modal.locator('button[aria-label="Close"]').click()
  await expect(modal).toBeHidden()
  expect(await page.locator('main').evaluate((m) => m.scrollTop)).toBe(before)
  await page.context().close()
})
