import { describe, expect, it } from 'vitest'
import { buildPaymobWaMessage, safeAmountNumber } from './paymobLinks'

describe('paymobLinks', () => {
  it('safeAmountNumber parses numeric strings', () => {
    expect(safeAmountNumber('100')).toBe(100)
    expect(safeAmountNumber('1,200.50')).toBe(1200.5)
    expect(safeAmountNumber('')).toBeNull()
    expect(safeAmountNumber('abc')).toBeNull()
  })

  it('buildPaymobWaMessage includes URL and amount', () => {
    const msg = buildPaymobWaMessage({ name: 'محمد', amount: 10.5, description: 'خدمة شحن', url: 'https://x' })
    expect(msg).toContain('مرحباً محمد')
    expect(msg).toContain('10.50')
    expect(msg).toContain('https://x')
  })
})

