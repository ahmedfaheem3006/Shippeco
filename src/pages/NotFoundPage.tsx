// Standalone "page not found" — rendered by the SPA's catch-all route AND
// prerendered at build time into dist/404.html (scripts/prerender.mjs),
// which the host serves with a real HTTP 404 for unknown URLs. So it must
// not depend on React Router context or the backend: links are plain
// anchors that also work before/without JavaScript.
import { useEffect, type MouseEvent } from 'react'
import { Home, ArrowRight, MessageCircle } from 'lucide-react'
import shippecLogo from '../assets/shippec.jpeg'
import { CONTACT, NOT_FOUND } from '../content/landingPageContent'
import { goBackSafely } from '../utils/safeBack'
import './notFound.css'

/** While this page is shown: 404 title, noindex, and no canonical/og:url
 *  (so it never claims to be the homepage). Everything is restored on
 *  unmount, so nothing leaks to the next page in the SPA. */
function useNotFoundHead() {
  useEffect(() => {
    const prevTitle = document.title
    document.title = NOT_FOUND.documentTitle

    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const createdRobots = !robots
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      document.head.appendChild(robots)
    }
    const prevRobots = robots.getAttribute('content')
    robots.setAttribute('content', 'noindex, nofollow')

    const detached = Array.from(
      document.head.querySelectorAll<HTMLElement>('link[rel="canonical"], meta[property="og:url"]')
    )
    detached.forEach((el) => el.remove())

    return () => {
      document.title = prevTitle
      if (createdRobots) robots?.remove()
      else if (prevRobots !== null) robots?.setAttribute('content', prevRobots)
      detached.forEach((el) => document.head.appendChild(el))
    }
  }, [])
}

function PackageZero() {
  // The "0" of 404, drawn as a shipping box.
  return (
    <svg viewBox="0 0 64 72" className="h-[0.78em] w-auto mx-[0.04em] overflow-visible" aria-hidden="true" focusable="false">
      <g className="nf-box">
        <path d="M32 6 58 19v34L32 66 6 53V19Z" fill="#d9a86c" />
        <path d="M32 6 58 19 32 32 6 19Z" fill="#e8c08f" />
        <path d="M32 32v34L6 53V19Z" fill="#c8945a" />
        <path d="M19 12.5 45 25.5v9l-6-3v-7L13 15.5Z" fill="#f6e6c8" />
        <path d="M32 32 58 19" stroke="#b07c43" strokeWidth="1.2" fill="none" />
      </g>
    </svg>
  )
}

function OffRouteIllustration() {
  // A dashed delivery route that ends at a location pin — drawn once.
  const route = 'M300 58 C 250 58, 236 20, 186 22 S 112 70, 64 46'
  return (
    <svg viewBox="0 0 340 96" className="w-full max-w-[340px] h-auto mx-auto" aria-hidden="true" focusable="false">
      <defs>
        <mask id="nf-route-reveal">
          <path d={route} pathLength={1} className="nf-route-mask" stroke="#fff" strokeWidth="10" fill="none" strokeLinecap="round" />
        </mask>
      </defs>
      <circle cx="300" cy="58" r="7" fill="#c7d2fe" />
      <circle cx="300" cy="58" r="3.5" fill="#4f46e5" />
      <path
        d={route}
        mask="url(#nf-route-reveal)"
        stroke="#818cf8"
        strokeWidth="3"
        strokeDasharray="2 9"
        strokeLinecap="round"
        fill="none"
      />
      <g className="nf-pin">
        <path d="M46 8c-9.4 0-17 7.3-17 16.4C29 36.7 46 52 46 52s17-15.3 17-27.6C63 15.3 55.4 8 46 8Z" fill="#4f46e5" />
        <circle cx="46" cy="24.5" r="6.2" fill="#fff" />
        <ellipse cx="46" cy="56" rx="9" ry="2.6" fill="#c7d2fe" />
      </g>
    </svg>
  )
}

export function NotFoundPage() {
  useNotFoundHead()

  const onBack = (e: MouseEvent<HTMLAnchorElement>) => {
    // Without JS this is a plain link to the homepage.
    e.preventDefault()
    goBackSafely()
  }

  return (
    <div
      dir="rtl"
      lang="ar"
      className="min-h-screen flex flex-col overflow-x-hidden bg-gradient-to-b from-indigo-50/70 via-white to-white text-gray-900 font-cairo"
    >
      <header className="w-full max-w-5xl mx-auto px-5 py-5">
        <a
          href="/"
          className="inline-flex rounded-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30"
          aria-label="SHIPPEC — الصفحة الرئيسية"
        >
          <img src={shippecLogo} alt="" className="h-9 w-auto max-w-[130px] object-contain" width={130} height={36} />
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 pb-16">
        <div className="w-full max-w-xl text-center">
          <div
            dir="ltr"
            aria-hidden="true"
            className="nf-rise flex items-center justify-center text-[92px] sm:text-[128px] leading-none font-extrabold select-none"
          >
            <span className="bg-gradient-to-b from-indigo-600 to-indigo-400 bg-clip-text text-transparent">4</span>
            <PackageZero />
            <span className="bg-gradient-to-b from-indigo-600 to-indigo-400 bg-clip-text text-transparent">4</span>
          </div>

          <div className="mt-2 nf-rise" style={{ animationDelay: '0.1s' }}>
            <OffRouteIllustration />
          </div>

          <p className="mt-4 inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold nf-rise" style={{ animationDelay: '0.18s' }}>
            {NOT_FOUND.eyebrow}
          </p>
          <h1 className="mt-4 text-[26px] sm:text-[34px] font-extrabold leading-[1.35] text-gray-900 [text-wrap:balance] nf-rise" style={{ animationDelay: '0.24s' }}>
            {NOT_FOUND.title}
          </h1>
          <p className="mt-3 text-[15px] sm:text-base text-gray-600 leading-relaxed max-w-md mx-auto [text-wrap:pretty] nf-rise" style={{ animationDelay: '0.3s' }}>
            {NOT_FOUND.description}
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 nf-rise" style={{ animationDelay: '0.36s' }}>
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-500/25 hover:bg-indigo-700 hover:shadow-indigo-500/35 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/40 transition-all"
            >
              <Home size={18} aria-hidden="true" />
              {NOT_FOUND.homeLabel}
            </a>
            <a
              href="/"
              onClick={onBack}
              className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl border border-gray-200 bg-white text-gray-700 font-bold hover:border-indigo-200 hover:text-indigo-700 hover:bg-indigo-50/50 active:scale-[0.98] focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/30 transition-all"
            >
              <ArrowRight size={18} aria-hidden="true" />
              {NOT_FOUND.backLabel}
            </a>
          </div>

          <p className="mt-6 text-sm text-gray-500 nf-rise" style={{ animationDelay: '0.42s' }}>
            {NOT_FOUND.helpPrefix}{' '}
            <a
              href={CONTACT.whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800 underline-offset-4 hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            >
              <MessageCircle size={14} aria-hidden="true" />
              {NOT_FOUND.helpLabel}
            </a>
          </p>
        </div>
      </main>
    </div>
  )
}

export default NotFoundPage
