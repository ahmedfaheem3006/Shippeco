// Single source of truth for the PUBLIC site origin used in canonical/OG
// tags, structured data and sitemap (the prerender script reads the same
// env var). Defaults to the domain that is actually live today; switching
// to https://shippec.com is a one-line env change (VITE_PUBLIC_SITE_ORIGIN)
// made only as part of the real domain migration — see
// docs/DOMAIN-MIGRATION.md. This is NOT the API base URL (VITE_API_URL),
// which stays on Railway regardless of the public domain.
const DEFAULT_PUBLIC_SITE_ORIGIN = 'https://shippeco.com'

export const PUBLIC_SITE_ORIGIN: string = (
  ((import.meta as any).env?.VITE_PUBLIC_SITE_ORIGIN as string | undefined) || DEFAULT_PUBLIC_SITE_ORIGIN
).replace(/\/+$/, '')
