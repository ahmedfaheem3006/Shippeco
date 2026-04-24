import { describe, expect, it } from 'vitest'
import type { Invoice } from './models'
import { buildReconcileReport, normalizeAwb } from './reconcile'

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

describe('reconcile', () => {
  it('normalizes awb by removing spaces/dashes and uppercasing', () => {
    expect(normalizeAwb(' 12-34 56 ')).toBe('123456')
  })

  it('marks not_found when invoice is missing', () => {
    const report = buildReconcileReport({
      filename: 'f.xlsx',
      shipments: [{ awb: 'A', total_charge: 100, weight_kg: 1, shipment_date: '2026-01-01', destination: 'SA', origin: 'JO', service_type: 'EXP', fuel_surcharge: 0, vat_amount: 0 }],
      invoices: [],
    })
    expect(report.not_found).toBe(1)
    expect(report.results[0].status).toBe('not_found_in_platform')
  })

  it('marks matched when within discrepancy threshold', () => {
    const report = buildReconcileReport({
      filename: 'f.xlsx',
      shipments: [{ awb: 'A', total_charge: 100, weight_kg: 1, shipment_date: '2026-01-01', destination: 'SA', origin: 'JO', service_type: 'EXP', fuel_surcharge: 0, vat_amount: 0 }],
      invoices: [inv({ id: '10', awb: 'A', price: 100.2 })],
      discrepancyThreshold: 0.5,
    })
    expect(report.matched).toBe(1)
    expect(report.with_discrepancies).toBe(0)
    expect(report.results[0].status).toBe('matched')
  })

  it('marks discrepancy when over threshold and computes profit margin', () => {
    const report = buildReconcileReport({
      filename: 'f.xlsx',
      shipments: [{ awb: 'A', total_charge: 100, weight_kg: 1, shipment_date: '2026-01-01', destination: 'SA', origin: 'JO', service_type: 'EXP', fuel_surcharge: 0, vat_amount: 0 }],
      invoices: [inv({ id: '10', awb: 'A', price: 110 })],
      discrepancyThreshold: 0.5,
    })
    expect(report.with_discrepancies).toBe(1)
    expect(report.results[0].status).toBe('discrepancy')
    expect(report.results[0].profit_margin_pct).toBeCloseTo(10, 10)
    expect(report.results[0].discrepancies).toHaveLength(1)
  })
})

