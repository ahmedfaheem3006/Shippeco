import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

// Exercises the actual production static-hosting topology (two HTML shells
// + noindex header rules — see public/.htaccess and scripts/prerender.mjs)
// against a *built* dist/, via scripts/preview-static.mjs, which mimics the
// Hostinger .htaccess rewrite/header logic. This is deliberately separate
// from the other e2e spec's `npm run dev` server: dev mode doesn't have two
// HTML shells and can't exercise this at all.
const ROOT = process.cwd()
const DIST = path.join(ROOT, 'dist')

let server: ChildProcess
let BASE: string

// Runs all tests in this file against a single shared server instance, in
// one worker — each test otherwise gets its own worker under this project's
// `fullyParallel: true`, which would spawn multiple server processes
// fighting over the same port.
test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  if (!fs.existsSync(path.join(DIST, 'index.html')) || !fs.existsSync(path.join(DIST, 'app.html'))) {
    throw new Error('dist/ is missing index.html or app.html — run `npm run build` before this spec.')
  }

  // PORT=0 lets the OS assign a free port, so this never collides with
  // another instance of this same server (e.g. a leftover from a previous
  // run, or `npm run preview:static` running locally on the default port).
  server = spawn(process.execPath, ['scripts/preview-static.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: '0' },
    stdio: 'pipe',
  })

  BASE = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('preview-static.mjs did not start in time')), 15_000)
    server.stdout?.on('data', (chunk) => {
      const match = chunk.toString().match(/Static preview.*?(http:\/\/localhost:\d+)/)
      if (match) {
        clearTimeout(timer)
        resolve(match[1])
      }
    })
    server.on('error', reject)
  })
})

test.afterAll(() => {
  server?.kill()
})

test('public homepage ("/") is real prerendered content, indexable, with the right metadata', async ({ page, request }) => {
  const res = await page.goto(`${BASE}/`)
  expect(res?.status()).toBe(200)
  expect(res?.headers()['x-robots-tag']).toBeUndefined()

  await expect(page).toHaveTitle(/شيب بيك/)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('شيب بيك')
  await expect(page.getByRole('link', { name: 'تسجيل الدخول', exact: true }).first()).toBeVisible()

  // The raw HTML (no JS) must already contain the real content — this is
  // what proves prerendering actually happened, not just client rendering.
  const raw = await (await request.get(`${BASE}/`)).text()
  expect(raw).toContain('خدماتنا')
  expect(raw).toContain('<link rel="canonical" href="https://shippeco.com/" />')
  expect(raw).toMatch(/<meta name="robots" content="index, follow" \/>/)
  expect(raw).toContain('"@type":"Organization"')
})

test('protected app routes serve noindex (header + meta) and still boot the SPA', async ({ page, request }) => {
  const res = await request.get(`${BASE}/dashboard`)
  expect(res.headers()['x-robots-tag']).toBe('noindex, nofollow')
  const raw = await res.text()
  expect(raw).toMatch(/<meta name="robots" content="noindex, nofollow" \/>/)

  // Unauthenticated direct navigation to a protected route must land on login.
  await page.goto(`${BASE}/dashboard`)
  await expect(page).toHaveURL(/\/login$/)
})

test('direct navigation to /login renders the login form (clean URL, no #)', async ({ page }) => {
  await page.goto(`${BASE}/login`)
  await expect(page).toHaveURL(`${BASE}/login`)
  await expect(page.locator('input[type="password"]')).toBeVisible()
})

test('a public payment link route (/pay/:id) loads directly without requiring auth', async ({ page }) => {
  await page.goto(`${BASE}/pay/999999`)
  // No auth redirect — /pay/:id is a top-level public route.
  await expect(page).toHaveURL(`${BASE}/pay/999999`)
  await expect(page).not.toHaveURL(/\/login$/)
})

test('an unknown path renders the not-found page instead of a login redirect', async ({ page }) => {
  await page.goto(`${BASE}/this-page-does-not-exist`)
  await expect(page).toHaveURL(`${BASE}/this-page-does-not-exist`)
  await expect(page.getByText('الصفحة غير موجودة')).toBeVisible()
})

test('robots.txt and sitemap.xml are served and consistent', async ({ request }) => {
  const robots = await (await request.get(`${BASE}/robots.txt`)).text()
  expect(robots).toContain('Sitemap: https://shippeco.com/sitemap.xml')
  // No active Disallow directive (a mention in the explanatory comment is fine).
  expect(robots).not.toMatch(/^Disallow:/m)

  const sitemap = await (await request.get(`${BASE}/sitemap.xml`)).text()
  const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1])
  expect(locs).toEqual(['https://shippeco.com/'])
})
