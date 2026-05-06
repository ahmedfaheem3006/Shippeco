// Frontend/src/pages/ReportsPage.tsx
import { useEffect } from 'react';
import { useReportsPage } from '../hooks/useReportsPage';
import {
  BarChart2, FileSpreadsheet, Download, RefreshCw,
  ChevronRight, ChevronLeft, Search, CheckCircle2,
  AlertCircle, AlertTriangle, CreditCard,
  Users, Truck, Package,
  RotateCcw,
} from 'lucide-react';
import { formatSar, formatNum, formatPct } from '../utils/reports';

// ═══════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════
const PERIODS = [
  { key: 'all', label: 'الكل' },
  { key: 'daily', label: 'يومي' },
  { key: 'weekly', label: 'أسبوعي' },
  { key: 'monthly', label: 'شهري' },
  { key: 'yearly', label: 'سنوي' },
  { key: 'custom', label: 'مخصص' },
] as const;

const STATUSES = [
  { key: 'all', label: 'الكل', icon: Package, color: 'text-gray-600 dark:text-gray-300' },
  { key: 'paid', label: 'مدفوعة', icon: CheckCircle2, color: 'text-green-600 dark:text-green-400' },
  { key: 'unpaid', label: 'غير مدفوعة', icon: AlertCircle, color: 'text-red-600 dark:text-red-400' },
  { key: 'partial', label: 'جزئية', icon: AlertTriangle, color: 'text-yellow-600 dark:text-yellow-500' },
  { key: 'returned', label: 'مرتجعة', icon: RotateCcw, color: 'text-purple-600 dark:text-purple-400' },
  { key: 'unpaid_all', label: 'غير محصّل', icon: CreditCard, color: 'text-indigo-600 dark:text-indigo-400' },
] as const;

const TONE_MAP: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  blue:   { bg: 'bg-blue-50 dark:bg-blue-900/10',    border: 'border-blue-100 dark:border-blue-800/20',    text: 'text-blue-700 dark:text-blue-400',    iconBg: 'bg-blue-100 dark:bg-blue-900/30' },
  green:  { bg: 'bg-green-50 dark:bg-green-900/10',   border: 'border-green-100 dark:border-green-800/20',  text: 'text-green-700 dark:text-green-400',  iconBg: 'bg-green-100 dark:bg-green-900/30' },
  red:    { bg: 'bg-red-50 dark:bg-red-900/10',       border: 'border-red-100 dark:border-red-800/20',      text: 'text-red-700 dark:text-red-400',      iconBg: 'bg-red-100 dark:bg-red-900/30' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/10', border: 'border-purple-100 dark:border-purple-800/20', text: 'text-purple-700 dark:text-purple-400', iconBg: 'bg-purple-100 dark:bg-purple-900/30' },
  amber:  { bg: 'bg-amber-50 dark:bg-amber-900/10',  border: 'border-amber-100 dark:border-amber-800/20',  text: 'text-amber-700 dark:text-amber-400',  iconBg: 'bg-amber-100 dark:bg-amber-900/30' },
  gray:   { bg: 'bg-gray-50 dark:bg-gray-900/10',    border: 'border-gray-200 dark:border-gray-700',       text: 'text-gray-700 dark:text-gray-400',    iconBg: 'bg-gray-100 dark:bg-gray-800' },
};

