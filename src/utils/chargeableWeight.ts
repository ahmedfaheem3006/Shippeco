export type UnitSystem = 'metric' | 'imperial'

export type CalcPiece = {
  qty: number
  weight: number
  l: number
  w: number
  h: number
}

export function toKg(weight: number, unitSystem: UnitSystem) {
  return unitSystem === 'imperial' ? weight / 2.20462 : weight
}

function toCm(value: number, unitSystem: UnitSystem) {
  return unitSystem === 'imperial' ? value * 2.54 : value
}

export function computeVolumetricWeightKg(piece: CalcPiece, unitSystem: UnitSystem) {
  const l = toCm(piece.l, unitSystem)
  const w = toCm(piece.w, unitSystem)
  const h = toCm(piece.h, unitSystem)
  if (!(l > 0 && w > 0 && h > 0)) return 0
  return (l * w * h) / 5000
}

export function computeChargeableWeightKg(pieces: readonly CalcPiece[], unitSystem: UnitSystem) {
  let totalA = 0
  let totalV = 0
  let hasV = false
  let valid = false

  for (const p of pieces) {
    const qty = p.qty || 1
    const aw = toKg(p.weight, unitSystem)
    if (aw > 0) {
      totalA += aw * qty
      valid = true
    }
    const vw = computeVolumetricWeightKg(p, unitSystem)
    if (vw > 0) {
      totalV += vw * qty
      hasV = true
    }
  }

  if (!valid) return null
  return hasV ? Math.max(totalA, totalV) : totalA
}

