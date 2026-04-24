import { useEffect } from 'react'
import { useAuditLogPage } from '../hooks/useAuditLogPage'
import { formatAtShort, formatAuditType } from '../utils/auditLog'
import {
  ClipboardList, CheckCircle2, Clock, Trash2,
  Download, FileSpreadsheet, RefreshCw, Search,
  Lock, CreditCard, Edit, Plus, ChevronLeft, ChevronRight,
  Shield, Hash,
} from 'lucide-react'

function formatNum(n: number): string {
  return n.toLocaleString('en-US')
}

/* ── Pagination ── */
function Pagination({
  current, total, totalItems, pageSize, onChange,
}: {
  current: number; total: number; totalItems: number; pageSize: number; onChange: (p: number) => void
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
    <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-5 py-3 border-t border-gray-200 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-800/50">
      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 font-inter">
        عرض {start}-{end} من {formatNum(totalItems)}
      </span>
      <div className="flex gap-1">
        <button
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold disabled:opacity-40 hover:border-indigo-400 transition-colors"
          disabled={current <= 1}
          onClick={() => onChange(current - 1)}
        >
          <ChevronRight size={14} />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`d${i}`} className="flex items-center justify-center w-8 h-8 text-gray-400 text-xs">…</span>
          ) : (
            <button
              key={p}
              className={`flex items-center justify-center w-8 h-8 rounded-lg border text-xs font-bold font-inter transition-colors ${
                p === current
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-400'
              }`}
              onClick={() => onChange(p as number)}
            >
              {p}
            </button>
          ),
        )}
        <button
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold disabled:opacity-40 hover:border-indigo-400 transition-colors"
          disabled={current >= total}
          onClick={() => onChange(current + 1)}
        >
          <ChevronLeft size={14} />
        </button>
      </div>
    </div>
  )
}

