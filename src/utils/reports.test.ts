import { describe, expect, it } from 'vitest'
import type { Invoice } from './models'
import { computeRange, computeRemaining, computeSummary, filterInvoices } from './reports'

function inv(partial: Partial<Invoice>): Invoice {
  return {
    id: String(partial.id ?? '1'),
    client: partial.client ?? 'عميل',
    date: partial.date ?? '2026-01-01',
    status: partial.status ?? 'unpaid',
    price: partial.price ?? 0,
    ...partial,
  }
}

describe('reports', () => {
  it('computeRange daily returns same from/to', () => {
    const r = computeRange('daily', 0, { from: '2026-01-01', to: '2026-01-01' })
    expect(r.from).toBe(r.to)
  })

  it('computeRemaining respects status', () => {
    expect(computeRemaining(inv({ status: 'paid', price: 100 }))).toBe(0)
    expect(computeRemaining(inv({ status: 'unpaid', price: 100 }))).toBe(100)
    expect(computeRemaining(inv({ status: 'partial', price: 100, partialPaid: 40 }))).toBe(60)
  })

  it('filterInvoices filters by status and date', () => {
    const all = [
      inv({ id: '1', status: 'paid', date: '2026-01-01', price: 10 }),
      inv({ id: '2', status: 'unpaid', date: '2026-01-02', price: 10 }),
    ]
    const out = filterInvoices(all, {
      query: '',
      status: 'paid',
      range: { from: '2026-01-01', to: '2026-01-31', label: '' },
    })
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('1')
  })

  it('computeSummary aggregates totals', () => {
    const sum = computeSummary([inv({ status: 'paid', price: 10 }), inv({ status: 'unpaid', price: 5 })])
    expect(sum.totalCount).toBe(2)
    expect(sum.totalAmount).toBe(15)
    expect(sum.paidCount).toBe(1)
    expect(sum.unpaidCount).toBe(1)
  })
})

