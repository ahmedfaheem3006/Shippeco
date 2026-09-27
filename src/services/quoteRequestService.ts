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

export class QuoteRequestError extends Error {}

export async function submitQuoteRequest(input: QuoteRequestInput): Promise<{ id: number }> {
  const res = await fetch(`${API_BASE}/quote-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok || !json?.success) {
    throw new QuoteRequestError(json?.error?.message || 'تعذر إرسال الطلب، حاول مرة أخرى')
  }
  return json.data
}
