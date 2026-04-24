import { describe, expect, it } from 'vitest'
import { computeChargeableWeightKg, computeVolumetricWeightKg, type CalcPiece } from './chargeableWeight'

describe('chargeableWeight', () => {
  it('returns null when all piece weights are zero', () => {
    const pieces: CalcPiece[] = [{ qty: 1, weight: 0, l: 0, w: 0, h: 0 }]
    expect(computeChargeableWeightKg(pieces, 'metric')).toBeNull()
  })

  it('uses actual weight when no dimensions exist', () => {
    const pieces: CalcPiece[] = [
      { qty: 1, weight: 2.5, l: 0, w: 0, h: 0 },
      { qty: 2, weight: 1, l: 0, w: 0, h: 0 },
    ]
    expect(computeChargeableWeightKg(pieces, 'metric')).toBeCloseTo(4.5, 10)
  })

  it('uses volumetric when larger than actual', () => {
    const pieces: CalcPiece[] = [{ qty: 1, weight: 1, l: 50, w: 40, h: 30 }]
    const vw = computeVolumetricWeightKg(pieces[0], 'metric')
    expect(vw).toBeCloseTo(12, 10)
    expect(computeChargeableWeightKg(pieces, 'metric')).toBeCloseTo(12, 10)
  })

  it('uses max(totalActual, totalVolumetric) across pieces', () => {
    const pieces: CalcPiece[] = [
      { qty: 1, weight: 10, l: 0, w: 0, h: 0 },
      { qty: 1, weight: 1, l: 100, w: 50, h: 40 },
    ]
    const total = computeChargeableWeightKg(pieces, 'metric')
    expect(total).toBeCloseTo((100 * 50 * 40) / 5000, 10)
  })

  it('supports imperial conversion (lb/in)', () => {
    const pieces: CalcPiece[] = [{ qty: 1, weight: 22.0462, l: 0, w: 0, h: 0 }]
    expect(computeChargeableWeightKg(pieces, 'imperial')).toBeCloseTo(10, 6)
  })
})

