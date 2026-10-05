import { expect, test, type Browser, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * LIVE end-to-end of the customer payment page: real browser (phone size) ↔
 * real local backend ↔ real PostgreSQL, Paymob replaced by
 * e2e/support/fake-paymob.mjs, mail by a local SMTP capture (never relays).
 *
 *   node e2e/support/fake-paymob.mjs 4599
 *   (SMTP capture writing JSON files to E2E_MAIL_INBOX on 127.0.0.1:2525)
 *   (Backend) PORT=3100 DATABASE_URL=<local test db> PAYMOB_BASE_URL=http://127.0.0.1:4599
 *             PAYMOB_CHECKOUT_URL=http://127.0.0.1:4599/checkout PAYMOB_HMAC_SECRET=e2e-hmac-secret
 *             PAYMOB_INTEGRATION_IDS=111 MAIL_PROVIDER=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=2525 ... npx tsx src/index.ts
 *   VITE_API_URL=http://127.0.0.1:3100/api npx vite --port 5173
 *   E2E_LIVE_API=http://127.0.0.1:3100/api E2E_FAKE_PAYMOB=http://127.0.0.1:4599 E2E_MAIL_INBOX=<dir> \
 *     E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... PW_SLOWMO_MS=0 npx playwright test pay-page.live
 */

const API = process.env.E2E_LIVE_API || ''
const FAKE_PAYMOB = process.env.E2E_FAKE_PAYMOB || 'http://127.0.0.1:4599'
const INBOX = process.env.E2E_MAIL_INBOX || ''
const INTEGRATION = Number(process.env.E2E_INTEGRATION_ID || 111)
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL || '', password: process.env.E2E_ADMIN_PASSWORD || '' }

test.skip(!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(API) || !ADMIN.email, 'live e2e: set E2E_LIVE_API (local only) and admin credentials')
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

let txSeq = Math.floor(Date.now() / 1000) + 900_000
function transaction(orderId: number, cents: number, success = true) {
  return {
    id: ++txSeq, amount_cents: cents, created_at: new Date().toISOString(), currency: 'SAR', error_occured: false,
    has_parent_transaction: false, integration_id: INTEGRATION, is_3d_secure: true, is_auth: false, is_capture: false,
    is_refunded: false, is_standalone_payment: true, is_voided: false, order: { id: orderId }, owner: 1, pending: false,
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' }, success,
    data: success ? {} : { message: 'Do not honour', txn_response_code: '05' },
  }
}

async function paymobKnows(tx: ReturnType<typeof transaction>) {
  const res = await fetch(`${FAKE_PAYMOB}/_control/tx`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tx }) })
  expect(res.status).toBe(200)
}
const intentions = async () => (await (await fetch(`${FAKE_PAYMOB}/_control/intentions`)).json()) as { order_id: number; body: any }[]

async function newInvoiceWithClientEmail(token: string, total: number, clientEmail: string) {
  const label = `بريد ${Date.now().toString(36)}`
  const inv = await call<{ id: number; invoice_number: string; client_id?: number }>('/invoices', {
    method: 'POST', token,
    body: { client_name: `عميل ${label}`, phone: '0551234567', email: clientEmail, total, status: 'unpaid', invoice_date: new Date().toISOString().slice(0, 10), carrier: 'DHL' },
  })
  return inv
}

async function phone(browser: Browser, p: string): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  })
  const page = await context.newPage()
  await page.route(/railway\.app|shippec\.com|workers\.dev|daftra\.com|paymob\.com/, (r) => r.abort())
  // The fake "Paymob checkout" page the customer is sent to.
  await page.route(`${FAKE_PAYMOB}/checkout/**`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body><h1>FAKE PAYMOB CHECKOUT</h1></body></html>' }))
  await page.goto(p)
  return page
}

const mailsTo = (addr: string) => (INBOX && fs.existsSync(INBOX) ? fs.readdirSync(INBOX) : [])
  .map((f) => JSON.parse(fs.readFileSync(path.join(INBOX, f), 'utf8')))
  .filter((m) => String(m.to || '').includes(addr))

let admin: Session

test.beforeAll(async () => {
  admin = await call<Session>('/auth/login', { method: 'POST', body: { email: ADMIN.email, password: ADMIN.password } })
})

