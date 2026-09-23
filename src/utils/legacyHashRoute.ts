/**
 * The app used to run on HashRouter (paths like /#/login, /#/pay/42?foo=bar).
 * Old links, bookmarks, and messages already sent to clients still point at
 * those hash URLs. Convert them to clean BrowserRouter paths in place, before
 * the router mounts, so those links keep working after the migration.
 *
 * Restricted to same-origin, in-page conversion only (no navigation to another
 * origin is possible here — we only ever read/replace window.location).
 */
export function convertLegacyHashRoute(loc: Pick<Location, 'hash' | 'pathname' | 'search'> = window.location): {
  path: string
  search: string
} | null {
  const hash = loc.hash || ''
  if (!hash.startsWith('#/')) return null

  // Strip the leading "#" — everything after it is a normal "path?query" string.
  const rest = hash.slice(1)
  const [hashPath, hashQuery = ''] = rest.split('?')

  const path = hashPath.startsWith('/') ? hashPath : `/${hashPath}`

  // Merge query params: keep whatever was already a real query param, and
  // add the ones that were encoded after the hash.
  const mergedParams = new URLSearchParams(loc.search || '')
  const hashParams = new URLSearchParams(hashQuery)
  hashParams.forEach((value, key) => {
    if (!mergedParams.has(key)) mergedParams.set(key, value)
  })
  const search = mergedParams.toString()

  return { path, search: search ? `?${search}` : '' }
}

/**
 * Applies the conversion via history.replaceState, so the browser's address
 * bar and BrowserRouter's initial location both see the clean URL — no
 * redirect round-trip, no flash of the old hash URL.
 */
export function applyLegacyHashRouteConversion() {
  if (typeof window === 'undefined') return
  const converted = convertLegacyHashRoute(window.location)
  if (!converted) return
  const target = `${converted.path}${converted.search}`
  window.history.replaceState(null, '', target)
}
