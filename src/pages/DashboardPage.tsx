import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDashboardPage } from '../hooks/useDashboardPage'
import {
  Package, DollarSign, CheckCircle2, AlertCircle, AlertTriangle,
  CreditCard, TrendingUp, BarChart2, TrendingDown, RefreshCw,
  PlusCircle, FileText, ChevronLeft, Calendar, Trophy,
  Users, ArrowUpRight, ArrowDownRight, Zap, Clock, RotateCcw
} from 'lucide-react'

const PERIODS = [
  { key: 'today', label: 'اليوم' },
  { key: 'week', label: 'هذا الأسبوع' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'year', label: 'هذه السنة' },
  { key: 'all', label: 'الكل' },
] as const

function statusColor(status: 'paid' | 'partial' | 'unpaid' | 'returned') {
  if (status === 'paid') return 'text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30'
  if (status === 'partial') return 'text-yellow-700 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30'
  if (status === 'returned') return 'text-purple-700 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30'
  return 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30'
}

function statusLabel(status: 'paid' | 'partial' | 'unpaid' | 'returned') {
  if (status === 'paid') return 'مدفوعة'
  if (status === 'partial') return 'جزئية'
  if (status === 'returned') return 'مرتجعة'
  return 'غير مدفوعة'
}

function fmtSAR(val: number) {
  return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' SAR'
}

function DonutChart({ percentage, color, size = 80, strokeWidth = 8 }: { percentage: number; color: string; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, percentage)) / 100) * circumference
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-gray-100 dark:text-slate-700" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
    </svg>
  )
}

/* ═══════════════════════════════════════════════════════
   Revenue Chart — with daily/monthly/yearly toggle
   ═══════════════════════════════════════════════════════ */