test('customer: e-mail → one click → Paymob (same tab) → declined → retry → paid; receipt goes ONLY to the confirmed e-mail', async ({ browser }, info) => {
  const shots = (n: string) => info.outputPath(`${n}.png`)
  const clientEmail = `client.record.${Date.now()}@gmail.com`
  const payerEmail = `payer.e2e.${Date.now()}@gmail.com`
  const inv = await newInvoiceWithClientEmail(admin.token, 1, clientEmail)
  const link = await call<{ id: number }>('/paymob/create-link', {
    method: 'POST', token: admin.token, body: { amount: 1, client_name: 'إبراهيم - اختبار', client_phone: '0551234567', invoice_id: inv.id },
  })

  // Staff: the invoices page is open the whole time (live update without reload).
  const staffCtx = await browser.newContext({ viewport: { width: 1366, height: 860 } })
  await staffCtx.addInitScript(([token, user]) => {
    sessionStorage.setItem('auth_token', token as string)
    sessionStorage.setItem('shippec_session', JSON.stringify(user))
  }, [admin.token, { id: admin.user.id, username: admin.user.email, name: admin.user.full_name, role: admin.user.role, status: admin.user.status }])
  const staff = await staffCtx.newPage()
  await staff.route(/railway\.app|shippec\.com|workers\.dev|daftra\.com/, (r) => r.abort())
  await staff.goto('/invoices')
  await staff.getByPlaceholder('بحث بالاسم، الجوال، رقم الفاتورة، رقم دفترة...').fill(inv.invoice_number)
  const row = staff.locator('tr', { hasText: inv.invoice_number }).first()
  await expect(row).toContainText('غير مدفوعة')

  const page = await phone(browser, `/pay/${link.id}`)
  await expect(page.getByLabel(/البريد الإلكتروني لاستلام إيصال السداد/)).toBeVisible()
  await expect(page.locator('iframe')).toHaveCount(0)
  await expect(page.getByText('هل تواجه مشكلة')).toHaveCount(0)
  await page.screenshot({ path: shots('1-form'), fullPage: true })

  // invalid → clear message, no checkout created
  const before = (await intentions()).length
  await page.getByLabel(/البريد الإلكتروني لاستلام إيصال السداد/).fill('a@b')
  await page.getByRole('button', { name: 'المتابعة إلى الدفع' }).click()
  await expect(page.getByRole('alert')).toContainText('بريد إلكتروني صحيح')
  expect((await intentions()).length).toBe(before)

  // valid (with surrounding spaces) → shown back to the customer → one click → Paymob in the same tab
  await page.getByLabel(/البريد الإلكتروني لاستلام إيصال السداد/).fill(`  ${payerEmail} `)
  await expect(page.getByText('سيُرسل إيصال السداد إلى:')).toBeVisible()
  await expect(page.getByText(payerEmail, { exact: true })).toBeVisible()
  await page.screenshot({ path: shots('2-confirm-email'), fullPage: true })
  await page.getByRole('button', { name: 'المتابعة إلى الدفع' }).dblclick()
  await page.waitForURL(/\/checkout\/\?publicKey=.*&clientSecret=csk_test_\d+/)
  await expect(page.getByText('FAKE PAYMOB CHECKOUT')).toBeVisible()
  let all = await intentions()
  expect(all.length - before).toBe(1) // double click → one checkout
  const first = all[all.length - 1]
  expect(first.body.billing_data.email).toBe(payerEmail)
  expect(first.body.redirection_url).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:\\d+/pay/${link.id}$`))

  // Paymob sends the customer back after a DECLINE
  const declined = transaction(first.order_id, 100, false)
  await paymobKnows(declined)
  await page.goto(`/pay/${link.id}?id=${declined.id}&order=${first.order_id}&success=false`)
  await expect(page.getByText('لم تكتمل عملية الدفع')).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: shots('3-declined'), fullPage: true })
  expect((await call<any>(`/invoices/${inv.id}?strict=1`, { token: admin.token })).payment_status).toBe(0)
  expect(await call<any[]>(`/invoices/${inv.id}/emails`, { token: admin.token })).toHaveLength(0)

  // retry → a fresh checkout for the same e-mail
  await page.getByRole('button', { name: 'المحاولة مرة أخرى' }).click()
  await page.getByLabel(/البريد الإلكتروني لاستلام إيصال السداد/).fill(payerEmail)
  await page.getByRole('button', { name: 'المتابعة إلى الدفع' }).click()
  await page.waitForURL(/\/checkout\//)
  all = await intentions()
  const second = all[all.length - 1]
  expect(second.order_id).not.toBe(first.order_id)
  expect(second.body.billing_data.email).toBe(payerEmail)

  // paid this time: back on our page, confirmed by the server
  const ok = transaction(second.order_id, 100, true)
  await paymobKnows(ok)
  const t0 = Date.now()
  await page.goto(`/pay/${link.id}?id=${ok.id}&order=${second.order_id}&success=true`)
  await expect(page.getByText('تم سداد الفاتورة بنجاح')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/جارٍ إرسال إيصال السداد|سلّمنا إيصال السداد/).first()).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: shots('4-paid'), fullPage: true })

  // staff page flipped by itself; notification arrived
  await expect(row).toContainText('مدفوعة', { timeout: 10_000 })
  await expect(row).not.toContainText('غير مدفوعة')
  console.log(`[E2E] return → staff row paid: ${Date.now() - t0} ms`)
  await staff.getByTestId('notifications-bell').click()
  await expect(staff.getByTestId('notification-item').filter({ hasText: 'تم تحصيل دفعة إلكترونية' }).first()).toContainText(inv.invoice_number)

  // outbox: one job, to the payer, accepted by the (local) mail server
  await expect.poll(async () => (await call<any[]>(`/invoices/${inv.id}/emails`, { token: admin.token }))[0]?.status, { timeout: 30_000 }).toBe('sent')
  const jobs = await call<any[]>(`/invoices/${inv.id}/emails`, { token: admin.token })
  expect(jobs).toHaveLength(1)
  expect(jobs[0]).toMatchObject({ recipient: payerEmail, recipient_source: 'payer_checkout', transaction_id: String(ok.id) })
  if (INBOX) {
    await expect.poll(() => mailsTo(payerEmail).length, { timeout: 15_000 }).toBe(1)
    expect(mailsTo(clientEmail)).toHaveLength(0)
    const m = mailsTo(payerEmail)[0]
    expect(m.subject).toContain(inv.invoice_number)
    console.log(`[E2E] payer=${payerEmail} attempt order=${second.order_id} outbox#${jobs[0].id} → ${jobs[0].recipient} smtp=${m.messageId}`)
  }
  // the client record was not touched by the public page
  const client = await call<any>(`/invoices/${inv.id}?strict=1`, { token: admin.token })
  expect(JSON.stringify(client)).not.toContain(payerEmail)

  // the page shows the provider state honestly (accepted ≠ delivered)
  await page.reload()
  await expect(page.getByText(/سلّمنا إيصال السداد لمزوّد البريد/)).toBeVisible({ timeout: 15_000 })
  await page.context().close()
  await staffCtx.close()
})

