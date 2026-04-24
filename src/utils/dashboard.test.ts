import { describe, expect, it } from 'vitest'
import type { Invoice } from './models'
import { buildSparklinePath, computeDashboardKpis, computeDashboardRange, filterForDashboard } from './dashboard'

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

describe('dashboard', () => {
  it('computeDashboardRange returns expected label for all', () => {
    expect(computeDashboardRange('all').label).toBe('الكل')
  })

  it('filterForDashboard respects date bounds', () => {
    const range = { from: '2026-01-01', to: '2026-01-10', label: '' }
    const out = filterForDashboard([inv({ date: '2026-01-02' }), inv({ date: '2026-02-01' })], range)
    expect(out).toHaveLength(1)
  })

  it('computeDashboardKpis sums totals and remaining', () => {
    const k = computeDashboardKpis([inv({ status: 'paid', price: 10 }), inv({ status: 'unpaid', price: 5 })])
    expect(k.totalCount).toBe(2)
    expect(k.totalSales).toBe(15)
    expect(k.remaining).toBe(5)
  })

  it('buildSparklinePath returns SVG path', () => {
    const p = buildSparklinePath([1, 2, 3], 100, 30)
    expect(p.startsWith('M')).toBe(true)
  })
})