function RevenueChart({
  series,
  chartView,
  setChartView,
  loading,
  rangeLabel,
}: {
  series: Array<{ label: string; value: number }>
  chartView: 'daily' | 'monthly' | 'yearly'
  setChartView: (v: 'daily' | 'monthly' | 'yearly') => void
  loading: boolean
  rangeLabel: string
}) {
  const svgRef = React.useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = React.useState<{ x: number; y: number; label: string; value: number } | null>(null)

  const svgW = 560
  const svgH = 180
  const padL = 45
  const padR = 15
  const padT = 20
  const padB = 30
  const chartW = svgW - padL - padR
  const chartH = svgH - padT - padB

  const maxVal = React.useMemo(() => {
    const m = Math.max(...series.map((s) => s.value), 0)
    return m > 0 ? m * 1.1 : 1000
  }, [series])

  const points = React.useMemo(() => {
    if (!series.length) return []
    const step = series.length === 1 ? 0 : chartW / (series.length - 1)
    return series.map((s, i) => ({
      x: padL + step * i,
      y: padT + chartH - (s.value / maxVal) * chartH,
      ...s,
    }))
  }, [series, maxVal, chartW, chartH])

  const linePath = React.useMemo(() => {
    if (points.length < 2) {
      if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
      return ''
    }
    let d = `M ${points[0].x} ${points[0].y}`
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i]
      const next = points[i + 1]
      const cpx = (curr.x + next.x) / 2
      d += ` C ${cpx} ${curr.y}, ${cpx} ${next.y}, ${next.x} ${next.y}`
    }
    return d
  }, [points])

  const areaPath = React.useMemo(() => {
    if (!linePath || points.length < 2) return ''
    const baseY = padT + chartH
    return `${linePath} L ${points[points.length - 1].x} ${baseY} L ${points[0].x} ${baseY} Z`
  }, [linePath, points, chartH])

  const yTicks = React.useMemo(() => {
    const ticks = []
    const steps = 4
    for (let i = 0; i <= steps; i++) {
      const val = (maxVal / steps) * i
      const y = padT + chartH - (i / steps) * chartH
      ticks.push({ y, val })
    }
    return ticks
  }, [maxVal, chartH])

  const xLabels = React.useMemo(() => {
    if (!points.length) return []
    const maxLabels = 7
    const step = Math.max(1, Math.ceil(points.length / maxLabels))
    return points.filter((_, i) => i % step === 0 || i === points.length - 1)
  }, [points])

  const formatYLabel = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`
    if (val >= 1000) return `${(val / 1000).toFixed(0)}k`
    return val.toFixed(0)
  }

  const formatXLabel = (label: string) => {
    if (chartView === 'yearly') return label
    if (chartView === 'monthly') return label.slice(2) // "25-01" from "2025-01"
    return label.slice(5) // "01-15" from "2025-01-15"
  }

  const handleMouseMove = React.useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || !points.length) return
      const rect = svgRef.current.getBoundingClientRect()
      const mouseX = ((e.clientX - rect.left) / rect.width) * svgW
      let closest = points[0]
      let minDist = Math.abs(mouseX - closest.x)
      for (const p of points) {
        const dist = Math.abs(mouseX - p.x)
        if (dist < minDist) { minDist = dist; closest = p }
      }
      if (minDist < chartW / (points.length || 1) + 20) {
        setTooltip({ x: closest.x, y: closest.y, label: closest.label, value: closest.value })
      } else {
        setTooltip(null)
      }
    },
    [points, svgW, chartW],
  )

  const handleMouseLeave = React.useCallback(() => setTooltip(null), [])

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart2 className="text-indigo-600 dark:text-indigo-400" size={20} /> الإيرادات
        </h3>
        <div className="flex bg-gray-50 dark:bg-slate-700/50 p-1 rounded-lg border border-gray-100 dark:border-slate-700">
          {(['daily', 'monthly', 'yearly'] as const).map((v) => (
            <button
              key={v}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors ${
                chartView === v
                  ? 'bg-white dark:bg-slate-600 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-slate-500'
                  : 'text-gray-500 hover:text-gray-900 dark:text-gray-400'
              }`}
              onClick={() => setChartView(v)}
              disabled={loading}
            >
              {v === 'daily' ? 'يومي' : v === 'monthly' ? 'شهري' : 'سنوي'}
            </button>
          ))}
        </div>
      </div>

      <div className="relative w-full select-none" style={{ minHeight: 220 }}>
        {series.length > 0 ? (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full"
            style={{ height: 220 }}
            preserveAspectRatio="xMidYMid meet"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="revGrad2" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#6366F1" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#6366F1" stopOpacity="0.01" />
              </linearGradient>
            </defs>
            {yTicks.map((t, i) => (
              <g key={i}>
                <line x1={padL} y1={t.y} x2={svgW - padR} y2={t.y} stroke="currentColor" strokeWidth="0.5" className="text-gray-100 dark:text-slate-700/60" strokeDasharray={i === 0 ? 'none' : '4,4'} />
                <text x={padL - 8} y={t.y + 3} textAnchor="end" fill="currentColor" className="text-gray-400 dark:text-slate-500" style={{ fontSize: 9, fontFamily: 'Inter, sans-serif' }}>{formatYLabel(t.val)}</text>
              </g>
            ))}
            {areaPath && <path d={areaPath} fill="url(#revGrad2)" />}
            {linePath && <path d={linePath} fill="none" stroke="#6366F1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={tooltip && Math.abs(tooltip.x - p.x) < 1 ? 5 : 3} fill={tooltip && Math.abs(tooltip.x - p.x) < 1 ? '#6366F1' : '#fff'} stroke="#6366F1" strokeWidth={tooltip && Math.abs(tooltip.x - p.x) < 1 ? 2.5 : 1.5} className="transition-[r] duration-150" />
            ))}
            {tooltip && (
              <g>
                <line x1={tooltip.x} y1={padT} x2={tooltip.x} y2={padT + chartH} stroke="#6366F1" strokeWidth="1" strokeDasharray="4,3" opacity="0.35" />
                {(() => {
                  const bw = 110; const bh = 44
                  let bx = tooltip.x - bw / 2
                  if (bx < 2) bx = 2
                  if (bx + bw > svgW - 2) bx = svgW - bw - 2
                  const by = Math.max(2, tooltip.y - bh - 14)
                  return (
                    <>
                      <rect x={bx} y={by} width={bw} height={bh} rx={10} fill="#1E293B" fillOpacity="0.92" />
                      <text x={bx + bw / 2} y={by + 16} textAnchor="middle" fill="#94A3B8" style={{ fontSize: 9, fontFamily: 'Inter, sans-serif' }}>{tooltip.label}</text>
                      <text x={bx + bw / 2} y={by + 34} textAnchor="middle" fill="#FFFFFF" style={{ fontSize: 13, fontWeight: 800, fontFamily: 'Inter, sans-serif' }}>{tooltip.value.toLocaleString('en-US', { maximumFractionDigits: 0 })} SAR</text>
                    </>
                  )
                })()}
              </g>
            )}
            {xLabels.map((p, i) => (
              <text key={i} x={p.x} y={svgH - 6} textAnchor="middle" fill="currentColor" className="text-gray-400 dark:text-slate-500" style={{ fontSize: 8, fontFamily: 'Inter, sans-serif' }}>{formatXLabel(p.label)}</text>
            ))}
          </svg>
        ) : (
          <div className="flex items-center justify-center text-gray-400 dark:text-slate-500 font-semibold text-sm bg-gray-50/50 dark:bg-slate-800/50 rounded-xl border border-dashed border-gray-200 dark:border-slate-700" style={{ height: 220 }}>لا توجد بيانات</div>
        )}
      </div>

      <div className="mt-2 text-xs font-medium text-gray-400 dark:text-slate-500 flex items-center justify-between">
        <span className="flex items-center gap-1.5"><Calendar size={14} /> {rangeLabel}</span>
        <span className="bg-gray-50 dark:bg-slate-700/50 px-2 py-1 rounded-md text-gray-600 dark:text-gray-300">{series.length ? `${series.length} نقطة` : '—'}</span>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   Revenue Breakdown
   ═══════════════════════════════════════════════════════ */
