import { describe, expect, it } from 'vitest'
import { formatDate, formatMoney, isValidAmount } from './money'

describe('money / date display', () => {
  it('formats exact strings without float drift', () => {
    expect(formatMoney('0.30')).toBe('0.30 ر.س')
    expect(formatMoney('1234567.5')).toBe('1,234,567.50 ر.س')
    expect(formatMoney('-15', { currency: false })).toBe('-15.00')
    expect(formatMoney(null)).toBe('—')
  })
  it('shows Gregorian dd/mm/yyyy with no timezone shift', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026')
    expect(formatDate('2026-03-31T23:30:00.000Z')).toBe('31/03/2026')
    expect(formatDate(null)).toBe('—')
  })
  it('validates typed amounts', () => {
    expect(isValidAmount('10.5')).toBe(true)
    expect(isValidAmount('0')).toBe(false)
    expect(isValidAmount('1.005')).toBe(false)
    expect(isValidAmount('-3')).toBe(false)
    expect(isValidAmount('1e3')).toBe(false)
  })
})
