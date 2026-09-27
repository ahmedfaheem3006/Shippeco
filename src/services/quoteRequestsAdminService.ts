// Admin review of submitted quote requests (authenticated, admin/manager
// only — see Backend routes/quoteRequests.routes.ts). Kept in its own file,
// separate from quoteRequestService.ts (the public submit function used by
// the prerendered landing page) — see that file's header comment for why
// the split matters.
import { unifiedService } from './unifiedService'
import type { QuoteRequestInput } from './quoteRequestService'

export type QuoteRequest = QuoteRequestInput & {
  id: number
  status: 'new' | 'reviewed'
  created_at: string
  reviewed_by_name?: string | null
}

export const quoteRequestsAdminService = {
  async list(status?: 'new' | 'reviewed'): Promise<QuoteRequest[]> {
    const qp = status ? `?status=${status}` : ''
    const result = await unifiedService.get<any>(`/quote-requests${qp}`)
    const list = result?.success ? result.data : result
    return Array.isArray(list) ? list : []
  },

  async setStatus(id: number, status: 'new' | 'reviewed'): Promise<QuoteRequest> {
    const result = await unifiedService.patch<any>(`/quote-requests/${id}/status`, { status })
    if (result?.error) throw new Error(result.error.message || 'فشل تحديث الحالة')
    return result?.success ? result.data : result
  },
}
