// Public submission from the unauthenticated landing page. Deliberately a
// plain fetch with ZERO local imports: this file is bundled standalone by
// scripts/prerender.mjs (esbuild, platform:node) when it prerenders
// PublicHomePage.tsx, and even an unused *named* import elsewhere in a
// shared file can drag in the whole authenticated-app dependency graph
// (apiClient -> useAuthStore -> socketClient -> socket.io-client, which
// itself dynamically requires 'fs' and breaks under esbuild's Node
// platform bundling). Admin-side quote review lives in
// quoteRequestsAdminService.ts instead, kept completely separate on purpose.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) || 'https://shippeco-backend-production.up.railway.app/api';

export type QuoteRequestInput = {
  name: string
  phone: string
  origin_country: string
  origin_city?: string
  destination_country: string
  destination_city?: string
  contents: string
  weight_approx?: string
  weight_unit?: 'kg' | 'lb'
  extra_details?: string
  /** Honeypot — must always be sent empty by real users; see the hidden
   *  field in QuoteForm.tsx and Backend's quoteRequest.validator.ts. */
  website?: string
}

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

export async function submitQuoteRequest(input: QuoteRequestInput): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/quote-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    const fieldErrors = Array.isArray(json?.error?.details) ? json.error.details : undefined
    const message = fieldErrors?.length
      ? 'تحقق من الحقول المُشار إليها بالأسفل.'
      : json?.error?.message || 'تعذر إرسال الطلب، حاول مرة أخرى'
    throw new QuoteRequestError(message, fieldErrors)
  }
  return json.data
}
