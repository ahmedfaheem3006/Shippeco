import { describe, expect, it } from 'vitest'
import type { Invoice } from './models'
import { computeClientInvoiceRows, computeClientRows, computeClientsSummary, filterClientRows, normalizeClientName } from './clients'

function inv(partial: Partial<Invoice>): Invoice {
  return {
    id: partial.id ?? '1',
    client: partial.client ?? 'عميل',
    phone: partial.phone,
    awb: partial.awb,
    carrier: partial.carrier,
    date: partial.date ?? '2026-01-01',
    status: partial.status ?? 'unpaid',
    price: partial.price ?? 10,
    partialPaid: partial.partialPaid,
    dhlCost: partial.dhlCost,
    items: partial.items,
    itemType: partial.itemType,
    details: partial.details,
    payment: partial.payment,
    shipperName: partial.shipperName,
    shipperPhone: partial.shipperPhone,
    shipperAddress: partial.shipperAddress,
    receiverName: partial.receiverName,
    receiverPhone: partial.receiverPhone,
    receiverAddress: partial.receiverAddress,
    receiverCountry: partial.receiverCountry,
    daftra_id: partial.daftra_id,
    daftra_client_id: partial.daftra_client_id,
    created_by: partial.created_by,
    codeType: partial.codeType,
    paymentUrl: partial.paymentUrl,
    paymentRef: partial.paymentRef,
    paymobOrderId: partial.paymobOrderId,
    waLog: partial.waLog,
    timeline: partial.timeline,
    isDraft: partial.isDraft,
  }
}

describe('clients', () => {
  it('normalizeClientName returns fallback for empty', () => {
    expect(normalizeClientName('')).toBe('غير محدد')
    expect(normalizeClientName('  ')).toBe('غير محدد')
    expect(normalizeClientName('Ali')).toBe('Ali')
  })

  it('computeClientRows aggregates counts and revenue', () => {
    const rows = computeClientRows([
      inv({ id: '1', client: 'A', price: 10, status: 'paid', date: '2026-01-02' }),
      inv({ id: '2', client: 'A', price: 5, status: 'unpaid', date: '2026-01-03' }),
      inv({ id: '3', client: 'B', price: 7, status: 'partial', date: '2026-01-01' }),
      inv({ id: '4', client: 'A', price: 99, isDraft: true }),
    ])

    const a = rows.find((r) => r.name === 'A')!
    expect(a.count).toBe(2)
    expect(a.revenue).toBe(15)
    expect(a.paidCount).toBe(1)
    expect(a.unpaidCount).toBe(1)
    expect(a.partialCount).toBe(0)
    expect(a.lastDate).toBe('2026-01-03')
    expect(a.lastInvoiceId).toBe('2')
  })

  it('filterClientRows searches by name and phone', () => {
    const rows = [
      { name: 'Ali', phone: '050', count: 1, revenue: 0, paidCount: 0, unpaidCount: 0, partialCount: 0, lastDate: '', lastInvoiceId: '' },
      { name: 'Sara', phone: '055', count: 1, revenue: 0, paidCount: 0, unpaidCount: 0, partialCount: 0, lastDate: '', lastInvoiceId: '' },
    ]
    expect(filterClientRows(rows, 'ali')).toHaveLength(1)
    expect(filterClientRows(rows, '055')).toHaveLength(1)
  })

  it('computeClientInvoiceRows returns sorted invoice rows', () => {
    const rows = computeClientInvoiceRows(
      [
        inv({ id: '1', client: 'A', date: '2026-01-01', price: 1 }),
        inv({ id: '2', client: 'A', date: '2026-01-03', price: 2 }),
        inv({ id: '3', client: 'B', date: '2026-01-02', price: 3 }),
      ],
      'A',
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].id).toBe('2')
    expect(rows[1].id).toBe('1')
  })

  it('computeClientsSummary totals over rows', () => {
    const sum = computeClientsSummary([
      { name: 'A', phone: '', count: 2, revenue: 10, paidCount: 1, unpaidCount: 1, partialCount: 0, lastDate: '', lastInvoiceId: '' },
      { name: 'B', phone: '', count: 1, revenue: 5, paidCount: 0, unpaidCount: 0, partialCount: 1, lastDate: '', lastInvoiceId: '' },
    ])
    expect(sum.clients).toBe(2)
    expect(sum.invoices).toBe(3)
    expect(sum.revenue).toBe(15)
    expect(sum.paid).toBe(1)
    expect(sum.unpaid).toBe(1)
    expect(sum.partial).toBe(1)
  })
})

