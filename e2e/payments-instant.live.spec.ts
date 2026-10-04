import { expect, test, type Browser } from '@playwright/test'

/**
 * LIVE end-to-end for instant payment recording and the Daftra switch-off:
 * real browser ↔ real local backend ↔ real PostgreSQL, Paymob replaced by
 * e2e/support/fake-paymob.mjs. Same setup as payments-notifications.live:
 *
 *   node e2e/support/fake-paymob.mjs 4599
 *   (Backend) PORT=3100 DATABASE_URL=<local test db> PAYMOB_BASE_URL=http://127.0.0.1:4599
 *             PAYMOB_HMAC_SECRET=e2e-hmac-secret PAYMOB_INTEGRATION_IDS=111 ... npx tsx src/index.ts
 *   VITE_API_URL=http://127.0.0.1:3100/api npx vite --port 5173
 *   E2E_LIVE_API=http://127.0.0.1:3100/api E2E_FAKE_PAYMOB=http://127.0.0.1:4599 \
 *     E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... PW_SLOWMO_MS=0 npx playwright test payments-instant.live
 */

const API = process.env.E2E_LIVE_API || ''
const FAKE_PAYMOB = process.env.E2E_FAKE_PAYMOB || 'http://127.0.0.1:4599'
const INTEGRATION = Number(process.env.E2E_INTEGRATION_ID || 111)
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL || '', password: process.env.E2E_ADMIN_PASSWORD || '' }

test.skip(!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API) || !ADMIN.email, 'live e2e: set E2E_LIVE_API (local only) and admin credentials')
test.use({ launchOptions: { slowMo: 0 } })
test.describe.configure({ mode: 'serial' })

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

let txSeq = Math.floor(Date.now() / 1000) + 500_000
function transaction(orderId: number, cents: number) {
  return {
    id: ++txSeq, amount_cents: cents, created_at: new Date().toISOString(), currency: 'SAR', error_occured: false,
    has_parent_transaction: false, integration_id: INTEGRATION, is_3d_secure: true, is_auth: false, is_capture: false,
    is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: orderId }, owner: 1, pending: false,
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' }, success: true,
  }
}

/** Make the fake Paymob API know this transaction (as the real one would after a payment). */
async function paymobKnows(tx: ReturnType<typeof transaction>) {
  const res = await fetch(`${FAKE_PAYMOB}/_control/tx`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tx }),
  })
  expect(res.status).toBe(200)
}

async function newInvoice(token: string, total: number, label: string) {
  return call<{ id: number; invoice_number: string }>('/invoices', {
    method: 'POST', token,
    body: { client_name: `عميل ${label}`, phone: '0551234567', total, status: 'unpaid', invoice_date: new Date().toISOString().slice(0, 10), carrier: 'DHL' },
  })
}

async function linkWithCheckout(token: string, amount: number, invoiceId: number) {
  const link = await call<{ id: number }>('/paymob/create-link', {
    method: 'POST', token, body: { amount, client_name: 'عميل اختبار', client_phone: '0551234567', invoice_id: invoiceId },
  })
  const pay = await call<{ paymob_order_id: string }>(`/paymob/public-link/${link.id}/pay`, {
    method: 'POST', body: { email: 'customer@example.test', phone: '0551234567' },
  })
  return { linkId: link.id, orderId: Number(pay.paymob_order_id) }
}

async function openAs(browser: Browser, s: Session | null, path: string) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 } })
  if (s) {
    await context.addInitScript(([token, user]) => {
      sessionStorage.setItem('auth_token', token as string)
      sessionStorage.setItem('shippec_session', JSON.stringify(user))
    }, [s.token, { id: s.user.id, username: s.user.email, name: s.user.full_name, role: s.user.role, status: s.user.status }])
  }
  const page = await context.newPage()
  // This test must never reach a production host.
  await page.route(/railway\.app|shippec\.com|workers\.dev|daftra\.com/, (r) => r.abort())
  await page.goto(path)
  return page
}

let admin: Session

test.beforeAll(async () => {
  admin = await call<Session>('/auth/login', { method: 'POST', body: { email: ADMIN.email, password: ADMIN.password } })
})

test('a callback whose signature does not verify is confirmed with Paymob and the open invoices page flips to paid live', async ({ browser }) => {
  const inv = await newInvoice(admin.token, 1, 'توقيع')
  const { orderId } = await linkWithCheckout(admin.token, 1, inv.id)

  const page = await openAs(browser, admin, '/invoices')
  await page.getByPlaceholder('بحث بالاسم، الجوال، رقم الفاتورة، رقم دفترة...').fill(inv.invoice_number)
  const row = page.locator('tr', { hasText: inv.invoice_number }).first()
  await expect(row).toContainText('غير مدفوعة')

  const tx = transaction(orderId, 100)
  await paymobKnows(tx)
  const res = await fetch(`${API}/paymob/webhook?hmac=${'0'.repeat(128)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'TRANSACTION', obj: tx }),
  })
  expect(res.status).toBe(200)

  // No reload: the row and the bell update from the socket push.
  await expect(row).toContainText('مدفوعة', { timeout: 10_000 })
  await expect(row).not.toContainText('غير مدفوعة')
  await page.getByTestId('notifications-bell').click()
  await expect(page.getByTestId('notification-item').filter({ hasText: 'تم تحصيل دفعة إلكترونية' }).first()).toContainText(inv.invoice_number)
  await page.context().close()
})

test('customer returning from checkout sees the confirmed payment right away and the invoice is paid', async ({ browser }) => {
  const inv = await newInvoice(admin.token, 75, 'رجوع')
  const { linkId, orderId } = await linkWithCheckout(admin.token, 75, inv.id)
  const intentions = await (await fetch(`${FAKE_PAYMOB}/_control/intentions`)).json()
  expect(intentions.find((i: any) => i.order_id === orderId).body.redirection_url).toMatch(new RegExp(`/pay/${linkId}$`))

  const tx = transaction(orderId, 7500)
  await paymobKnows(tx)
  // Exactly what Paymob appends to the redirection URL.
  const page = await openAs(browser, null, `/pay/${linkId}?id=${tx.id}&order=${orderId}&success=true&pending=false&amount_cents=7500`)
  await expect(page.getByText('تم سداد الفاتورة بنجاح')).toBeVisible({ timeout: 15_000 })

  const fresh = await call<any>(`/invoices/${inv.id}?strict=1`, { token: admin.token })
  expect(fresh.status).toBe('paid')
  await page.context().close()
})

test('payment gateway status is visible to staff on the payment links page', async ({ browser }) => {
  const page = await openAs(browser, admin, '/paymob-links')
  await expect(page.getByText(/بوابة الدفع تعمل|توقيع إشعارات Paymob|لم يصل أي إشعار/)).toBeVisible()
  await page.context().close()
})

test('Daftra is switched off: no import endpoints, no sync buttons', async ({ browser }) => {
  const res = await fetch(`${API}/sync/recent`, { headers: { Authorization: `Bearer ${admin.token}` } })
  expect(res.status).toBe(410)
  const status = await call<any>('/sync/status', { token: admin.token })
  expect(status.daftra_enabled).toBe(false)

  const page = await openAs(browser, admin, '/settings')
  await expect(page.getByText('المزامنة متوقفة')).toBeVisible()
  await expect(page.getByText('مزامنة يدوية الآن')).toHaveCount(0)
  await page.goto('/clients')
  await expect(page.getByRole('heading').first()).toBeVisible()
  await expect(page.getByText('مزامنة من دفترة')).toHaveCount(0)
  await page.context().close()
})
