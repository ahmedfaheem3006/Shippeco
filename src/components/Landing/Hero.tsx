import { MessageCircle } from 'lucide-react'
import heroFallback from '../../assets/hero2.png'
import heroMobile from '../../assets/landing/hero-shipment-mobile.webp'
import heroDesktop from '../../assets/landing/hero-shipment-desktop.webp'
import { HERO, CONTACT, whatsappLink } from '../../content/landingPageContent'

const primaryBtnClass =
  'inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-500/20 transition-colors'
const secondaryBtnClass =
  'inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-gray-200 hover:border-emerald-300 hover:text-emerald-600 text-gray-700 font-bold transition-colors'

export function LandingHero() {
  // A confirmed WhatsApp number replaces the secondary CTA entirely rather
  // than adding a third button — see CONTACT.whatsappNumber.
  const showWhatsappSecondary = Boolean(CONTACT.whatsappNumber)

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50/50 via-white to-white">
      {/* Purely decorative — a soft glow plus a simple triangle nodding to
          the logo mark. Absolutely positioned and aria-hidden so it never
          affects layout, reading order, or causes horizontal scroll (the
          section itself clips overflow). */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-indigo-100/60 blur-3xl" />
        <div
          className="absolute top-8 right-[6%] w-36 h-36 opacity-[0.06] bg-indigo-600"
          style={{ clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-5 pt-12 pb-16 md:pt-16 md:pb-20">
        <div className="flex flex-col md:flex-row items-center gap-8 md:gap-10">
          {/* Content — first in DOM order, so in this RTL page it sits on the
              right on desktop (flex-row's inline axis starts from the right
              under dir="rtl"), and appears first/top on mobile per the brief. */}
          <div className="md:basis-[45%] text-center md:text-right shp-animate-in">
            <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold mb-4">
              {HERO.eyebrow}
            </span>
            {/* Two fixed lines (not a wrapped paragraph) so the headline
                never breaks awkwardly on a stray word at any width. */}
            <h1 className="text-[32px] sm:text-[38px] md:text-[50px] lg:text-[60px] font-extrabold leading-[1.25] text-gray-900">
              <span className="block">{HERO.titleLine1}</span>
              <span className="block text-indigo-600">{HERO.titleLine2}</span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed max-w-xl mx-auto md:mx-0">
              {HERO.description}
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center md:items-stretch justify-center md:justify-start gap-3">
              <a href={HERO.primaryCta.href} className={primaryBtnClass}>
                {HERO.primaryCta.label}
              </a>
              {showWhatsappSecondary ? (
                <a
                  href={whatsappLink('مرحبًا، أريد الاستفسار عن شحن طرد.')}
                  target="_blank"
                  rel="noreferrer"
                  className={secondaryBtnClass}
                >
                  <MessageCircle size={18} />
                  {HERO.whatsappCtaLabel}
                </a>
              ) : (
                <a href={HERO.secondaryCta.href} className={secondaryBtnClass}>
                  {HERO.secondaryCta.label}
                </a>
              )}
            </div>
            <p className="mt-4 text-xs sm:text-sm text-gray-500">{HERO.noAccountNote}</p>
          </div>

          {/* Hero image — second in DOM order, sits on the left on desktop.
              No fixed height: width drives height via the real aspect
              ratio, so there's never letterboxing or cropping. */}
          <div className="md:basis-[55%] w-full shp-animate-in" style={{ animationDelay: '0.08s' }}>
            <picture>
              <source media="(min-width: 768px)" srcSet={heroDesktop} type="image/webp" />
              <source srcSet={heroMobile} type="image/webp" />
              <img
                src={heroFallback}
                alt="عربية شحن شيب بيك وطرود أمام طائرة شحن"
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
