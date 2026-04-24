import { describe, expect, it } from 'vitest'
import type { Invoice } from './models'
import { applyWaTemplate, defaultWaTemplates, normalizeWaTemplates } from './whatsappTemplates'

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

describe('whatsappTemplates', () => {
  it('normalizeWaTemplates fills missing keys', () => {
    const n = normalizeWaTemplates({ paid: 'x' })
    expect(n.paid).toBe('x')
    expect(n.unpaid.length).toBeGreaterThan(0)
    expect(n.payment_link.length).toBeGreaterThan(0)
  })

  it('applyWaTemplate replaces variables', () => {
    const t = defaultWaTemplates()
    const msg = applyWaTemplate('unpaid', inv({ id: '9', client: 'محمد', price: 10 }), t)
    expect(msg).toContain('محمد')
    expect(msg).toContain('#9')
    expect(msg).toContain('10.00')
  })
})

