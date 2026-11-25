import { expect, test, type Page } from '@playwright/test'

/**
 * «إنشاء شحنة» → Step 3 «تفاصيل الفاتورة الجمركية / Customs Invoice Details» and
 * Step 5 «الدفع / Payment» (the MyDHL+ workflows on SHIPPEC's design) at desktop
 * and mobile widths, Arabic (RTL) and English (LTR): Create Invoice ↔ Use My Own
 * Invoice, optional invoice number, remarks, Certificate of Origin (no NAFTA /
 * US filing for a Saudi origin), customs documents, Paperless; transport and
 * duties payers with their own account fields, the masked SHIPPEC account, DAP /
 * DDP. No horizontal scroll, every control inside the step. Every API request is
 * answered here — nothing reaches a real server or DHL. Screenshots → PW_SHOTS_DIR.
 */

const SHOTS = process.env.PW_SHOTS_DIR
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

const draft = (over: Record<string, unknown> = {}) => ({
  id: 5, dhl_env: 'test', status: 'draft', creation_status: 'draft', shippec_reference: 'SHIPPEC-7Q2K9D', idempotency_key: 'auto:x', awb: null, client_id: 3, client_name: 'Gulf Retail Client',
  customer_reference: 'PO-1182', product_code: null, local_product_code: null, product_name: null, service_codes: [], customs_required: true, paperless_trade: false,
  content_description: null, incoterm: 'DAP', currency: 'SAR', declared_value: null, export_reason_type: 'gift', shipment_type: 'personal',
  customs_invoice_number: null, customs_invoice_date: null, dhl_invoice_type: 'proforma', shipment_date: '2026-11-26', origin_gmt_offset: null, shipment_purpose: 'gift',
  invoice_remarks: [], declaration_statements: [], customs_documents: [],
  transport_payer: 'shipper', transport_payer_account: null, duties_payer: 'receiver', duties_payer_account: null, pickup_option: 'none',
  pickup_earliest_time: null, pickup_latest_time: null, pickup_location: null, pickup_location_type: null, pickup_instructions: null, pickup_address: null,
  service_point_id: null, service_point_name: null, package_count: 1, total_gross_weight: '1.200', validation_issues: [], validation_warnings: [],
  dhl_validation_status: 'not_run', available_products: null, rate_quotes: null, dhl_cost: null, dhl_cost_source: null, selling_price: null, price_currency: 'SAR',
  invoice_id: null, invoice_link_status: 'none', invoice_link_error: null, creation_error_code: null, creation_error_message: null, message_reference: null, uncertain_since: null,
  pickup_id: null, plt_status: 'not_required', tracking_id: null, is_domestic: false, content_type: 'goods', created_at: '2026-11-22T10:00:00Z', updated_at: '2026-11-22T10:00:00Z',
  shipper_company: 'Shippec Trading', shipper_contact: 'Sara Operations', shipper_phone: '+966551234567', shipper_email: 'ops@shippec.invalid', shipper_address_line1: '3456, Prince Sultan Road',
  shipper_address_line2: '7788, Al Olaya', shipper_address_line3: 'ROLA3456', shipper_city: 'Dammam', shipper_postal_code: '31952', shipper_province: null, shipper_country_code: 'SA', shipper_type: 'business',
  receiver_company: 'Gulf Retail Trading LLC', receiver_contact: 'Omar Haddad', receiver_phone: '+971501234567', receiver_email: null, receiver_address_line1: 'Office 1204, Bay Square 7',
  receiver_address_line2: 'Business Bay', receiver_address_line3: null, receiver_city: 'Dubai', receiver_postal_code: '00000', receiver_province: null, receiver_country_code: 'AE', receiver_type: 'business',
  packages: [{ sequence: 1, weight_kg: '1.200', length_cm: '30.00', width_cm: '20.00', height_cm: '10.00', customer_reference: null, dhl_piece_id: null }],
  items: [
    { description: 'Cotton T-shirt', quantity: 20, unit: 'PCS', unit_value: '22.000', country_of_origin: 'SA', outbound_hs_code: null, inbound_hs_code: null, unit_net_weight_kg: '0.020', line_gross_weight_kg: '0.500' },
    { description: 'Wool scarf', quantity: 6, unit: 'PCS', unit_value: '33.333', country_of_origin: 'TR', outbound_hs_code: '6117.10', inbound_hs_code: null, unit_net_weight_kg: '0.100', line_gross_weight_kg: '0.700' },
  ],
  shipment_details_extra: { references: [{ type: 'CU', value: 'PO-1182' }], document_protection: false, insurance: false, estimated_duties: false, precalculated_duties: false, item_entry: 'describe', charges: [], items: [], customs_invoice_mode: 'create' },
  documents: [],
  ...over,
})

