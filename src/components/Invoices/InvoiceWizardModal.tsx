import { useEffect, useMemo, useRef, useState } from 'react'
import type { InvoiceStatus } from '../../utils/models'
import type { InvoiceDraftInput, WizardMode, WizardStep } from '../../utils/invoiceWizard'
import { computeBackStep, createNewInvoiceDraftInput } from '../../utils/invoiceWizard'
import { COUNTRIES } from '../../legacy/dhlData'
import { computeLegacyPrice, getZoneInfoLegacy, type LegacyService } from '../../utils/dhlLegacyPricing'
import { 
  X, Calculator, Edit3, Save, Zap, Home, 
  DownloadCloud, UploadCloud, MapPin, 
  Box, Truck, AlertCircle
} from 'lucide-react'
import { SearchableClientInput } from '../shared/SearchableClientInput'

type Prefill = {
  price?: string
  details?: string
  dhlCost?: string
  weight?: string
}

type Props = {
  open: boolean
  onClose: () => void
  onSave: (draft: InvoiceDraftInput, options: { asDraft: boolean }) => void
  prefill?: Prefill
  title?: string
  initialDraft?: InvoiceDraftInput
  initialStep?: WizardStep
  saving?: boolean
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

type CalcKind = 'economy' | 'local' | 'import' | 'export'

type CalcResult = {
  baseRate: number
  fuelAmt: number
  goGreen: number
  markup: number
  total: number
  chargeableWeight: number
  zoneLabel: string
  zoneName: string
  fuelPct: number
  profitPct: number
}
type CountryOption = { value: string; label: string }

const SA = 'SA'
const DEFAULT_FOREIGN = 'United Arab Emirates'

function getCountryLabel(value: string) {
  if (value === SA) return 'المملكة العربية السعودية'
  return COUNTRIES.find((c) => c.en === value)?.ar ?? value
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}

function computeVolumetricWeight(lengthCm: number, widthCm: number, heightCm: number) {
  const v = (lengthCm * widthCm * heightCm) / 5000
  return Number.isFinite(v) ? v : 0
}

function calcKindToLegacyService(kind: CalcKind): LegacyService {
  if (kind === 'local') return 'domestic'
  if (kind === 'export') return 'export'
  return 'import'
}

export function InvoiceWizardModal({ open, onClose, onSave, prefill, title, initialDraft, initialStep, saving }: Props) {
  const [mode, setMode] = useState<WizardMode>(() =>
    initialDraft ? 'direct' : prefill?.price || prefill?.details ? 'direct' : 'calc',
  )
  const [step, setStep] = useState<WizardStep>(() =>
    initialStep ?? (initialDraft ? 2 : prefill?.price || prefill?.details ? 2 : 0),
  )
  const [draft, setDraft] = useState<InvoiceDraftInput>(() => {
    if (initialDraft) return initialDraft
    const next = createNewInvoiceDraftInput(todayIso())
    if (prefill?.price) next.price = prefill.price
    if (prefill?.details) next.details = prefill.details
    if (prefill?.dhlCost) next.dhlCost = prefill.dhlCost
    if (prefill?.weight) next.weight = prefill.weight
    if (prefill?.price || prefill?.details) next.details = next.details || 'إدخال يدوي'
    return next
  })
  const [calcKind, setCalcKind] = useState<CalcKind>('import')
  const [routeFromUser, setRouteFromUser] = useState(DEFAULT_FOREIGN)
  const [routeToUser, setRouteToUser] = useState(DEFAULT_FOREIGN)
  const [calcWeight, setCalcWeight] = useState('0')
  const [calcLength, setCalcLength] = useState('')
  const [calcWidth, setCalcWidth] = useState('')
  const [calcHeight, setCalcHeight] = useState('')
  const [calcQty, setCalcQty] = useState('1')
  const [calcFuelPct, setCalcFuelPct] = useState(30)
  const [calcMarginPct, setCalcMarginPct] = useState(50)
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [calcError, setCalcError] = useState<string | null>(null)
  const priceRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open) return
    if (step === 2 && mode === 'direct') {
      priceRef.current?.focus()
    }
  }, [mode, open, step])

  const canSubmit = useMemo(() => {
    return Boolean(draft.client.trim() && draft.phone.trim())
  }, [draft.client, draft.phone])

  const backStep = useMemo(() => computeBackStep(mode, step), [mode, step])

  const countryOptions = useMemo<CountryOption[]>(
    () => [{ value: SA, label: 'المملكة العربية السعودية' }, ...COUNTRIES.map((c) => ({ value: c.en, label: c.ar }))],
    [],
  )

  const addressCountryOptions = useMemo<CountryOption[]>(
    () => [
      { value: 'Saudi Arabia', label: 'المملكة العربية السعودية' },
      ...COUNTRIES.map((c) => ({ value: c.en, label: c.ar })),
    ],
    [],
  )

  const legacyService = useMemo(() => calcKindToLegacyService(calcKind), [calcKind])
  const routeFromValue = routeFromUser
  const routeToValue = routeToUser
  const zoneInfo = useMemo(
    () => getZoneInfoLegacy(legacyService, routeFromValue, routeToValue),
    [legacyService, routeFromValue, routeToValue],
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true" data-testid="invoice-wizard-modal">
      <div className="bg-gray-50 dark:bg-slate-900 w-full max-w-[640px] max-h-[90vh] rounded-2xl shadow-xl flex flex-col overflow-hidden border border-gray-200 dark:border-slate-700">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="font-bold text-gray-900 dark:text-white text-base">{title || 'إنشاء فاتورة جديدة'}</div>
          <button type="button" className="text-gray-500 dark:text-gray-400 hover:text-red-600 dark:text-red-400 transition-colors p-1" onClick={onClose} aria-label="Close" disabled={Boolean(saving)}>
            <X size={20} />
          </button>
        </div>

        {/* Steps Tracker */}
        {step !== 0 && (
          <div className="flex items-center bg-white dark:bg-slate-800 p-3 border-b border-gray-200 dark:border-slate-700 text-sm font-bold">
            <div className={`flex items-center gap-2 flex-1 justify-center ${step === 1 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}>
              <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs ${step === 1 ? 'bg-indigo-600 hover:bg-indigo-700 text-white/20 text-indigo-600 dark:text-indigo-400 ring-2 ring-accent' : 'bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700'}`}>1</div>
              <span>احسب السعر</span>
            </div>
            <div className="w-12 h-px bg-border"></div>
            <div className={`flex items-center gap-2 flex-1 justify-center ${step === 2 ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 opacity-50'}`}>
              <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs ${step === 2 ? 'bg-indigo-600 hover:bg-indigo-700 text-white/20 text-indigo-600 dark:text-indigo-400 ring-2 ring-accent' : 'bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700'}`}>2</div>
              <span>بيانات العميل</span>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {step === 0 && (
            <div className="animate-in slide-in-from-bottom-2">
              <div className="text-center mb-6">
                <div className="text-base font-black text-gray-900 dark:text-white mb-1">كيف تريد إدخال السعر؟</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-bold">اختر الطريقة المناسبة لإنشاء الفاتورة</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-gray-200 dark:border-slate-700 hover:border-indigo-500 dark:border-indigo-500 hover:bg-indigo-50/50 dark:bg-indigo-900/10 transition-all text-center group"
                  onClick={() => {
                    setMode('calc')
                    setStep(1)
                  }}
                >
                  <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full group-hover:scale-110 transition-transform">
                     <Calculator size={32} />
                  </div>
                  <div>
                     <div className="font-bold text-gray-900 dark:text-white">احسب السعر</div>
                     <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">استخدم الحاسبة لحساب سعر الشحن عبر DHL تلقائياً واستيراد المدخلات للعميل</div>
                  </div>
                </button>
                <button
                  type="button"
                  className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 border-gray-200 dark:border-slate-700 hover:border-gold hover:bg-gold/5 transition-all text-center group"
                  onClick={() => {
                    setMode('direct')
                    setDraft((prev) => ({ ...prev, details: prev.details || 'إدخال يدوي' }))
                    setStep(2)
                  }}
                >
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-500 rounded-full group-hover:scale-110 transition-transform">
                     <Edit3 size={32} />
                  </div>
                  <div>
                     <div className="font-bold text-gray-900 dark:text-white">إدخال يدوي</div>
                     <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">تخطي الحاسبة. استخدم هذه الطريقة إذا كان السعر معلوماً وتريد حفظ الفاتورة مباشرة</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="flex flex-col gap-5 animate-in slide-in-from-right-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { k: 'economy', icon: Zap, label: 'Economy', color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500' },
                  { k: 'local', icon: Home, label: 'محلي', color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500' },
                  { k: 'import', icon: DownloadCloud, label: 'استيراد', color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500' },
                  { k: 'export', icon: UploadCloud, label: 'تصدير', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20', border: 'border-green' },
                ].map(({ k, icon: Icon, label, color, border, bg }) => {
                  const isActive = calcKind === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border-2 transition-all ${isActive ? `${bg} ${border} shadow-sm` : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 hover:border-muted'}`}
                      onClick={() => setCalcKind(k as CalcKind)}
                    >
                      <Icon size={24} className={isActive ? color : 'text-gray-500 dark:text-gray-400'} />
                      <span className={`text-xs font-bold ${isActive ? color : 'text-gray-900 dark:text-white'}`}>{label}</span>
                    </button>
                  )
                })}
              </div>

              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Box size={14}/> الوزن الفعلي (كجم)</label>
                  <input
                    className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none"
                    value={calcWeight}
                    onChange={(e) => setCalcWeight(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.0"
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Box size={14}/> الأبعاد (سم) — طول × عرض × ارتفاع</label>
                  <div className="grid grid-cols-3 gap-2">
                    <input className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 text-center" value={calcLength} onChange={(e) => setCalcLength(e.target.value)} inputMode="decimal" placeholder="ط" />
                    <input className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 text-center" value={calcWidth} onChange={(e) => setCalcWidth(e.target.value)} inputMode="decimal" placeholder="ع" />
                    <input className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 text-center" value={calcHeight} onChange={(e) => setCalcHeight(e.target.value)} inputMode="decimal" placeholder="ر" />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Box size={14}/> الكمية (طرود)</label>
                  <input className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50" value={calcQty} onChange={(e) => setCalcQty(e.target.value)} inputMode="numeric" placeholder="1" />
                </div>
                
                <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-500 dark:text-gray-400 flex gap-1.5 items-center"><MapPin size={14}/> الزون التلقائي</label>
                   {zoneInfo ? (
                      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/30 px-3 py-2 rounded-lg text-xs font-bold font-mono h-[38px] flex items-center justify-center">
                         Zone {zoneInfo.label} — {zoneInfo.name}
                      </div>
                   ) : (
                      <div className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 px-3 py-2 rounded-lg text-xs font-bold text-gray-500 dark:text-gray-400 h-[38px] flex items-center justify-center">Zone —</div>
                   )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400">المسار — من</label>
                  <select
                    className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50"
                    value={routeFromValue} onChange={(e) => setRouteFromUser(e.target.value)}
                  >
                    {countryOptions.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-500 dark:text-gray-400">المسار — إلى</label>
                  <select
                    className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50"
                    value={routeToValue} onChange={(e) => setRouteToUser(e.target.value)}
                  >
                    {countryOptions.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2 mt-2">
                   <div className="flex justify-between text-xs font-bold text-gray-500 dark:text-gray-400"><span>تسعيرة الوقود</span> <span>{calcFuelPct}%</span></div>
                   <input type="range" className="w-full accent-accent" min={0} max={60} value={calcFuelPct} onChange={(e) => setCalcFuelPct(Number(e.target.value))} />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                   <div className="flex justify-between text-xs font-bold text-gray-500 dark:text-gray-400"><span>هامش الربح التشغيلي</span> <span>{calcMarginPct}%</span></div>
                   <input type="range" className="w-full accent-gold" min={0} max={100} value={calcMarginPct} onChange={(e) => setCalcMarginPct(Number(e.target.value))} />
                </div>
              </div>

              {calcError && <div className="text-red-600 dark:text-red-400 text-xs font-bold bg-red-50 dark:bg-red-900/20 flex items-center gap-2 p-3 rounded-xl border border-red-200 dark:border-red-800/30"><AlertCircle size={16}/> {calcError}</div>}

              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-600 hover:bg-indigo-700 text-white/90 transition-all text-sm"
                onClick={() => {
                  setCalcError(null)
                  const actualW = Number(calcWeight) || 0
                  if (!actualW) { setCalcError('أدخل الوزن'); return }

                  const l = Number(calcLength) || 0; const w = Number(calcWidth) || 0; const h = Number(calcHeight) || 0
                  const qty = Math.max(1, Math.floor(Number(calcQty) || 1))
                  const hasDims = l > 0 && w > 0 && h > 0
                  const volumetric = hasDims ? computeVolumetricWeight(l, w, h) : 0
                  const chargeW = (hasDims ? Math.max(actualW, volumetric) : actualW) * qty

                  const r = computeLegacyPrice({ service: legacyService, from: routeFromValue, to: routeToValue, chargeW, fuelPct: calcFuelPct, profitPct: calcMarginPct })

                  if ('kind' in r) {
                    if (r.kind === 'missing_route') setCalcError('اختر المسار أولاً')
                    else if (r.kind === 'missing_weight') setCalcError('أدخل الوزن')
                    else if (r.kind === 'missing_zone') setCalcError('لم يتم العثور على الزون لهذا المسار')
                    else setCalcError('لا يوجد سعر لهذه الوجهة (زون 8)')
                    return
                  }

                  const res: CalcResult = {
                    baseRate: r.baseRate, fuelAmt: r.fuelAmt, goGreen: r.goGreen, markup: r.markup, total: r.total, chargeableWeight: round2(chargeW), zoneLabel: r.zoneInfo.label, zoneName: r.zoneInfo.name, fuelPct: calcFuelPct, profitPct: calcMarginPct,
                  }
                  setCalcResult(res)

                  const fromLabel = getCountryLabel(routeFromValue); const toLabel = getCountryLabel(routeToValue)
                  const wt = `${round2(chargeW).toFixed(2)} كجم`
                  const zoneLine = `Zone ${r.zoneInfo.label} — ${r.zoneInfo.name}`
                  const detailsLines = [
                    `من: ${fromLabel}`, `إلى: ${toLabel}`, zoneLine, `وزن المحاسبة: ${wt}`, `عدد الطرود: ${qty}`
                  ]
                  if (hasDims) detailsLines.push(`الأبعاد: ${l} × ${w} × ${h} سم`)
                  
                  const adminNotes = `أساسي: ${r.baseRate.toFixed(2)} ر.س  وقود: +${r.fuelAmt.toFixed(2)} ر.س  GoGreen: +${r.goGreen.toFixed(2)} ر.س`

                  setDraft((p) => ({
                    ...p, price: r.total.toFixed(2), dhlCost: r.baseRate.toFixed(2), weight: round2(chargeW).toFixed(2), details: detailsLines.join('\n'), notes: adminNotes, itemType: 'شحن دولي', carrier: 'DHL Express'
                  }))
                  setMode('calc')
                  setStep(2)
                }}
              >
                <Calculator size={18} /> احسب وانتقل لبيانات العميل
              </button>

              {calcResult && (
                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl p-4 shadow-sm animate-in fade-in">
                  <div className="grid grid-cols-[1fr_auto] gap-y-3 gap-x-4 text-xs">
                    <div className="text-gray-500 dark:text-gray-400 font-bold">الزون الجغرافي</div>
                    <div className="font-mono font-bold text-gray-900 dark:text-white">Zone {calcResult.zoneLabel}</div>
                    <div className="text-gray-500 dark:text-gray-400 font-bold">تكلفة DHL الاستخراجية</div>
                    <div className="font-mono font-bold text-gray-900 dark:text-white">{calcResult.baseRate.toFixed(2)} ر.س</div>
                    <div className="text-gray-500 dark:text-gray-400 font-bold">رسوم وأعباء الوقود</div>
                    <div className="font-mono font-bold text-red-600 dark:text-red-400">+{calcResult.fuelAmt.toFixed(2)} ر.س</div>
                    <div className="text-gray-500 dark:text-gray-400 font-bold">رسوم GoGreen المناخية</div>
                    <div className="font-mono font-bold text-green-600 dark:text-green-400">+{calcResult.goGreen.toFixed(2)} ر.س</div>
                    <div className="text-gray-500 dark:text-gray-400 font-bold">صافي الربح المُقدر التشغيلي</div>
                    <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">+{calcResult.markup.toFixed(2)} ر.س</div>
                    <div className="border-t border-gray-200 dark:border-slate-700 col-span-2 mt-1 pt-2 grid grid-cols-[1fr_auto] gap-4">
                       <div className="text-gray-900 dark:text-white font-bold">السعر النهائي المقدم للعميل</div>
                       <div className="font-mono font-black text-yellow-600 dark:text-yellow-500 text-lg">{calcResult.total.toFixed(2)} ر.س</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4 animate-in slide-in-from-right-2">
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/20 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                <div className="text-xs font-bold text-yellow-600 dark:text-yellow-500 flex items-center gap-1.5"><Save size={16}/> إجمالي التسعيرة للفاتورة</div>
                <div className="flex items-center gap-3">
                   {draft.weight && <div className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-white dark:bg-slate-800 px-2 py-1 rounded-md">{draft.weight} كجم</div>}
                   <div className="font-mono text-2xl font-black text-yellow-600 dark:text-yellow-500">
                     {draft.price ? `${draft.price} ر.س` : '—'}
                   </div>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="sm:col-span-2">
                   <SearchableClientInput
                     nameValue={draft.client}
                     phoneValue={draft.phone}
                     onNameChange={(val) => setDraft((p) => ({ ...p, client: val }))}
                     onPhoneChange={(val) => setDraft((p) => ({ ...p, phone: val }))}
                     onSelect={(name, phone) => setDraft((p) => ({ ...p, client: name, phone: phone }))}
                   />
                 </div>
                 
                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-500 dark:text-gray-400">تصنيف بند الفاتورة *</label>
                   <select className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50" value={draft.itemType} onChange={(e) => setDraft((p) => ({ ...p, itemType: e.target.value }))}>
                     <option value="شحن دولي">شحن دولي (استيراد/تصدير)</option><option value="شحن داخلي">شحن داخلي وحلي</option><option value="تغيير عنوان">رسوم تغيير عنوان</option><option value="فرق وزن">رسوم ومطالبات فرق وزن</option><option value="توصيل">خدمات توصيل</option><option value="أخرى">أخرى</option>
                   </select>
                 </div>
                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-500 dark:text-gray-400">الناقل اللوجستي *</label>
                   <select className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50" value={draft.carrier} onChange={(e) => setDraft((p) => ({ ...p, carrier: e.target.value }))}>
                     <option value="">بدون ناقل / غير محدد</option><option value="DHL Express">DHL Express قطاع الأعمال</option><option value="Aramex">Aramex</option><option value="FedEx">FedEx</option><option value="SMSA">SMSA</option><option value="Naqel">Naqel</option><option value="J&T Express">J&T Express</option><option value="أخرى">أخرى</option>
                   </select>
                 </div>

                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-500 dark:text-gray-400">رقم التتبع البوليصة AWB</label>
                   <input className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 text-left outline-none" value={draft.awb} onChange={(e) => setDraft((p) => ({ ...p, awb: e.target.value }))} placeholder="XXXXXXXXXX" dir="ltr" />
                 </div>
                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-500 dark:text-gray-400 text-yellow-600 dark:text-yellow-500">القيمة النهائية المقدرة (ر.س)</label>
                   <input ref={priceRef} className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-yellow-600 dark:text-yellow-500 font-bold focus:ring-2 focus:ring-gold/50 text-left outline-none" value={draft.price} onChange={(e) => setDraft((p) => ({ ...p, price: e.target.value }))} placeholder="0.00" dir="ltr" />
                 </div>

                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-500 dark:text-gray-400">تكلفة الناقل الاصلية (محاسبة)</label>
                   <input className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-500 dark:text-gray-400 focus:ring-2 focus:ring-indigo-500/50 text-left outline-none" value={draft.dhlCost} onChange={(e) => setDraft((p) => ({ ...p, dhlCost: e.target.value }))} placeholder="0.00" dir="ltr" />
                 </div>
                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-500 dark:text-gray-400">وزن المحاسبة النهائي (كجم)</label>
                   <input className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-500 dark:text-gray-400 focus:ring-2 focus:ring-indigo-500/50 text-left outline-none" value={draft.weight} onChange={(e) => setDraft((p) => ({ ...p, weight: e.target.value }))} placeholder="0.0" dir="ltr" />
                 </div>

                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-500 dark:text-gray-400">الأبعاد (سم)</label>
                   <input className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-500 dark:text-gray-400 focus:ring-2 focus:ring-indigo-500/50 text-left outline-none" value={draft.dimensions} onChange={(e) => setDraft((p) => ({ ...p, dimensions: e.target.value }))} placeholder="طول × عرض × ارتفاع" dir="ltr" />
                 </div>

                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-500 dark:text-gray-400">تاريخ إنشاء الفاتورة</label>
                   <input type="date" className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 text-left outline-none" value={draft.date} onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))} dir="ltr" />
                 </div>
                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-500 dark:text-gray-400">حالة السداد الأولية</label>
                   <select className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50" value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value as InvoiceStatus }))}>
                     <option value="unpaid">لم يتم الدفع بعد 🔴</option><option value="partial">دفعة مقدمة / عربون 🟡</option><option value="paid">مسددة بالكامل خالص ✅</option><option value="returned">مرتجعة 🟣</option>
                   </select>
                 </div>

                 {draft.status === 'partial' && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-bold text-yellow-600 dark:text-yellow-500">المبلغ المدفوع جزئياً والمستلم (ر.س)</label>
                      <input className="w-full bg-gray-50 dark:bg-slate-900 border border-yellow-200 dark:border-yellow-800/30 rounded-lg px-3 py-2.5 text-sm font-mono font-bold text-yellow-600 dark:text-yellow-500 focus:ring-2 focus:ring-gold/50 text-left outline-none" value={draft.partialPaid} onChange={(e) => setDraft((p) => ({ ...p, partialPaid: e.target.value }))} placeholder="0.00" dir="ltr" />
                    </div>
                 )}

                 <div className="flex flex-col gap-1.5">
                   <label className="text-xs font-bold text-gray-500 dark:text-gray-400">مسار إتمام الدفع</label>
                   <select className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50" value={draft.payment} onChange={(e) => setDraft((p) => ({ ...p, payment: e.target.value }))}>
                      <option value="">بدون مسار / قيد الانتظار</option><option value="تحويل بنكي">تحويل مباشر للحساب البنكي</option><option value="سداد إلكتروني">عبر روابط الدفع (Paymob)</option>
                   </select>
                 </div>
                 
                 <div className="flex flex-col gap-1.5 sm:col-span-2 mt-2">
                   <label className="text-xs font-bold text-gray-500 dark:text-gray-400">نصوص ووصف الفاتورة للعميل</label>
                   <textarea rows={4} className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-3 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none leading-relaxed" value={draft.details} onChange={(e) => setDraft((p) => ({ ...p, details: e.target.value }))} placeholder="اكتب الملاحظات والتفاصيل هنا..." />
                 </div>
              </div>

              <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-200 dark:border-slate-700 flex flex-col gap-4">
                 <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 pb-3">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2"><Truck size={16} className="text-gray-500 dark:text-gray-400"/> معلومات التوجيه اللوجستية (Shipper & Receiver)</h3>
                    <label className="flex items-center gap-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-lg border border-indigo-100 dark:border-indigo-800/20">
                      <input type="checkbox" className="accent-accent w-4 h-4 cursor-pointer" checked={draft.shipperSameAsClient} onChange={(e) => setDraft((p) => ({ ...p, shipperSameAsClient: e.target.checked }))} />
                      نفس بيانات العميل للإرسال
                    </label>
                 </div>

                 {!draft.shipperSameAsClient && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-4 border-b border-gray-200 dark:border-slate-700">
                       <h4 className="sm:col-span-2 text-xs font-bold text-gray-500 dark:text-gray-400">بيانات المُرسـل (Shipper)</h4>
                       <input className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none" value={draft.shipperName} onChange={(e) => setDraft((p) => ({ ...p, shipperName: e.target.value }))} placeholder="الاسم" />
                       <input className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white font-mono text-left focus:ring-2 focus:ring-indigo-500/50 outline-none" value={draft.shipperPhone} onChange={(e) => setDraft((p) => ({ ...p, shipperPhone: e.target.value }))} placeholder="الجوال" dir="ltr" />
                       <input className="sm:col-span-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none" value={draft.shipperAddress} onChange={(e) => setDraft((p) => ({ ...p, shipperAddress: e.target.value }))} placeholder="العنوان كاملاً للارساليات" />
                    </div>
                 )}

                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <h4 className="sm:col-span-2 text-xs font-bold text-gray-500 dark:text-gray-400">بيانات المُستلم (Receiver)</h4>
                    <input className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none" value={draft.receiverName} onChange={(e) => setDraft((p) => ({ ...p, receiverName: e.target.value }))} placeholder="الاسم الكامل" />
                    <input className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white font-mono text-left focus:ring-2 focus:ring-indigo-500/50 outline-none" value={draft.receiverPhone} onChange={(e) => setDraft((p) => ({ ...p, receiverPhone: e.target.value }))} placeholder="رقم الجوال لتواصل الكورير" dir="ltr" />
                    <select className="bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none" value={draft.receiverCountry} onChange={(e) => setDraft((p) => ({ ...p, receiverCountry: e.target.value }))}>
                       {addressCountryOptions.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                    </select>
                    <input className="sm:col-span-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/50 outline-none" value={draft.receiverAddress} onChange={(e) => setDraft((p) => ({ ...p, receiverAddress: e.target.value }))} placeholder="المدن، الشوارع، الاحياء للوجهة" />
                 </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-end gap-3 flex-wrap">
          {step !== 0 && (
             <button type="button" className="px-4 py-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white text-sm font-bold rounded-xl hover:bg-border transition-colors disabled:opacity-50" onClick={() => setStep(backStep)} disabled={Boolean(saving)}>
               تغيير الطريقة
             </button>
          )}
          <button type="button" className="px-5 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:text-white text-sm font-bold rounded-xl hover:bg-gray-50 dark:bg-slate-900 transition-colors disabled:opacity-50" onClick={onClose} disabled={Boolean(saving)}>
            إلغاء وإغلاق
          </button>
          {step === 2 && (
            <>
              <button
                type="button"
                className="px-6 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20 text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
                onClick={() => onSave(draft, { asDraft: true })}
                disabled={Boolean(saving) || !canSubmit}
              >
                حفظ بمسودة (قيد الإعداد)
              </button>
              <button
                type="button"
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white hover:bg-indigo-600 hover:bg-indigo-700 text-white/90 shadow-lg shadow-indigo-500/20 text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
                onClick={() => onSave(draft, { asDraft: false })}
                disabled={Boolean(saving) || !canSubmit}
              >
                {saving ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></div> : <Save size={16} />}
                إصدار الفاتورة النهائية
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
