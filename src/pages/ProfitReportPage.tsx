import { useEffect } from 'react'
import { useProfitReportPage } from '../hooks/useProfitReportPage'
import {
  formatSar,
  formatNum,
  formatPct,
  formatMonthLabel,
  statusLabel,
  statusColor,
  type ProfitPeriod,
  type ProfitTab,
  type ProfitChartPoint,
} from '../utils/profitReport'
import {
  CircleDollarSign,
  FileSpreadsheet,
  Download,
  RefreshCw,
  Search,
  CalendarDays,
  Users,
  FileText,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  SlidersHorizontal,
} from 'lucide-react'
import s from './ProfitReportPage.module.css'

/* ═══════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════ */

const PERIODS: { key: ProfitPeriod; label: string }[] = [
  { key: 'today', label: 'اليوم' },
  { key: 'this_week', label: 'هذا الأسبوع' },
  { key: 'month', label: 'هذا الشهر' },
  { key: 'last_month', label: 'الشهر السابق' },
  { key: 'quarter', label: 'آخر 3 أشهر' },
  { key: 'year', label: 'هذه السنة' },
  { key: 'all', label: 'الكل' },
  { key: 'custom', label: 'مخصص' },
]

const TABS: { key: ProfitTab; label: string; icon: typeof FileText }[] = [
  { key: 'invoices', label: 'مفصل بالفواتير', icon: FileText },
  { key: 'clients', label: 'مجمع بالعملاء', icon: Users },
  { key: 'daily', label: 'مجمع بالأيام', icon: CalendarDays },
  { key: 'weekly', label: 'مجمع بالأسابيع', icon: CalendarDays },
  { key: 'monthly', label: 'مجمع بالشهور', icon: BarChart3 },
  { key: 'yearly', label: 'مجمع بالسنوات', icon: BarChart3 },
]

function profitColorClass(val: number | null | undefined, isText = true): string {
  if (val == null) return isText ? s.muted : ''
  if (val >= 0) return isText ? s.profitPos : ''
  return isText ? s.profitNeg : ''
}

/* ═══════════════════════════════════════════════════
   MINI BAR CHART (Pure CSS — no library)
   ═══════════════════════════════════════════════════ */

