import { describe, expect, it } from 'vitest'
import { documentTitleFor, PAGE_TITLES, pageTitleFor } from './pageTitles'

describe('central page titles', () => {
  it.each([
    ['/', 'الرئيسية'],
    ['/dashboard', 'الرئيسية'],
    ['/create-shipment', 'إنشاء شحنة'],
    ['/shipment-tracking', 'متابعة البوليصة'],
    ['/shipment-tracking/', 'متابعة البوليصة'],
    ['/shipment-tracking/6606077671', 'تفاصيل البوليصة'],
    ['/invoices', 'إدارة الفواتير'],
    ['/new-invoice', 'إنشاء فاتورة جديدة'],
    ['/invoice-template', 'قالب الفاتورة'],
    ['/collection-model', 'نموذج التحصيل'],
    ['/expenses', 'المصروفات'],
    ['/tasks', 'المهام'],
    ['/support', 'مركز خدمة العملاء'],
    ['/quote-requests', 'طلبات الشحن والتواصل'],
  ])('%s → %s', (path, title) => {
    expect(pageTitleFor(path)).toBe(title)
  })

  it('dynamic routes match their segment only; unknown paths fall back to the home title', () => {
    expect(pageTitleFor('/shipment-tracking/6606077671/extra')).toBe('الرئيسية')
    expect(pageTitleFor('/something-else')).toBe('الرئيسية')
    // the old substring rules made these wrong ("/wa", "/log" …)
    expect(pageTitleFor('/create-shipment')).not.toBe(pageTitleFor('/dashboard'))
  })

  it('browser tab title: "<page> | SHIPPEC"', () => {
    expect(documentTitleFor('/create-shipment')).toBe('إنشاء شحنة | SHIPPEC')
    expect(documentTitleFor('/shipment-tracking')).toBe('متابعة البوليصة | SHIPPEC')
    expect(documentTitleFor('/shipment-tracking/6606077671')).toBe('تفاصيل البوليصة | SHIPPEC')
    expect(documentTitleFor('/dashboard')).toBe('الرئيسية | SHIPPEC')
  })

  it('every signed-in route of App.tsx has a title (no silent "الرئيسية")', () => {
    const appRoutes = ['/dashboard', '/invoices', '/new-invoice', '/reports', '/clients', '/collection-model', '/expenses', '/calculator', '/reconcile',
      '/invoice-template', '/paymob-links', '/settings', '/profit-report', '/audit-log', '/wa-templates', '/tasks', '/shipment-tracking',
      '/shipment-tracking/:awb', '/create-shipment', '/support', '/quote-requests']
    const declared = PAGE_TITLES.map((p) => p.path)
    for (const r of appRoutes) expect(declared).toContain(r)
  })
})
