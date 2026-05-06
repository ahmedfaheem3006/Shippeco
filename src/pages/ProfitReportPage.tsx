import { useEffect, useState } from 'react'
import { useProfitReportPage } from '../hooks/useProfitReportPage'
import {
  formatSar,
  formatNum,
  formatMonthLabel,
  statusLabel,
  statusColor,
  type ProfitPeriod,
  type ProfitTab,
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
  Edit3,
  ListTodo,
  User,
  X,
  MessageSquare,
} from 'lucide-react'
import { useAuthStore } from '../hooks/useAuthStore'
import { InvoiceWizardModal } from '../components/Invoices/InvoiceWizardModal'
import { toDraftFromInvoice } from '../utils/invoiceWizard'
import { api } from '../utils/apiClient'
import s from './ProfitReportPage.module.css'

function timeAgo(dateStr: string): string {
  if (!dateStr) return '—';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  if (diffHr < 24) return `منذ ${diffHr} ساعة`;
  if (diffDay < 7) return `منذ ${diffDay} يوم`;
  return new Date(dateStr).toLocaleDateString('ar-EG');
}

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

/*
/*
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
*/

/* ═══════════════════════════════════════════════════
   DONUT CHART (Pure SVG)
   ═══════════════════════════════════════════════════ */

/*
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
  const user = useAuthStore((st) => st.user)
  
  // ── Wizard / Edit State ──
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardKey, setWizardKey] = useState(0)
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null)
  const [wizardInitialDraft, setWizardInitialDraft] = useState<any>(undefined)
  const [wizardTitle, setWizardTitle] = useState<string | undefined>(undefined)
  const [mutating, setMutating] = useState(false)

  // ── Task Modal State ──
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskInvoice, setTaskInvoice] = useState<any>(null)
  const [usersList, setUsersList] = useState<{id: number, full_name: string, role: string}[]>([])
  const [taskRecipientId, setTaskRecipientId] = useState('')
  const [taskNotes, setTaskNotes] = useState('')
  const [taskLoading, setTaskLoading] = useState(false)
  const [taskHistory, setTaskHistory] = useState<any[]>([])

  const handleEdit = (inv: any) => {
    if (!inv) return
    setEditingInvoiceId(String(inv.id))
    setWizardInitialDraft(toDraftFromInvoice(inv))
    setWizardTitle(`تعديل الفاتورة #${inv.invoice_number || inv.daftra_id || inv.id}`)
    setWizardKey((k) => k + 1)
    setWizardOpen(true)
  }

  const handleOpenTaskModal = async (inv: any) => {
    setTaskInvoice(inv)
    setTaskModalOpen(true)
    setTaskNotes('')
    setTaskRecipientId('')
    setTaskLoading(true)
    try {
      const [uRes, hRes] = await Promise.all([
        api.get('/users/list'),
        api.get(`/notifications/invoice/${inv.id}`)
      ]);
      setUsersList(Array.isArray(uRes) ? uRes : (uRes as any).data || [])
      setTaskHistory(Array.isArray(hRes) ? hRes : (hRes as any).data || [])
    } catch (e: any) {
      console.error('[ProfitReport] Failed to load task data', e)
    } finally {
      setTaskLoading(false)
    }
  }

  const handleSendTask = async () => {
    if (!taskRecipientId || !taskNotes.trim() || !taskInvoice) return
    setTaskLoading(true)
    try {
      await api.post('/notifications/send', {
        recipientId: taskRecipientId,
        message: taskNotes,
        data: { 
          invoiceId: taskInvoice.id, 
          invoiceNumber: taskInvoice.invoice_number || taskInvoice.daftra_id || taskInvoice.id 
        }
      })
      setTaskModalOpen(false)
      window.alert('تم إرسال المهمة بنجاح')
    } catch (err: any) {
      console.error('[ProfitReport] Send task failed', err)
      window.alert((err as any).response?.data?.error || 'حدث خطأ أثناء الإرسال')
    } finally {
      setTaskLoading(false)
    }
  }

  const onWizardSave = async (draft: any, options: { asDraft: boolean }) => {
    if (mutating) return
    setMutating(true)
    try {
      await api.put(`/invoices/${editingInvoiceId}`, {
        ...draft,
        isDraft: options.asDraft,
      })
      setWizardOpen(false)
      void rep.refresh()
    } catch (e: any) {
      window.alert('فشل حفظ التغييرات: ' + (e.message || 'خطأ غير معروف'))
    } finally {
      setMutating(false)
    }
  }

  useEffect(() => {
    void rep.refresh()
  }, [])

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

      {/* ═══════════════ CHARTS (Commented Out) ═══════════════ */}
      {/* 
      <div className={s.chartsGrid}>
        <div className={s.chartCard}>
          <div className={s.chartTitle}>
            <BarChart3 size={18} style={{ color: '#6366f1' }} />
            الإيرادات مقابل التكلفة والربح — شهرياً
          </div>
          <MiniBarChart data={rep.chartData} />
        </div>

        <div className={s.chartCard}>
          <div className={s.chartTitle}>
            <CircleDollarSign size={18} style={{ color: '#6366f1' }} />
            توزيع الإيرادات
          </div>
          <DonutChart summary={rep.summary} />
        </div>
      </div>
      */}

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
                  <th className={s.th} style={{ textAlign: 'center' }}>الإجراءات</th>
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
                        <td className={s.td}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <button 
                              onClick={() => handleEdit(r.raw)} 
                              className={s.actionBtn} 
                              title="تعديل الفاتورة"
                              style={{ color: '#eab308', background: 'rgba(234,179,8,0.1)', border: 'none', padding: 6, borderRadius: 4, cursor: 'pointer' }}
                            >
                              <Edit3 size={14} />
                            </button>
                            <button 
                              onClick={() => handleOpenTaskModal(r.raw)} 
                              className={s.actionBtn} 
                              title="إرسال مهمة"
                              style={{ color: '#6366f1', background: 'rgba(99,102,241,0.1)', border: 'none', padding: 6, borderRadius: 4, cursor: 'pointer' }}
                            >
                              <ListTodo size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className={s.emptyState}>
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
      </div>

      {/* Pagination */}
      {rep.tab === 'invoices' && (
        <Pagination
          current={rep.currentPage}
          total={rep.totalPages}
          totalItems={rep.totalFiltered}
          pageSize={rep.pageSize}
          onChange={rep.setCurrentPage}
        />
      )}
      
      {rep.tab === 'clients' && (
        <Pagination
          current={rep.currentPage}
          total={rep.totalClientPages}
          totalItems={rep.allClientRows.length}
          pageSize={rep.pageSize}
          onChange={rep.setCurrentPage}
        />
      )}

      {/* ── MODALS ── */}
      {wizardOpen && (
        <InvoiceWizardModal
          key={wizardKey}
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onSave={onWizardSave}
          initialDraft={wizardInitialDraft}
          title={wizardTitle}
          saving={mutating}
        />
      )}

      {/* Task Modal / Chat */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setTaskModalOpen(false)}>
          <div className="w-full max-w-2xl bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-100 dark:border-slate-700 flex flex-col h-[80vh]" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700/50 flex items-center justify-between bg-white dark:bg-slate-800 shrink-0">
              <div className="flex items-center gap-3 text-right" dir="rtl">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl text-indigo-600 dark:text-indigo-400">
                  <ListTodo size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">المهام والمراسلات</h3>
                  <p className="text-[10px] text-gray-500 font-bold">فاتورة #{taskInvoice?.invoice_number || taskInvoice?.daftra_id || taskInvoice?.id}</p>
                </div>
              </div>
              <button onClick={() => setTaskModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full transition-all">
                <X size={20} />
              </button>
            </div>

            {/* Chat History */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50 dark:bg-slate-900/50" dir="rtl">
              {taskLoading && taskHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <RefreshCw size={24} className="animate-spin mb-2" />
                  <p className="text-xs font-bold">جاري تحميل المراسلات...</p>
                </div>
              ) : taskHistory.length > 0 ? (
                taskHistory.map((msg, idx) => {
                  const isMe = String(msg.data?.senderId) === String(user?.id);
                  const sName = msg.sender_name || 'موظف';
                  const rName = msg.recipient_name || 'موظف';

                  return (
                    <div key={msg.id || idx} className={`flex flex-col ${isMe ? 'items-start' : 'items-end'} animate-in fade-in slide-in-from-bottom-2 mb-4`}>
                      <div className="flex items-center gap-2 mb-1 px-1">
                        <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
                          {sName}
                        </span>
                        <span className="text-[9px] text-gray-400 font-medium">
                          • {timeAgo(msg.created_at)}
                        </span>
                      </div>
                      
                      <div className={`max-w-[90%] rounded-2xl px-4 py-3 shadow-md ${
                        isMe 
                          ? 'bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-900/30 text-gray-900 dark:text-white rounded-tr-none' 
                          : 'bg-indigo-600 text-white rounded-tl-none'
                      }`}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">{msg.message}</p>
                      </div>

                      <div className={`mt-2 flex ${isMe ? 'justify-start' : 'justify-end'}`}>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-100 dark:border-indigo-800/30 text-[10px] font-bold shadow-sm hover:scale-105 transition-transform cursor-default">
                          <User size={10} />
                          موجه إلى: {rName}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 opacity-50">
                  <MessageSquare size={48} className="mb-4" />
                  <p className="text-sm font-bold">لا توجد مراسلات سابقة لهذه الفاتورة</p>
                  <p className="text-xs mt-1">ابدأ بإرسال أول مهمة أو استفسار</p>
                </div>
              )}
            </div>

            {/* Reply / Send Form */}
            <div className="p-6 border-t border-gray-100 dark:border-slate-700/50 bg-white dark:bg-slate-800 shrink-0" dir="rtl">
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-[11px] font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mr-1">
                      <User size={14} className="text-indigo-500" /> توجيه إلى
                    </label>
                    <select
                      value={taskRecipientId}
                      onChange={(e) => setTaskRecipientId(e.target.value)}
                      className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-bold"
                      disabled={taskLoading}
                    >
                      <option value="">-- اختر الموظف --</option>
                      {usersList.map((u) => (
                        <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    value={taskNotes}
                    onChange={(e) => setTaskNotes(e.target.value)}
                    placeholder="اكتب ردك أو تفاصيل المهمة هنا..."
                    className="w-full h-24 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-all placeholder:text-gray-400"
                    disabled={taskLoading}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) {
                        void handleSendTask();
                      }
                    }}
                  />
                  <div className="absolute left-3 bottom-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSendTask}
                      disabled={taskLoading || !taskRecipientId || !taskNotes.trim()}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:grayscale flex items-center gap-2"
                    >
                      {taskLoading ? 'جاري الإرسال...' : 'إرسال'}
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 text-center font-medium">Ctrl + Enter للإرسال السريع</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}