import { useState } from 'react'
import { ChevronDown, Info, SlidersHorizontal, X, Zap } from 'lucide-react'
import {
  ACTIVITY_OPTIONS,
  type ClientFilterState,
  type ClientPreset,
  type FilterChip,
} from '../../utils/clientFilters'

type Props = {
  filters: ClientFilterState
  setFilter: <K extends keyof ClientFilterState>(key: K, value: ClientFilterState[K]) => void
  patchFilters: (patch: Partial<ClientFilterState>) => void
  presets: ClientPreset[]
  applyPreset: (p: ClientPreset) => void
  chips: FilterChip[]
  /** Chips for the page's other filters (search / segment / city). */
  extraChips: { id: string; label: string; onClear: () => void }[]
  hasAnyFilter: boolean
  clearAll: () => void
  total: number
  loading: boolean
}

const inputCls =
  'w-full min-w-0 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg px-2.5 py-2 text-xs font-inter text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30'
const labelCls = 'text-[11px] font-bold text-gray-500 dark:text-gray-400'
const sectionCls = 'rounded-xl border border-gray-100 dark:border-slate-700/70 p-3 space-y-2'
const titleCls = 'text-xs font-black text-gray-800 dark:text-gray-100'

function NumInput({ value, onChange, placeholder, suffix, label }: { value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string; label: string }) {
  return (
    <label className="flex items-center gap-1.5 min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
        placeholder={placeholder}
        aria-label={label}
        className={inputCls}
      />
      {suffix && <span className="text-[10px] font-bold text-gray-400 shrink-0">{suffix}</span>}
    </label>
  )
}

