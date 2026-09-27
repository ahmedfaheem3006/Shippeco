// Admin review of submitted shipment/contact requests (authenticated,
// admin/manager only — see Backend routes/quoteRequests.routes.ts). Kept in
// its own file, separate from quoteRequestService.ts (the public submit
// function used by the prerendered landing page) — see that file's header
// comment for why the split matters.
import { unifiedService } from './unifiedService'
import type { ShipmentPackage, ShipmentParty } from './quoteRequestService'

/** One row of the quote_requests table as returned by GET /quote-requests. */
export type QuoteRequest = {
  id: number
  request_type: 'contact' | 'waybill'
  status: 'new' | 'reviewed'
  name: string
  phone: string
  origin_country: string | null
  origin_city: string | null
  destination_country: string | null
  destination_city: string | null
  shipment_type: 'document' | 'package' | null
  packages: ShipmentPackage[] | null
  contents: string | null
  extra_details: string | null
  service_name: string | null
  sender: ShipmentParty | null
  receiver: ShipmentParty | null
  declared_value: string | number | null
  declared_currency: string | null
  customs_info: string | null
  // Legacy single-weight fields from rows saved before the multi-step form.
  weight_approx: string | number | null
  weight_unit: string | null
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
