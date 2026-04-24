import { describe, expect, it } from 'vitest'
import { computeChargeableWeightKg } from './chargeableWeight'
import { computeLegacyPrice } from './dhlLegacyPricing'

describe('pricing integration', () => {
  it('prices a multi-piece shipment using chargeable weight and legacy pricing', () => {
    const chargeW = computeChargeableWeightKg(
      [
        { qty: 2, weight: 1, l: 0, w: 0, h: 0 },
        { qty: 1, weight: 1, l: 60, w: 40, h: 35 },
      ],
      'metric',
    )
    expect(chargeW).not.toBeNull()
    if (!chargeW) throw new Error('missing chargeable weight')

    const out = computeLegacyPrice({
      service: 'import',
      from: 'Jordan',
      to: 'SA',
      chargeW,
      fuelPct: 30,
      profitPct: 50,
    })
    if ('kind' in out) throw new Error(`unexpected error: ${out.kind}`)
    expect(out.total).toBeGreaterThan(0)
  })

  it('represents a discount via negative profitPct', () => {
    const out = computeLegacyPrice({
      service: 'import',
      from: 'Jordan',
      to: 'SA',
      chargeW: 10,
      fuelPct: 30,
      profitPct: -10,
    })
    if ('kind' in out) throw new Error(`unexpected error: ${out.kind}`)
    const withoutDiscount = computeLegacyPrice({
      service: 'import',
      from: 'Jordan',
      to: 'SA',
      chargeW: 10,
      fuelPct: 30,
      profitPct: 0,
    })
    if ('kind' in withoutDiscount) throw new Error(`unexpected error: ${withoutDiscount.kind}`)
    expect(out.total).toBeLessThan(withoutDiscount.total)
  })
})

