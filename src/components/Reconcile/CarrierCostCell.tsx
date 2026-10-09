import { Check, Loader2, X } from 'lucide-react'
import type { CostAction } from '../../services/reconcileService'
import { COST_BLOCK_TEXT, formatSar } from '../../utils/carrierCost'

type Props = {
  action: CostAction | null | undefined
  /** Fallback amount for rows without a verified cost (the extracted DHL price). */
  fallbackAmount?: number | null
  busy: 'apply' | 'reject' | null
  onApply: () => void
  onReject: () => void
}

/**
 * "تكلفة الناقل الأصلية من DHL" cell: the TOTAL CHARGE of the AWB and the
 * accountant's ✓ / ✕. States (all decided by the server):
 *   pending  → amount + ✓ + ✕
 *   applying → buttons disabled, spinner on the pressed one
 *   applied  → "✓ تم إضافتها"  (only after the server confirmed)
 *   rejected → "تم إزالتها"
 *   blocked  → reason label (+ ✕ to ignore the record)
 * An error leaves the buttons in place (the page shows a toast).
 */
export function CarrierCostCell({ action, fallbackAmount, busy, onApply, onReject }: Props) {
  if (!action) return <span className="text-gray-400 font-bold">{formatSar(fallbackAmount)}</span>
  const amount = action.amount ?? (action.state === 'blocked' ? null : fallbackAmount ?? null)
  const amountText = amount !== null ? formatSar(amount) : action.candidates.length ? action.candidates.map((c) => formatSar(c)).join(' / ') : '—'
  const btn = 'inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'

  return (
    <div className="flex items-center gap-2" data-testid="carrier-cost-cell" data-state={action.state}>
      <span className={`font-bold tabular-nums ${amount !== null ? 'text-yellow-600 dark:text-yellow-500' : 'text-gray-400'}`} dir="ltr">{amountText}</span>

      {action.state === 'applied' && (
        <span
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border text-green-700 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800/30 dark:text-green-400"
          title={`تم تحديث تكلفة الناقل في الفاتورة${action.previous_cost !== null ? ` من ${formatSar(action.previous_cost)}` : ''} إلى ${formatSar(action.applied_cost)}${action.decided_by_name ? ` — ${action.decided_by_name}` : ''}`}
        >
          <Check size={13} strokeWidth={3} /> تم إضافتها
        </span>
      )}

      {action.state === 'rejected' && (
        <span className="inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold border text-gray-500 bg-gray-50 border-gray-200 dark:bg-slate-900 dark:border-slate-700 dark:text-gray-400"
          title={`تم تجاهل القيمة — الفاتورة لم تتغير${action.decided_by_name ? ` — ${action.decided_by_name}` : ''}`}>
          تم إزالتها
        </span>
      )}

      {action.state === 'blocked' && action.reason && (
        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-bold border ${COST_BLOCK_TEXT[action.reason]?.cls ?? ''}`} title={COST_BLOCK_TEXT[action.reason]?.hint}>
          {COST_BLOCK_TEXT[action.reason]?.label ?? 'يحتاج مراجعة'}
        </span>
      )}

      {action.can_apply && (
        <button type="button" className={`${btn} border-green-300 text-green-600 bg-green-50 hover:bg-green-600 hover:text-white dark:bg-green-900/20 dark:border-green-800/40`}
          onClick={onApply} disabled={busy !== null}
          aria-label={`اعتماد تكلفة الناقل ${formatSar(amount)} في الفاتورة`} title="اعتماد القيمة في الفاتورة">
          {busy === 'apply' ? <Loader2 size={15} className="animate-spin" /> : <Check size={16} strokeWidth={3} />}
        </button>
      )}
      {action.can_reject && (
        <button type="button" className={`${btn} border-gray-200 text-gray-500 bg-white hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:bg-slate-900 dark:border-slate-700`}
          onClick={onReject} disabled={busy !== null}
          aria-label="تجاهل القيمة وعدم تطبيقها على الفاتورة" title="تجاهل القيمة (لا تغيّر الفاتورة)">
          {busy === 'reject' ? <Loader2 size={15} className="animate-spin" /> : <X size={16} strokeWidth={3} />}
        </button>
      )}
    </div>
  )
}
