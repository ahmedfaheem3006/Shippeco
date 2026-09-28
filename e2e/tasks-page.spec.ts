import { expect, test, type Page } from '@playwright/test'

/**
 * Regression tests for /tasks:
 *  - the "assign task" dialog opened mid-list rendered off-screen (only the
 *    dimmed backdrop was visible) because the page wrapper kept a transform
 *    from its entrance animation;
 *  - opening a task scrolled the page (scrollIntoView on the discussion), and
 *    closing it lost the user's place in the list.
 * Every request to the API is answered here; nothing reaches a real server.
 */

test.use({ launchOptions: { slowMo: 0 }, viewport: { width: 1440, height: 900 } })

type T = Record<string, unknown> & { id: number; title: string; status: 'open' | 'closed' }

function seedTasks(n: number): T[] {
  return Array.from({ length: n }, (_, i) => ({
    id: n - i,
    title: `مهمة رقم ${n - i}`,
    description: `وصف المهمة ${n - i}`,
    assigned_to: 4,
    assigned_by: 1,
    status: (n - i) % 5 === 0 ? 'closed' : 'open',
    created_at: '2026-09-01T10:00:00Z',
    updated_at: '2026-09-01T10:00:00Z',
    assigned_to_name: 'موظف أول',
    assigned_by_name: 'مدير النظام',
  }))
}

async function setup(page: Page) {
  const tasks = seedTasks(36)
  const messages = new Map<number, { id: number; task_id: number; user_id: number; message: string; created_at: string; user_name: string }[]>()
  let nextMsgId = 1000
  const calls = { createTask: 0 }

  await page.addInitScript(() => {
    sessionStorage.setItem('shippec_session', JSON.stringify({ id: 1, username: 'admin@test', name: 'مدير النظام', role: 'admin', status: 'approved' }))
    sessionStorage.setItem('auth_token', 'e2e-token')
  })
  const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

  // Catch-all first (Playwright matches the most recently added route first).
  await page.route(/\/api\//, (r) => r.fulfill(json({ success: true, data: [] })))
  await page.route(/socket\.io/, (r) => r.abort())
  await page.route(/\/api\/users\/list/, (r) => r.fulfill(json({ success: true, data: [{ id: 4, full_name: 'موظف أول', role: 'employee' }] })))
  await page.route(/\/api\/tasks(\?.*)?$/, async (r) => {
    if (r.request().method() === 'POST') {
      calls.createTask++
      const body = r.request().postDataJSON() as { title: string; assigned_to: number }
      await new Promise((res) => setTimeout(res, 300))
      const created: T = { ...tasks[0], id: 1000 + calls.createTask, title: body.title, status: 'open' }
      tasks.unshift(created)
      return r.fulfill(json({ success: true, data: created }, 201))
    }
    const status = new URL(r.request().url()).searchParams.get('status')
    return r.fulfill(json({ success: true, data: status ? tasks.filter((t) => t.status === status) : tasks }))
  })
  await page.route(/\/api\/tasks\/\d+$/, (r) => {
    const id = Number(r.request().url().split('/').pop())
    const t = tasks.find((x) => x.id === id)
    return r.fulfill(json({ success: true, data: { ...t, messages: messages.get(id) ?? [] } }))
  })
  await page.route(/\/api\/tasks\/\d+\/messages$/, (r) => {
    const id = Number(r.request().url().split('/').slice(-2)[0])
    const m = { id: nextMsgId++, task_id: id, user_id: 1, message: (r.request().postDataJSON() as { message: string }).message, created_at: new Date().toISOString(), user_name: 'مدير النظام' }
    messages.set(id, [...(messages.get(id) ?? []), m])
    return r.fulfill(json({ success: true, data: m }))
  })

  await page.goto('/tasks')
  await page.locator('[data-task-id]').first().waitFor()
  await page.locator('main').evaluate((m) => { (m as HTMLElement).style.scrollBehavior = 'auto' })
  await page.waitForTimeout(300) // page entrance animation
  return { calls }
}

const mainTop = (page: Page) => page.locator('main').evaluate((m) => m.scrollTop)
const setMainTop = (page: Page, y: number) => page.locator('main').evaluate((m, v) => { m.scrollTop = v }, y)

async function clickAssignOnScreen(page: Page) {
  const buttons = page.getByRole('button', { name: /إسناد مهمة/ })
  const i = await buttons.evaluateAll((els) => els.findIndex((e) => {
    const r = e.getBoundingClientRect(); const m = document.querySelector('main')!.getBoundingClientRect()
    return r.height > 0 && r.top >= m.top && r.bottom <= m.bottom
  }))
  expect(i, 'an assign button is reachable without scrolling').toBeGreaterThanOrEqual(0)
  await buttons.nth(i).click()
}

test('assign dialog is fully on screen from the top, middle and bottom of a long list', async ({ page }) => {
  await setup(page)
  const max = await page.locator('main').evaluate((m) => m.scrollHeight - m.clientHeight)
  for (const y of [0, Math.round(max / 2), max]) {
    await setMainTop(page, y)
    await clickAssignOnScreen(page)
    const dialog = page.getByRole('dialog', { name: 'إسناد مهمة جديدة' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: /إرسال المهمة/ })).toBeInViewport()
    await expect(dialog.getByRole('textbox', { name: /عنوان المهمة/ })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await mainTop(page)).toBe(y)
  }
})

