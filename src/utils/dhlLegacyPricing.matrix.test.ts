import { describe, expect, it } from 'vitest'
import { COUNTRIES, GOGREEN_RATE } from '../legacy/dhlData'
import type { LegacyService } from './dhlLegacyPricing'
import { computeLegacyPrice, getZoneInfoLegacy, lookupRate } from './dhlLegacyPricing'

function asNumber(value: string | number) {
  return typeof value === 'number' ? value : Number(value)
}

describe('legacy pricing matrix', () => {
  const pickCountryByZone = (z: number) => {
    const c = COUNTRIES.find((x) => x.z === z)
    if (!c) throw new Error(`missing country for zone ${z}`)
    return c.en
  }

  it('covers all result kinds for missing inputs', () => {
    expect(computeLegacyPrice({ service: 'import', from: '', to: 'SA', chargeW: 1, fuelPct: 0, profitPct: 0 })).toEqual({
      kind: 'missing_route',
    })
    expect(computeLegacyPrice({ service: 'import', from: 'Jordan', to: '', chargeW: 1, fuelPct: 0, profitPct: 0 })).toEqual({
      kind: 'missing_route',
    })
    expect(computeLegacyPrice({ service: 'import', from: 'Jordan', to: 'SA', chargeW: 0, fuelPct: 0, profitPct: 0 })).toEqual({
      kind: 'missing_weight',
    })
    expect(
      computeLegacyPrice({ service: 'import', from: 'Not A Country', to: 'SA', chargeW: 1, fuelPct: 0, profitPct: 0 }),
    ).toEqual({ kind: 'missing_zone' })
  })

  it('returns no_rate for zone 8 destinations like legacy', () => {
    const zone8 = COUNTRIES.find((c) => c.z === 8)?.en
    expect(zone8).toBeTruthy()
    const out = computeLegacyPrice({
      service: 'import',
      from: zone8 ?? 'Afghanistan',
      to: 'SA',
      chargeW: 1,
      fuelPct: 0,
      profitPct: 0,
    })
    expect(out).toEqual({ kind: 'no_rate' })
  })

  it('calculates fuel and profit on top of (base + gogreen) like legacy', () => {
    const out = computeLegacyPrice({
      service: 'import',
      from: 'Jordan',
      to: 'SA',
      chargeW: 10,
      fuelPct: 30,
      profitPct: 50,
    })
    if ('kind' in out) throw new Error(`unexpected error: ${out.kind}`)
    const expectedGoGreen = 10 * asNumber(GOGREEN_RATE)
    expect(out.goGreen).toBeCloseTo(expectedGoGreen, 10)
    const expectedFuel = out.baseRate * 0.3
    expect(out.fuelAmt).toBeCloseTo(expectedFuel, 10)
    const expectedAfter = out.baseRate + out.fuelAmt + out.goGreen
    expect(out.afterFuel).toBeCloseTo(expectedAfter, 10)
    const expectedMarkup = expectedAfter * 0.5
    expect(out.markup).toBeCloseTo(expectedMarkup, 10)
    expect(out.total).toBeCloseTo(expectedAfter + expectedMarkup, 10)
  })

  it('computes branch coverage for lookupRate across zones', () => {
    const z1 = pickCountryByZone(1)
    const z2 = pickCountryByZone(2)
    const z3 = pickCountryByZone(3)
    const z4 = pickCountryByZone(4)
    const z5 = pickCountryByZone(5)
    const z6 = pickCountryByZone(6)
    const z7 = pickCountryByZone(7)

    const cases: Array<{
      name: string
      service: LegacyService
      from: string
      to: string
      expectLabel: string
    }> = [
      { name: 'domestic SA', service: 'domestic', from: 'SA', to: 'SA', expectLabel: 'A' },
      { name: 'qatar special', service: 'import', from: 'Qatar', to: 'SA', expectLabel: 'QT' },
      { name: 'zone 1', service: 'import', from: z1, to: 'SA', expectLabel: '1' },
      { name: 'zone 2', service: 'import', from: z2, to: 'SA', expectLabel: '2' },
      { name: 'zone 3', service: 'import', from: z3, to: 'SA', expectLabel: '3' },
      { name: 'zone 4', service: 'import', from: z4, to: 'SA', expectLabel: '4' },
      { name: 'zone 5 import', service: 'import', from: z5, to: 'SA', expectLabel: '5' },
      { name: 'zone 5 export', service: 'export', from: 'SA', to: z5, expectLabel: '5' },
      { name: 'zone 6 import', service: 'import', from: z6, to: 'SA', expectLabel: '6' },
      { name: 'zone 6 export', service: 'export', from: 'SA', to: z6, expectLabel: '6' },
      { name: 'zone 7', service: 'import', from: z7, to: 'SA', expectLabel: '7' },
    ]

    for (const c of cases) {
      const z = getZoneInfoLegacy(c.service, c.from, c.to)
      expect(z?.label, c.name).toBe(c.expectLabel)
      if (!z) throw new Error(`missing zone for ${c.name}`)
      const base = lookupRate(1, z, c.service)
      expect(base, c.name).not.toBeNull()
    }
  })

  it('matches legacy behavior across combinations of service, weight, fuel, profit', () => {
    const z2 = pickCountryByZone(2)
    const services: Array<{ service: LegacyService; from: string; to: string }> = [
      { service: 'domestic', from: 'SA', to: 'SA' },
      { service: 'import', from: z2, to: 'SA' },
      { service: 'export', from: 'SA', to: z2 },
      { service: 'import', from: 'Qatar', to: 'SA' },
      { service: 'export', from: 'SA', to: 'Qatar' },
    ]

    const weights = [0.2, 0.9, 1, 1.1, 2.4, 5.01, 10, 14.2, 33, 100, 101]
    const fuels = [0, 15, 30]
    const profits = [0, 10, 50]

    for (const s of services) {
      for (const w of weights) {
        for (const fuelPct of fuels) {
          for (const profitPct of profits) {
            const out = computeLegacyPrice({
              service: s.service,
              from: s.from,
              to: s.to,
              chargeW: w,
              fuelPct,
              profitPct,
            })

            if ('kind' in out) {
              throw new Error(`unexpected ${out.kind} for ${JSON.stringify({ ...s, w, fuelPct, profitPct })}`)
            }

            expect(out.baseRate, 'baseRate finite').toBeGreaterThan(0)
            expect(out.total, 'total finite').toBeGreaterThan(0)

            const expectedGoGreen = s.service === 'domestic' ? 0 : w * asNumber(GOGREEN_RATE)
            expect(out.goGreen, 'gogreen formula').toBeCloseTo(expectedGoGreen, 10)

            const expectedFuel = out.baseRate * (fuelPct / 100)
            expect(out.fuelAmt, 'fuel formula').toBeCloseTo(expectedFuel, 10)

            const expectedAfter = out.baseRate + out.fuelAmt + out.goGreen
            expect(out.afterFuel, 'afterFuel formula').toBeCloseTo(expectedAfter, 10)

            const expectedMarkup = expectedAfter * (profitPct / 100)
            expect(out.markup, 'markup formula').toBeCloseTo(expectedMarkup, 10)

            expect(out.total, 'total formula').toBeCloseTo(expectedAfter + expectedMarkup, 10)
          }
        }
      }
    }
  })
})
