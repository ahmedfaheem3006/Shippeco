import { describe, expect, it } from 'vitest'
import { awbCount, parseAwbInput, verifyFailureText } from './verifyAwbs'

describe('«تحقق البوليصة» — AWB input', () => {
  it('one per line, commas (Latin / Arabic), semicolons, or several on one line separated by spaces', () => {
    expect(parseAwbInput('6606077671\n2816850120').valid).toEqual(['6606077671', '2816850120'])
    expect(parseAwbInput('6606077671, 2816850120،1000000001; 1000000002').valid).toEqual(['6606077671', '2816850120', '1000000001', '1000000002'])
    expect(parseAwbInput('6606077671 2816850120').valid).toEqual(['6606077671', '2816850120'])
  })

  it('normalized like the Backend; leading zeros kept (strings, never numbers); no spaces added', () => {
    const r = parseAwbInput('AWB 660-607-7671\n0012345678\n 0000000001 ')
    expect(r).toEqual({ valid: ['6606077671', '0012345678', '0000000001'], invalid: [], duplicates: 0 })
  })

  it('duplicates are dropped and counted; anything that is not a 10-digit DHL AWB is reported, never sent', () => {
    expect(parseAwbInput('6606077671\n6606077671, AWB 6606077671')).toEqual({ valid: ['6606077671'], invalid: [], duplicates: 2 })
    expect(parseAwbInput('12345\n6606077671\nABCDEFGHIJ\n66060776711').invalid).toEqual(['12345', 'ABCDEFGHIJ', '66060776711'])
    expect(parseAwbInput('  \n , ').valid).toEqual([])
  })

  it('Arabic counts and plain-Arabic failure reasons (never DHL raw text)', () => {
    expect([1, 2, 3, 10, 11, 50].map(awbCount)).toEqual(['بوليصة واحدة', 'بوليصتين', '3 بوالص', '10 بوالص', '11 بوليصة', '50 بوليصة'])
    expect(verifyFailureText({ error_code: 'DHL_RATE_LIMITED', detail: 'Too many requests {json}' })).toBe('DHL مشغولة حاليًا — أعد المحاولة بعد قليل.')
    expect(verifyFailureText({ error_code: 'DHL_SERVER', detail: 'mock 500' })).toContain('غير متاحة مؤقتًا')
    expect(verifyFailureText({ error_code: 'DHL_TIMEOUT', detail: null })).toContain('لم تستجب DHL')
    expect(verifyFailureText({ error_code: 'SOMETHING_NEW', detail: 'raw' })).not.toContain('raw')
  })
})