test('create: validation, single request on double click, list stays put', async ({ page }) => {
  const { calls } = await setup(page)
  await setMainTop(page, 900)
  await clickAssignOnScreen(page)
  const dialog = page.getByRole('dialog', { name: 'إسناد مهمة جديدة' })
  await dialog.getByRole('button', { name: /إرسال المهمة/ }).click()
  await expect(dialog.getByText('عنوان المهمة مطلوب')).toBeVisible()
  await expect(dialog.getByText('اختر الموظف المسؤول عن المهمة')).toBeVisible()
  expect(calls.createTask).toBe(0)

  await dialog.getByRole('textbox', { name: /عنوان المهمة/ }).fill('مهمة جديدة من الاختبار')
  await dialog.getByRole('combobox', { name: /الموظف المسؤول/ }).click()
  await page.getByRole('option', { name: /موظف أول/ }).click()
  const firstVisible = await page.evaluate(() => {
    const m = document.querySelector('main')!.getBoundingClientRect()
    const el = [...document.querySelectorAll<HTMLElement>('[data-task-id]')].find((e) => e.getBoundingClientRect().top >= m.top + 120)!
    return { id: el.dataset.taskId, top: el.getBoundingClientRect().top }
  })
  await dialog.getByRole('button', { name: /إرسال المهمة/ }).dblclick()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText(/تم إسناد المهمة «مهمة جديدة من الاختبار»/)).toBeVisible()
  expect(calls.createTask).toBe(1)
  const after = await page.locator(`[data-task-id="${firstVisible.id}"]`).boundingBox()
  expect(Math.abs(after!.y - firstVisible.top)).toBeLessThanOrEqual(2)
})

test('open → reply → close keeps the list position and returns focus, across several tasks', async ({ page }) => {
  await setup(page)
  await page.locator('#tasks-search').fill('مهمة')
  await setMainTop(page, 1200)
  const ids = await page.locator('[data-task-open]').evaluateAll((els) => {
    const m = document.querySelector('main')!.getBoundingClientRect()
    return els.filter((e) => { const r = e.getBoundingClientRect(); return r.top > m.top + 120 && r.bottom < m.bottom }).map((e) => e.getAttribute('data-task-open')!)
  })
  for (const id of ids.slice(0, 3)) {
    const before = await mainTop(page)
    await page.locator(`[data-task-open="${id}"]`).click()
    const dialog = page.getByRole('dialog')
    const composer = dialog.getByRole('textbox', { name: 'اكتب ردك' })
    await expect(composer).toBeEnabled()
    expect(await mainTop(page)).toBe(before)
    await composer.fill(`رد على ${id}`)
    await composer.press('Enter')
    await expect(dialog.getByRole('log').getByText(`رد على ${id}`)).toHaveCount(1)
    await expect(composer).toHaveValue('')
    expect(await mainTop(page)).toBe(before)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await mainTop(page)).toBe(before)
    await expect(page.locator(`[data-task-open="${id}"]`)).toBeFocused()
  }
})

test('prev/next moves through the filtered list and keeps an unsent draft per task', async ({ page }) => {
  await setup(page)
  await page.getByRole('tab', { name: 'مفتوحة' }).click()
  await page.locator('[data-task-open]').first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'المهمة السابقة' })).toBeDisabled()
  const first = await dialog.locator('h2').innerText()
  await dialog.getByRole('textbox', { name: 'اكتب ردك' }).fill('مسودة')
  await dialog.getByRole('button', { name: 'المهمة التالية' }).click()
  await expect(dialog.locator('h2')).not.toHaveText(first)
  await expect(dialog.getByRole('button', { name: 'المهمة التالية' })).toBeFocused()
  await expect(dialog.getByRole('textbox', { name: 'اكتب ردك' })).toHaveValue('')
  await dialog.getByRole('button', { name: 'المهمة السابقة' }).click()
  await expect(dialog.locator('h2')).toHaveText(first)
  await expect(dialog.getByRole('textbox', { name: 'اكتب ردك' })).toHaveValue('مسودة')
  await page.keyboard.press('Escape')
  await expect(page.getByText('مسودة رد').first()).toBeVisible()
})

test('mobile: dialog controls stay on screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.locator('[data-task-open]').nth(1).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: 'إغلاق', exact: true })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: 'إرسال الرد' })).toBeInViewport()
})
