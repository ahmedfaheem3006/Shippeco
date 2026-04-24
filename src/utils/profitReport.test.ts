import { describe, expect, it } from 'vitest'
import type { Invoice } from './models'
import { calcInvoiceProfit, computeProfitRange, computeProfitSummary, filterProfitInvoices } from './profitReport'

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

describe('profitReport', () => {
  it('calcInvoiceProfit handles missing cost', () => {
    const p = calcInvoiceProfit(inv({ price: 10 }))
    expect(p.hasCost).toBe(false)
    expect(p.profit).toBeNull()
  })

  it('filterProfitInvoices filters by date range', () => {
    const range = { from: '2026-01-01', to: '2026-01-10', label: '' }
    const out = filterProfitInvoices([inv({ date: '2026-01-02' }), inv({ date: '2026-02-01' })], range, '')
    expect(out).toHaveLength(1)
  })

  it('computeProfitSummary counts hasCost and losing', () => {
    const out = computeProfitSummary([inv({ price: 10, dhlCost: 8 }), inv({ price: 5, dhlCost: 7 })])
    expect(out.countedCount).toBe(2)
    expect(out.losingCount).toBe(1)
  })

  it('computeProfitRange supports custom', () => {
    const r = computeProfitRange('custom', { from: '2026-01-10', to: '2026-01-01' })
    expect(r.from).toBe('2026-01-01')
    expect(r.to).toBe('2026-01-10')
  })
})

