// Public marketing homepage — served at "/".
//
// Rendered both by the live SPA and by the build-time prerender step
// (scripts/prerender.mjs, via react-dom/server) — see that script's
// esbuild `define` for import.meta.env, which is what lets this page (and
// anything it imports, e.g. quoteRequestService.ts) read VITE_* env vars
// safely when bundled standalone outside Vite's own pipeline.
//
// Copy lives in src/content/landingPageContent.ts — edit that file to
// change what the page says. Every claim reflects something actually true
// of the product today; no invented pricing, branches, delivery times,
// partnerships or contact numbers.
import './../components/Landing/landing.css'
import { LandingHeader } from '../components/Landing/Header'
import { LandingHero } from '../components/Landing/Hero'
import { LandingServices } from '../components/Landing/Services'
import { LandingAbout } from '../components/Landing/About'
import { LandingHowItWorks } from '../components/Landing/HowItWorks'
import { LandingShipmentDetailsSections } from '../components/Landing/ShipmentDetailsSections'
import { LandingQuoteForm } from '../components/Landing/QuoteForm'
import { LandingFAQ } from '../components/Landing/FAQSection'
import { LandingFinalCtaFooter } from '../components/Landing/FinalCtaFooter'
import { CONTACT } from '../content/landingPageContent'

const ORG_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Shippec',
  alternateName: 'شيب بيك',
  url: 'https://shippeco.com',
  logo: 'https://shippeco.com/apple-touch-icon.png',
  email: CONTACT.email,
  areaServed: ['EG', 'SA'],
  sameAs: [],
}

const WEBSITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'شيب بيك',
  url: 'https://shippeco.com',
  inLanguage: 'ar',
}

export function PublicHomePage() {
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
        <LandingServices />
        <LandingAbout />
        <LandingHowItWorks />
        <LandingShipmentDetailsSections />
        <LandingQuoteForm />
        <LandingFAQ />
      </main>
      <LandingFinalCtaFooter />
    </div>
  )
}

export default PublicHomePage