function RevenueBreakdown({ kpis }: { kpis: any }) {
  const total = kpis.totalSales || 0
  const collected = kpis.totalCollected || 0
  const remaining = kpis.remaining || 0

  const segments = [
    { label: 'محصّل', amount: collected, color: '#10B981', icon: CheckCircle2 },
    { label: 'جزئي (مدفوع)', amount: kpis.partial?.paidAmount || 0, color: '#F59E0B', icon: AlertTriangle },
    { label: 'غير محصّل', amount: remaining, color: '#EF4444', icon: AlertCircle },
  ]
  const barTotal = segments.reduce((s, seg) => s + seg.amount, 0) || 1

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between p-4 md:p-5 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50">
        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2"><DollarSign size={18} className="text-indigo-500" /> تحليل الإيرادات</h3>
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg font-inter">{total.toLocaleString('en-US', { maximumFractionDigits: 0 })} SAR</span>
      </div>
      <div className="p-5 flex flex-col gap-5">
        <div>
          <div className="flex w-full h-5 rounded-full overflow-hidden bg-gray-100 dark:bg-slate-700">
            {segments.map((seg, i) => {
              const pct = (seg.amount / barTotal) * 100
              if (pct <= 0) return null
              return <div key={i} className="h-full transition-all duration-1000 ease-out first:rounded-r-full last:rounded-l-full" style={{ width: `${pct}%`, backgroundColor: seg.color }} title={`${seg.label}: ${seg.amount.toLocaleString('en-US')} SAR`} />
            })}
          </div>
          <div className="flex items-center justify-between mt-2">
            {segments.map((seg, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                {seg.label}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {segments.map((seg, i) => {
            const pct = total > 0 ? ((seg.amount / total) * 100).toFixed(1) : '0.0'
            const Icon = seg.icon
            return (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700/30 rounded-xl border border-gray-100 dark:border-slate-700/50 hover:border-gray-200 dark:hover:border-slate-600 transition-colors">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${seg.color}15` }}><Icon size={18} style={{ color: seg.color }} /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{seg.label}</span>
                    <span className="font-inter font-bold text-sm text-gray-900 dark:text-white">{seg.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex-1 bg-gray-200 dark:bg-slate-600 h-1.5 rounded-full overflow-hidden mr-3">
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, parseFloat(pct))}%`, backgroundColor: seg.color }} />
                    </div>
                    <span className="text-xs font-bold font-inter" style={{ color: seg.color }}>{pct}%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-slate-700">
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400">نسبة التحصيل الفعلي</span>
          <span className="text-sm font-black font-inter text-green-600 dark:text-green-400">{total > 0 ? ((collected / total) * 100).toFixed(1) : '0.0'}%</span>
        </div>
      </div>
    </div>
  )
}


export function DashboardPage() {
  const nav = useNavigate()
  const dash = useDashboardPage()
  const { refresh } = dash

  useEffect(() => { void refresh() }, [refresh])

  const onCreateInvoice = () => {
    nav('/new-invoice')
  }

  const goToReports = (status: 'unpaid' | 'partial' | 'unpaid_all') => {
    try { sessionStorage.setItem('shippec_reports_status', status) } catch { void 0 }
    nav('/reports')
  }

  const KpiCard = ({ title, value, detail, icon: Icon, colorClass, bgClass, onClick, hint, children }: any) => (
    <div className={`bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-5 flex flex-col gap-3 relative overflow-hidden transition-all duration-200 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-600' : ''}`} onClick={onClick}>
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2 uppercase tracking-wide">
            {title}
            {hint && <span className="text-[10px] bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full text-indigo-600 dark:text-indigo-400 font-bold normal-case">{hint}</span>}
          </h3>
          <p className={`text-2xl font-extrabold font-inter tracking-tight ${colorClass || 'text-gray-900 dark:text-white'}`}>{value}</p>
        </div>
        <div className={`p-3 rounded-xl ${bgClass || 'bg-gray-50 dark:bg-slate-700/50'}`}>
          <Icon size={22} className={colorClass || 'text-gray-600 dark:text-gray-300'} />
        </div>
      </div>
      <p className="text-xs font-medium text-gray-400 dark:text-slate-500">{detail}</p>
      {children}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" className={`px-4 py-2 text-sm font-bold rounded-lg transition-all duration-200 ${dash.period === p.key ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'}`} onClick={() => dash.setPeriod(p.key)} disabled={dash.loading}>
              {p.label}
            </button>
          ))}
          <button className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50" onClick={() => void dash.refresh()} disabled={dash.loading}>
            <RefreshCw size={16} className={dash.loading ? 'animate-spin text-indigo-600' : 'text-gray-400'} />
            <span className="hidden sm:inline">تحديث</span>
          </button>
        </div>
        <button className="w-full xl:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50" onClick={onCreateInvoice} disabled={dash.loading}>
          <PlusCircle size={20} /> إنشاء فاتورة
        </button>
      </div>

      {/* Daftra Live Badge */}
      {dash.daftraStats && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-sm">
          <Zap size={16} className="text-green-600 dark:text-green-400" />
          <span className="font-bold text-green-700 dark:text-green-400">بيانات دفترة الحية</span>
          <span className="text-green-600 dark:text-green-500 font-medium">— شهر {dash.daftraStats.month} · {dash.daftraStats.totalCount} فاتورة · محصّل {dash.daftraStats.collected.toLocaleString('en-US')} SAR</span>
          {dash.summaryLoading && <RefreshCw size={14} className="animate-spin text-green-500 mr-auto" />}
        </div>
      )}

      {/* KPI Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard title="إجمالي الفواتير" value={dash.cards.totalCount.value} detail={dash.cards.totalCount.detail} icon={Package} bgClass="bg-indigo-50 dark:bg-indigo-900/20" />
        <KpiCard title="إجمالي المبيعات" value={dash.cards.totalSales.value} detail={dash.cards.totalSales.detail} icon={DollarSign} colorClass="text-yellow-600 dark:text-yellow-400" bgClass="bg-yellow-50 dark:bg-yellow-900/20" />
        <KpiCard title="إجمالي المحصّل" value={dash.cards.totalCollected.value} detail={dash.cards.totalCollected.detail} icon={CheckCircle2} colorClass="text-green-600 dark:text-green-400" bgClass="bg-green-50 dark:bg-green-900/20" />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="غير مدفوعة" value={dash.cards.unpaid.value} detail={dash.cards.unpaid.detail} icon={AlertCircle} colorClass="text-red-600 dark:text-red-400" bgClass="bg-red-50 dark:bg-red-900/20" onClick={() => goToReports('unpaid')} hint="التقرير" />

        <KpiCard title="مدفوعة جزئياً" value={dash.cards.partial.value} detail={dash.cards.partial.detail} icon={AlertTriangle} colorClass="text-yellow-600 dark:text-yellow-400" bgClass="bg-yellow-50 dark:bg-yellow-900/20" onClick={() => goToReports('partial')} hint="التقرير">
          <div className="mt-1 pt-3 border-t border-gray-100 dark:border-slate-700 space-y-2">
            {dash.cards.partial.totalRaw > 0 && (
              <div className="w-full bg-gray-100 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(100, (dash.cards.partial.paidRaw / dash.cards.partial.totalRaw) * 100)}%` }} />
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-green-600 dark:text-green-400 flex items-center gap-1"><ArrowUpRight size={12} /> المدفوع</span>
              <span className="text-xs font-bold font-inter text-green-600 dark:text-green-400">{dash.cards.partial.paidAmount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-red-500 dark:text-red-400 flex items-center gap-1"><ArrowDownRight size={12} /> المتبقي</span>
              <span className="text-xs font-bold font-inter text-red-500 dark:text-red-400">{dash.cards.partial.remainingAmount}</span>
            </div>
          </div>
        </KpiCard>

        <KpiCard title="فواتير مرتجعة" value={dash.cards.returned.value} detail={dash.cards.returned.detail} icon={RotateCcw} colorClass="text-purple-600 dark:text-purple-400" bgClass="bg-purple-50 dark:bg-purple-900/20" />

        <KpiCard title="إجمالي غير المحصّل" value={dash.cards.remaining.value} detail={dash.cards.remaining.detail} icon={CreditCard} colorClass="text-red-600 dark:text-red-400" bgClass="bg-red-50 dark:bg-red-900/20" onClick={() => goToReports('unpaid_all')} hint="التقرير" />
      </div>

      {/* KPI Row 3: Profit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard title="إجمالي الربح" value={dash.cards.profit.value} detail={dash.cards.profit.detail} icon={TrendingUp} colorClass={dash.cards.profit.value.startsWith('-') ? 'text-red-600 dark:text-red-400' : dash.cards.profit.value === '—' ? 'text-gray-400 dark:text-slate-500' : 'text-green-600 dark:text-green-400'} bgClass={dash.cards.profit.value.startsWith('-') ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'}>
          {dash.cards.profit.value === '—' && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg">⚠ لا توجد بيانات تكلفة DHL</p>
          )}
        </KpiCard>
        <KpiCard title="متوسط هامش الربح" value={dash.cards.margin.value} detail={dash.cards.margin.detail} icon={BarChart2} colorClass={dash.cards.margin.value === '—' ? 'text-gray-400 dark:text-slate-500' : 'text-indigo-600 dark:text-indigo-400'} bgClass="bg-indigo-50 dark:bg-indigo-900/20">
          {dash.cards.margin.value === '—' && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-lg">⚠ يتطلب بيانات تكلفة DHL</p>
          )}
        </KpiCard>
        <KpiCard title="فواتير خاسرة" value={dash.cards.losing.value} detail={dash.cards.losing.detail} icon={TrendingDown} colorClass="text-red-600 dark:text-red-400" bgClass="bg-red-50 dark:bg-red-900/20" />
      </div>

      {/* Collection Rate + Revenue Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 flex flex-col items-center justify-center gap-4">
          <h3 className="font-bold text-sm text-gray-500 dark:text-gray-400 uppercase tracking-wide">نسبة التحصيل</h3>
          <div className="relative">
            <DonutChart percentage={dash.collectionRate} color="#10B981" size={120} strokeWidth={12} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-extrabold font-inter text-gray-900 dark:text-white">{dash.collectionRate}%</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-500 font-medium">محصّل من إجمالي المبيعات</p>
        </div>
        <div className="lg:col-span-2">
          <RevenueChart series={dash.revenueSeries} chartView={dash.chartView} setChartView={dash.setChartView} loading={dash.loading} rangeLabel={dash.range.label} />
        </div>
      </div>

      {/* Status Bars + Revenue Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2"><CheckCircle2 className="text-green-500" size={20} /> حالة التحصيل</h3>
            <button className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1" onClick={() => nav('/reports')}>التقرير التفصيلي <ChevronLeft size={14} /></button>
          </div>
                    <div className="flex flex-col gap-5 flex-1 justify-center">
            {dash.statusBars.map((b) => (
              <div key={b.label}>
                <div className="flex justify-between text-sm font-semibold mb-2">
                  <span className="text-gray-700 dark:text-gray-300">{b.label}</span>
                  <span className="text-gray-500 dark:text-gray-400 font-inter font-bold">{b.count}</span>
                </div>
                <div className="w-full bg-gray-100 dark:bg-slate-700/50 h-3 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${Math.min(100, Math.max(0, b.pct))}%`, background: b.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <RevenueBreakdown kpis={{
          totalSales: dash.cards.totalSales ? parseFloat(dash.cards.totalSales.value?.replace(/[^0-9.-]/g, '') || '0') : 0,
          totalCollected: dash.cards.totalCollected ? parseFloat(dash.cards.totalCollected.value?.replace(/[^0-9.-]/g, '') || '0') : 0,
          remaining: dash.cards.remaining ? parseFloat(dash.cards.remaining.value?.replace(/[^0-9.-]/g, '') || '0') : 0,
          partial: {
            paidAmount: dash.cards.partial?.paidRaw || 0,
          }
        }} />
      </div>

      {/* Top Clients + Partial Clients */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Clients */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-4 md:p-5 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Trophy size={18} className="text-yellow-500" /> أكثر العملاء شحناً
            </h3>
            <button className="text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-indigo-600 transition-colors" onClick={() => nav('/clients')}>الكل</button>
          </div>
          <div className="p-2 flex-1">
            {dash.topClients.length ? (
              <div className="flex flex-col gap-1">
                {dash.topClients.map((c, idx) => (
                  <div key={c.name} className="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold font-inter ${idx === 0 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' : idx === 1 ? 'bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-gray-300' : idx === 2 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' : 'bg-gray-50 dark:bg-slate-700 text-gray-500'}`}>
                        {idx + 1}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-gray-900 dark:text-white">{c.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5 font-inter">{c.count} شحنة · {c.amount.toLocaleString('en-US')} SAR</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-400 font-semibold text-sm">لا توجد بيانات</div>
            )}
          </div>
        </div>

        {/* Partial Clients */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-4 md:p-5 border-b border-gray-100 dark:border-slate-700 bg-yellow-50/50 dark:bg-yellow-900/10">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <AlertTriangle size={18} className="text-yellow-500" /> عملاء الدفع الجزئي
            </h3>
            <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-1 rounded-full">{dash.partialClients.length} عميل</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-700" style={{ maxHeight: '640px' }}>
            {dash.partialClients.length ? (
              dash.partialClients.map((c) => (
                <div key={c.name} className="p-4 hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-sm text-gray-900 dark:text-white">{c.name}</span>
                    <span className="text-xs font-bold font-inter text-gray-500 dark:text-gray-400">
                      {c.count} فاتورة · {c.totalAmount.toLocaleString('en-US')} SAR
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-green-600 dark:text-green-400 font-bold flex items-center gap-1">
                      <ArrowUpRight size={12} /> دفع: {c.paidAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR
                    </span>
                    <span className="text-red-500 dark:text-red-400 font-bold flex items-center gap-1">
                      <ArrowDownRight size={12} /> متبقي: {c.remainingAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} SAR
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-gray-400 dark:text-slate-500 font-semibold text-sm">لا يوجد عملاء بدفع جزئي</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Invoices */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-800/50">
          <h3 className="font-bold text-base text-gray-900 dark:text-white flex items-center gap-2">
            <Clock className="text-indigo-500" size={20} /> آخر الفواتير المضافة
          </h3>
          <button className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1" onClick={() => nav('/invoices')}>
            عرض الكل <ChevronLeft size={16} />
          </button>
        </div>
        <div className="w-full overflow-x-auto">
          {dash.recent.length ? (
            <table className="w-full text-right border-collapse min-w-[750px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-slate-700/50 border-b border-gray-100 dark:border-slate-700 text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-wider">
                  <th className="px-4 py-3">رقم الفاتورة</th>
                  <th className="px-4 py-3">العميل</th>
                  <th className="px-4 py-3">التاريخ</th>
                  <th className="px-4 py-3">الحالة</th>
                  <th className="px-4 py-3">المبلغ</th>
                  <th className="px-4 py-3">المدفوع</th>
                  <th className="px-4 py-3 text-left">المتبقي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {dash.recent.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition-colors cursor-pointer" onClick={() => nav('/invoices')}>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-inter font-bold">#{r.invoiceNumber || r.id}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 font-semibold">{r.client}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 font-inter">{r.date}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${statusColor(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-inter font-bold text-gray-900 dark:text-white">{fmtSAR(r.amount)}</td>
                    <td className="px-4 py-3 text-sm font-inter font-bold">
                      {r.status === 'paid' ? (
                        <span className="text-green-600 dark:text-green-400">{fmtSAR(r.amount)}</span>
                      ) : r.status === 'partial' ? (
                        <span className="text-green-600 dark:text-green-400">{fmtSAR(r.partialPaid)}</span>
                      ) : (
                        <span className="text-gray-400 dark:text-slate-500">0.00 SAR</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm font-inter font-bold text-left">
                      {r.remaining > 0 ? (
                        <span className="text-red-500 dark:text-red-400">{fmtSAR(r.remaining)}</span>
                      ) : (
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1 justify-end">
                          <CheckCircle2 size={14} /> مكتملة
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-10 text-center text-gray-500 dark:text-gray-400 font-medium flex flex-col items-center gap-3">
              <FileText size={40} className="text-gray-300 dark:text-slate-600" />
              {dash.loading ? (
                <div className="flex items-center gap-2">
                  <RefreshCw size={16} className="animate-spin text-indigo-500" />
                  <span>جاري التحميل...</span>
                </div>
              ) : 'لا توجد فواتير بعد'}
            </div>
          )}
        </div>
        {dash.error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm font-medium border-t border-red-200 dark:border-red-900/50 flex items-center gap-2">
            <AlertCircle size={16} /> {dash.error}
          </div>
        )}
      </div>

      {/* ═══ Footer Stats Bar — FIXED: مرتجعة + إجمالي العملاء الصح ═══ */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-4 flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-gray-400 dark:text-slate-500">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            مدفوعة: <span className="font-bold font-inter text-gray-600 dark:text-gray-300">{dash.statusBars[0]?.count || 0}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-yellow-500" />
            جزئية: <span className="font-bold font-inter text-gray-600 dark:text-gray-300">{dash.statusBars[1]?.count || 0}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            غير مدفوعة: <span className="font-bold font-inter text-gray-600 dark:text-gray-300">{dash.statusBars[2]?.count || 0}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            مرتجعة: <span className="font-bold font-inter text-gray-600 dark:text-gray-300">{dash.statusBars[3]?.count || 0}</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Users size={14} />
          <span>إجمالي العملاء: <span className="font-bold font-inter text-gray-600 dark:text-gray-300">{dash.totalClients}</span></span>
          {dash.daftraStats && (
            <>
              <span className="text-gray-300 dark:text-slate-600">|</span>
              <Zap size={12} className="text-green-500" />
              <span>دفترة: {dash.daftraStats.month}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}