import { describe, expect, it } from 'vitest'
import { convertLegacyHashRoute } from './legacyHashRoute'

describe('convertLegacyHashRoute', () => {
  it('returns null when there is no legacy hash route', () => {
    expect(convertLegacyHashRoute({ hash: '', pathname: '/dashboard', search: '' })).toBeNull()
    expect(convertLegacyHashRoute({ hash: '#section', pathname: '/', search: '' })).toBeNull()
  })

  it('converts a simple hash path', () => {
    const result = convertLegacyHashRoute({ hash: '#/login', pathname: '/', search: '' })
    expect(result).toEqual({ path: '/login', search: '' })
  })

  it('converts a public pay link and preserves its id segment', () => {
    const result = convertLegacyHashRoute({ hash: '#/pay/42', pathname: '/', search: '' })
    expect(result).toEqual({ path: '/pay/42', search: '' })
  })

  it('preserves query params encoded after the hash (payment callback data)', () => {
    const result = convertLegacyHashRoute({
      hash: '#/pay/42?success=true&order_id=abc',
      pathname: '/',
      search: '',
    })
    expect(result?.path).toBe('/pay/42')
    const params = new URLSearchParams(result?.search)
    expect(params.get('success')).toBe('true')
    expect(params.get('order_id')).toBe('abc')
  })

  it('merges real query params with hash-encoded ones, real params winning on conflict', () => {
    const result = convertLegacyHashRoute({
      hash: '#/pay/42?source=whatsapp',
      pathname: '/',
      search: '?source=sms&utm=x',
    })
    const params = new URLSearchParams(result?.search)
    expect(params.get('source')).toBe('sms')
    expect(params.get('utm')).toBe('x')
  })
})
