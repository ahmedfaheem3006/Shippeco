import { useCalculatorPage } from '../hooks/useCalculatorPage'
import {
  Calculator, Zap, Home, DownloadCloud, UploadCloud, MapPin,
  CheckCircle2, RotateCcw, AlertCircle, Package, Hash, X
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

            <div className={styles.field}>
              <label className={styles.fieldLabel}><Package size={12} /> نوع الشحنة</label>
              <select
                className={styles.fieldInput}
                value={calc.shipmentType}
                onChange={(e) => calc.setShipmentType(e.target.value as any)}
              >
                <option value="non-doc">بضاعة (Non-Document)</option>
                <option value="doc">مستندات (Document)</option>
                <option value="envelope">مغلف (Envelope)</option>
              </select>
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
            <div className="flex justify-between items-center mb-2">
              <label className={styles.fieldLabel}>الطرود والأوزان</label>
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 p-0.5 rounded-lg border border-gray-200 dark:border-slate-700">
                <button type="button" onClick={() => calc.setDimUnit('metric')} className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${calc.dimUnit === 'metric' ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}>سم/كجم</button>
                <button type="button" onClick={() => calc.setDimUnit('imperial')} className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-colors ${calc.dimUnit === 'imperial' ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}>إنش/باوند</button>
              </div>
            </div>

            {calc.pieces.map((piece, i) => (
              <div key={i} className="flex flex-col gap-2 p-3 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 mb-3 relative">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-gray-500">طرد #{i + 1}</span>
                  {calc.pieces.length > 1 && (
                    <button type="button" onClick={() => calc.removePiece(i)} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1 rounded-md transition-colors"><X size={14}/></button>
                  )}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 flex flex-col">
                    <span className="text-[10px] text-gray-400 mb-1">الوزن ({calc.dimUnit === 'metric' ? 'كجم' : 'باوند'})</span>
                    <input className={`${styles.fieldInput} ${styles.fieldMono} text-sm py-1.5`} value={piece.weight} onChange={(e) => calc.updatePiece(i, { weight: e.target.value })} inputMode="decimal" placeholder="0.0" dir="ltr" />
                  </div>
                  <div className="flex-1 flex flex-col">
                    <span className="text-[10px] text-gray-400 mb-1">الكمية</span>
                    <input className={`${styles.fieldInput} ${styles.fieldMono} text-sm py-1.5`} value={piece.qty} onChange={(e) => calc.updatePiece(i, { qty: e.target.value })} inputMode="numeric" placeholder="1" dir="ltr" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-400 mb-1">الأبعاد ({calc.dimUnit === 'metric' ? 'سم' : 'إنش'}) ط × ع × ر</span>
                  <div className={styles.dimsGrid}>
                    <input className={`${styles.dimsInput} py-1.5`} value={piece.l} onChange={(e) => calc.updatePiece(i, { l: e.target.value })} inputMode="decimal" placeholder="طول" dir="ltr" />
                    <input className={`${styles.dimsInput} py-1.5`} value={piece.w} onChange={(e) => calc.updatePiece(i, { w: e.target.value })} inputMode="decimal" placeholder="عرض" dir="ltr" />
                    <input className={`${styles.dimsInput} py-1.5`} value={piece.h} onChange={(e) => calc.updatePiece(i, { h: e.target.value })} inputMode="decimal" placeholder="ارتفاع" dir="ltr" />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" onClick={calc.addPiece} className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-xl text-gray-500 font-bold text-sm mb-4 hover:border-indigo-500 hover:text-indigo-600 transition-colors bg-white dark:bg-slate-800">+ إضافة طرد آخر</button>

            {/* Surcharges */}
            <div className="mb-4 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
              <div className="px-3 py-2 bg-gray-100/50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700 flex items-center gap-2">
                <AlertCircle size={14} className="text-gray-500" />
                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">رسوم إضافية يدوية (اختياري)</span>
              </div>
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-bold text-gray-600 dark:text-gray-400">
                <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors">
                  <input type="checkbox" checked={calc.manualSurcharges.elevatedRisk} onChange={(e) => calc.setManualSurcharge('elevatedRisk', e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  Elevated Risk (خطر مرتفع)
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors">
                  <input type="checkbox" checked={calc.manualSurcharges.restrictedDestination} onChange={(e) => calc.setManualSurcharge('restrictedDestination', e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  Restricted Destination (وجهة مقيدة)
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors">
                  <input type="checkbox" checked={calc.manualSurcharges.overweight} onChange={(e) => calc.setManualSurcharge('overweight', e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  Overweight Piece {'>'} 70kg
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors">
                  <input type="checkbox" checked={calc.manualSurcharges.oversize} onChange={(e) => calc.setManualSurcharge('oversize', e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  Oversize Piece {'>'} 120cm
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors">
                  <input type="checkbox" checked={calc.manualSurcharges.nonConveyable} onChange={(e) => calc.setManualSurcharge('nonConveyable', e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  Non-Conveyable (غير قابل للحزام)
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors">
                  <input type="checkbox" checked={calc.manualSurcharges.nonStackable} onChange={(e) => calc.setManualSurcharge('nonStackable', e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  Non-Stackable Pallet (طبلية)
                </label>
                <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors">
                  <input type="checkbox" checked={calc.manualSurcharges.remoteArea} onChange={(e) => calc.setManualSurcharge('remoteArea', e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  Remote Area (منطقة نائية)
                </label>
              </div>
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
                <span className={styles.calcResultLabel}>الوزن الفعلي / الحجمي</span>
                <span className={styles.calcResultValue} dir="ltr">{calc.result.actualKg} kg / {calc.result.volumetricKg} kg</span>
                <span className={styles.calcResultLabel}>وزن المحاسبة</span>
                <span className={styles.calcResultValue} dir="ltr">{calc.result.chargeableKg} kg</span>
                <span className={styles.calcResultLabel}>تكلفة DHL الأساسية</span>
                <span className={styles.calcResultValue}>{calc.result.baseRate.toFixed(2)} ر.س</span>
                <span className={styles.calcResultLabel}>رسوم الوقود ({calc.result.fuelPct}%)</span>
                <span className={styles.calcResultValue} style={{ color: '#dc2626' }}>+{calc.result.fuelAmt.toFixed(2)} ر.س</span>
                <span className={styles.calcResultLabel}>رسوم GoGreen المناخية</span>
                <span className={styles.calcResultValue} style={{ color: '#16a34a' }}>+{calc.result.goGreen.toFixed(2)} ر.س</span>
                {calc.result.surcharges.totalSurcharges > 0 && (
                  <>
                    <span className={styles.calcResultLabel}>رسوم إضافية (Surcharges)</span>
                    <span className={styles.calcResultValue} style={{ color: '#d97706' }}>+{calc.result.surcharges.totalSurcharges.toFixed(2)} ر.س</span>
                  </>
                )}
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
