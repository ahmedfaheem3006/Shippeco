import { createHmac } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Browser } from '@playwright/test'

/**
 * LIVE end-to-end for the customer payment-receipt e-mail: real browser ↔ real
 * local backend ↔ real PostgreSQL ↔ REAL SMTP (a local capture server that
 * requires AUTH and stores messages; it never relays). Paymob is the fake
 * from e2e/support/fake-paymob.mjs. Never touches production.
 *
 *   node <scratch>/smtp/capture.mjs 2525 <inbox dir>
 *   node e2e/support/fake-paymob.mjs 4599
 *   (Backend) … MAIL_PROVIDER=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_SECURE=false
 *             SMTP_USER=… SMTP_PASS=… MAIL_FROM_ADDRESS=billing@shippec.com npx tsx src/index.ts
 *   E2E_LIVE_API=http://127.0.0.1:3100/api E2E_SMTP_INBOX=<inbox dir> E2E_ADMIN_EMAIL=… E2E_ADMIN_PASSWORD=… \
 *     PW_SLOWMO_MS=0 npx playwright test payment-receipt-email.live
 */

const API = process.env.E2E_LIVE_API || ''
const INBOX = process.env.E2E_SMTP_INBOX || ''
const HMAC = process.env.E2E_HMAC_SECRET || 'e2e-hmac-secret'
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL || '', password: process.env.E2E_ADMIN_PASSWORD || '' }

test.skip(!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API) || !ADMIN.email || !INBOX, 'live e2e: local API, admin credentials and SMTP capture inbox required')
test.use({ launchOptions: { slowMo: 0 } })
test.describe.configure({ mode: 'serial' })

type Session = { token: string; user: { id: number; email: string; full_name: string; role: string; status: string } }

async function call<T = any>(p: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${p}`, {
    method: init.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const json: any = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${p} → ${res.status} ${JSON.stringify(json)}`)
  return (json?.data ?? json) as T
}

const FIELDS = ['amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction', 'id', 'integration_id',
  'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded', 'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending',
  'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success']
