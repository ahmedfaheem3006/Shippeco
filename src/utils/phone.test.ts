import { describe, it, expect } from 'vitest'
import { COUNTRIES, nationalPlaceholder, parseNationalInput, toWesternDigits } from './phone'

describe('toWesternDigits', () => {
  it('converts Arabic-Indic and Persian digits, leaving "+" intact', () => {
    expect(toWesternDigits('+٩٦٦٥٠١٢٣٤٥٦٧')).toBe('+966501234567')
    expect(toWesternDigits('۰۵۰')).toBe('050')
  })
})

describe('COUNTRIES', () => {
  it('lists Saudi Arabia then Egypt first', () => {
    expect(COUNTRIES[0].iso).toBe('SA')
    expect(COUNTRIES[1].iso).toBe('EG')
  })
})

describe('parseNationalInput', () => {
  it('accepts a valid Saudi mobile typed locally (with or without the trunk 0)', () => {
    expect(parseNationalInput('501234567', 'SA')).toMatchObject({ isValid: true, e164: '+966501234567' })
    expect(parseNationalInput('0501234567', 'SA')).toMatchObject({ isValid: true, e164: '+966501234567' })
  })

  it('accepts a valid Egyptian mobile', () => {
    expect(parseNationalInput('01012345678', 'EG')).toMatchObject({ isValid: true, e164: '+201012345678' })
  })

  it('accepts Arabic-Indic digits', () => {
    expect(parseNationalInput('٠٥٠١٢٣٤٥٦٧', 'SA')).toMatchObject({ isValid: true, e164: '+966501234567' })
  })

  it('detects the country from a pasted full international number instead of doubling the dial code', () => {
    // Selected country is Saudi Arabia, but an Egyptian number was pasted.
    const r = parseNationalInput('+201012345678', 'SA')
    expect(r).toMatchObject({ isValid: true, e164: '+201012345678', country: 'EG' })
    const r00 = parseNationalInput('00966501234567', 'EG')
    expect(r00).toMatchObject({ isValid: true, e164: '+966501234567', country: 'SA' })
  })

  it('works for a non-Gulf country too (UK mobile)', () => {
    expect(parseNationalInput('07400123456', 'GB')).toMatchObject({ isValid: true, e164: '+447400123456' })
  })

  it('rejects numbers that are not valid for the selected country', () => {
    expect(parseNationalInput('12345', 'SA').isValid).toBe(false)
    expect(parseNationalInput('', 'EG').isValid).toBe(false)
  })
})

describe('nationalPlaceholder', () => {
  it('gives a country-specific example rather than one pattern for every country', () => {
    expect(nationalPlaceholder('SA')).not.toBe(nationalPlaceholder('EG'))
    expect(nationalPlaceholder('SA')).toMatch(/\d/)
  })
})
