import { useCalculatorPage } from '../hooks/useCalculatorPage'
import {
  Calculator, Zap, Home, DownloadCloud, UploadCloud, MapPin,
  CheckCircle2, RotateCcw, AlertCircle, Package, Hash, X
} from 'lucide-react'
import { SearchableSelect } from '../components/shared/SearchableSelect'
import { SURCHARGE_DEFS, computeAutoSurcharges } from '../utils/surcharges'
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

            {/* Surcharges moved to Result Panel */}

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

      {calc.result && (() => {
        const { autoState, counts } = computeAutoSurcharges(calc.result.foreignCountry, calc.result.pieces, calc.result.dimUnit)
        
        let surchargeTotal = 0;
        const activeSurcharges: Record<string, boolean> = {};

        SURCHARGE_DEFS.forEach(def => {
          let autoTriggered = false;
          if (def.type === 'auto') {
            autoTriggered = autoState[def.id];
          }
          const isChecked = calc.surchargesState[def.id] !== undefined ? calc.surchargesState[def.id] : autoTriggered;
          activeSurcharges[def.id] = isChecked;

          if (isChecked) {
            const count = def.perPiece ? ((counts as any)[def.id] || 1) : 1;
            surchargeTotal += def.feeBase * count;
          }
        });

        const grandTotal = calc.result.total + surchargeTotal;

        return (
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
                  <span className={styles.calcResultLabel}>صافي الربح المُقدر ({calc.result.profitPct}%)</span>
                  <span className={styles.calcResultValue} style={{ color: '#6366f1' }}>+{calc.result.markup.toFixed(2)} ر.س</span>
                </div>
                
                {/* Final Final Base Price before Surcharges (as in the new design) */}
                <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-4 text-center mt-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">السعر الأساسي (قبل الرسوم الإضافية)</div>
                  <div className="text-3xl font-bold text-amber-500 font-mono">
                    <span className="text-lg text-gray-400 mr-1 font-sans">ر.س</span>
                    {calc.result.total.toFixed(2)}
                  </div>
                </div>

                {/* Surcharges Section inside Result Panel */}
                <div className="mt-5">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-red-600 rounded-full"></div>
                    رسوم إضافية
                  </div>
                  <div className="flex flex-col gap-2">
                    {SURCHARGE_DEFS.map(def => {
                      let autoTriggered = false;
                      if (def.type === 'auto') autoTriggered = autoState[def.id];
                      const isChecked = activeSurcharges[def.id];
                      const count = def.perPiece ? ((counts as any)[def.id] || 0) : null;
                      const feeBase = def.feeBase;
                      const amountStr = (def.perPiece && count && count > 1) 
                        ? `${feeBase.toFixed(2)} × ${count} = ${(feeBase * count).toFixed(2)} ر.س`
                        : `${feeBase.toFixed(2)} ر.س`;

                      return (
                        <div 
                          key={def.id}
                          onClick={() => calc.toggleSurcharge(def.id)}
                          className={`flex items-center gap-3 bg-white dark:bg-slate-900 border rounded-xl p-3 cursor-pointer transition-colors select-none ${
                            isChecked 
                              ? 'border-red-500 bg-red-50/50 dark:bg-red-900/10' 
                              : autoTriggered 
                                ? 'border-amber-500 bg-amber-50/30 dark:bg-amber-900/10'
                                : 'border-gray-200 dark:border-slate-700 hover:border-red-300'
                          }`}
                        >
                          <div className={`w-5 h-5 min-w-[20px] rounded border-2 flex items-center justify-center transition-colors ${
                            isChecked ? 'bg-red-600 border-red-600 text-white' : 
                            autoTriggered ? 'border-amber-500 text-transparent' : 'border-gray-300 text-transparent'
                          }`}>
                            <CheckCircle2 size={14} />
                          </div>
                          <div className="flex-1">
                            <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                              {def.nameAr} <span className="text-gray-400 font-normal text-[11px]">{def.name}</span>
                            </div>
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              {def.desc} {count !== null && count > 0 && <span className="font-bold text-gray-700 dark:text-gray-300 ml-1">— {count} طرد</span>}
                            </div>
                          </div>
                          {autoTriggered && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 whitespace-nowrap">
                              تلقائي
                            </span>
                          )}
                          <div className="text-[13px] font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                            {amountStr}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-gradient-to-br from-slate-900 to-black rounded-xl p-6 text-center mt-4 border border-gray-800 shadow-xl">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">السعر الإجمالي للعميل (شامل الرسوم)</div>
                  <div className="text-4xl font-bold text-amber-400 font-mono tracking-tight">
                    <span className="text-lg text-gray-500 mr-1 font-sans">ر.س</span>
                    {grandTotal.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
