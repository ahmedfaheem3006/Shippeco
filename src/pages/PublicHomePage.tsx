// Public marketing homepage — served at "/".
//
// Rendered both by the live SPA and by the build-time prerender step
// (scripts/prerender.mjs, via react-dom/server) — see that script's
// esbuild `define` for import.meta.env, which is what lets this page (and
// anything it imports, e.g. quoteRequestService.ts) read VITE_* env vars
// safely when bundled standalone outside Vite's own pipeline.
//
// Copy lives in src/content/landingPageContent.ts — edit that file to
// change what the page says.
import './../components/Landing/landing.css'
import { LandingHeader } from '../components/Landing/Header'
import { LandingHero } from '../components/Landing/Hero'
import { LandingShippingJourney } from '../components/Landing/journey/ShippingJourney'
import { LandingFeatures } from '../components/Landing/Features'
import { LandingServices } from '../components/Landing/Services'
import { LandingAbout } from '../components/Landing/About'
import { LandingHowItWorks } from '../components/Landing/HowItWorks'
import { LandingShipmentDetailsSections } from '../components/Landing/ShipmentDetailsSections'
import { LandingVisitSection } from '../components/Landing/VisitSection'
import { LandingFAQ } from '../components/Landing/FAQSection'
import { LandingFinalCtaFooter } from '../components/Landing/FinalCtaFooter'
import { useScrollReveal } from '../components/Landing/useScrollReveal'
import { COMPANY, CONTACT, SOCIAL_LINKS } from '../content/landingPageContent'
import { PUBLIC_SITE_ORIGIN } from '../config/publicSite'

// Real company data only — no rating/review markup (none is verified).
const ORG_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: COMPANY.nameEn,
  alternateName: COMPANY.nameAr,
  url: PUBLIC_SITE_ORIGIN,
  logo: `${PUBLIC_SITE_ORIGIN}/apple-touch-icon.png`,
  email: CONTACT.email,
  telephone: CONTACT.phone,
  address: {
    '@type': 'PostalAddress',
    streetAddress: '7610، طريق الأمير نايف بن عبدالعزيز، حي الروضة',
    addressLocality: 'الدمام',
    postalCode: '32256',
    addressCountry: 'SA',
  },
  sameAs: SOCIAL_LINKS.map((s) => s.href),
}

const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: COMPANY.nameAr,
  url: PUBLIC_SITE_ORIGIN,
  inLanguage: 'ar',
}

export function PublicHomePage() {
  useScrollReveal()

  return (
    <div dir="rtl" lang="ar" className="min-h-screen bg-white text-gray-900 font-cairo">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSON_LD) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSON_LD) }}
      />

      <LandingHeader />
      <main>
        <LandingHero />
        <LandingShippingJourney />
        <LandingFeatures />
        <LandingServices />
        <LandingAbout />
        <LandingHowItWorks />
        <LandingShipmentDetailsSections />
        <LandingVisitSection />
        <LandingFAQ />
      </main>
      <LandingFinalCtaFooter />
    </div>
  )
}

export default PublicHomePage
