import { MessageCircle } from 'lucide-react'
import heroFallback from '../../assets/hero2.png'
import heroMobile from '../../assets/landing/hero-shipment-mobile.webp'
import heroDesktop from '../../assets/landing/hero-shipment-desktop.webp'
import { HERO, CONTACT, whatsappLink } from '../../content/landingPageContent'

export function LandingHero() {
  return (
    <section className="max-w-6xl mx-auto px-5 pt-10 pb-16 md:pt-16 md:pb-24">
      <div className="flex flex-col md:flex-row items-center gap-10 md:gap-14">
        {/* Content — first in DOM order, so in this RTL page it sits on the
            right on desktop (flex-row's inline axis starts from the right
            under dir="rtl"), and appears first/top on mobile per the brief. */}
        <div className="flex-1 text-center md:text-right shp-animate-in">
          <span className="inline-block px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold mb-4">
            {HERO.eyebrow}
          </span>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold leading-tight text-gray-900">
            {HERO.title}
          </h1>
          <p className="mt-5 text-base sm:text-lg text-gray-600 leading-relaxed max-w-xl mx-auto md:mx-0">
            {HERO.description}
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center md:items-stretch justify-center md:justify-start gap-3">
            <a
              href={HERO.primaryCta.href}
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-lg shadow-indigo-500/20 transition-colors"
            >
              {HERO.primaryCta.label}
            </a>
            {CONTACT.whatsappNumber && (
              <a
                href={whatsappLink('مرحبًا، أريد الاستفسار عن شحن طرد.')}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-gray-200 hover:border-emerald-300 hover:text-emerald-600 text-gray-700 font-bold transition-colors"
              >
                <MessageCircle size={18} />
                {HERO.whatsappCtaLabel}
              </a>
            )}
          </div>
        </div>

        {/* Hero image — second in DOM order, sits on the left on desktop. */}
        <div className="flex-1 w-full shp-animate-in" style={{ animationDelay: '0.08s' }}>
          <picture>
            <source media="(min-width: 768px)" srcSet={heroDesktop} type="image/webp" />
            <source srcSet={heroMobile} type="image/webp" />
            <img
              src={heroFallback}
              alt="عربية شحن شيب بيك وطرود أمام طائرة شحن"
              className="w-full h-auto rounded-2xl shadow-xl object-contain bg-gray-50"
              width={1672}
              height={941}
              // @ts-expect-error - fetchpriority isn't in this React version's JSX typings yet, but is a valid, supported HTML attribute
              fetchpriority="high"
            />
          </picture>
        </div>
      </div>
    </section>
  )
}
