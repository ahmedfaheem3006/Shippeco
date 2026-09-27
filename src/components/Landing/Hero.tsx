import { MessageCircle } from 'lucide-react'
import heroFallback from '../../assets/hero2.png'
import heroMobile from '../../assets/landing/hero-shipment-mobile.webp'
import heroDesktop from '../../assets/landing/hero-shipment-desktop.webp'
import { HERO, CONTACT } from '../../content/landingPageContent'

const primaryBtnClass =
  'inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold shadow-lg shadow-indigo-500/20 transition-all'
const secondaryBtnClass =
  'inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-gray-200 bg-white/70 hover:border-emerald-300 hover:text-emerald-700 active:scale-[0.98] text-gray-700 font-bold transition-all'

// The title's two words-groups on two fixed lines so it never breaks on a
// stray word; animated as whole words/lines (never split into letters,
// which would break Arabic letter joining).
const [TITLE_LINE_1, ...TITLE_REST] = HERO.title.split(' ')

export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50/50 via-white to-white">
      {/* Purely decorative — a soft glow plus a simple triangle nodding to
          the logo mark, drifting slowly (CSS only; paused for reduced motion
          and on small screens). aria-hidden, and the section clips overflow
          so it can never cause horizontal scroll. */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-indigo-100/60 blur-3xl shp-float-slow" />
        <div
          className="absolute top-8 right-[6%] w-36 h-36 opacity-[0.06] bg-indigo-600 shp-float"
          style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-5 pt-12 pb-12 md:pt-16 md:pb-16">
        <div className="flex flex-col md:flex-row items-center gap-8 md:gap-10">
          {/* Content — first in DOM order, so it sits on the right on
              desktop under dir="rtl" and appears first on mobile. */}
          <div className="md:basis-[45%] text-center md:text-right">
            <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold mb-4 shp-animate-in">
              {HERO.eyebrow}
            </span>
            <h1 className="text-[34px] sm:text-[42px] md:text-[52px] lg:text-[62px] font-extrabold leading-[1.25] text-gray-900">
              <span className="block shp-animate-in" style={{ animationDelay: '0.06s' }}>{TITLE_LINE_1}</span>
              <span className="block text-indigo-600 shp-animate-in" style={{ animationDelay: '0.14s' }}>{TITLE_REST.join(' ')}</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed max-w-xl mx-auto md:mx-0 shp-animate-in" style={{ animationDelay: '0.22s' }}>
              {HERO.description}
            </p>
            <div
              className="mt-8 flex flex-col sm:flex-row items-center md:items-stretch justify-center md:justify-start gap-3 shp-animate-in"
              style={{ animationDelay: '0.3s' }}
            >
              <a href={HERO.primaryCta.href} className={primaryBtnClass}>
                {HERO.primaryCta.label}
              </a>
              <a href={CONTACT.whatsappLink} target="_blank" rel="noreferrer" className={secondaryBtnClass}>
                <MessageCircle size={18} aria-hidden="true" />
                {HERO.secondaryCtaLabel}
              </a>
            </div>
            <p className="mt-4 text-xs sm:text-sm text-gray-500 shp-animate-in" style={{ animationDelay: '0.36s' }}>
              {HERO.noAccountNote}
            </p>
          </div>

          {/* Hero image — illustrative marketing photo, not the company's
              actual fleet. Never lazy-loaded; no fixed height, so it's never
              cropped or letterboxed. */}
          <div className="md:basis-[55%] w-full shp-animate-in shp-animate-image" style={{ animationDelay: '0.12s' }}>
            <picture>
              <source media="(min-width: 768px)" srcSet={heroDesktop} type="image/webp" />
              <source srcSet={heroMobile} type="image/webp" />
              <img
                src={heroFallback}
                alt="صورة توضيحية لعربية شحن وطرود أمام طائرة شحن"
                className="w-full h-auto rounded-2xl shadow-lg"
                width={1672}
                height={941}
                // @ts-expect-error - fetchpriority isn't in this React version's JSX typings yet, but is a valid, supported HTML attribute
                fetchpriority="high"
              />
            </picture>
          </div>
        </div>
      </div>
    </section>
  )
}
