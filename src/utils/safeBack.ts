// "Go back" that never leaves the site and never loops: it only steps back
// when the previous entry is known to be a page of THIS site, otherwise it
// goes to the homepage.

export type BackDecision = 'history' | 'home'

export function decideBack(input: { historyIdx: unknown; referrer: string; currentHref: string }): BackDecision {
  // React Router's BrowserRouter numbers the entries it pushes in
  // history.state.idx — idx > 0 means an earlier in-app page exists in this
  // tab. (history.length alone can't tell same-site from external entries.)
  if (typeof input.historyIdx === 'number' && input.historyIdx > 0) return 'history'

  // A full page load that came from another page of this same site (e.g. a
  // link on the homepage that led to a server-side 404).
  try {
    if (input.referrer) {
      const ref = new URL(input.referrer)
      const here = new URL(input.currentHref)
      if (ref.origin === here.origin && ref.pathname + ref.search !== here.pathname + here.search) return 'history'
    }
  } catch {
    // Malformed referrer — fall through to home.
  }
  return 'home'
}

export function goBackSafely(): void {
  const decision = decideBack({
    historyIdx: (window.history.state as { idx?: unknown } | null)?.idx,
    referrer: document.referrer,
    currentHref: window.location.href,
  })
  if (decision === 'home') {
    window.location.assign('/')
    return
  }

  // Safety net: if nothing actually happens (e.g. the page was opened in a
  // new tab, so there is no entry to go back to), go home instead of
  // leaving the visitor stuck.
  const before = window.location.href
  let left = false
  const onHide = () => {
    left = true
  }
  window.addEventListener('pagehide', onHide, { once: true })
  window.history.back()
  window.setTimeout(() => {
    window.removeEventListener('pagehide', onHide)
    if (!left && window.location.href === before) window.location.assign('/')
  }, 500)
}
