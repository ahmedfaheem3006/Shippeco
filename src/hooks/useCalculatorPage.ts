import { useCallback, useMemo, useState, useEffect } from 'react'
import { COUNTRIES } from '../legacy/dhlData'
import { computeLegacyPrice, getZoneInfoLegacy, type LegacyCalcError, type LegacyCalcOutput, type LegacyService } from '../utils/dhlLegacyPricing'
import { computeTotals, type CalcKind, type PieceInput } from '../utils/calculator'

import { computeAutoSurcharges, SURCHARGE_DEFS } from '../utils/surcharges'
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
  total: number
  fuelPct: number
  profitPct: number
  
  // New surcharges state for the result panel
  foreignCountry: string
  pieces: PieceInput[]
  dimUnit: 'metric' | 'imperial'
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
  
  const [surchargesState, setSurchargesState] = useState<Record<string, boolean>>({})

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
    setSurchargesState({})
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

    const foreignCountry = legacyService === 'export' ? routeTo : routeFrom;
    const { autoState, counts } = computeAutoSurcharges(foreignCountry, pieces, dimUnit);

    let surchargeTotal = 0;
    SURCHARGE_DEFS.forEach(def => {
      const isChecked = surchargesState[def.id] !== undefined ? surchargesState[def.id] : autoState[def.id];
      if (isChecked) {
        const count = def.perPiece ? ((counts as any)[def.id] || 1) : 1;
        surchargeTotal += def.feeBase * count;
      }
    });

    const out = computeLegacyPrice({
      service: legacyService,
      from: routeFrom,
      to: routeTo,
      chargeW: totals.chargeableKg,
      fuelPct,
      profitPct,
      surchargeTotal
    })

    if ('kind' in out) {
      setError(mapCalcError(out))
      setResult(null)
      return
    }

    const r = out as LegacyCalcOutput

    // We do not clear surchargesState here so that manual user overrides are preserved.

    const grandTotal = r.total;

    setResult({
      actualKg: round2(totals.actualKg),
      volumetricKg: round2(totals.volumetricKg),
      chargeableKg: round2(totals.chargeableKg),
      zoneLabel: r.zoneInfo.label,
      zoneName: r.zoneInfo.name,
      baseRate: r.baseRate,
      fuelAmt: r.fuelAmt,
      goGreen: r.goGreen,
      markup: r.markup,
      total: grandTotal,
      fuelPct,
      profitPct,
      foreignCountry,
      pieces,
      dimUnit
    })
  }, [fuelPct, legacyService, profitPct, routeFrom, routeTo, totals.actualKg, totals.chargeableKg, totals.volumetricKg, pieces, dimUnit, surchargesState])

  // Automatically recalculate if surcharges change and we already have a result
  useEffect(() => {
    if (result) {
      calculate()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surchargesState])

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

    surchargesState,
    setSurchargesState,
    toggleSurcharge: (id: string) => {
      setSurchargesState((prev) => ({ ...prev, [id]: !prev[id] }));
    }
  }
}