async function base(page: Page, lang: 'ar' | 'en') {
  await page.addInitScript((l) => {
    sessionStorage.setItem('shippec_session', JSON.stringify({ id: 1, username: 'manager@test', name: 'Manager', role: 'manager', status: 'approved' }))
    sessionStorage.setItem('auth_token', 'e2e-token')
    localStorage.setItem('shippec.createShipment.lang', l)
  }, lang)
  await page.route(/\/api\//, (r) => r.fulfill(json({ success: true, data: [] })))
  await page.route(/socket\.io/, (r) => r.abort())
  await page.route(/\/api\/dhl\/shipments(\?.*)?$/, (r) => r.fulfill(json({ success: true, data: [], pagination: { total: 0 } })))
  await page.route(/\/api\/dhl\/shipments\/5$/, (r) => r.fulfill(json({ success: true, data: draft() })))
  await page.route(/\/api\/dhl\/default-shipper$/, (r) => r.fulfill(json({ success: true, data: null })))
  await page.route(/\/api\/dhl\/options$/, (r) => r.fulfill(json({ success: true, data: {
    purposes: [], transport_payers: ['shipper', 'receiver', 'third_party'], duties_payers: ['receiver', 'shipper', 'third_party'], pickup_options: [], document_refetch_types: [],
    features: { paperless_upload: true }, declaration_statements: [{ id: 'certificate_of_origin', supported: true }, { id: 'usmca', supported: false }],
    customs_document_types: ['COO', 'EXL'], payment: { shipper_account_masked: '*****2611' },
  } })))
  await page.route(/\/api\/dhl\/incoterms$/, (r) => r.fulfill(json({ success: true, data: { source: 'dhl', items: [
    { code: 'DAP', name: 'Delivered At Place', description: null }, { code: 'DDP', name: 'Delivered Duty Paid', description: null }, { code: 'EXW', name: 'Ex Works', description: null },
  ] } })))
}

test.use({ launchOptions: { slowMo: 0 }, video: 'off', trace: 'off', actionTimeout: 10_000 })

/** No horizontal page scroll; every visible control of the step stays inside the step. */
async function fits(page: Page, testId: string) {
  const r = await page.evaluate((id) => {
    const step = document.querySelector(`[data-testid="${id}"]`) as HTMLElement
    const s = step.getBoundingClientRect()
    const outside = [...step.querySelectorAll('input, select, textarea, button')].filter((el) => {
      const b = el.getBoundingClientRect()
      return b.width > 0 && (b.left < s.left - 1 || b.right > s.right + 1)
    }).map((el) => (el as HTMLElement).getAttribute('aria-label') || el.id || el.tagName)
    return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, outside }
  }, testId)
  expect(r.scrollW).toBeLessThanOrEqual(r.innerW + 1)
  expect(r.outside).toEqual([])
}

