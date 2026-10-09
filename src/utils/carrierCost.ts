/** Display helpers for the DHL carrier cost (reconciliation ✓ / ✕). */

/** "154.90 ر.س" — two decimals, Latin digits. */
export function formatSar(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '—'
  return `${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`
}

/** Text shown for a state the accountant cannot (or can no longer) act on. */
export const COST_BLOCK_TEXT: Record<string, { label: string; hint: string; cls: string }> = {
  not_found: { label: 'غير موجودة بالمنصة', hint: 'لا توجد فاتورة بهذه البوليصة في SHIPPEC — لا يمكن اعتماد التكلفة', cls: 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/30 dark:text-red-400' },
  multiple_invoices: { label: 'يحتاج مراجعة', hint: 'البوليصة مرتبطة بأكثر من فاتورة — لن تُطبَّق التكلفة حتى يُحل التعارض', cls: 'text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800/30 dark:text-orange-400' },
  duplicate_awb: { label: 'يحتاج مراجعة', hint: 'رقم البوليصة مسجل على أكثر من فاتورة (أو لم يعد على الفاتورة المطابقة)', cls: 'text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800/30 dark:text-orange-400' },
  needs_review: { label: 'يحتاج مراجعة', hint: 'المطابقة ليست عبر رقم البوليصة في الفاتورة — راجعها أولًا', cls: 'text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800/30 dark:text-orange-400' },
  ambiguous: { label: 'يحتاج مراجعة', hint: 'ظهرت أكثر من قيمة TOTAL CHARGE لنفس البوليصة', cls: 'text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-900/20 dark:border-orange-800/30 dark:text-orange-400' },
  unclear: { label: 'تعذر تحديد تكلفة الناقل', hint: 'لم يمكن قراءة TOTAL CHARGE لهذه البوليصة بثقة من الملف', cls: 'text-gray-600 bg-gray-50 border-gray-200 dark:bg-slate-900 dark:border-slate-700 dark:text-gray-300' },
  not_verified: { label: 'تعذر تحديد تكلفة الناقل', hint: 'القيمة من التحليل بالذكاء الاصطناعي فقط ولم يتم التحقق منها من سطر TOTAL CHARGE', cls: 'text-gray-600 bg-gray-50 border-gray-200 dark:bg-slate-900 dark:border-slate-700 dark:text-gray-300' },
  legacy: { label: 'تعذر تحديد تكلفة الناقل', hint: 'هذا التقرير حُلل قبل استخراج التكلفة — أعد تحليل الملف نفسه لاستخراجها', cls: 'text-gray-600 bg-gray-50 border-gray-200 dark:bg-slate-900 dark:border-slate-700 dark:text-gray-300' },
}
