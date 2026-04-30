import { useCalculatorPage } from '../hooks/useCalculatorPage'
import {
  Calculator, Zap, Home, DownloadCloud, UploadCloud, MapPin,
  Box, CheckCircle2, RotateCcw, AlertCircle, Package, Hash, Weight, Ruler
} from 'lucide-react'
import { SearchableSelect } from '../components/shared/SearchableSelect'
import styles from './NewInvoicePage.module.css'

export function CalculatorPage() {
  const calc = useCalculatorPage()

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <div className={styles.headerTitle}>حاسبة DHL المتقدمة</div>
          <div className={styles.headerSubtitle}>احسب سعر الشحن الدولي أو المحلي بناءً على الوزن والوجهة بدقة واحترافية</div>
        </div>
        <div className={styles.invoiceIdBadge}>
          <button 
            type="button" 
            onClick={calc.reset}
            className="flex items-center gap-1.5 font-bold transition-all hover:text-white text-white/80 p-1"
          >
            <RotateCcw size={16} />
            <span className="text-sm">إعادة ضبط</span>
          </button>
        </div>
      </div>

      <div className={styles.contentGrid}>
        {/* Shipping Type & Route */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon} style={{ background: '#eef2ff', color: '#4f46e5' }}>
              <DownloadCloud size={18} />
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
                  className={`${styles.calcTypeBtn} ${calc.kind === k ? styles.calcTypeBtnActive : ''}`}
                  style={calc.kind === k ? { '--calc-color': color, '--calc-bg': bg, '--calc-ring': ring } as any : undefined}
                  onClick={() => calc.setKind(k)}
                >
                  <Icon size={22} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}><MapPin size={12} /> المسار — من</label>
              <SearchableSelect
                options={calc.countryOptions}
                value={calc.routeFrom}
                onChange={calc.setRouteFromUser}
                placeholder="اختر الدولة..."
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}><MapPin size={12} /> المسار — إلى</label>
              <SearchableSelect
                options={calc.countryOptions}
                value={calc.routeTo}
                onChange={calc.setRouteToUser}
                placeholder="اختر الدولة..."
              />
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}><Hash size={12} /> الزون التلقائي</label>
              {calc.zoneInfo ? (
                <div className={`${styles.zoneBadge} ${styles.zoneBadgeActive}`}>
                  Zone {calc.zoneInfo.label} — {calc.zoneInfo.name}
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
              <label className={styles.fieldLabel}><Weight size={12} /> الوزن الفعلي (كجم)</label>
              <input
                className={`${styles.fieldInput} ${styles.fieldMono}`}
                value={calc.pieces[0].weight}
                onChange={(e) => calc.updatePiece(0, { weight: e.target.value })}
                inputMode="decimal"
                placeholder="0.0"
                dir="ltr"
              />
            </div>

            <div className={styles.field}>
              <div className="flex justify-between items-center mb-2">
                <label className={styles.fieldLabel} style={{ marginBottom: 0 }}><Ruler size={12} /> الأبعاد — طول × عرض × ارتفاع</label>
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg">
                  <button type="button" onClick={() => calc.setDimUnit('metric')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${calc.dimUnit === 'metric' ? 'bg-white dark:bg-slate-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>سم (cm)</button>
                  <button type="button" onClick={() => calc.setDimUnit('imperial')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-colors ${calc.dimUnit === 'imperial' ? 'bg-white dark:bg-slate-600 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>إنش (inch)</button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input className={styles.fieldInput} value={calc.pieces[0].l} onChange={(e) => calc.updatePiece(0, { l: e.target.value })} inputMode="decimal" placeholder="ط" dir="ltr" />
                <input className={styles.fieldInput} value={calc.pieces[0].w} onChange={(e) => calc.updatePiece(0, { w: e.target.value })} inputMode="decimal" placeholder="ع" dir="ltr" />
                <input className={styles.fieldInput} value={calc.pieces[0].h} onChange={(e) => calc.updatePiece(0, { h: e.target.value })} inputMode="decimal" placeholder="ر" dir="ltr" />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.fieldLabel}><Box size={12} /> الكمية (طرود)</label>
              <input className={`${styles.fieldInput} ${styles.fieldMono}`} value={calc.pieces[0].qty} onChange={(e) => calc.updatePiece(0, { qty: e.target.value })} inputMode="numeric" placeholder="1" dir="ltr" />
            </div>

            <div className={styles.rangeGroup}>
              <div className={styles.rangeHeader}>
                <span>رسوم الوقود (Fuel %)</span>
                <span className={styles.rangeValue}>{calc.fuelPct}%</span>
              </div>
              <input type="range" className={styles.rangeInput} min={0} max={60} value={calc.fuelPct} onChange={(e) => calc.setFuelPct(Number(e.target.value))} />
            </div>

            <div className={styles.rangeGroup}>
              <div className={styles.rangeHeader}>
                <span>هامش الربح التشغيلي</span>
                <span className={styles.rangeValue}>{calc.profitPct}%</span>
              </div>
              <input type="range" className={styles.rangeInput} min={0} max={100} value={calc.profitPct} onChange={(e) => calc.setProfitPct(Number(e.target.value))} />
            </div>
            
            {calc.error && (
              <div className={styles.errorAlert}>
                <AlertCircle size={16} /> {calc.error}
              </div>
            )}
            
            <button type="button" className={styles.btnCalc} onClick={calc.calculate}>
              <Calculator size={18} /> احسب السعر فوراً
            </button>
          </div>
        </div>
      </div>

      {calc.result && (
        <div className={styles.section} style={{ animation: 'fadeSlideUp 0.3s ease-out' }}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionIcon} style={{ background: '#f0fdf4', color: '#16a34a' }}>
              <CheckCircle2 size={18} />
            </div>
            <div className={styles.sectionTitle}>نتيجة الحساب التفصيلية</div>
          </div>
          <div className={`${styles.sectionBody} ${styles.sectionBodySingle}`}>
            <div className={styles.calcPanel}>
              <div className={styles.calcResult}>
                <span className={styles.calcResultLabel}>الزون الجغرافي</span>
                <span className={styles.calcResultValue}>Zone {calc.result.zoneLabel}</span>
                <span className={styles.calcResultLabel}>وزن المحاسبة</span>
                <span className={styles.calcResultValue}>{calc.result.chargeableKg} كجم</span>
                <span className={styles.calcResultLabel}>تكلفة DHL الأساسية</span>
                <span className={styles.calcResultValue}>{calc.result.baseRate.toFixed(2)} ر.س</span>
                <span className={styles.calcResultLabel}>رسوم الوقود ({calc.result.fuelPct}%)</span>
                <span className={styles.calcResultValue} style={{ color: '#dc2626' }}>+{calc.result.fuelAmt.toFixed(2)} ر.س</span>
                <span className={styles.calcResultLabel}>رسوم GoGreen المناخية</span>
                <span className={styles.calcResultValue} style={{ color: '#16a34a' }}>+{calc.result.goGreen.toFixed(2)} ر.س</span>
                <span className={styles.calcResultLabel}>صافي الربح المُقدر ({calc.result.profitPct}%)</span>
                <span className={styles.calcResultValue} style={{ color: '#6366f1' }}>+{calc.result.markup.toFixed(2)} ر.س</span>
              </div>
              <div className={styles.calcTotal}>
                <span className={styles.calcTotalLabel}>السعر النهائي للعميل</span>
                <span className={styles.calcTotalValue}>{calc.result.total.toFixed(2)} ر.س</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