export function ClientFiltersPanel(p: Props) {
  const { filters: f, setFilter } = p
  const [open, setOpen] = useState(false)
  const count = p.chips.length

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${open || count ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/40' : 'bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-slate-700'}`}
        >
          <SlidersHorizontal size={14} /> فلاتر متقدمة
          {count > 0 && <span className="px-1.5 rounded-md bg-indigo-600 text-white font-inter">{count}</span>}
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
          {p.loading ? 'جاري التطبيق...' : <>النتائج: <span className="font-inter text-gray-900 dark:text-white">{p.total.toLocaleString('en-US')}</span> عميل</>}
        </span>
        {p.hasAnyFilter && (
          <button type="button" onClick={p.clearAll} className="mr-auto flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
            <X size={13} /> مسح جميع الفلاتر
          </button>
        )}
      </div>

      {/* Presets: each one only fills visible fields below */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-[11px] font-black text-gray-500 dark:text-gray-400"><Zap size={12} className="text-amber-500" /> اختصارات:</span>
        {p.presets.map((pr) => (
          <button
            key={pr.key}
            type="button"
            title={pr.hint}
            onClick={() => { p.applyPreset(pr); setOpen(true) }}
            className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 hover:border-indigo-300 hover:text-indigo-600"
          >
            {pr.label}
          </button>
        ))}
      </div>

      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 animate-in fade-in duration-150">
          <div className={sectionCls}>
            <div className={titleCls}>المستحقات</div>
            <select value={f.balance} onChange={(e) => setFilter('balance', e.target.value as ClientFilterState['balance'])} className={inputCls} aria-label="حالة الرصيد">
              <option value="">الكل</option>
              <option value="has">عليهم رصيد مستحق</option>
              <option value="none">لا توجد عليهم مستحقات</option>
            </select>
            <div className={labelCls}>المبلغ المستحق (ر.س)</div>
            <div className="flex items-center gap-2">
              <NumInput label="المستحق من" value={f.remainingMin} onChange={(v) => setFilter('remainingMin', v)} placeholder="من" />
              <NumInput label="المستحق إلى" value={f.remainingMax} onChange={(v) => setFilter('remainingMax', v)} placeholder="إلى" />
            </div>
          </div>

          <div className={sectionCls}>
            <div className={titleCls}>إجمالي التعامل (بدون المرتجعات)</div>
            <div className="flex items-center gap-2">
              <NumInput label="إجمالي التعامل من" value={f.revenueMin} onChange={(v) => setFilter('revenueMin', v)} placeholder="من" />
              <NumInput label="إجمالي التعامل إلى" value={f.revenueMax} onChange={(v) => setFilter('revenueMax', v)} placeholder="إلى" suffix="ر.س" />
            </div>
            <div className={labelCls}>نسبة التحصيل لا تقل عن</div>
            <NumInput label="نسبة التحصيل الدنيا" value={f.collectionMin} onChange={(v) => setFilter('collectionMin', v)} placeholder="مثال: 90" suffix="%" />
          </div>

          <div className={sectionCls}>
            <div className={titleCls}>الفواتير</div>
            <div className={labelCls}>عدد الفواتير</div>
            <div className="flex items-center gap-2">
              <NumInput label="عدد الفواتير من" value={f.invoicesMin} onChange={(v) => setFilter('invoicesMin', v)} placeholder="من" />
              <NumInput label="عدد الفواتير إلى" value={f.invoicesMax} onChange={(v) => setFilter('invoicesMax', v)} placeholder="إلى" />
            </div>
            <div className={labelCls}>فواتير غير مسددة/جزئية لا تقل عن</div>
            <NumInput label="عدد الفواتير غير المسددة" value={f.openMin} onChange={(v) => setFilter('openMin', v)} placeholder="مثال: 3" suffix="فاتورة" />
            <label className="flex items-center gap-2 text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
              <input type="checkbox" checked={f.allPaid} onChange={(e) => setFilter('allPaid', e.target.checked)} className="accent-indigo-600" />
              كل فواتيرهم مسددة
            </label>
          </div>

          <div className={sectionCls}>
            <div className={titleCls}>المتأخرات</div>
            <div className="flex items-center gap-2">
              <select value={f.overdue} onChange={(e) => setFilter('overdue', e.target.value as ClientFilterState['overdue'])} className={inputCls} aria-label="المتأخرات">
                <option value="">الكل</option>
                <option value="yes">لديهم متأخرات</option>
                <option value="no">بدون متأخرات</option>
              </select>
            </div>
            <div className={labelCls}>تُعد الفاتورة متأخرة إذا مضى على استحقاقها (أو تاريخها) أكثر من</div>
            <NumInput label="أيام التأخير" value={f.overdueDays} onChange={(v) => setFilter('overdueDays', v)} placeholder="30" suffix="يومًا" />
            <div className={labelCls}>قيمة المتأخرات لا تقل عن</div>
            <NumInput label="الحد الأدنى للمتأخرات" value={f.overdueMin} onChange={(v) => setFilter('overdueMin', v)} placeholder="مثال: 5000" suffix="ر.س" />
          </div>

          <div className={sectionCls}>
            <div className={titleCls}>النشاط (تاريخ الفاتورة)</div>
            <select
              value={f.activity}
              onChange={(e) => setFilter('activity', e.target.value as ClientFilterState['activity'])}
              className={inputCls}
              aria-label="فترة التعامل"
            >
              {ACTIVITY_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.key ? `لديهم فاتورة: ${o.label}` : 'أي وقت'}</option>)}
            </select>
            {f.activity === 'custom' && (
              <div className="flex items-center gap-2">
                <input type="date" aria-label="من تاريخ" value={f.activeFrom} max={f.activeTo || undefined} onChange={(e) => setFilter('activeFrom', e.target.value)} className={inputCls} />
                <input type="date" aria-label="إلى تاريخ" value={f.activeTo} min={f.activeFrom || undefined} onChange={(e) => setFilter('activeTo', e.target.value)} className={inputCls} />
              </div>
            )}
            <div className={labelCls}>لا يوجد تعامل منذ أكثر من</div>
            <NumInput label="أيام عدم التعامل" value={f.inactiveDays} onChange={(v) => setFilter('inactiveDays', v)} placeholder="مثال: 90" suffix="يومًا" />
          </div>

          <div className={sectionCls}>
            <div className={titleCls}>السداد</div>
            <div className={labelCls}>عليهم مستحقات ولم يُسجَّل لهم سداد منذ أكثر من</div>
            <NumInput label="أيام بدون سداد" value={f.noPaymentDays} onChange={(v) => setFilter('noPaymentDays', v)} placeholder="مثال: 60" suffix="يومًا" />
            <p className="flex items-start gap-1 text-[10px] text-gray-400 font-bold leading-relaxed">
              <Info size={12} className="shrink-0 mt-0.5" />
              يعتمد على السداد المسجل في النظام (المدفوعات وتاريخ السداد). الفواتير المسددة في دفترة فقط قد لا تحمل تاريخ سداد.
            </p>
          </div>
        </div>
      )}

      {(p.chips.length > 0 || p.extraChips.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-gray-100 dark:border-slate-700/60">
          <span className="text-[11px] font-black text-gray-500 dark:text-gray-400">الفلاتر المفعلة:</span>
          {p.extraChips.map((c) => (
            <span key={c.id} className="flex items-center gap-1 pr-2 pl-1 py-0.5 rounded-lg bg-gray-100 dark:bg-slate-700 text-[11px] font-bold text-gray-700 dark:text-gray-200">
              {c.label}
              <button type="button" onClick={c.onClear} className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-slate-600" aria-label={`إزالة ${c.label}`}><X size={11} /></button>
            </span>
          ))}
          {p.chips.map((c) => (
            <span key={c.id} className="flex items-center gap-1 pr-2 pl-1 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
              {c.label}
              <button type="button" onClick={() => p.patchFilters(c.clear)} className="p-0.5 rounded hover:bg-indigo-100 dark:hover:bg-indigo-800/40" aria-label={`إزالة ${c.label}`}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