const sign = (obj: any) => createHmac('sha512', HMAC).update(FIELDS.map((f) => f.split('.').reduce((v: any, k) => (v == null ? undefined : v[k]), obj) ?? '').join('')).digest('hex')
let txSeq = Math.floor(Date.now() / 1000) + 900_000
const transaction = (orderId: number, cents: number) => ({
  id: ++txSeq, amount_cents: cents, created_at: new Date().toISOString(), currency: 'SAR', error_occured: false,
  has_parent_transaction: false, integration_id: 111, is_3d_secure: true, is_auth: false, is_capture: false,
  is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: orderId }, owner: 1, pending: false,
  source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' }, success: true,
})
async function sendWebhook(obj: any) {
  const res = await fetch(`${API}/paymob/webhook?hmac=${sign(obj)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'TRANSACTION', obj }),
  })
  expect(res.status).toBe(200)
}
const inbox = () => fs.existsSync(INBOX)
  ? fs.readdirSync(INBOX).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(INBOX, f), 'utf8')))
  : []

async function openAs(browser: Browser, s: Session, p: string) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } })
  await context.addInitScript(([token, user]) => {
    sessionStorage.setItem('auth_token', token as string)
    sessionStorage.setItem('shippec_session', JSON.stringify(user))
  }, [s.token, { id: s.user.id, username: s.user.email, name: s.user.full_name, role: s.user.role, status: s.user.status }])
  const page = await context.newPage()
  await page.route(/railway\.app|shippec\.com|workers\.dev|daftra\.com/, (r) => r.abort())
  await page.goto(p)
  return page
}

let admin: Session
test.beforeAll(async () => {
  admin = await call<Session>('/auth/login', { method: 'POST', body: ADMIN })
})

test('payment → invoice flips live, then exactly ONE receipt reaches the SMTP server with the saved values; staff see "قبله مزود البريد"', async ({ browser }) => {
  const to = `receipt.${Date.now()}@gmail.com`
  const inv = await call<{ id: number; invoice_number: string }>('/invoices', {
    method: 'POST', token: admin.token,
    body: { client_name: `عميل بريد ${Date.now()}`, phone: '0551234567', client_email: to, total: 449, status: 'unpaid', invoice_date: new Date().toISOString().slice(0, 10), carrier: 'DHL' },
  })
  const page = await openAs(browser, admin, `/invoices?invoice=${inv.id}`)
  const modal = page.getByTestId('invoice-view-modal')
  await expect(modal).toContainText(inv.invoice_number)
  await expect(modal).toContainText('بانتظار الدفع')

  const link = await call<{ id: number }>('/paymob/create-link', { method: 'POST', token: admin.token, body: { amount: 449, client_name: 'x', client_phone: '0551234567', invoice_id: inv.id } })
  const pay = await call<{ paymob_order_id: string }>(`/paymob/public-link/${link.id}/pay`, { method: 'POST', body: { email: 'someone.else@evil.example', phone: '0551234567' } })
  const tx = transaction(Number(pay.paymob_order_id), 44900)
  const t0 = Date.now()
  await sendWebhook(tx)

  await expect(modal).toContainText('مدفوعة بالكامل', { timeout: 10_000 })
  const tLive = Date.now() - t0
  await expect(page.getByTestId('invoice-email-label')).toHaveText('قبله مزود البريد', { timeout: 15_000 })
  const tMail = Date.now() - t0
  console.log(`[E2E] webhook → invoice paid on screen: ${tLive} ms; → receipt accepted by SMTP + shown to staff: ${tMail} ms`)

  await sendWebhook(tx) // Paymob retry
  await page.waitForTimeout(3000)
  const mine = inbox().filter((m) => m.envelope_to.includes(to))
  expect(mine).toHaveLength(1)
  expect(inbox().some((m) => m.envelope_to.some((a: string) => a.includes('evil')))).toBe(false)
  expect(mine[0].subject).toBe(`تم سداد فاتورتك ${inv.invoice_number} بنجاح | SHIPPEC`)
  expect(mine[0].from).toContain('billing@shippec.com')
  expect(mine[0].reply_to).toContain('support@shippec.com')
  expect(mine[0].has_html && mine[0].has_text).toBe(true)
  expect(mine[0].text).toContain('المبلغ المدفوع في هذه العملية: 449.00 ر.س')
  expect(mine[0].text).toContain(`مرجع عملية الدفع: ${tx.id}`)
  expect(mine[0].text).toContain('حالة الفاتورة: مدفوعة بالكامل')
  await page.screenshot({ path: path.join(INBOX, 'staff-modal.png') })
  await page.context().close()
})

test('client without an e-mail: payment succeeds, staff see "بريد العميل غير متوفر", nothing is sent', async ({ browser }) => {
  const before = inbox().length
  const inv = await call<{ id: number; invoice_number: string }>('/invoices', {
    method: 'POST', token: admin.token,
    body: { client_name: `عميل بلا بريد ${Date.now()}`, phone: '0551234568', total: 30, status: 'unpaid', invoice_date: new Date().toISOString().slice(0, 10), carrier: 'DHL' },
  })
  const link = await call<{ id: number }>('/paymob/create-link', { method: 'POST', token: admin.token, body: { amount: 30, client_name: 'x', client_phone: '0551234568', invoice_id: inv.id } })
  const pay = await call<{ paymob_order_id: string }>(`/paymob/public-link/${link.id}/pay`, { method: 'POST', body: { email: 'payer@gmail.com', phone: '0551234568' } })
  await sendWebhook(transaction(Number(pay.paymob_order_id), 3000))
  const page = await openAs(browser, admin, `/invoices?invoice=${inv.id}`)
  const modal = page.getByTestId('invoice-view-modal')
  await expect(modal).toContainText('مدفوعة بالكامل')
  await expect(page.getByTestId('invoice-email-label')).toHaveText('بريد العميل غير متوفر')
  await page.waitForTimeout(2000)
  expect(inbox().length).toBe(before)
  await page.context().close()
})
