import { useCallback, useMemo, useState } from 'react'
import { COUNTRIES } from '../legacy/dhlData'
import { computeLegacyPrice, getZoneInfoLegacy, type LegacyCalcError, type LegacyCalcOutput, type LegacyService } from '../utils/dhlLegacyPricing'
import { computeTotals, type CalcKind, type PieceInput } from '../utils/calculator'

const SA = 'SA'
const DEFAULT_FOREIGN = 'SA'

export type CalcResult = {
  actualKg: number
  volumetricKg: number
  chargeableKg: number
  zoneLabel: string
  zoneName: string
  baseRate: number
  fuelAmt: number
  goGreen: number
  markup: number
  surcharges: {
    elevatedRisk: number
    restrictedDestination: number
    overweight: number
    oversize: number
    nonConveyable: number
    nonStackable: number
    remoteArea: number
    totalSurcharges: number
  }
  total: number
  fuelPct: number
  profitPct: number
}

type CountryOption = { value: string; label: string }

function kindToLegacyService(kind: CalcKind): LegacyService {
  if (kind === 'local') return 'domestic'
  if (kind === 'export') return 'export'
  return 'import'
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function mapCalcError(err: LegacyCalcError) {
  if (err.kind === 'missing_route') return 'اختر المسار أولاً'
  if (err.kind === 'missing_weight') return 'أدخل الوزن'
  if (err.kind === 'missing_zone') return 'لم يتم العثور على الزون لهذا المسار'
  return 'لا يوجد سعر لهذه الوجهة (زون 8)'
}

export function useCalculatorPage() {
  const [kind, setKind] = useState<CalcKind>('import')
  const legacyService = useMemo(() => kindToLegacyService(kind), [kind])

  const [routeFromUser, setRouteFromUser] = useState(DEFAULT_FOREIGN)
  const [routeToUser, setRouteToUser] = useState(DEFAULT_FOREIGN)

  const routeFrom = routeFromUser
  const routeTo = routeToUser

  const [pieces, setPieces] = useState<PieceInput[]>([{ qty: '1', weight: '', l: '', w: '', h: '' }])
  const [dimUnit, setDimUnit] = useState<'metric' | 'imperial'>('metric')
  const [shipmentType, setShipmentType] = useState<'non-doc' | 'doc' | 'envelope'>('non-doc')
  
  // Manual surcharges overrides
  const [manualSurcharges, setManualSurcharges] = useState({
    elevatedRisk: false,
    restrictedDestination: false,
    overweight: false,
    oversize: false,
    nonConveyable: false,
    nonStackable: false,
    remoteArea: false,
  })

  const [fuelPct, setFuelPct] = useState(30)
  const [profitPct, setProfitPct] = useState(50)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CalcResult | null>(null)

  const countryOptions = useMemo<CountryOption[]>(
    () => [{ value: SA, label: 'المملكة العربية السعودية' }, ...COUNTRIES.map((c) => ({ value: c.en, label: c.ar }))],
    [],
  )

  const totals = useMemo(() => computeTotals(pieces, dimUnit), [pieces, dimUnit])

  const zoneInfo = useMemo(() => getZoneInfoLegacy(legacyService, routeFrom, routeTo), [legacyService, routeFrom, routeTo])

  const updatePiece = useCallback((idx: number, partial: Partial<PieceInput>) => {
    setPieces((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], ...partial }
      return next
    })
  }, [])

  const addPiece = useCallback(() => {
    setPieces((prev) => [...prev, { qty: '1', weight: '', l: '', w: '', h: '' }])
  }, [])

  const removePiece = useCallback((idx: number) => {
    setPieces((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      return next.length ? next : [{ qty: '1', weight: '', l: '', w: '', h: '' }]
    })
  }, [])

  const reset = useCallback(() => {
    setKind('import')
    setRouteFromUser(DEFAULT_FOREIGN)
    setRouteToUser(DEFAULT_FOREIGN)
    setPieces([{ qty: '1', weight: '', l: '', w: '', h: '' }])
    setShipmentType('non-doc')
    setManualSurcharges({
      elevatedRisk: false,
      restrictedDestination: false,
      overweight: false,
      oversize: false,
      nonConveyable: false,
      nonStackable: false,
      remoteArea: false,
    })
    setFuelPct(30)
    setProfitPct(50)
    setError(null)
    setResult(null)
  }, [])

  const calculate = useCallback(() => {
    setError(null)

    if (!routeFrom || !routeTo) {
      setError('اختر المسار أولاً')
      setResult(null)
      return
    }

    if (!totals.chargeableKg) {
      setError('أدخل وزن واحد على الأقل')
      setResult(null)
      return
    }

    const out = computeLegacyPrice({
      service: legacyService,
      from: routeFrom,
      to: routeTo,
      chargeW: totals.chargeableKg,
      fuelPct,
      profitPct,
    })

    if ('kind' in out) {
      setError(mapCalcError(out))
      setResult(null)
      return
    }

    const r = out as LegacyCalcOutput

    // ─── Surcharges Auto & Manual Logic ───
    const SURCHARGE_RATES = {
      elevatedRisk: 159,
      restrictedDestination: 203,
      overweight: 418,
      oversize: 418,
      nonConveyable: 418,
      nonStackable: 1354,
      remoteArea: 135,
    }

    // Auto calculate if not manually checked
    // Elevated Risk countries
    const riskCountries = ['Afghanistan', 'Iraq', 'Libya', 'Somalia', 'Syria', 'Yemen', 'Niger', 'Mali', 'Sudan', 'Burundi']
    const isElevatedRisk = manualSurcharges.elevatedRisk || riskCountries.includes(routeTo) || riskCountries.includes(routeFrom)

    // Restricted Destination countries
    const restrictedCountries = ['Central African Republic', 'Congo', 'Eritrea', 'Iran', 'Iraq', 'Libya', 'North Korea', 'Somalia', 'Syria', 'Yemen']
    const isRestricted = manualSurcharges.restrictedDestination || restrictedCountries.includes(routeTo) || restrictedCountries.includes(routeFrom)

    // Overweight: Any single piece >= 70kg
    const autoOverweight = pieces.some(p => Number(p.weight) >= 70)
    const isOverweight = manualSurcharges.overweight || autoOverweight

    // Oversize: Any dimension > 120cm
    const autoOversize = pieces.some(p => {
      const dim = dimUnit === 'imperial' ? 47.24 : 120 // 120cm in inches is ~47.24
      return Number(p.l) > dim || Number(p.w) > dim || Number(p.h) > dim
    })
    const isOversize = manualSurcharges.oversize || autoOversize

    const isNonConveyable = manualSurcharges.nonConveyable
    const isNonStackable = manualSurcharges.nonStackable
    const isRemoteArea = manualSurcharges.remoteArea

    const surchargesObj = {
      elevatedRisk: isElevatedRisk ? SURCHARGE_RATES.elevatedRisk : 0,
      restrictedDestination: isRestricted ? SURCHARGE_RATES.restrictedDestination : 0,
      overweight: isOverweight ? SURCHARGE_RATES.overweight : 0,
      oversize: isOversize ? SURCHARGE_RATES.oversize : 0,
      nonConveyable: isNonConveyable ? SURCHARGE_RATES.nonConveyable : 0,
      nonStackable: isNonStackable ? SURCHARGE_RATES.nonStackable : 0,
      remoteArea: isRemoteArea ? SURCHARGE_RATES.remoteArea : 0,
    }

    const totalSurcharges = Object.values(surchargesObj).reduce((sum, val) => sum + val, 0)
    
    // Add surcharges markup and fuel? Usually surcharges don't get the same markup, but let's add markup to total
    const grandTotal = r.total + totalSurcharges + (totalSurcharges * (profitPct / 100))

    setResult({
      actualKg: round2(totals.actualKg),
      volumetricKg: round2(totals.volumetricKg),
      chargeableKg: round2(totals.chargeableKg),
      zoneLabel: r.zoneInfo.label,
      zoneName: r.zoneInfo.name,
      baseRate: r.baseRate,
      fuelAmt: r.fuelAmt,
      goGreen: r.goGreen,
      markup: r.markup + (totalSurcharges * (profitPct / 100)), // add surcharge markup to total markup
      surcharges: { ...surchargesObj, totalSurcharges },
      total: grandTotal,
      fuelPct,
      profitPct,
    })
  }, [fuelPct, legacyService, profitPct, routeFrom, routeTo, totals.actualKg, totals.chargeableKg, totals.volumetricKg, manualSurcharges, pieces, dimUnit])

  return {
    countryOptions,

    kind,
    setKind: (k: CalcKind) => {
      setKind(k)
      setResult(null)
      setError(null)
    },
    legacyService,

    routeFrom,
    routeTo,
    routeFromUser,
    setRouteFromUser: (v: string) => {
      setRouteFromUser(v)
      setResult(null)
    },
    routeToUser,
    setRouteToUser: (v: string) => {
      setRouteToUser(v)
      setResult(null)
    },
    zoneInfo,

    pieces,
    updatePiece,
    addPiece,
    removePiece,

    dimUnit,
    setDimUnit: (u: 'metric' | 'imperial') => {
      setDimUnit(u)
      setResult(null)
    },

    fuelPct,
    setFuelPct: (v: number) => {
      setFuelPct(v)
      setResult(null)
    },
    profitPct,
    setProfitPct: (v: number) => {
      setProfitPct(v)
      setResult(null)
    },

    totals,
    result,
    error,
    calculate,
    reset,

    shipmentType,
    setShipmentType: (t: 'non-doc' | 'doc' | 'envelope') => {
      setShipmentType(t)
      setResult(null)
    },

    manualSurcharges,
    setManualSurcharge: (key: keyof typeof manualSurcharges, val: boolean) => {
      setManualSurcharges(prev => ({ ...prev, [key]: val }))
      setResult(null)
    }
  }
}