test('two people on one link: each paid transaction is receipted to its own attempt e-mail', async ({ browser }) => {
  const inv = await newInvoiceWithClientEmail(admin.token, 2, `client.two.${Date.now()}@gmail.com`)
  const link = await call<{ id: number }>('/paymob/create-link', {
    method: 'POST', token: admin.token, body: { amount: 1, client_name: 'عميل', client_phone: '0551234567', invoice_id: inv.id },
  })
  const a = `person.a.${Date.now()}@gmail.com`
  const b = `person.b.${Date.now()}@outlook.com`
  const pa = await phone(browser, `/pay/${link.id}`)
  const pb = await phone(browser, `/pay/${link.id}`)
  for (const [p, e, ph] of [[pa, a, '0551111111'], [pb, b, '0552222222']] as const) {
    await p.getByLabel(/البريد الإلكتروني لاستلام إيصال السداد/).fill(e)
    await p.getByLabel('رقم الجوال').fill(ph)
    await p.getByRole('button', { name: 'المتابعة إلى الدفع' }).click()
    await p.waitForURL(/\/checkout\//)
  }
  const all = await intentions()
  const ia = all.filter((i) => i.body.billing_data.email === a).pop()!
  const ib = all.filter((i) => i.body.billing_data.email === b).pop()!
  for (const [i, p] of [[ib, pb], [ia, pa]] as const) {
    const t = transaction(i.order_id, 100)
    await paymobKnows(t)
    await p.goto(`/pay/${link.id}?id=${t.id}&order=${i.order_id}&success=true`)
    await expect(p.getByText('تم سداد الفاتورة بنجاح')).toBeVisible({ timeout: 15_000 })
  }
  await expect.poll(async () => (await call<any[]>(`/invoices/${inv.id}/emails`, { token: admin.token })).length, { timeout: 20_000 }).toBe(2)
  const jobs = await call<any[]>(`/invoices/${inv.id}/emails`, { token: admin.token })
  expect(jobs.map((j) => j.recipient).sort()).toEqual([a, b].sort())
  await pa.context().close()
  await pb.context().close()
})