function MiniBarChart({ data }: { data: ProfitChartPoint[] }) {
  if (!data.length) {
    return <div className={s.emptyState}>لا توجد بيانات كافية للرسم البياني</div>
  }

  const points = data.slice(-12)
  const maxVal = Math.max(
    ...points.map((p) => Math.max(p.revenue, p.cost, Math.abs(p.profit))),
    1,
  )

  return (
    <>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          { label: 'الإيرادات', color: '#eab308' },
          { label: 'التكلفة', color: '#ef4444' },
          { label: 'الربح', color: '#22c55e' },
        ].map((l) => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: 'var(--muted, #6b7280)' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
            {l.label}
          </span>
        ))}
      </div>

      <div className={s.barChart}>
        {points.map((p, i) => {
          const revH = Math.max((p.revenue / maxVal) * 180, 2)
          const costH = Math.max((p.cost / maxVal) * 180, 2)
          const profitH = Math.max((Math.abs(p.profit) / maxVal) * 180, 2)
          const monthLabel = p.label.slice(5) || p.label

          return (
            <div key={i} className={s.barGroup}>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 200, width: '100%' }}>
                <div className={s.bar} style={{ height: revH, background: '#eab308', flex: 1 }}>
                  <div className={s.barTooltip}>{formatSar(p.revenue)}</div>
                </div>
                <div className={s.bar} style={{ height: costH, background: '#ef4444', flex: 1 }}>
                  <div className={s.barTooltip}>{formatSar(p.cost)}</div>
                </div>
                <div
                  className={s.bar}
                  style={{
                    height: profitH,
                    background: p.profit >= 0 ? '#22c55e' : '#f87171',
                    flex: 1,
                  }}
                >
                  <div className={s.barTooltip}>{formatSar(p.profit)}</div>
                </div>
              </div>
              <span className={s.barLabel}>{monthLabel}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

/* ═══════════════════════════════════════════════════
   DONUT CHART (Pure SVG)
   ═══════════════════════════════════════════════════ */

function DonutChart({ summary }: { summary: ReturnType<typeof useProfitReportPage>['summary'] }) {
  const total = summary.revenue || 1
  const segments = [
    { label: 'الربح', value: Math.max(summary.profit, 0), color: '#22c55e' },
    { label: 'التكلفة', value: summary.cost, color: '#ef4444' },
    {
      label: 'غير محسوب',
      value: Math.max(summary.revenue - summary.cost - Math.max(summary.profit, 0), 0),
      color: '#d1d5db',
    },
  ].filter((seg) => seg.value > 0)

  let cumulative = 0
  const radius = 60
  const circumference = 2 * Math.PI * radius

  return (
    <div className={s.donutWrap}>
      <svg className={s.donutSvg} viewBox="0 0 160 160">
        {segments.map((seg, i) => {
          const pct = seg.value / total
          const dash = pct * circumference
          const offset = cumulative * circumference
          cumulative += pct
          return (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="20"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          )
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="14" fontWeight="800" fill="var(--text, #111)">
          {formatPct(summary.avgMarginPct)}
        </text>
        <text x="80" y="94" textAnchor="middle" fontSize="10" fill="var(--muted, #6b7280)">
          هامش الربح
        </text>
      </svg>

      <div className={s.donutLegend}>
        {segments.map((seg, i) => (
          <div key={i} className={s.legendItem}>
            <span className={s.legendDot} style={{ background: seg.color }} />
            <span>{seg.label}</span>
            <span className={s.legendValue}>{formatSar(seg.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   PAGINATION
   ═══════════════════════════════════════════════════ */

function Pagination({
  current,
  total,
  totalItems,
  pageSize,
  onChange,
}: {
  current: number
  total: number
  totalItems: number
  pageSize: number
  onChange: (p: number) => void
}) {
  if (total <= 1) return null

  const start = (current - 1) * pageSize + 1
  const end = Math.min(current * pageSize, totalItems)

  const pages: (number | '...')[] = []
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i)
  } else {
    pages.push(1)
    if (current > 3) pages.push('...')
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i)
    if (current < total - 2) pages.push('...')
    pages.push(total)
  }

  return (
    <div className={s.pagination}>
      <span className={s.paginationInfo}>
        عرض {start}-{end} من {formatNum(totalItems)}
      </span>
      <div className={s.paginationButtons}>
        <button className={s.pageBtn} disabled={current <= 1} onClick={() => onChange(current - 1)}>
          <ChevronRight size={16} />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className={s.pageBtn} style={{ border: 'none', cursor: 'default' }}>
              …
            </span>
          ) : (
            <button
              key={p}
              className={`${s.pageBtn} ${p === current ? s.pageBtnActive : ''}`}
              onClick={() => onChange(p as number)}
            >
              {p}
            </button>
          ),
        )}
        <button className={s.pageBtn} disabled={current >= total} onClick={() => onChange(current + 1)}>
          <ChevronLeft size={16} />
        </button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════
   MAIN PAGE COMPONENT
   ═══════════════════════════════════════════════════ */

export function ProfitReportPage() {
  const rep = useProfitReportPage()

  useEffect(() => {
    void rep.refresh()
  }, [rep.refresh])

  /* ── Determine pagination totals based on active tab ── */
  const activeTotalPages =
    rep.tab === 'invoices'
      ? rep.totalPages
      : rep.tab === 'clients'
        ? rep.totalClientPages
        : rep.tab === 'daily'
          ? Math.ceil(rep.dailyRows.length / rep.pageSize) || 1
          : rep.tab === 'weekly'
            ? Math.ceil(rep.weeklyRows.length / rep.pageSize) || 1
            : rep.tab === 'monthly'
              ? Math.ceil(rep.monthlyRows.length / rep.pageSize) || 1
              : Math.ceil(rep.yearlyRows.length / rep.pageSize) || 1

  const activeTotalItems =
    rep.tab === 'invoices'
      ? rep.totalFiltered
      : rep.tab === 'clients'
        ? rep.allClientRows.length
        : rep.tab === 'daily'
          ? rep.dailyRows.length
          : rep.tab === 'weekly'
            ? rep.weeklyRows.length
            : rep.tab === 'monthly'
              ? rep.monthlyRows.length
              : rep.yearlyRows.length

  return (
    <div className={s.pageWrap}>
      {/* ═══════════════ HEADER ═══════════════ */}
      <div className={s.header}>
        <div className={s.headerTitle}>
          <div className={s.headerIcon}>
            <CircleDollarSign size={22} />
          </div>
          <div>
            <h1 style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>تقرير الأرباح الشامل</h1>
            <p style={{ fontSize: 12, color: 'var(--muted, #6b7280)', fontWeight: 600, margin: 0 }}>
              حساب الأرباح بدقة بناءً على إيرادات الفواتير وتكلفة بوالص DHL
            </p>
          </div>
        </div>

        <div className={s.headerActions}>
          <button
            className={s.btnPrimary}
            onClick={() => void rep.exportReport('xlsx')}
            disabled={rep.loading}
          >
            <FileSpreadsheet size={16} />
            تصدير Excel
          </button>
          <button
            className={s.btnSecondary}
            onClick={() => void rep.exportReport('csv')}
            disabled={rep.loading}
          >
            <Download size={16} />
            تصدير CSV
          </button>
          <button
            className={s.btnIcon}
            onClick={() => void rep.refresh()}
            disabled={rep.loading}
            title="تحديث البيانات"
          >
            <RefreshCw size={18} className={rep.loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ═══════════════ FILTERS ═══════════════ */}
      <div className={s.filtersCard}>
        <div className={s.filtersRow}>
          <div className={s.filtersLabel}>
            <CalendarDays size={16} style={{ color: '#6366f1' }} />
            نطاق التقرير:
          </div>

          <div className={s.periodChips}>
            {PERIODS.map((p) => (
              <button
                key={p.key}
                className={`${s.chip} ${rep.period === p.key ? s.chipActive : ''}`}
                onClick={() => rep.setPeriod(p.key)}
                disabled={rep.loading}
              >
                {p.label}
              </button>
            ))}
          </div>

          {rep.period === 'custom' && (
            <div className={s.dateInputs}>
              <input
                className={s.dateInput}
                type="date"
                value={rep.from}
                onChange={(e) => rep.setFrom(e.target.value)}
                disabled={rep.loading}
              />
              <span style={{ color: 'var(--muted)', fontWeight: 700 }}>—</span>
              <input
                className={s.dateInput}
                type="date"
                value={rep.to}
                onChange={(e) => rep.setTo(e.target.value)}
                disabled={rep.loading}
              />
            </div>
          )}

          <div className={s.rangeBadge}>{rep.range.label}</div>
        </div>

        {/* Local Only Toggle */}
        <div className={s.filtersRow}>
          <div className={s.filtersLabel}>
            <SlidersHorizontal size={16} style={{ color: '#6366f1' }} />
            مصدر البيانات:
          </div>
          <button
            className={`${s.localToggle} ${rep.localOnly ? s.localToggleActive : ''}`}
            onClick={() => rep.setLocalOnly(!rep.localOnly)}
          >
            <div className={`${s.toggleDot} ${rep.localOnly ? s.toggleDotActive : ''}`} />
            فواتير الموقع فقط
          </button>
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
            {rep.localOnly ? (
              <>
                <AlertTriangle size={12} style={{ display: 'inline', marginInlineEnd: 4 }} />
                يتم احتساب الربح على الفواتير المنشأة يدوياً فقط (بدون فواتير دفترة)
              </>
            ) : (
              'يتم احتساب كل الفواتير'
            )}
          </span>
        </div>
      </div>

      {/* ═══════════════ KPI CARDS ═══════════════ */}
      <div className={s.kpiGrid}>
        {Object.values(rep.summaryCards).map((c) => (
          <div key={c.label} className={s.kpiCard}>
            <div className={s.kpiTop}>
              <span className={s.kpiLabel}>{c.label}</span>
              <span className={s.kpiDot} style={{ background: c.color }} />
            </div>
            <div className={s.kpiValue} style={{ color: c.color }}>
              {c.value}
            </div>
            <div className={s.kpiSub}>{c.sub}</div>
            <div className={s.kpiBg} style={{ background: c.color }} />
          </div>
        ))}
      </div>

      {/* ═══════════════ CHARTS ═══════════════ */}
      <div className={s.chartsGrid}>
        {/* Bar Chart */}
        <div className={s.chartCard}>
          <div className={s.chartTitle}>
            <BarChart3 size={18} style={{ color: '#6366f1' }} />
            الإيرادات مقابل التكلفة والربح — شهرياً
          </div>
          <MiniBarChart data={rep.chartData} />
        </div>

        {/* Donut Chart */}
        <div className={s.chartCard}>
          <div className={s.chartTitle}>
            <CircleDollarSign size={18} style={{ color: '#6366f1' }} />
            توزيع الإيرادات
          </div>
          <DonutChart summary={rep.summary} />
        </div>
      </div>

      {/* ═══════════════ TABLE SECTION ═══════════════ */}
      <div className={s.tableCard}>
        {/* Table Header: Tabs + Search */}
        <div className={s.tableHeader}>
          <div className={s.tabChips}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginInlineEnd: 8, alignSelf: 'center' }}>
              تجميع حسب:
            </span>
            {TABS.map((t) => {
              const Icon = t.icon
              const isActive = rep.tab === t.key
              return (
                <button
                  key={t.key}
                  className={`${s.tabChip} ${isActive ? s.tabChipActive : ''}`}
                  onClick={() => rep.setTab(t.key)}
                  disabled={rep.loading}
                >
                  <Icon size={16} />
                  {t.label}
                </button>
              )
            })}
          </div>

          <div className={s.searchBox}>
            <Search size={16} className={s.searchIcon} />
            <input
              className={s.searchInput}
              type="text"
              placeholder="بحث بالعميل أو رقم الفاتورة أو AWB..."
              value={rep.query}
              onChange={(e) => rep.setQuery(e.target.value)}
              // Remove disabled={rep.loading} to prevent focus loss during instant search
            />
          </div>
        </div>

        {/* Error */}
        {rep.error && <div className={s.errorBox}>{rep.error}</div>}

        {/* Table Content */}
        <div className={s.tableWrap}>
          {/* ── INVOICES TAB ── */}
          {rep.tab === 'invoices' && (
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>رقم الفاتورة</th>
                  <th className={s.th}>التاريخ</th>
                  <th className={s.th}>العميل</th>
                  <th className={s.th}>AWB</th>
                  <th className={s.th}>الناقل</th>
                  <th className={s.th}>الحالة</th>
                  <th className={s.th}>السعر</th>
                  <th className={s.th}>تكلفة DHL</th>
                  <th className={s.th}>صافي الربح</th>
                  <th className={s.th} style={{ textAlign: 'left' }}>هامش %</th>
                </tr>
              </thead>
              <tbody>
                {rep.invoiceRows.length ? (
                  rep.invoiceRows.map((r) => {
                    const isLoss = r.hasCost && (r.profit ?? 0) < 0
                    return (
                      <tr key={r.id} className={isLoss ? s.rowLoss : ''}>
                        <td className={`${s.td} ${s.mono}`}>
                          #{r.invoiceNumber || r.id}
                        </td>
                        <td className={`${s.td} ${s.mono}`} style={{ color: 'var(--muted)' }}>
                          {r.date}
                        </td>
                        <td className={s.td} style={{ fontWeight: 700, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.client}>
                          {r.client}
                        </td>
                        <td className={`${s.td} ${s.mono}`} style={{ color: 'var(--muted)' }}>
                          {r.awb || '—'}
                        </td>
                        <td className={s.td} style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
                          {r.carrier}
                        </td>
                        <td className={s.td}>
                          <span className={`${s.statusBadge} ${statusColor(r.status)}`}>
                            {statusLabel(r.status)}
                          </span>
                        </td>
                        <td className={`${s.td} ${s.mono} ${s.gold}`}>
                          {formatSar(r.price)}
                        </td>
                        <td className={`${s.td} ${s.mono} ${r.hasCost ? s.red : s.muted}`}>
                          {r.hasCost && r.cost != null ? formatSar(r.cost) : '—'}
                        </td>
                        <td className={`${s.td} ${s.mono} ${profitColorClass(r.profit)}`}>
                          {r.hasCost && r.profit != null
                            ? `${r.profit > 0 ? '+' : ''}${formatSar(r.profit)}`
                            : '—'}
                        </td>
                        <td className={s.td} style={{ textAlign: 'left' }}>
                          {r.hasCost && r.marginPct != null ? (
                            <span
                              className={s.mono}
                              style={{
                                padding: '3px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 800,
                                background:
                                  r.marginPct >= 0
                                    ? 'rgba(34,197,94,0.1)'
                                    : 'rgba(239,68,68,0.1)',
                                color: r.marginPct >= 0 ? '#22c55e' : '#ef4444',
                                border: `1px solid ${r.marginPct >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                              }}
                            >
                              {r.marginPct > 0 ? '+' : ''}
                              {r.marginPct.toFixed(1)}%
                            </span>
                          ) : (
                            <span className={s.muted}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className={s.emptyState}>
                      <RefreshCw
                        size={24}
                        style={{ margin: '0 auto 8px', display: 'block' }}
                        className={rep.loading ? 'animate-spin' : ''}
                      />
                      {rep.loading ? 'جاري التحميل...' : 'لا توجد نتائج'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* ── CLIENTS TAB ── */}
          {rep.tab === 'clients' && (
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>العميل</th>
                  <th className={s.th}>عدد الفواتير</th>
                  <th className={s.th}>الإيرادات</th>
                  <th className={s.th}>تكلفة DHL</th>
                  <th className={s.th}>صافي الربح</th>
                  <th className={s.th} style={{ textAlign: 'left' }}>هامش %</th>
                </tr>
              </thead>
              <tbody>
                {rep.clientRows.length ? (
                  rep.clientRows.map((r) => (
                    <tr key={r.client} className={r.profit < 0 ? s.rowLoss : ''}>
                      <td className={s.td} style={{ fontWeight: 700, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.client}>
                        {r.client}
                      </td>
                      <td className={`${s.td} ${s.mono}`}>
                        <span style={{
                          background: 'var(--bg, #f9fafb)',
                          border: '1px solid var(--border, #e5e7eb)',
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 12,
                        }}>
                          {r.count}
                        </span>
                      </td>
                      <td className={`${s.td} ${s.mono} ${s.gold}`}>{formatSar(r.revenue)}</td>
                      <td className={`${s.td} ${s.mono} ${s.red}`}>{formatSar(r.cost)}</td>
                      <td className={`${s.td} ${s.mono} ${profitColorClass(r.profit)}`}>
                        {r.profit > 0 ? '+' : ''}{formatSar(r.profit)}
                      </td>
                      <td className={s.td} style={{ textAlign: 'left' }}>
                        <span
                          className={s.mono}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 800,
                            background: r.marginPct != null && r.marginPct >= 0
                              ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            color: r.marginPct != null && r.marginPct >= 0 ? '#22c55e' : '#ef4444',
                            border: `1px solid ${r.marginPct != null && r.marginPct >= 0
                              ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                          }}
                        >
                          {r.marginPct == null ? '—' : `${r.marginPct > 0 ? '+' : ''}${r.marginPct.toFixed(1)}%`}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className={s.emptyState}>
                      <RefreshCw
                        size={24}
                        style={{ margin: '0 auto 8px', display: 'block' }}
                        className={rep.loading ? 'animate-spin' : ''}
                      />
                      {rep.loading ? 'جاري التحميل...' : 'لا توجد نتائج'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {/* ── AGGREGATED TIME TABS (Daily, Weekly, Monthly, Yearly) ── */}
          {['daily', 'weekly', 'monthly', 'yearly'].includes(rep.tab) && (
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>الفترة</th>
                  <th className={s.th}>عدد الفواتير</th>
                  <th className={s.th}>الإيرادات</th>
                  <th className={s.th}>التكلفة</th>
                  <th className={s.th}>صافي الربح</th>
                  <th className={s.th} style={{ textAlign: 'left' }}>هامش %</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const rows = rep.tab === 'daily' ? rep.dailyRows : 
                               rep.tab === 'weekly' ? rep.weeklyRows :
                               rep.tab === 'monthly' ? rep.monthlyRows : rep.yearlyRows;
                  
                  if (!rows.length) {
                    return (
                      <tr>
                        <td colSpan={6} className={s.emptyState}>
                          {rep.loading ? 'جاري التحميل...' : 'لا توجد نتائج'}
                        </td>
                      </tr>
                    );
                  }

                  return rows.map((r) => (
                    <tr key={r.month}>
                      <td className={s.td} style={{ fontWeight: 700 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CalendarDays size={14} style={{ color: 'var(--muted)' }} />
                          {rep.tab === 'monthly' ? formatMonthLabel(r.month) : r.month}
                        </span>
                      </td>
                      <td className={`${s.td} ${s.mono}`}>
                        <span style={{
                          background: 'var(--bg, #f9fafb)',
                          border: '1px solid var(--border, #e5e7eb)',
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 12,
                        }}>
                          {r.count}
                        </span>
                      </td>
                      <td className={`${s.td} ${s.mono} ${s.gold}`}>{formatSar(r.revenue)}</td>
                      <td className={`${s.td} ${s.mono} ${s.red}`}>{formatSar(r.cost)}</td>
                      <td className={`${s.td} ${s.mono} ${profitColorClass(r.profit)}`}>
                        {r.profit > 0 ? '+' : ''}{formatSar(r.profit)}
                      </td>
                      <td className={s.td} style={{ textAlign: 'left' }}>
                        <span
                          className={s.mono}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 8,
                            fontSize: 12,
                            fontWeight: 800,
                            background: r.marginPct != null && r.marginPct >= 0
                              ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            color: r.marginPct != null && r.marginPct >= 0 ? '#22c55e' : '#ef4444',
                            border: `1px solid ${r.marginPct != null && r.marginPct >= 0
                              ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                          }}
                        >
                          {r.marginPct == null ? '—' : `${r.marginPct > 0 ? '+' : ''}${r.marginPct.toFixed(1)}%`}
                        </span>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination ── */}
        <Pagination
          current={rep.currentPage}
          total={activeTotalPages}
          totalItems={activeTotalItems}
          pageSize={rep.pageSize}
          onChange={rep.setCurrentPage}
        />
      </div>
    </div>
  )
}