// ═══════════════════════════════════════════════════════════
//  Small Components
// ═══════════════════════════════════════════════════════════
/*
function MiniBarChart({ data, maxVal }: { data: number[]; maxVal: number }) {
  if (!data.length) return <div className="text-xs text-gray-400">لا توجد بيانات</div>;
  return (
    <div className="flex items-end gap-[2px] h-10 sm:h-12">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 bg-indigo-400/60 dark:bg-indigo-500/40 rounded-t-sm min-w-[3px] max-w-[14px] transition-all hover:bg-indigo-500 dark:hover:bg-indigo-400"
          style={{ height: `${Math.max(3, (v / (maxVal || 1)) * 100)}%` }}
          title={`${(v || 0).toLocaleString('en-US')} SAR`}
        />
      ))}
    </div>
  );
}
*/

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: 'bg-green-500', partial: 'bg-yellow-500', unpaid: 'bg-red-500', returned: 'bg-purple-500',
  };
  return <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full flex-shrink-0 ${colors[status] || 'bg-gray-400'}`} />;
}

function CollectionBar({ pct }: { pct: number }) {
  const safeP = Number(pct) || 0;
  const color = safeP >= 100 ? 'bg-green-500' : safeP > 0 ? 'bg-yellow-500' : 'bg-gray-200 dark:bg-slate-700';
  const textColor = safeP >= 100 ? 'text-green-700 dark:text-green-400' : safeP > 0 ? 'text-yellow-700 dark:text-yellow-400' : 'text-gray-400';
  return (
    <div className="flex items-center gap-1.5 sm:gap-2">
      <div className="w-14 sm:w-20 bg-gray-100 dark:bg-slate-700 h-2 sm:h-2.5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.min(100, safeP)}%` }} />
      </div>
      <span className={`text-[11px] sm:text-[13px] font-inter font-bold ${textColor}`}>
        {safeP.toLocaleString('en-US', { maximumFractionDigits: 1 })}%
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════
export function ReportsPage() {
  const rep = useReportsPage();

  useEffect(() => {
    void rep.refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-3 sm:space-y-5 animate-in fade-in duration-300 pb-24 sm:pb-20 lg:pb-0">

      {/* ═══ الهيدر ═══ */}
      <div className="flex flex-col gap-3 sm:gap-4 bg-white dark:bg-slate-800 p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 sm:p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg sm:rounded-xl border border-indigo-100 dark:border-indigo-800/20">
            <BarChart2 className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base sm:text-xl text-gray-900 dark:text-white">التقارير والتحليلات</h1>
            <p className="text-[11px] sm:text-sm text-gray-500 dark:text-gray-400 font-semibold mt-0.5 truncate">
              التقارير المالية وتحليلات الناقلين
              {rep.syncInfo && (
                <span className="text-indigo-500 mr-1 sm:mr-2">· {formatNum(rep.syncInfo.total_invoices)} فاتورة</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex-1 flex justify-center items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-lg sm:rounded-xl transition-all border border-green-200 dark:border-green-800/30 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 disabled:opacity-50" type="button" onClick={() => void rep.exportReport('xlsx')} disabled={rep.loading}>
            <FileSpreadsheet className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            <span className="hidden xs:inline">تصدير</span> Excel
          </button>
          <button className="flex-1 flex justify-center items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-bold rounded-lg sm:rounded-xl transition-all border border-blue-200 dark:border-blue-800/30 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 hover:bg-blue-100 disabled:opacity-50" type="button" onClick={() => void rep.exportReport('csv')} disabled={rep.loading}>
            <Download className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            <span className="hidden xs:inline">تصدير</span> CSV
          </button>
          <button className="flex-none flex items-center justify-center p-2 sm:p-3 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-900 hover:bg-gray-100 rounded-lg sm:rounded-xl border border-gray-200 dark:border-slate-700 disabled:opacity-50" type="button" onClick={() => void rep.refresh()} disabled={rep.loading}>
            <RefreshCw className={`w-4 h-4 sm:w-5 sm:h-5 ${rep.loading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* ═══ الفترة والتنقل ═══ */}
      <div className="bg-white dark:bg-slate-800 p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col gap-3 sm:gap-4">
        {/* Period tabs */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" onClick={() => rep.setPeriod(p.key)} disabled={rep.loading}
              className={`flex-shrink-0 px-3 sm:px-5 py-1.5 sm:py-2.5 text-xs sm:text-sm font-bold rounded-lg sm:rounded-xl transition-all border ${rep.period === p.key ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}>
              {p.label}
            </button>
          ))}
        </div>
        {/* Navigation */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg sm:rounded-xl p-1 sm:p-1.5">
            <button type="button" className="p-1.5 sm:p-2.5 rounded-md sm:rounded-lg text-gray-500 hover:text-gray-900 hover:bg-white dark:hover:bg-slate-800 transition-colors disabled:opacity-30" onClick={() => rep.navigate(-1)} disabled={rep.loading || rep.period === 'all'}>
              <ChevronRight className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
            <span className="flex-1 text-xs sm:text-base font-bold text-gray-900 dark:text-white px-2 sm:px-5 font-inter min-w-[100px] sm:min-w-[160px] text-center">{rep.range.label}</span>
            <button type="button" className="p-1.5 sm:p-2.5 rounded-md sm:rounded-lg text-gray-500 hover:text-gray-900 hover:bg-white dark:hover:bg-slate-800 transition-colors disabled:opacity-30" onClick={() => rep.navigate(1)} disabled={rep.loading || rep.period === 'all'}>
              <ChevronLeft className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
          {rep.period === 'custom' && (
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-slate-900 p-1.5 sm:p-2 rounded-lg sm:rounded-xl border border-gray-200 dark:border-slate-700">
              <input type="date" className="bg-transparent border-none text-xs sm:text-sm text-gray-900 dark:text-white font-inter font-bold focus:outline-none px-1 sm:px-2 min-w-0 flex-1" value={rep.customFrom} onChange={(e) => rep.setCustomFrom(e.target.value)} />
              <span className="text-gray-400 text-xs sm:text-sm flex-shrink-0">→</span>
              <input type="date" className="bg-transparent border-none text-xs sm:text-sm text-gray-900 dark:text-white font-inter font-bold focus:outline-none px-1 sm:px-2 min-w-0 flex-1" value={rep.customTo} onChange={(e) => rep.setCustomTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {/* ═══ بطاقات المؤشرات ═══ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        {rep.summaryCards.map((c) => {
          const tone = TONE_MAP[c.tone] || TONE_MAP.blue;
          return (
            <div key={c.key} className={`${tone.bg} border ${tone.border} rounded-xl sm:rounded-2xl p-3 sm:p-5 flex flex-col gap-1.5 sm:gap-2.5 hover:shadow-md transition-shadow`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 leading-tight">{c.label}</span>
                <span className={`text-base sm:text-xl ${tone.iconBg} w-7 h-7 sm:w-9 sm:h-9 rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0`}>{c.icon}</span>
              </div>
              <div className={`text-base sm:text-2xl font-black font-inter ${tone.text} leading-tight truncate`}>{c.value}</div>
              <div className="text-[9px] sm:text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate">{c.detail}</div>
            </div>
          );
        })}
      </div>

      {/* ═══ توزيع الحالات + الرسم البياني + نسبة التحصيل (Commented Out) ═══ */}
      {/* 
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 p-4 sm:p-6 shadow-sm">
          <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-3 sm:mb-5 flex items-center gap-2">
            <Activity className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-indigo-500" /> توزيع الحالات
          </h3>
          <div className="flex flex-col gap-3 sm:gap-4">
            {rep.statusBars.map((bar) => (
              <div key={bar.key} className="flex flex-col gap-1.5 sm:gap-2">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded flex-shrink-0" style={{ background: bar.color }} />
                    <span className="font-bold text-gray-700 dark:text-gray-300">{bar.label}</span>
                    <span className="text-gray-400 font-inter">({formatNum(bar.count)})</span>
                  </div>
                  <span className="font-inter font-bold text-gray-900 dark:text-white">{formatPct(bar.pct)}</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-slate-700 h-2 sm:h-2.5 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${bar.pct}%`, background: bar.color }} />
                </div>
                <div className="text-[10px] sm:text-[11px] font-inter text-gray-400 text-left">{formatSar(bar.amount)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 p-4 sm:p-6 shadow-sm">
          <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-3 sm:mb-5 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-green-500" /> اتجاه الإيرادات
          </h3>
          <MiniBarChart data={rep.sparkData.points} maxVal={rep.sparkData.max} />
          {rep.sparkData.labels.length > 0 && (
            <div className="flex justify-between mt-2 text-[9px] sm:text-[10px] text-gray-400 font-inter">
              <span>{rep.sparkData.labels[0]}</span>
              <span>{rep.sparkData.labels[rep.sparkData.labels.length - 1]}</span>
            </div>
          )}
          <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100 dark:border-slate-700 grid grid-cols-2 gap-2 sm:gap-3">
            <div>
              <div className="text-[10px] sm:text-[11px] text-gray-400 font-bold">إجمالي الإيرادات</div>
              <div className="text-sm sm:text-base font-black font-inter text-gray-900 dark:text-white truncate">{formatSar(rep.summary.totalAmount)}</div>
            </div>
            <div>
              <div className="text-[10px] sm:text-[11px] text-gray-400 font-bold">متوسط يومي</div>
              <div className="text-sm sm:text-base font-black font-inter text-gray-900 dark:text-white truncate">
                {rep.dailySeries.length > 0 ? formatSar(rep.summary.totalAmount / rep.dailySeries.length) : '—'}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 p-4 sm:p-6 shadow-sm flex flex-col">
          <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-3 sm:mb-5 flex items-center gap-2">
            <DollarSign className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-yellow-500" /> نسبة التحصيل
          </h3>
          <div className="flex-1 flex items-center justify-center py-2 sm:py-0">
            <div className="relative w-28 h-28 sm:w-36 sm:h-36">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="10" className="text-gray-100 dark:text-slate-700" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="currentColor" strokeWidth="10"
                  strokeDasharray={`${Math.PI * 100}`}
                  strokeDashoffset={`${Math.PI * 100 * (1 - (Number(rep.summary.collectionRate) || 0) / 100)}`}
                  strokeLinecap="round"
                  className="text-green-500 transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl sm:text-3xl font-black font-inter text-gray-900 dark:text-white">{formatPct(rep.summary.collectionRate)}</span>
                <span className="text-[8px] sm:text-[10px] text-gray-400 font-bold">محصّل</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-gray-100 dark:border-slate-700">
            <div className="text-center">
              <div className="text-[10px] sm:text-[11px] text-green-500 font-bold flex items-center justify-center gap-1"><ArrowUpRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> محصّل</div>
              <div className="text-xs sm:text-base font-black font-inter text-green-600 dark:text-green-400 truncate">{formatSar(rep.summary.collectedAmount)}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] sm:text-[11px] text-red-500 font-bold flex items-center justify-center gap-1"><ArrowDownRight className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> متبقي</div>
              <div className="text-xs sm:text-base font-black font-inter text-red-600 dark:text-red-400 truncate">{formatSar(rep.summary.remainingAmount)}</div>
            </div>
          </div>
        </div>
      </div>
      */}

      {/* ═══ تحليل الناقلين + أكبر العملاء ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
        {/* تحليل الناقلين */}
        <div className="bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 p-4 sm:p-6 shadow-sm">
          <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-3 sm:mb-5 flex items-center gap-2">
            <Truck className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-blue-500" /> تحليل الناقلين
          </h3>
          {rep.carrierBreakdown.length > 0 ? (
            <div className="flex flex-col gap-3 sm:gap-4">
              {rep.carrierBreakdown.map((c) => (
                <div key={c.carrier} className="flex items-center gap-2 sm:gap-3">
                  <div className="w-16 sm:w-24 text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 truncate" title={c.carrier}>{c.carrier}</div>
                  <div className="flex-1 bg-gray-100 dark:bg-slate-700 h-5 sm:h-6 rounded-full overflow-hidden relative">
                    <div className="h-full bg-blue-500/70 dark:bg-blue-400/50 rounded-full transition-all duration-700" style={{ width: `${c.percentage}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-[9px] sm:text-[11px] font-bold font-inter text-gray-700 dark:text-gray-200">
                      {formatNum(c.count)} ({formatPct(c.percentage)})
                    </span>
                  </div>
                  <div className="w-20 sm:w-28 text-right text-[10px] sm:text-sm font-inter font-bold text-gray-500 dark:text-gray-400 truncate">{formatSar(c.amount)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 text-sm sm:text-base py-6 sm:py-8">لا توجد بيانات ناقلين</div>
          )}
        </div>

        {/* أكبر العملاء */}
        <div className="bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 p-4 sm:p-6 shadow-sm">
          <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-white mb-3 sm:mb-5 flex items-center gap-2">
            <Users className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-purple-500" /> أكبر العملاء
          </h3>
          {rep.topClients.length > 0 ? (
            <div className="flex flex-col gap-1.5 sm:gap-2.5">
              {rep.topClients.slice(0, 8).map((c, idx) => (
                <div key={c.name} className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors">
                  <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-[10px] sm:text-[11px] font-black text-indigo-600 dark:text-indigo-400 font-inter flex-shrink-0">{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">{c.name}</div>
                    <div className="text-[10px] sm:text-[11px] text-gray-400 font-inter">{formatNum(c.count)} فاتورة</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs sm:text-sm font-inter font-bold text-gray-900 dark:text-white">{formatSar(c.amount)}</div>
                    {c.remaining > 0 && (
                      <div className="text-[9px] sm:text-[11px] font-inter text-red-500">متبقي {formatSar(c.remaining)}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-gray-400 text-sm sm:text-base py-6 sm:py-8">لا توجد بيانات عملاء</div>
          )}
        </div>
      </div>

      {/* ═══ فلاتر الجدول ═══ */}
      <div className="bg-white dark:bg-slate-800 p-3 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col gap-3 sm:gap-4">
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {STATUSES.map((s) => {
            const Icon = s.icon;
            const isActive = rep.status === s.key;
            return (
              <button key={s.key} type="button" disabled={rep.loading}
                className={`flex-shrink-0 flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 text-[11px] sm:text-sm font-bold rounded-md sm:rounded-lg transition-all border ${isActive ? `${s.color} border-current bg-current/5 shadow-sm` : 'bg-gray-50 dark:bg-slate-900 border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                onClick={() => rep.setStatus(s.key as any)}>
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> {s.label}
              </button>
            );
          })}
        </div>
        <div className="relative w-full">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-[18px] sm:h-[18px]" />
          <input type="text" placeholder="بحث في الفواتير..." value={rep.query}
            onChange={(e) => rep.setQuery(e.target.value)} disabled={rep.loading}
            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg sm:rounded-xl py-2 sm:py-3 pr-9 sm:pr-11 pl-3 sm:pl-4 text-xs sm:text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 outline-none" />
        </div>
      </div>

      {rep.error && (
        <div className="text-red-600 dark:text-red-400 text-xs sm:text-sm font-bold bg-red-50 dark:bg-red-900/20 p-3 sm:p-4 rounded-lg sm:rounded-xl border border-red-200 dark:border-red-800/30 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 sm:w-[18px] sm:h-[18px] flex-shrink-0" /> {rep.error}
        </div>
      )}

      {/* ═══ جدول البيانات ═══ */}
      <div className="bg-white dark:bg-slate-800 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-3 sm:px-5 py-2.5 sm:py-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <span className="text-xs sm:text-sm font-bold text-gray-500 dark:text-gray-400">
            {formatNum(rep.tablePagination.total)} فاتورة
            {rep.tablePagination.pages > 1 && (
              <span className="text-gray-400 mr-1 hidden sm:inline">
                · صفحة {rep.tablePagination.page} من {rep.tablePagination.pages}
              </span>
            )}
          </span>
          <span className="text-[10px] sm:text-xs font-inter text-gray-400">
            الإجمالي: {formatSar(rep.summary.totalAmount)}
          </span>
        </div>

        {/* ═══ Mobile Cards (< sm) ═══ */}
        <div className="sm:hidden divide-y divide-gray-100 dark:divide-slate-700/50 max-h-[500px] overflow-y-auto">
          {rep.tableRows.length > 0 ? (
            rep.tableRows.map((r) => (
              <div key={r.id} className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-inter font-black text-base text-gray-900 dark:text-white">
                      {r.invoice_number ? `#${r.invoice_number}` : `#${r.id}`}
                    </span>
                    {r.daftra_id && <span className="text-[10px] text-indigo-500 font-bold mr-2">#{r.daftra_id}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={r.status} />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{r.statusLabel}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-gray-900 dark:text-white truncate max-w-[45%]">{r.client}</span>
                  <span className="text-gray-400 font-inter">
                    {r.date.includes('|') ? r.date.split('|')[1] : r.date}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="text-gray-400">المبلغ: </span>
                    <span className="font-inter font-bold text-gray-900 dark:text-white">{r.totalText}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">المدفوع: </span>
                    <span className="font-inter font-bold text-green-600">{r.paidText}</span>
                  </div>
                </div>
                {r.remaining > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-red-500 font-inter font-bold">متبقي: {r.remainingText}</span>
                    <CollectionBar pct={r.collectionPct} />
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="p-10 text-center">
              {rep.loading ? (
                <div className="flex flex-col items-center gap-2">
                  <RefreshCw size={28} className="animate-spin text-indigo-500" />
                  <span className="text-gray-500 font-bold text-sm">جاري التحميل...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Search size={28} className="text-gray-300" />
                  <span className="text-gray-500 font-bold text-sm">لا توجد فواتير</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ═══ Desktop Table (>= sm) ═══ */}
        <div className="hidden sm:block overflow-x-auto max-h-[650px] overflow-y-auto">
          <table className="w-full text-right border-collapse whitespace-nowrap" style={{ minWidth: 1050 }}>
            <thead className="sticky top-0 bg-gray-50 dark:bg-slate-900 z-10 border-b border-gray-200 dark:border-slate-700">
              <tr className="text-xs text-gray-500 dark:text-gray-400 font-bold tracking-wide">
                <th className="p-4">الفاتورة</th>
                <th className="p-4">التاريخ</th>
                <th className="p-4">العميل</th>
                <th className="p-4">الجوال</th>
                <th className="p-4">الناقل</th>
                <th className="p-4">الحالة</th>
                <th className="p-4">المبلغ</th>
                <th className="p-4">المدفوع</th>
                <th className="p-4">المتبقي</th>
                <th className="p-4">نسبة التحصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {rep.tableRows.length > 0 ? (
                rep.tableRows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-700/20 transition-colors">
                    <td className="p-4">
                      <div className="font-inter font-black text-[17px] text-gray-900 dark:text-white">
                        {r.invoice_number ? `#${r.invoice_number}` : `#${r.id}`}
                      </div>
                      {r.daftra_id && <div className="text-[11px] text-indigo-500 font-bold mt-0.5">دفترة# {r.daftra_id}</div>}
                    </td>
                    <td className="p-4">
                      {r.date.includes('|') ? (
                        <div className="flex flex-col">
                          <span className="text-[14px] font-inter font-semibold text-gray-700 dark:text-gray-300">
                            {r.date.split('|')[0]}
                          </span>
                          <span className="text-[12px] font-inter text-gray-400 dark:text-gray-500 mt-0.5">
                            {r.date.split('|')[1]}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[14px] font-inter font-medium text-gray-600 dark:text-gray-400">{r.date}</span>
                      )}
                    </td>
                    <td className="p-4 font-bold text-[15px] text-gray-900 dark:text-white max-w-[200px] truncate" title={r.client}>
                      {r.client}
                    </td>
                    <td className="p-4 font-inter text-[13px] text-gray-600 dark:text-gray-400" dir="ltr">
                      {r.phone || '—'}
                    </td>
                    <td className="p-4">
                      <span className="text-xs font-bold bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-md">
                        {r.carrier}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <StatusDot status={r.status} />
                        <span className="text-[14px] font-bold text-gray-700 dark:text-gray-300">{r.statusLabel}</span>
                      </div>
                    </td>
                    <td className="p-4 font-inter font-bold text-[15px] text-gray-900 dark:text-white">
                      {r.totalText}
                    </td>
                    <td className="p-4 font-inter font-bold text-[14px] text-green-600 dark:text-green-400">
                      {r.paid > 0 ? r.paidText : <span className="text-gray-300 dark:text-slate-600">0.00 SAR</span>}
                    </td>
                    <td className={`p-4 font-inter font-bold text-[14px] ${r.remaining > 0 ? 'text-red-500 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {r.remaining > 0 ? r.remainingText : '✓ مسدد'}
                    </td>
                    <td className="p-4">
                      <CollectionBar pct={r.collectionPct} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="p-16 text-center">
                    {rep.loading ? (
                      <div className="flex flex-col items-center gap-3">
                        <RefreshCw size={36} className="animate-spin text-indigo-500" />
                        <span className="text-gray-500 font-bold text-base">جاري تحميل التقرير...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <Search size={36} className="text-gray-300" />
                        <span className="text-gray-500 font-bold text-base">لا توجد فواتير مطابقة للشروط المحددة</span>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ═══ Pagination ═══ */}
        {rep.tablePagination.pages > 1 && (
          <div className="px-3 sm:px-5 py-3 sm:py-4 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
            <div className="text-[10px] sm:text-sm text-gray-400 font-inter">
              <span className="hidden sm:inline">عرض </span>
              {((rep.tablePagination.page - 1) * rep.tablePagination.limit) + 1}-{Math.min(rep.tablePagination.page * rep.tablePagination.limit, rep.tablePagination.total)}
              <span className="hidden sm:inline"> من</span>
              <span className="sm:hidden">/</span> {formatNum(rep.tablePagination.total)}
            </div>
            <div className="flex items-center gap-1 sm:gap-2">
              <button type="button"
                disabled={rep.tablePagination.page <= 1 || rep.loading}
                onClick={() => rep.setTablePage(rep.tablePagination.page - 1)}
                className="p-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-bold rounded-md sm:rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-all">
                <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>

              {Array.from({ length: Math.min(5, rep.tablePagination.pages) }, (_, i) => {
                const totalPages = rep.tablePagination.pages;
                const currentPage = rep.tablePagination.page;
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button key={pageNum} type="button" disabled={rep.loading}
                    onClick={() => rep.setTablePage(pageNum)}
                    className={`w-7 h-7 sm:w-9 sm:h-9 text-[11px] sm:text-sm font-bold rounded-md sm:rounded-lg transition-all ${pageNum === currentPage
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                      : 'bg-gray-50 dark:bg-slate-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 border border-gray-200 dark:border-slate-700'
                    }`}>
                    {pageNum}
                  </button>
                );
              })}

              <button type="button"
                disabled={rep.tablePagination.page >= rep.tablePagination.pages || rep.loading}
                onClick={() => rep.setTablePage(rep.tablePagination.page + 1)}
                className="p-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-bold rounded-md sm:rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-all">
                <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}