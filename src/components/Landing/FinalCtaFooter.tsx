import ctaFallback from '../../assets/image 3.png'
import ctaMobile from '../../assets/landing/van-warehouse-mobile.webp'
import ctaDesktop from '../../assets/landing/van-warehouse-desktop.webp'
import shippecLogo from '../../assets/shippec.jpeg'
import { Mail } from 'lucide-react'
import { FINAL_CTA, FOOTER, CONTACT } from '../../content/landingPageContent'

export function LandingFinalCtaFooter() {
  const year = new Date().getFullYear()

  return (
    <>
      <section className="relative">
        <div className="absolute inset-0">
          <picture>
            <source media="(min-width: 768px)" srcSet={ctaDesktop} type="image/webp" />
            <source srcSet={ctaMobile} type="image/webp" />
            <img
              src={ctaFallback}
              alt="عربية شيب بيك أمام مستودع شحن"
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </picture>
          <div className="absolute inset-0 bg-slate-900/70" />
        </div>
        <div className="relative max-w-4xl mx-auto px-5 py-20 md:py-28 text-center shp-animate-in">
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white">{FINAL_CTA.title}</h2>
          <a
            href="#quote"
            className="mt-8 inline-flex items-center justify-center px-8 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-900/30 transition-colors"
          >
            {FINAL_CTA.buttonLabel}
          </a>
        </div>
      </section>

      <footer className="bg-slate-950 text-slate-300">
        <div className="max-w-6xl mx-auto px-5 py-12 grid grid-cols-1 sm:grid-cols-2 gap-8">
          <div>
            <img src={shippecLogo} alt="شيب بيك Shippec" className="h-8 w-auto max-w-[110px] object-contain bg-white rounded-lg p-1" />
            <p className="mt-4 text-sm text-slate-400 leading-relaxed max-w-sm">{FOOTER.blurb}</p>
            <a
              href={`mailto:${CONTACT.email}`}
              className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-slate-200 hover:text-white"
              dir="ltr"
            >
              <Mail size={16} aria-hidden="true" />
              {CONTACT.email}
            </a>
          </div>
          <nav className="flex flex-col sm:items-end gap-2">
            {FOOTER.links.map((link) => (
              <a key={link.href} href={link.href} className="text-sm text-slate-400 hover:text-white transition-colors">
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="border-t border-slate-800">
          <div className="max-w-6xl mx-auto px-5 py-5 text-center text-xs text-slate-500">
            © {year} شيب بيك Shippec
          </div>
        </div>
      </footer>
    </>
  )
}
