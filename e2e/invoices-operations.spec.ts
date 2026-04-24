import { expect, test } from '@playwright/test'

function seedInvoice() {
  return [
    {
      id: '123',
      client: 'محمد عبدالله',
      phone: '0550000000',
      awb: '1234567890',
      carrier: 'DHL Express',
      date: '2026-03-16',
      status: 'unpaid',
      payment: '',
      price: 100,
      partialPaid: 0,
      dhlCost: 80,
      weight: '10',
      itemType: 'شحن دولي',
      details: 'تفاصيل',
      codeType: 'barcode',
      isDraft: false,
      waLog: [],
      timeline: [],
    },
  ]
}

async function stubDb(page: import('@playwright/test').Page) {
  type DbInvoice = { id: string } & Record<string, unknown>
  let invoices: DbInvoice[] = seedInvoice() as unknown as DbInvoice[]

  await page.route('**/db/invoices**', async (route) => {
    const req = route.request()
    const method = req.method()

    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(invoices) })
      return
    }

    if (method === 'POST') {
      const body = req.postDataJSON() as unknown
      if (Array.isArray(body)) {
        for (const inv of body) {
          const invObj = inv as Record<string, unknown>
          const id = String(invObj.id ?? '')
          if (!id) continue
          const idx = invoices.findIndex((x) => String(x.id) === id)
          const normalized = invObj as unknown as DbInvoice
          if (idx === -1) invoices.push(normalized)
          else invoices[idx] = normalized
        }
      } else {
        const obj = body as Record<string, unknown>
        const id = String(obj.id ?? '')
        if (id) {
          const idx = invoices.findIndex((x) => String(x.id) === id)
          const normalized = obj as unknown as DbInvoice
          if (idx === -1) invoices.push(normalized)
          else invoices[idx] = normalized
        }
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      return
    }

    if (method === 'DELETE') {
      const url = req.url()
      const id = decodeURIComponent(url.split('/').pop() || '')
      invoices = invoices.filter((x) => String(x.id) !== id)
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.route('**/db/settings**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

test.beforeEach(async ({ page }) => {
  await stubDb(page)
  await page.addInitScript(
    () => {
      // @ts-expect-error - test hook
      window.__lastOpen = null
      window.open = (...args) => {
        // @ts-expect-error - test hook
        window.__lastOpen = args
        return null
      }
      window.confirm = () => true
    },
  )
})

test('invoice row operations behave like legacy', async ({ page }) => {
  await page.goto('/#/invoices')

  const row = page.locator('tr', { hasText: '#123' })
  await expect(row).toBeVisible()

  await row.getByTestId('invoice-row-menu-trigger').click()
  await row.getByTestId('invoice-row-menu-item-view').click()
  await expect(page.getByTestId('invoice-view-modal')).toBeVisible()
  await expect(page.getByText('فاتورة #123')).toBeVisible()
  await page.getByTestId('invoice-view-close').click()
  await expect(page.getByTestId('invoice-view-modal')).toBeHidden()

  await row.getByTestId('invoice-row-menu-trigger').click()
  await row.getByTestId('invoice-row-menu-item-add_item').click()
  await expect(page.getByTestId('invoice-add-item-modal')).toBeVisible()
  await page.getByTestId('invoice-add-item-submit').click()
  await expect(page.getByTestId('invoice-add-item-modal')).toBeHidden()
  await expect(row).toContainText('156.00 ر.س')

  await row.getByTestId('invoice-row-menu-trigger').click()
  await row.getByTestId('invoice-row-menu-item-edit').click()
  await expect(page.getByTestId('invoice-wizard-modal')).toBeVisible()
  await page.getByTestId('wizard-client').fill('محمد (تعديل)')
  await page.getByTestId('wizard-save-invoice').click()
  await expect(page.getByTestId('invoice-wizard-modal')).toBeHidden()
  await expect(row).toContainText('محمد (تعديل)')

  await row.getByTestId('invoice-row-menu-trigger').click()
  await row.getByTestId('invoice-row-menu-item-collect').click()
  const lastOpen = await page.evaluate(() => {
    // @ts-expect-error - test hook
    return window.__lastOpen
  })
  expect(lastOpen?.[0]).toContain('https://wa.me/')
  expect(decodeURIComponent(String(lastOpen?.[0]))).toContain('رقم الفاتورة')

  await row.getByTestId('invoice-row-menu-trigger').click()
  await row.getByTestId('invoice-row-menu-item-delete').click()
  await expect(page.locator('tr', { hasText: '#123' })).toHaveCount(0)
})
