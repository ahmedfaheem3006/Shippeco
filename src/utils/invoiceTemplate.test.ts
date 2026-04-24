import { describe, expect, it } from 'vitest'
import type { Invoice } from './models'
import { computeInvoiceTotal, normalizeInvoiceTemplate } from './invoiceTemplate'

describe('invoiceTemplate', () => {
  it('normalizeInvoiceTemplate fills defaults', () => {
    const t = normalizeInvoiceTemplate({ companyAr: 'X', logoDataUrl: 'data:image/png;base64,abc' })
    expect(t.companyAr).toBe('X')
    expect(t.companyEn.length).toBeGreaterThan(0)
    expect(t.logoDataUrl).toContain('data:image')
  })

  it('getInvoiceItems falls back to legacy fields', () => {
    const inv = { id: '1', client: 'عميل', date: '2026-01-01', status: 'unpaid', price: 10, itemType: 'شحن' } as Invoice
    const { items } = computeInvoiceTotal(inv)
    expect(items).toHaveLength(1)
    expect(items[0].type).toContain('شحن')
  })

  it('computeInvoiceTotal sums item prices', () => {
    const inv = {
      id: '1',
      client: 'عميل',
      date: '2026-01-01',
      status: 'unpaid',
      price: 0,
      items: [{ type: 'A', price: 5 }, { type: 'B', price: 7.5 }],
    } as Invoice
    const { total } = computeInvoiceTotal(inv)
    expect(total).toBe(12.5)
  })
})

