/**
 * Invoice profitability as computed by the backend (single rule shared with
 * the profit report, exports and loss alerts):
 *   net = invoice total − DHL cost, only for invoices with a DHL cost that
 *   are not returned. Without a cost an invoice is "no_cost", never profit.
 */
import type { Invoice } from './models'

export type ProfitFilter = '' | 'profit' | 'loss' | 'break_even' | 'no_cost'
export type ProfitStatus = NonNullable<Invoice['profit_status']>

export const PROFIT_FILTER_OPTIONS: { key: ProfitFilter; label: string }[] = [
  { key: '', label: 'كل الفواتير (الربحية)' },
  { key: 'profit', label: 'رابحة' },
  { key: 'loss', label: 'خاسرة' },
  { key: 'break_even', label: 'متعادلة (صافي = 0)' },
  { key: 'no_cost', label: 'بدون تكلفة DHL' },
]

export const PROFIT_STATUS_LABEL: Record<ProfitStatus, string> = {
  profit: 'ربح',
  loss: 'خسارة',
  break_even: 'تعادل',
  no_cost: 'بدون تكلفة',
  returned: 'مرتجعة',
}

export const PROFIT_STATUS_CLASS: Record<ProfitStatus, string> = {
  profit: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800/40',
  loss: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/40',
  break_even: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40',
  no_cost: 'bg-gray-50 dark:bg-slate-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-slate-700',
  returned: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800/40',
}

export type InvoiceProfitSummary = {
  count: number
  revenue: number
  countedCount: number
  countedRevenue: number
  cost: number
  net: number
  marginPct: number | null
  profitCount: number
  lossCount: number
  breakEvenCount: number
  noCostCount: number
  lossTotal: number
}

export function profitStatusOf(inv: Invoice): ProfitStatus {
  if (inv.profit_status) return inv.profit_status
  // Fallback for rows not coming from the list endpoint.
  if (inv.status === 'returned') return 'returned'
  const cost = Number(inv.dhl_cost ?? inv.dhlCost ?? 0)
  const total = Number(inv.price ?? 0)
  if (!(cost > 0)) return 'no_cost'
  const net = Math.round(total * 100) - Math.round(cost * 100)
  return net < 0 ? 'loss' : net > 0 ? 'profit' : 'break_even'
}

export function netProfitOf(inv: Invoice): number | null {
  if (inv.net_profit !== undefined) return inv.net_profit
  const st = profitStatusOf(inv)
  if (st === 'no_cost' || st === 'returned') return null
  return Math.round((Number(inv.price ?? 0) - Number(inv.dhl_cost ?? inv.dhlCost ?? 0)) * 100) / 100
}

export const fmtSigned = (n: number) =>
  (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