/* ── Action badge styles ── */
function getActionStyle(action: string): { icon: typeof Lock; color: string } {
  const map: Record<string, { icon: typeof Lock; color: string }> = {
    login: { icon: Lock, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/30' },
    create: { icon: Plus, color: 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/30' },
    update: { icon: Edit, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/30' },
    delete: { icon: Trash2, color: 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30' },
    import: { icon: Download, color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800/30' },
    export: { icon: FileSpreadsheet, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-800/30' },
    payment_link: { icon: CreditCard, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800/30' },
    paid: { icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/30' },
  }
  return map[action] || { icon: ClipboardList, color: 'text-gray-500 bg-gray-50 dark:bg-slate-900 border-gray-200 dark:border-slate-700' }
}

/* ═══════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════ */

export function AuditLogPage() {
  const aud = useAuditLogPage()

  useEffect(() => {
    void aud.refresh()
  }, [aud.refresh])

  return (
    <div className="space-y-5 animate-in fade-in duration-300 pb-20 lg:pb-0">
      {/* ── Header ── */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-xl border border-indigo-200 dark:border-indigo-800/30">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="font-bold text-lg text-gray-900 dark:text-white">سجل العمليات والتدقيق</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">تتبع كل العمليات: إنشاء، تعديل، حذف، دخول، دفع</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
          <button
            className="flex-1 xl:flex-none flex justify-center items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl border border-indigo-200 dark:border-indigo-800/30 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition disabled:opacity-50"
            onClick={() => void aud.exportReport('xlsx')}
            disabled={aud.loading}
          >
            <FileSpreadsheet size={16} /> Excel
          </button>
          <button
            className="flex-1 xl:flex-none flex justify-center items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl border border-blue-200 dark:border-blue-800/30 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 transition disabled:opacity-50"
            onClick={() => void aud.exportReport('csv')}
            disabled={aud.loading}
          >
            <Download size={16} /> CSV
          </button>
          <button
            className="flex-none p-2.5 rounded-xl text-gray-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-700 transition disabled:opacity-50"
            onClick={() => void aud.refresh()}
            disabled={aud.loading}
          >
            <RefreshCw size={18} className={aud.loading ? 'animate-spin text-indigo-500' : ''} />
          </button>
          <button
            className="flex-none flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl border border-red-200 dark:border-red-800/30 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 transition disabled:opacity-50"
            onClick={() => { if (confirm('هل أنت متأكد من مسح كل السجلات؟')) void aud.clear() }}
            disabled={aud.saving || aud.loading}
          >
            <Trash2 size={16} /> <span className="hidden sm:inline">مسح</span>
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-gray-500">إجمالي العمليات</span>
            <ClipboardList size={18} className="text-indigo-500 opacity-60" />
          </div>
          <div className="text-3xl font-black font-inter text-indigo-600">{formatNum(aud.summary.total)}</div>
          <div className="text-[10px] text-gray-400 font-semibold mt-1">كل العمليات المسجلة</div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-gray-500">إنشاء / تعديل / حذف</span>
            <CheckCircle2 size={18} className="text-amber-500 opacity-60" />
          </div>
          <div className="flex items-end gap-2 font-inter font-bold">
            <span className="text-green-600 text-xl">{formatNum(aud.getTypeCount('create'))}</span>
            <span className="text-gray-300">/</span>
            <span className="text-amber-600 text-2xl">{formatNum(aud.getTypeCount('update'))}</span>
            <span className="text-gray-300">/</span>
            <span className="text-red-600 text-xl">{formatNum(aud.getTypeCount('delete'))}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-gray-500">تسجيلات الدخول</span>
            <Lock size={18} className="text-blue-500 opacity-60" />
          </div>
          <div className="text-3xl font-black font-inter text-blue-600">{formatNum(aud.getTypeCount('login'))}</div>
          <div className="text-[10px] text-gray-400 font-semibold mt-1">عمليات تسجيل الدخول</div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-gray-200 dark:border-slate-700 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-xs font-bold text-gray-500">آخر عملية</span>
            <Clock size={18} className="text-green-500 opacity-60" />
          </div>
          <div className="text-lg font-bold font-inter text-green-600">
            {aud.summary.lastAt ? formatAtShort(aud.summary.lastAt) : '—'}
          </div>
          <div className="text-[10px] text-gray-400 font-semibold mt-1">آخر نشاط مسجل</div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center">
        <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-2 lg:pb-0">
          <span className="text-xs font-bold text-gray-500 whitespace-nowrap hidden sm:block">فلتر النوع:</span>
          {aud.typeOptions.map((t) => (
            <button
              key={t.key}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition whitespace-nowrap ${
                aud.type === t.key
                  ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800/30 text-indigo-600 shadow-sm'
                  : 'bg-gray-50 dark:bg-slate-900 border-transparent text-gray-500 hover:border-gray-200 hover:text-gray-900'
              }`}
              onClick={() => aud.setType(t.key)}
              disabled={aud.loading}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-80">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl py-2 pr-10 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            type="text"
            placeholder="بحث بالمستخدم أو الوصف أو الكيان..."
            value={aud.query}
            onChange={(e) => aud.setQuery(e.target.value)}
            disabled={aud.loading}
          />
        </div>
      </div>

      {/* ── Messages ── */}
      {aud.error && (
        <div className="text-red-600 text-xs font-bold bg-red-50 dark:bg-red-900/20 p-3 rounded-xl border border-red-200 dark:border-red-800/30">
          {aud.error}
        </div>
      )}
      {aud.status && (
        <div className="text-green-600 text-xs font-bold bg-green-50 dark:bg-green-900/20 p-3 rounded-xl border border-green-200 dark:border-green-800/30">
          {aud.status}
        </div>
      )}

      {/* ── Table ── */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-right border-collapse whitespace-nowrap min-w-[900px]">
            <thead className="sticky top-0 bg-gray-50 dark:bg-slate-900 z-10 border-b border-gray-200 dark:border-slate-700">
              <tr className="text-gray-500 text-[11px] uppercase font-bold tracking-wider">
                <th className="p-4 w-40">الوقت والتاريخ</th>
                <th className="p-4 w-28">المستخدم</th>
                <th className="p-4 w-28">العملية</th>
                <th className="p-4 w-28">الكيان</th>
                <th className="p-4">الوصف</th>
                <th className="p-4 w-56">التفاصيل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/50">
              {aud.entries.length ? (
                aud.entries.map((e) => {
                  const actionInfo = getActionStyle(e.type)
                  const ActionIcon = actionInfo.icon
                  return (
                    <tr key={e.id} className="hover:bg-gray-50/80 dark:hover:bg-slate-700/30 transition-colors group">
                      <td className="p-3 text-xs font-mono text-gray-500 font-bold">{formatAtShort(e.at)}</td>
                      <td className="p-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-bold text-gray-900 dark:text-white">
                            {e.user || '—'}
                          </span>
                          {e.userEmail && e.userEmail !== e.user && (
                            <span className="text-[10px] font-semibold text-gray-400 font-mono">
                              {e.userEmail}
                            </span>
                          )}
                          {e.userRole && (
                            <span className="text-[10px] font-bold" style={{
                              color: e.userRole === 'admin' ? '#6366f1' : e.userRole === 'accountant' ? '#eab308' : '#6b7280'
                            }}>
                              {e.userRole === 'admin' ? '👑 مدير النظام' : e.userRole === 'accountant' ? '📊 محاسب' : e.userRole}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${actionInfo.color}`}>
                          <ActionIcon size={12} />
                          {formatAuditType(e.type)}
                        </span>
                      </td>
                      <td className="p-3">
                        {e.entityType && (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                            <Hash size={10} />
                            {e.entityType}
                            {e.entityId ? ` #${e.entityId}` : ''}
                          </span>
                        )}
                        {!e.entityType && <span className="text-gray-400 text-xs">—</span>}
                      </td>
                      <td className="p-3 text-sm font-semibold text-gray-700 dark:text-gray-300 truncate max-w-xs" title={e.note}>
                        {e.note || '—'}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-gray-400 truncate max-w-[220px] group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" title={e.meta ? JSON.stringify(e.meta) : ''}>
                        {e.meta ? JSON.stringify(e.meta).slice(0, 80) : '—'}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="p-16 text-center text-gray-400 font-bold">
                    {aud.loading ? (
                      <><RefreshCw size={28} className="animate-spin text-indigo-500 mx-auto mb-2" /><p>جاري التحميل...</p></>
                    ) : (
                      <><Search size={28} className="text-gray-300 mx-auto mb-2" /><p>لا توجد سجلات</p></>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination
          current={aud.currentPage}
          total={aud.totalPages}
          totalItems={aud.totalAll}
          pageSize={aud.pageSize}
          onChange={aud.setCurrentPage}
        />

        {/* Footer Stats */}
        <div className="bg-gray-50/80 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 p-3 flex flex-wrap gap-2 text-xs font-bold">
          <span className="px-3 py-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg">
            <span className="text-gray-400 mr-1">الإجمالي:</span>
            <span className="font-inter">{formatNum(aud.totalAll)}</span>
          </span>
          <span className="px-3 py-1 bg-green-50 border border-green-200 rounded-lg text-green-600 flex items-center gap-1">
            <Plus size={10} /> {formatNum(aud.getTypeCount('create'))}
          </span>
          <span className="px-3 py-1 bg-amber-50 border border-amber-200 rounded-lg text-amber-600 flex items-center gap-1">
            <Edit size={10} /> {formatNum(aud.getTypeCount('update'))}
          </span>
          <span className="px-3 py-1 bg-red-50 border border-red-200 rounded-lg text-red-600 flex items-center gap-1">
            <Trash2 size={10} /> {formatNum(aud.getTypeCount('delete'))}
          </span>
          <span className="px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg text-blue-600 flex items-center gap-1">
            <Lock size={10} /> {formatNum(aud.getTypeCount('login'))}
          </span>
        </div>
      </div>
    </div>
  )
}