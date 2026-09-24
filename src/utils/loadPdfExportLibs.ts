// html2canvas + jsPDF used to be loaded unconditionally via <script> tags in
// index.html, which meant every single page load — including the public
// marketing homepage — paid for two heavy third-party scripts it almost
// never uses. They're only needed when a user actually exports/downloads a
// PDF (invoices, client statements), so we load them on demand instead and
// cache the in-flight promise so concurrent export clicks don't double-load.
const HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'

let loadingPromise: Promise<void> | null = null

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`))
    document.head.appendChild(script)
  })
}

function hasLibs(): boolean {
  const w = window as any
  return Boolean(w.html2canvas && (w.jspdf?.jsPDF || w.jsPDF))
}

/** Ensures window.html2canvas and window.jspdf.jsPDF are available. Safe to
 *  call from every PDF-export entry point — it's a no-op once loaded. */
export function loadPdfExportLibs(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (hasLibs()) return Promise.resolve()
  if (!loadingPromise) {
    loadingPromise = Promise.all([loadScriptOnce(HTML2CANVAS_URL), loadScriptOnce(JSPDF_URL)])
      .then(() => undefined)
      .catch((err) => {
        loadingPromise = null // allow retrying on a later export attempt
        throw err
      })
  }
  return loadingPromise
}