for (const lang of ['ar', 'en'] as const) {
  const L = (ar: string, en: string) => (lang === 'en' ? en : ar)
  for (const [w, h] of [[1440, 900], [1024, 768], [390, 844], [320, 700]] as const) {
    test(`Customs Invoice + Payment ${lang.toUpperCase()} at ${w}px: MyDHL workflow, fits, direction`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h })
      await base(page, lang)
      await page.goto('/create-shipment?draft=5')
      await expect(page.getByText('Gulf Retail Client').first()).toBeVisible()

      // ── Customs Invoice ──
      await page.getByRole('button', { name: L('الجمارك', 'Customs') }).first().click()
      const customs = page.getByTestId('customs-step')
      await expect(customs).toBeVisible()
      await expect(customs.getByText(L('تفاصيل الفاتورة الجمركية', 'Customs Invoice Details'))).toBeVisible()
      expect(await customs.evaluate((e) => (e.closest('[dir]') as HTMLElement).dir)).toBe(lang === 'en' ? 'ltr' : 'rtl')
      await expect(customs.getByRole('radio', { name: L('إنشاء فاتورة', 'Create Invoice') })).toHaveAttribute('aria-checked', 'true')
      // Saudi origin: Certificate of Origin only — no NAFTA / USMCA, no US Electronic Export Filing
      await expect(customs.getByTestId('declaration-certificate_of_origin')).toContainText(/Saudi Arabia, (Turkey|Türkiye) origin/)
      await expect(customs.getByTestId('declaration-usmca')).toHaveCount(0)
      await expect(customs.getByTestId('us-export-filing')).toHaveCount(0)
      // Create Invoice (MyDHL+-like): the invoice number / date are issued by SHIPPEC — nothing to type
      await expect(customs.getByLabel(L('أرغب في إضافة رقم فاتورة', 'I would like to include an invoice number'))).toHaveCount(0)
      await expect(customs.getByLabel(new RegExp(`^${L('رقم الفاتورة', 'Invoice Number')}`))).toHaveCount(0)
      await expect(customs.getByTestId('generated-invoice')).toBeVisible()
      // a draft the server has not completed yet: «Preparing invoice information…» — never an empty required field
      await expect(customs.getByTestId('generated-invoice-pending')).toContainText(L('جارٍ تجهيز بيانات الفاتورة', 'Preparing invoice information'))
      await customs.getByLabel(new RegExp(`^${L('معلومات إضافية على الفاتورة', 'Additional Invoice Information')}`)).fill('Goods for exhibition')
      await customs.getByRole('button', { name: L('إضافة مستند آخر', 'Add Another') }).click()
      await customs.locator('[data-document="0"]').getByLabel(L('نوع المستند', 'Document type')).selectOption('COO')
      await customs.locator('[data-document="0"]').getByLabel(L('رقم المستند', 'Document ID')).fill('COO-2026-118')
      await expect(customs.getByTestId('paperless-box').getByRole('checkbox')).toBeEnabled()
      await expect(customs.getByTestId('additional-parties').getByRole('radio', { name: L('نعم', 'Yes') })).toBeDisabled()
      await fits(page, 'customs-step')
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/customs-create-${lang}-${w}.png`, fullPage: true })
      // Use My Own Invoice: «My Invoice Number», no DHL-invoice fields
      await customs.getByRole('radio', { name: L('استخدام فاتورتي الخاصة', 'Use My Own Invoice') }).click()
      await expect(customs.getByLabel(new RegExp(`^${L('رقم فاتورتي', 'My Invoice Number')}`))).toBeVisible()
      await expect(customs.getByTestId('declaration-statements')).toHaveCount(0)
      await fits(page, 'customs-step')
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/customs-own-${lang}-${w}.png`, fullPage: true })
      await customs.getByRole('radio', { name: L('إنشاء فاتورة', 'Create Invoice') }).click()
      await expect(customs.getByLabel(new RegExp(`^${L('معلومات إضافية على الفاتورة', 'Additional Invoice Information')}`))).toHaveValue('Goods for exhibition')

      // ── Payment ──
      await page.getByRole('button', { name: L('الدفع', 'Payment') }).first().click()
      const pay = page.getByTestId('payment-step')
      await expect(pay).toBeVisible()
      await expect(pay.getByText(L('كيف سيتم دفع رسوم النقل؟', 'How will you pay for transportation charges?')).first()).toBeVisible()
      await expect(pay.getByTestId('transport-payer')).toContainText('*****2611')
      await pay.getByTestId('transport-payer').getByRole('radio', { name: L('حساب DHL لطرف ثالث', 'Third Party DHL Account') }).click()
      await page.getByRole('button', { name: L('التالي', 'Next') }).click()
      await expect(pay.getByText(L('رقم حساب DHL للطرف الثالث مطلوب.', 'The third-party DHL account number is required.'))).toBeVisible()
      await pay.getByLabel(new RegExp(`^${L('رقم حساب DHL للطرف الثالث', 'Third Party DHL Account Number')}`)).fill('123456789')
      await pay.getByTestId('duties-payer').getByRole('radio', { name: L('SHIPPEC / حساب المرسل', 'SHIPPEC / Sender account') }).click()
      await expect(pay.getByLabel(/^Incoterm/)).toHaveValue('DDP')
      await expect(pay.getByTestId('incoterm-auto')).toContainText('DDP')
      await pay.getByLabel(/^Incoterm/).selectOption('DAP')
      await expect(pay.getByTestId('incoterm-warning')).toContainText(L('طريقة الدفع هذه تتطلب عادةً DDP.', 'This payment selection normally requires DDP.'))
      await fits(page, 'payment-step')
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/payment-${lang}-${w}.png`, fullPage: true })
    })
  }
}
