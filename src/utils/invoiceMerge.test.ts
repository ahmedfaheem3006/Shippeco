import { describe, expect, it } from 'vitest'
import type { Invoice } from './models'
import { mergeInvoices } from './invoiceMerge'

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

describe('mergeInvoices', () => {
  it('prefers DB invoice when ids collide', () => {
    const local = [inv({ id: '10', client: 'L', price: 1 })]
    const db = [inv({ id: '10', client: 'D', price: 2 })]
    const merged = mergeInvoices(db, local)
    expect(merged).toHaveLength(1)
    expect(merged[0].client).toBe('D')
    expect(merged[0].price).toBe(2)
  })

  it('deduplicates by daftra_id', () => {
    const local = [inv({ id: 'a', daftra_id: '55' }), inv({ id: 'b', daftra_id: '55' })]
    const merged = mergeInvoices([], local)
    expect(merged).toHaveLength(1)
  })

  it('keeps local invoices that are not in DB', () => {
    const local = [inv({ id: '1' }), inv({ id: '2' })]
    const merged = mergeInvoices([], local)
    expect(merged.map((i) => i.id).sort()).toEqual(['1', '2'])
  })
})
