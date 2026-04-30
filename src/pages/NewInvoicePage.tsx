import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppLayout } from '../components/AppLayout/useAppLayout'
import type { InvoiceStatus } from '../utils/models'
import type { InvoiceDraftInput, WizardMode, WizardStep } from '../utils/invoiceWizard'
import { createNewInvoiceDraftInput, toInvoiceFromDraft } from '../utils/invoiceWizard'
import { COUNTRIES } from '../legacy/dhlData'
import { computeLegacyPrice, getZoneInfoLegacy, type LegacyService } from '../utils/dhlLegacyPricing'
import { invoiceService } from '../services/invoiceService'
import { computeVolumetricWeightKg, toKg, type UnitSystem } from '../utils/chargeableWeight'

import styles from './NewInvoicePage.module.css'
import {
  Calculator, Edit3, Save, Zap, Home,
  DownloadCloud, UploadCloud, MapPin,
  Box, Truck, AlertCircle, CheckCircle2,
  ArrowRight, FileText, User, CreditCard,
  Package, Hash, Calendar, ClipboardList,
  Banknote, Weight, Ruler
} from 'lucide-react'
import { SearchableClientInput } from '../components/shared/SearchableClientInput'
import { SearchableSelect } from '../components/shared/SearchableSelect'

type CalcKind = 'economy' | 'local' | 'import' | 'export'

type CalcResult = {
  baseRate: number; fuelAmt: number; goGreen: number
  markup: number; total: number; chargeableWeight: number
  zoneLabel: string; zoneName: string; fuelPct: number; profitPct: number
}

type CountryOption = { value: string; label: string }

const SA = 'SA'
const DEFAULT_FOREIGN = 'SA'

function getCountryLabel(value: string) {
  if (value === SA) return 'المملكة العربية السعودية'
  return COUNTRIES.find((c) => c.en === value)?.ar ?? value
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}



