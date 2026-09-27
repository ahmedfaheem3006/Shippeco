import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import shippecLogo from '../../assets/shippec.jpeg'
import { NAV_LINKS, HERO } from '../../content/landingPageContent'

export function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-2 shrink-0">
          <img
            src={shippecLogo}
            alt="شيب بيك Shippec"
            className="h-8 w-auto max-w-[110px] object-contain"
            width={110}
            height={30}
          />
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-bold text-gray-700">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-indigo-600 transition-colors">
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <a href="/login" className="text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors">
            تسجيل الدخول
          </a>
          <a
            href={HERO.primaryCta.href}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-sm font-bold transition-all"
          >
            {HERO.primaryCta.label}
          </a>
        </div>

        <button
          type="button"
          className="md:hidden p-2 -mr-2 text-gray-700"
          aria-label={mobileOpen ? 'إغلاق القائمة' : 'فتح القائمة'}
          aria-expanded={mobileOpen}
          aria-controls="landing-mobile-nav"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <nav
          id="landing-mobile-nav"
          className="shp-menu-in md:hidden border-t border-gray-100 bg-white px-5 py-4 flex flex-col gap-1"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="py-3 text-sm font-bold text-gray-700 border-b border-gray-50 last:border-0"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/login"
            onClick={() => setMobileOpen(false)}
            className="py-3 text-sm font-bold text-gray-500"
          >
            تسجيل الدخول
          </a>
          <a
            href={HERO.primaryCta.href}
            onClick={() => setMobileOpen(false)}
            className="mt-2 text-center px-5 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold"
          >
            {HERO.primaryCta.label}
          </a>
        </nav>
      )}
    </header>
  )
}
