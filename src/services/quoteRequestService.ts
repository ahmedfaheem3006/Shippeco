// Public submission from the unauthenticated landing page. Deliberately a
// plain fetch with ZERO local imports: this file is bundled standalone by
// scripts/prerender.mjs (esbuild, platform:node) when it prerenders
// PublicHomePage.tsx, and even an unused *named* import elsewhere in a
// shared file can drag in the whole authenticated-app dependency graph
// (apiClient -> useAuthStore -> socketClient -> socket.io-client, which
// itself dynamically requires 'fs' and breaks under esbuild's Node
// platform bundling). Admin-side review lives in
// quoteRequestsAdminService.ts instead, kept completely separate on purpose.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'https://shippeco-backend-production.up.railway.app/api';

export type ShipmentPackage = {
  weight_kg: number
  length_cm?: number
  width_cm?: number
  height_cm?: number
}

export type ShipmentParty = {
  name: string
  phone: string
  address_line: string
  city: string
  postal_code?: string
}

type SharedFields = {
  origin_country?: string
  destination_country?: string
  shipment_type?: 'document' | 'package'
  packages?: ShipmentPackage[]
  service_name?: string
  /** Idempotency key — the same value on a retry returns the original
   *  saved request instead of a duplicate (see Backend migration 020). */
  client_request_id?: string
  /** Honeypot — must always be sent empty by real users; see the hidden
   *  field in the journey forms and Backend's quoteRequest.validator.ts. */
  website?: string
}

/** "تواصلوا معي" — only name + phone are required. */
export type ContactRequestInput = SharedFields & {
  request_type: 'contact'
  name: string
  phone: string
}

/** "استكمال بيانات البوليصة" — saved for staff review; never auto-issued. */
export type WaybillRequestInput = SharedFields & {
  request_type: 'waybill'
  origin_country: string
  destination_country: string
  shipment_type: 'document' | 'package'
  contents: string
  sender: ShipmentParty
  receiver: ShipmentParty
  declared_value?: number
  declared_currency?: string
  customs_info?: string
}

export type QuoteRequestInput = ContactRequestInput | WaybillRequestInput

export type QuoteRequestFieldError = { field: string; message: string }

export class QuoteRequestError extends Error {
  /** Per-field messages from the Backend's Zod validation (see
   *  middleware/validate.ts's { error: { details: [{field, message}] } }
   *  shape) — lets the form show each error next to its own field instead
   *  of only a generic banner. Absent for network/server errors. */
  fieldErrors?: QuoteRequestFieldError[]

  constructor(message: string, fieldErrors?: QuoteRequestFieldError[]) {
    super(message)
    this.fieldErrors = fieldErrors
  }
}

export function newClientRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export async function submitQuoteRequest(input: QuoteRequestInput): Promise<{ id: number }> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/quote-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
  } catch {
    throw new QuoteRequestError('تعذر الاتصال بالخادم، تحقق من الاتصال وحاول مرة أخرى.')
  }
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    const fieldErrors = Array.isArray(json?.error?.details) ? json.error.details : undefined
    const message = fieldErrors?.length
      ? 'تحقق من الحقول المُشار إليها.'
      : res.status === 429
        ? json?.error?.message || 'عدد كبير من المحاولات، حاول مرة أخرى بعد قليل.'
        : 'تعذر إرسال الطلب، حاول مرة أخرى.'
    throw new QuoteRequestError(message, fieldErrors)
  }
  return json.data
}