function calcKindToLegacyService(kind: CalcKind): LegacyService {
  if (kind === 'local') return 'domestic'
  if (kind === 'export') return 'export'
  return 'import'
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

export function NewInvoicePage() {
  useAppLayout()
  const navigate = useNavigate()
  // ─── Invoice ID from backend ───
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { api } = await import('../utils/apiClient')
        const res = await api.get('/invoices/next-number')
        if (!cancelled) {
          const num = res?.data?.invoice_number ?? res?.invoice_number ?? null
          setNextInvoiceNumber(num)
        }
      } catch (err) {
        console.warn('Failed to fetch next invoice number:', err)
        if (!cancelled) setNextInvoiceNumber(null)
      } finally {
        if (!cancelled) setLoadingId(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ─── State ───
  const [mode, setMode] = useState<WizardMode>('calc')
  const [step, setStep] = useState<WizardStep>(0)
  const [draft, setDraft] = useState<InvoiceDraftInput>(() => createNewInvoiceDraftInput(todayIso()))
  const [saving, setSaving] = useState(false)
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
  const [calcDimUnit, setCalcDimUnit] = useState<UnitSystem>('metric')
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [calcError, setCalcError] = useState<string | null>(null)
  const priceRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (step === 2 && mode === 'direct') {
      priceRef.current?.focus()
    }
  }, [mode, step])

  const canSubmit = useMemo(() => {
    return Boolean(draft.client.trim() && draft.phone.trim())
  }, [draft.client, draft.phone])

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

  // ─── Handlers ───
  const handleCalcAndContinue = useCallback(() => {
    setCalcError(null)
    const actualW = Number(calcWeight) || 0
    if (!actualW) { setCalcError('أدخل الوزن'); return }

    const l = Number(calcLength) || 0; const w = Number(calcWidth) || 0; const h = Number(calcHeight) || 0
    const qty = Math.max(1, Math.floor(Number(calcQty) || 1))
    const hasDims = l > 0 && w > 0 && h > 0

    // Convert actual weight if imperial
    const actualKg = toKg(actualW, calcDimUnit)
    
    // Calculate volumetric weight (already converts to Kg inside the function)
    const volumetricKg = hasDims ? computeVolumetricWeightKg({ qty: 1, weight: 0, l, w, h }, calcDimUnit) : 0
    
    // Chargeable weight per piece is max(actual, volumetric)
    const chargeW = Math.max(actualKg, volumetricKg) * qty

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
    if (hasDims) detailsLines.push(`الأبعاد: ${l} × ${w} × ${h} ${calcDimUnit === 'metric' ? 'سم' : 'إنش'}`)
    detailsLines.push('---', `أساسي: ${r.baseRate.toFixed(2)} ر.س  وقود: +${r.fuelAmt.toFixed(2)} ر.س  GoGreen: +${r.goGreen.toFixed(2)} ر.س`)

    const unitLabel = calcDimUnit === 'metric' ? 'سم' : 'إنش'
    const dimsStr = hasDims ? `${l} × ${w} × ${h} ${unitLabel}` : ''
    setDraft((p) => ({
      ...p, price: r.total.toFixed(2), dhlCost: r.baseRate.toFixed(2), weight: round2(chargeW).toFixed(2), dimensions: dimsStr, details: detailsLines.join('\n'), itemType: 'شحن دولي', carrier: 'DHL Express'
    }))
    setMode('calc')
    setStep(2)
  }, [calcWeight, calcLength, calcWidth, calcHeight, calcQty, legacyService, routeFromValue, routeToValue, calcFuelPct, calcMarginPct])

  const handleSave = useCallback(async (asDraft: boolean) => {
    if (saving) return
    const id = `${Date.now()}`
    const next = toInvoiceFromDraft(id, draft, { forceDraft: asDraft })

    // ══ Ensure paid_amount is sent for partial payments ══
    const payload: any = { ...next }

    // Map frontend fields to backend fields
    if (!payload.client_name && payload.client) payload.client_name = payload.client
    if (!payload.invoice_date && payload.date) payload.invoice_date = payload.date

    // Handle paid_amount for partial status
    if (draft.status === 'partial') {
      const partialValue = Number(draft.partialPaid) || 0
      payload.paid_amount = partialValue
    } else if (draft.status === 'paid') {
      payload.paid_amount = Number(draft.price) || 0
    } else {
      payload.paid_amount = 0
    }

    setSaving(true)
    try {
      const created = await invoiceService.createInvoice(payload)
      console.log('[NewInvoice] ✅ Invoice created:', created?.id || created?.invoice_number || 'OK')
      navigate('/invoices')
    } catch (e) {
      console.error('[NewInvoice] ❌ Failed:', e)
      window.alert(e instanceof Error ? e.message : 'فشل في إنشاء الفاتورة')
    } finally {
      setSaving(false)
    }
  }, [draft, saving, navigate])

  // ─── Step 0: Mode Selection ───
  if (step === 0) {
    return (
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <div className={styles.headerTitle}>إنشاء فاتورة جديدة</div>
            <div className={styles.headerSubtitle}>اختر طريقة إدخال السعر لبدء إنشاء الفاتورة</div>
          </div>
          <div className={styles.invoiceIdBadge}>
            <div>
              <div className={styles.invoiceIdLabel}>رقم الفاتورة التالي</div>
              {loadingId ? (
                <div className={styles.invoiceIdLoading} />
              ) : (
                <div className={styles.invoiceIdValue}>#{nextInvoiceNumber || '...'}</div>
              )}
            </div>
          </div>
        </div>

        {/* Mode cards */}
        <div className={styles.section}>
          <div className={styles.modeGrid}>
            <button type="button" className={styles.modeCard} onClick={() => { setMode('calc'); setStep(1) }}>
              <div className={styles.modeCardIcon} style={{ background: 'linear-gradient(135deg, #eef2ff, #e0e7ff)', color: '#4f46e5' }}>
                <Calculator size={36} />
              </div>
              <div className={styles.modeCardTitle}>احسب السعر تلقائياً</div>
              <div className={styles.modeCardDesc}>
                استخدم حاسبة DHL الذكية لحساب سعر الشحن تلقائياً بناءً على الوزن والوجهة والأبعاد ثم استيراد البيانات مباشرة
              </div>
            </button>
            <button type="button" className={styles.modeCard} onClick={() => { setMode('direct'); setDraft((p) => ({ ...p, details: p.details || 'إدخال يدوي' })); setStep(2) }}>
              <div className={styles.modeCardIcon} style={{ background: 'linear-gradient(135deg, #fefce8, #fef9c3)', color: '#d97706' }}>
                <Edit3 size={36} />
              </div>
              <div className={styles.modeCardTitle}>إدخال يدوي مباشر</div>
              <div className={styles.modeCardDesc}>
                تخطي الحاسبة إذا كان السعر معلوماً مسبقاً. أدخل جميع بيانات الفاتورة يدوياً وأصدرها مباشرة
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step 1: Calculator ───
  if (step === 1) {
    return (
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <div className={styles.headerTitle}>حاسبة تسعير الشحن</div>
            <div className={styles.headerSubtitle}>حدد نوع الشحن والمسار والأبعاد للحصول على التسعيرة المثالية</div>
          </div>
          <div className={styles.invoiceIdBadge}>
            <div>
              <div className={styles.invoiceIdLabel}>رقم الفاتورة</div>
              {loadingId ? (
                <div className={styles.invoiceIdLoading} />
              ) : (
                <div className={styles.invoiceIdValue}>#{nextInvoiceNumber || '...'}</div>
              )}
            </div>
          </div>
        </div>

        {/* Steps Bar */}
        <div className={styles.stepsBar}>
          <div className={`${styles.stepItem} ${styles.stepActive}`}>
            <div className={styles.stepNumber}>1</div>
            <span>حاسبة الشحن</span>
          </div>
          <div className={`${styles.stepDivider}`} />
          <div className={styles.stepItem}>
            <div className={styles.stepNumber}>2</div>
            <span>بيانات العميل والفاتورة</span>
          </div>
        </div>

        <div className={styles.contentGrid}>
          {/* Shipping Type */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon} style={{ background: '#eef2ff', color: '#4f46e5' }}>
                <Truck size={18} />
              </div>
              <div className={styles.sectionTitle}>نوع الشحن والمسار</div>
            </div>
            <div className={`${styles.sectionBody} ${styles.sectionBodySingle}`}>
              <div className={`${styles.calcTypeGrid} ${styles.fullWidth}`}>
                {([
                  { k: 'economy', icon: Zap, label: 'Economy', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', ring: 'rgba(245,158,11,0.1)' },
                  { k: 'local', icon: Home, label: 'محلي', color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', ring: 'rgba(59,130,246,0.1)' },
                  { k: 'import', icon: DownloadCloud, label: 'استيراد', color: '#8b5cf6', bg: 'rgba(139,92,246,0.08)', ring: 'rgba(139,92,246,0.1)' },
                  { k: 'export', icon: UploadCloud, label: 'تصدير', color: '#10b981', bg: 'rgba(16,185,129,0.08)', ring: 'rgba(16,185,129,0.1)' },
                ] as const).map(({ k, icon: Icon, label, color, bg, ring }) => (
                  <button
                    key={k}
                    type="button"
                    className={`${styles.calcTypeBtn} ${calcKind === k ? styles.calcTypeBtnActive : ''}`}
                    style={calcKind === k ? { '--calc-color': color, '--calc-bg': bg, '--calc-ring': ring } as any : undefined}
                    onClick={() => setCalcKind(k)}
                  >
                    <Icon size={22} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}><MapPin size={12} /> المسار — من</label>
                <SearchableSelect
                  options={countryOptions}
                  value={routeFromValue}
                  onChange={(val) => setRouteFromUser(val)}
                  placeholder="اختر الدولة..."
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}><MapPin size={12} /> المسار — إلى</label>
                <SearchableSelect
                  options={countryOptions}
                  value={routeToValue}
                  onChange={(val) => setRouteToUser(val)}
                  placeholder="اختر الدولة..."
                />
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}><Hash size={12} /> الزون التلقائي</label>
                {zoneInfo ? (
                  <div className={`${styles.zoneBadge} ${styles.zoneBadgeActive}`}>
                    Zone {zoneInfo.label} — {zoneInfo.name}
                  </div>
                ) : (
                  <div className={`${styles.zoneBadge} ${styles.zoneBadgeEmpty}`}>Zone —</div>
                )}
              </div>
            </div>
          </div>

          {/* Weight & Dimensions */}
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon} style={{ background: '#fef3c7', color: '#d97706' }}>
                <Package size={18} />
              </div>
              <div className={styles.sectionTitle}>الوزن والأبعاد</div>
            </div>
            <div className={`${styles.sectionBody} ${styles.sectionBodySingle}`}>
              <div className={styles.field}>
                <label className={styles.fieldLabel}><Weight size={12} /> الوزن الفعلي ({calcDimUnit === 'metric' ? 'كجم' : 'باوند'})</label>
                <input
                  className={`${styles.fieldInput} ${styles.fieldMono}`}
                  value={calcWeight}
                  onChange={(e) => setCalcWeight(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.0"
                  dir="ltr"
                />
              </div>

              <div className={styles.field}>
                <div className="flex justify-between items-center mb-1">
                  <label className={styles.fieldLabel}><Ruler size={12} /> الأبعاد ({calcDimUnit === 'metric' ? 'سم' : 'إنش'}) — ط × ع × ر</label>
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 p-0.5 rounded-lg border border-gray-200 dark:border-slate-700">
                    <button type="button" onClick={() => setCalcDimUnit('metric')} className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${calcDimUnit === 'metric' ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}>سم</button>
                    <button type="button" onClick={() => setCalcDimUnit('imperial')} className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${calcDimUnit === 'imperial' ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}>إنش</button>
                  </div>
                </div>
                <div className={styles.dimsGrid}>
                  <input className={`${styles.dimsInput}`} value={calcLength} onChange={(e) => setCalcLength(e.target.value)} inputMode="decimal" placeholder="ط" dir="ltr" />
                  <input className={`${styles.dimsInput}`} value={calcWidth} onChange={(e) => setCalcWidth(e.target.value)} inputMode="decimal" placeholder="ع" dir="ltr" />
                  <input className={`${styles.dimsInput}`} value={calcHeight} onChange={(e) => setCalcHeight(e.target.value)} inputMode="decimal" placeholder="ر" dir="ltr" />
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.fieldLabel}><Box size={12} /> الكمية (طرود)</label>
                <input className={`${styles.fieldInput} ${styles.fieldMono}`} value={calcQty} onChange={(e) => setCalcQty(e.target.value)} inputMode="numeric" placeholder="1" dir="ltr" />
              </div>

              <div className={styles.rangeGroup}>
                <div className={styles.rangeHeader}>
                  <span>تسعيرة الوقود</span>
                  <span className={styles.rangeValue}>{calcFuelPct}%</span>
                </div>
                <input type="range" className={styles.rangeInput} min={0} max={60} value={calcFuelPct} onChange={(e) => setCalcFuelPct(Number(e.target.value))} />
              </div>

              <div className={styles.rangeGroup}>
                <div className={styles.rangeHeader}>
                  <span>هامش الربح التشغيلي</span>
                  <span className={styles.rangeValue}>{calcMarginPct}%</span>
                </div>
                <input type="range" className={styles.rangeInput} min={0} max={100} value={calcMarginPct} onChange={(e) => setCalcMarginPct(Number(e.target.value))} />
              </div>
            </div>
          </div>
        </div>

        {/* Calc Result */}
        {calcResult && (
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionIcon} style={{ background: '#f0fdf4', color: '#16a34a' }}>
                <CheckCircle2 size={18} />
              </div>
              <div className={styles.sectionTitle}>نتيجة الحساب</div>
            </div>
            <div className={`${styles.sectionBody} ${styles.sectionBodySingle}`}>
              <div className={styles.calcPanel}>
                <div className={styles.calcResult}>
                  <span className={styles.calcResultLabel}>الزون الجغرافي</span>
                  <span className={styles.calcResultValue}>Zone {calcResult.zoneLabel}</span>
                  <span className={styles.calcResultLabel}>تكلفة DHL الاستخراجية</span>
                  <span className={styles.calcResultValue}>{calcResult.baseRate.toFixed(2)} ر.س</span>
                  <span className={styles.calcResultLabel}>رسوم الوقود ({calcResult.fuelPct}%)</span>
                  <span className={styles.calcResultValue} style={{ color: '#dc2626' }}>+{calcResult.fuelAmt.toFixed(2)} ر.س</span>
                  <span className={styles.calcResultLabel}>رسوم GoGreen المناخية</span>
                  <span className={styles.calcResultValue} style={{ color: '#16a34a' }}>+{calcResult.goGreen.toFixed(2)} ر.س</span>
                  <span className={styles.calcResultLabel}>صافي الربح المُقدر ({calcResult.profitPct}%)</span>
                  <span className={styles.calcResultValue} style={{ color: '#6366f1' }}>+{calcResult.markup.toFixed(2)} ر.س</span>
                </div>
                <div className={styles.calcTotal}>
                  <span className={styles.calcTotalLabel}>السعر النهائي للعميل</span>
                  <span className={styles.calcTotalValue}>{calcResult.total.toFixed(2)} ر.س</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {calcError && (
          <div className={styles.errorAlert}>
            <AlertCircle size={16} /> {calcError}
          </div>
        )}

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <button type="button" className={styles.btnBack} onClick={() => setStep(0)}>
              <ArrowRight size={16} /> تغيير الطريقة
            </button>
          </div>
          <div className={styles.footerRight}>
            <button type="button" className={styles.btnCalc} onClick={handleCalcAndContinue}>
              <Calculator size={18} /> احسب وانتقل لبيانات العميل
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Step 2: Full Invoice Data Entry ───
  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.headerTitle}>بيانات الفاتورة الكاملة</div>
          <div className={styles.headerSubtitle}>أدخل جميع بيانات العميل والشحنة والمبلغ لإصدار الفاتورة</div>
        </div>
        <div className={styles.invoiceIdBadge}>
          <div>
            <div className={styles.invoiceIdLabel}>رقم الفاتورة</div>
            {loadingId ? (
              <div className={styles.invoiceIdLoading} />
            ) : (
              <div className={styles.invoiceIdValue}>#{nextInvoiceNumber || '...'}</div>
            )}
          </div>
        </div>
      </div>

      {/* Steps Bar */}
      {mode === 'calc' && (
        <div className={styles.stepsBar}>
          <div className={`${styles.stepItem} ${styles.stepCompleted}`} onClick={() => setStep(1)}>
            <div className={styles.stepNumber}><CheckCircle2 size={14} /></div>
            <span>حاسبة الشحن</span>
          </div>
          <div className={`${styles.stepDivider} ${styles.stepDividerActive}`} />
          <div className={`${styles.stepItem} ${styles.stepActive}`}>
            <div className={styles.stepNumber}>2</div>
            <span>بيانات العميل والفاتورة</span>
          </div>
        </div>
      )}

      {/* ─── Price Summary (if available from calc) ─── */}
      {draft.price && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon} style={{ background: '#fef3c7', color: '#d97706' }}>
              <Banknote size={18} />
            </div>
            <div className={styles.sectionTitle}>ملخص التسعيرة</div>
          </div>
          <div className={`${styles.sectionBody} ${styles.sectionBodySingle}`}>
            <div className={styles.calcPanel}>
              <div className={styles.calcTotal} style={{ border: 'none', paddingTop: 0, marginTop: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {draft.weight && <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', background: '#f3f4f6', padding: '0.25rem 0.625rem', borderRadius: '0.375rem' }}>{draft.weight} كجم</span>}
                  <span className={styles.calcTotalLabel}>إجمالي التسعيرة</span>
                </div>
                <span className={styles.calcTotalValue}>{draft.price} ر.س</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={styles.contentGrid}>
        {/* ─── Client Info ─── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon} style={{ background: '#eef2ff', color: '#4f46e5' }}>
              <User size={18} />
            </div>
            <div className={styles.sectionTitle}>بيانات العميل</div>
          </div>
          <div className={styles.sectionBody} style={{ gridTemplateColumns: '1fr' }}>
            <SearchableClientInput
              nameValue={draft.client}
              phoneValue={draft.phone}
              onNameChange={(val) => setDraft((p) => ({ ...p, client: val }))}
              onPhoneChange={(val) => setDraft((p) => ({ ...p, phone: val }))}
              onSelect={(name, phone) => setDraft((p) => ({ ...p, client: name, phone: phone }))}
            />
          </div>
        </div>

        {/* ─── Shipment Details ─── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon} style={{ background: '#fef3c7', color: '#d97706' }}>
              <Package size={18} />
            </div>
            <div className={styles.sectionTitle}>تفاصيل الشحنة</div>
          </div>
          <div className={styles.sectionBody}>
            <div className={styles.field}>
              <label className={styles.fieldLabel}><ClipboardList size={12} /> تصنيف بند الفاتورة</label>
              <select className={styles.fieldSelect} value={draft.itemType} onChange={(e) => setDraft((p) => ({ ...p, itemType: e.target.value }))}>
                <option value="شحن دولي">شحن دولي (استيراد/تصدير)</option>
                <option value="شحن داخلي">شحن داخلي محلي</option>
                <option value="تغيير عنوان">رسوم تغيير عنوان</option>
                <option value="فرق وزن">رسوم فرق وزن</option>
                <option value="توصيل">خدمات توصيل</option>
                <option value="أخرى">أخرى</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}><Truck size={12} /> الناقل اللوجستي</label>
              <select className={styles.fieldSelect} value={draft.carrier} onChange={(e) => setDraft((p) => ({ ...p, carrier: e.target.value }))}>
                <option value="">بدون ناقل / غير محدد</option>
                <option value="DHL Express">DHL Express قطاع الأعمال</option>
                <option value="Aramex">Aramex</option>
                <option value="FedEx">FedEx</option>
                <option value="SMSA">SMSA</option>
                <option value="Naqel">Naqel</option>
                <option value="J&T Express">J&T Express</option>
                <option value="أخرى">أخرى</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}><FileText size={12} /> رقم التتبع البوليصة AWB</label>
              <input className={`${styles.fieldInput} ${styles.fieldMono}`} value={draft.awb} onChange={(e) => setDraft((p) => ({ ...p, awb: e.target.value }))} placeholder="XXXXXXXXXX" dir="ltr" style={{ textAlign: 'left' }} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}><Weight size={12} /> وزن المحاسبة (كجم)</label>
              <input className={`${styles.fieldInput} ${styles.fieldMono}`} value={draft.weight} onChange={(e) => setDraft((p) => ({ ...p, weight: e.target.value }))} placeholder="0.0" dir="ltr" style={{ textAlign: 'left' }} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}><Ruler size={12} /> الأبعاد (سم)</label>
              <input className={`${styles.fieldInput} ${styles.fieldMono}`} value={draft.dimensions} onChange={(e) => setDraft((p) => ({ ...p, dimensions: e.target.value }))} placeholder="طول × عرض × ارتفاع" dir="ltr" style={{ textAlign: 'left' }} />
            </div>
          </div>
        </div>

        {/* ─── Financial ─── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon} style={{ background: '#f0fdf4', color: '#16a34a' }}>
              <CreditCard size={18} />
            </div>
            <div className={styles.sectionTitle}>بيانات المالية والسداد</div>
          </div>
          <div className={styles.sectionBody}>
            <div className={`${styles.field} ${styles.priceField}`}>
              <label className={styles.fieldLabel}><Banknote size={12} /> القيمة النهائية (ر.س)</label>
              <input ref={priceRef} className={`${styles.fieldInput} ${styles.fieldMono}`} value={draft.price} onChange={(e) => setDraft((p) => ({ ...p, price: e.target.value }))} placeholder="0.00" dir="ltr" style={{ textAlign: 'left' }} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}><Banknote size={12} /> تكلفة الناقل الأصلية</label>
              <input className={`${styles.fieldInput} ${styles.fieldMono}`} value={draft.dhlCost} onChange={(e) => setDraft((p) => ({ ...p, dhlCost: e.target.value }))} placeholder="0.00" dir="ltr" style={{ textAlign: 'left' }} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}><Calendar size={12} /> تاريخ الفاتورة</label>
              <input type="date" className={`${styles.fieldInput} ${styles.fieldMono}`} value={draft.date} onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))} dir="ltr" style={{ textAlign: 'left' }} />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel}>حالة السداد</label>
              <select className={styles.fieldSelect} value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value as InvoiceStatus }))}>
                <option value="unpaid">لم يتم الدفع بعد 🔴</option>
                <option value="partial">دفعة مقدمة / عربون 🟡</option>
                <option value="paid">مسددة بالكامل ✅</option>
                <option value="returned">مرتجعة 🟣</option>
              </select>
            </div>
            {draft.status === 'partial' && (
              <div className={`${styles.field} ${styles.priceField}`}>
                <label className={styles.fieldLabel}>المبلغ المدفوع جزئياً (ر.س)</label>
                <input className={`${styles.fieldInput} ${styles.fieldMono}`} value={draft.partialPaid} onChange={(e) => setDraft((p) => ({ ...p, partialPaid: e.target.value }))} placeholder="0.00" dir="ltr" style={{ textAlign: 'left' }} />
              </div>
            )}
            <div className={styles.field}>
              <label className={styles.fieldLabel}>مسار الدفع</label>
              <select className={styles.fieldSelect} value={draft.payment} onChange={(e) => setDraft((p) => ({ ...p, payment: e.target.value }))}>
                <option value="">بدون مسار / قيد الانتظار</option>
                <option value="تحويل بنكي">تحويل مباشر للحساب البنكي</option>
                <option value="سداد إلكتروني">عبر روابط الدفع (Paymob)</option>
              </select>
            </div>
          </div>
        </div>

        {/* ─── Shipping Info (Shipper / Receiver) ─── */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon} style={{ background: '#ede9fe', color: '#7c3aed' }}>
              <Truck size={18} />
            </div>
            <div className={styles.sectionTitle}>معلومات التوجيه اللوجستية</div>
          </div>
          <div className={`${styles.sectionBody} ${styles.sectionBodySingle}`}>
            <div className={`${styles.toggleRow} ${styles.fullWidth}`}>
              <input type="checkbox" className={styles.toggleCheckbox} checked={draft.shipperSameAsClient} onChange={(e) => setDraft((p) => ({ ...p, shipperSameAsClient: e.target.checked }))} />
              <span className={styles.toggleLabel}>نفس بيانات العميل للإرسال (Shipper = Client)</span>
            </div>

            {!draft.shipperSameAsClient && (
              <>
                <div className={`${styles.fullWidth}`} style={{ paddingTop: '0.5rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', marginBottom: '0.75rem' }}>بيانات المُرسل (Shipper)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>الاسم</label>
                      <input className={styles.fieldInput} value={draft.shipperName} onChange={(e) => setDraft((p) => ({ ...p, shipperName: e.target.value }))} placeholder="الاسم" />
                    </div>
                    <div className={styles.field}>
                      <label className={styles.fieldLabel}>الجوال</label>
                      <input className={`${styles.fieldInput} ${styles.fieldMono}`} value={draft.shipperPhone} onChange={(e) => setDraft((p) => ({ ...p, shipperPhone: e.target.value }))} placeholder="الجوال" dir="ltr" style={{ textAlign: 'left' }} />
                    </div>
                    <div className={`${styles.field} ${styles.fullWidth}`}>
                      <label className={styles.fieldLabel}>العنوان</label>
                      <input className={styles.fieldInput} value={draft.shipperAddress} onChange={(e) => setDraft((p) => ({ ...p, shipperAddress: e.target.value }))} placeholder="العنوان كاملاً" />
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className={styles.fullWidth} style={{ paddingTop: '0.5rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6b7280', marginBottom: '0.75rem' }}>بيانات المُستلم (Receiver)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>الاسم الكامل</label>
                  <input className={styles.fieldInput} value={draft.receiverName} onChange={(e) => setDraft((p) => ({ ...p, receiverName: e.target.value }))} placeholder="الاسم الكامل" />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>رقم الجوال</label>
                  <input className={`${styles.fieldInput} ${styles.fieldMono}`} value={draft.receiverPhone} onChange={(e) => setDraft((p) => ({ ...p, receiverPhone: e.target.value }))} placeholder="جوال المستلم" dir="ltr" style={{ textAlign: 'left' }} />
                </div>
                <div className={styles.field}>
                  <label className={styles.fieldLabel}>الدولة</label>
                  <select className={styles.fieldSelect} value={draft.receiverCountry} onChange={(e) => setDraft((p) => ({ ...p, receiverCountry: e.target.value }))}>
                    {addressCountryOptions.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
                  </select>
                </div>
                <div className={`${styles.field}`}>
                  <label className={styles.fieldLabel}>العنوان التفصيلي</label>
                  <input className={styles.fieldInput} value={draft.receiverAddress} onChange={(e) => setDraft((p) => ({ ...p, receiverAddress: e.target.value }))} placeholder="المدينة، الحي، الشارع" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Notes (Full Width) ─── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionIcon} style={{ background: '#f3f4f6', color: '#6b7280' }}>
            <FileText size={18} />
          </div>
          <div className={styles.sectionTitle}>ملاحظات ووصف الفاتورة</div>
        </div>
        <div className={`${styles.sectionBody} ${styles.sectionBodySingle}`}>
          <div className={`${styles.field} ${styles.fullWidth}`}>
            <textarea
              className={styles.fieldTextarea}
              rows={5}
              value={draft.details}
              onChange={(e) => setDraft((p) => ({ ...p, details: e.target.value }))}
              placeholder="اكتب الملاحظات والتفاصيل هنا..."
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.footerLeft}>
          <button type="button" className={styles.btnBack} onClick={() => setStep(mode === 'calc' ? 1 : 0)}>
            <ArrowRight size={16} /> {mode === 'calc' ? 'العودة للحاسبة' : 'تغيير الطريقة'}
          </button>
        </div>
        <div className={styles.footerRight}>
          <button
            type="button"
            className={styles.btnDraft}
            onClick={() => void handleSave(true)}
            disabled={saving || !canSubmit}
          >
            حفظ كمسودة
          </button>
          <button
            type="button"
            className={styles.btnSubmit}
            onClick={() => void handleSave(false)}
            disabled={saving || !canSubmit}
          >
            {saving ? <div className={styles.spinner} /> : <Save size={18} />}
            إصدار الفاتورة النهائية
          </button>
        </div>
      </div>
    </div>
  )
}
