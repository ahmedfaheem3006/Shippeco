import { describe, expect, it } from 'vitest'
import { R_Z1, R_Z2 } from '../legacy/dhlData'
import { computeLegacyPrice, getZoneInfoLegacy, lookupFromTable, lookupRate } from './dhlLegacyPricing'

describe('dhlLegacyPricing', () => {
  const rZ1 = R_Z1 as unknown as Record<number, number>
  const rZ2 = R_Z2 as unknown as Record<number, number>

  it('lookupFromTable rounds up and uses nearest higher key', () => {
    expect(lookupFromTable(0.5, rZ1)).toBe(74)
    expect(lookupFromTable(1.2, rZ1)).toBe(82)
    expect(lookupFromTable(33, rZ1)).toBe(685)
  })

  it('lookupFromTable extrapolates above max key', () => {
    const rounded = 101
    const last = 100
    const prev = 95
    const expected = rZ1[last] + (rounded - last) * ((rZ1[last] - rZ1[prev]) / (last - prev))
    expect(lookupFromTable(101, rZ1)).toBeCloseTo(expected, 10)
  })

  it('getZoneInfoLegacy matches Qatar special case', () => {
    const z = getZoneInfoLegacy('import', 'Qatar', 'SA')
    expect(z?.label).toBe('QT')
  })

  it('lookupRate uses zone tables like legacy', () => {
    const z2 = getZoneInfoLegacy('import', 'Jordan', 'SA')
    expect(z2?.label).toBe('2')
    if (!z2) throw new Error('expected zone info')
    expect(lookupRate(1, z2, 'import')).toBe(rZ2[1])
  })

  it('computeLegacyPrice matches legacy ordering of fuel/gogreen/markup', () => {
    const out = computeLegacyPrice({
      service: 'import',
      from: 'Jordan',
      to: 'SA',
      chargeW: 1,
      fuelPct: 30,
      profitPct: 50,
    })
    if ('kind' in out) throw new Error('expected output')
    expect(out.baseRate).toBe(rZ2[1])
    expect(out.fuelAmt).toBeCloseTo(out.baseRate * 0.3, 10)
    expect(out.total).toBeCloseTo(out.afterFuel + out.markup, 10)
  })
})
