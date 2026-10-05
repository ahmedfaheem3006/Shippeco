import { describe, expect, it } from 'vitest'
import { isInAppBrowser, isValidReceiptEmail, normalizeReceiptEmail } from './payPage'

describe('public pay page helpers', () => {
  it('accepts real-looking addresses and trims only surrounding spaces', () => {
    expect(normalizeReceiptEmail('  Ahmed.Ali+inv@Gmail.com ')).toBe('Ahmed.Ali+inv@Gmail.com')
    for (const ok of ['customer@gmail.com', 'a.b+tag@outlook.sa', 'x@domain.com.sa']) expect(isValidReceiptEmail(ok)).toBe(true)
  })

  it('rejects malformed and placeholder addresses (no guessing)', () => {
    for (const bad of ['', 'no-at-sign', 'a@b', 'a b@gmail.com', 'two@@gmail.com', 'name@gmail', '.a@gmail.com', 'x@example.com', 'test@shippec.com'])
      expect(isValidReceiptEmail(bad)).toBe(false)
  })

  it('detects in-app browsers only for the hint', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) ... Instagram 300.0')).toBe(true)
    expect(isInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe(false)
  })
})
