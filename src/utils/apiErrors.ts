import { ApiError } from './apiClient'

const ARABIC = /[\u0600-\u06FF]/

/**
 * One Arabic sentence for any API failure: field errors from the server,
 * permission / conflict / not-found, network loss — never raw server text in
 * English or database details.
 */
export function describeApiError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 400 && err.details.length) return err.details.map((d) => d.message).filter((m) => ARABIC.test(m)).join('، ') || fallback
    if (err.status === 403) return 'ليست لديك صلاحية لتنفيذ هذا الإجراء'
    if (err.status === 404) return ARABIC.test(err.message) ? err.message : 'العنصر غير موجود أو تم حذفه'
    if (err.status === 409 || err.status === 413) return ARABIC.test(err.message) ? err.message : fallback
    if (err.status === 429) return 'طلبات كثيرة خلال وقت قصير، انتظر قليلًا ثم أعد المحاولة'
    if (err.status >= 500) return 'حدث خطأ في الخادم، لم يتم حفظ أي شيء — أعد المحاولة بعد قليل'
    return ARABIC.test(err.message) ? err.message : fallback
  }
  if (err instanceof TypeError || (err instanceof Error && /fetch|network/i.test(err.message))) {
    return 'تعذر الاتصال بالخادم — تحقق من الاتصال ثم أعد المحاولة'
  }
  if (err instanceof Error && ARABIC.test(err.message)) return err.message
  return fallback
}

export const isConflict = (err: unknown) => err instanceof ApiError && err.status === 409
export const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError'
