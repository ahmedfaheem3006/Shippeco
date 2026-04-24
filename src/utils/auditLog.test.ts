import { describe, expect, it } from 'vitest'
import { computeAuditSummary, filterAuditEntries, normalizeAuditEntries } from './auditLog'

describe('auditLog', () => {
  it('normalizeAuditEntries drops invalid items and sorts desc', () => {
    const out = normalizeAuditEntries([
      { id: '1', type: 'create', at: '2026-01-02T00:00:00.000Z', user: 'u' },
      { id: '2', type: 'update', at: '2026-01-03T00:00:00.000Z', user: 'u2' },
      'bad',
    ])
    expect(out).toHaveLength(2)
    expect(out[0].id).toBe('2')
  })

  it('filterAuditEntries supports type and query', () => {
    const entries = normalizeAuditEntries([
      { id: '1', type: 'create', at: '2026-01-02T00:00:00.000Z', note: 'created invoice' },
      { id: '2', type: 'delete', at: '2026-01-03T00:00:00.000Z', note: 'removed' },
    ])
    expect(filterAuditEntries(entries, '', 'create')).toHaveLength(1)
    expect(filterAuditEntries(entries, 'invoice', 'all')).toHaveLength(1)
  })

  it('computeAuditSummary counts types', () => {
    const entries = normalizeAuditEntries([
      { id: '1', type: 'create', at: '2026-01-02T00:00:00.000Z' },
      { id: '2', type: 'create', at: '2026-01-03T00:00:00.000Z' },
      { id: '3', type: 'paid', at: '2026-01-04T00:00:00.000Z' },
    ])
    const sum = computeAuditSummary(entries)
    expect(sum.total).toBe(3)
    expect(sum.counts.create).toBe(2)
    expect(sum.counts.paid).toBe(1)
  })
})

