import { MapPin, Phone, MessageCircle, Clock } from 'lucide-react'
import { COMPANY, CONTACT, VISIT_SECTION } from '../../content/landingPageContent'

/** Address + real contact channels only. No embedded map, "get directions"
 *  link, or Google rating is shown: the map link on the old site pointed to
 *  a differently-named business, and no verified rating data exists — so
 *  nothing unverified is published. */
export function LandingVisitSection() {
  return (
    <section id="visit" className="scroll-mt-20 max-w-5xl mx-auto px-5 py-16 md:py-20">
      <div className="shp-reveal rounded-3xl border border-gray-200 bg-gradient-to-br from-indigo-50/60 to-white p-6 md:p-10">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">{VISIT_SECTION.title}</h2>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-10 h-10 rounded-xl bg-white border border-gray-200 text-indigo-600 flex items-center justify-center">
              <MapPin size={20} aria-hidden="true" />
            </span>
            <div>
              <div className="text-sm font-extrabold text-gray-900">{COMPANY.nameAr}</div>
              <address className="mt-1 not-italic text-sm text-gray-600 leading-relaxed">{COMPANY.addressAr}</address>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <a href={`tel:${CONTACT.phone}`} className="inline-flex items-center gap-3 text-sm font-bold text-gray-800 hover:text-indigo-600">
              <span className="shrink-0 w-10 h-10 rounded-xl bg-white border border-gray-200 text-indigo-600 flex items-center justify-center">
                <Phone size={18} aria-hidden="true" />
              </span>
              <span dir="ltr">{CONTACT.phoneDisplay}</span>
            </a>
            <a
              href={CONTACT.whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-3 text-sm font-bold text-gray-800 hover:text-emerald-600"
            >
              <span className="shrink-0 w-10 h-10 rounded-xl bg-white border border-gray-200 text-emerald-600 flex items-center justify-center">
                <MessageCircle size={18} aria-hidden="true" />
              </span>
              تواصل عبر واتساب
            </a>
            <p className="inline-flex items-center gap-3 text-sm text-gray-500">
              <span className="shrink-0 w-10 h-10 rounded-xl bg-white border border-gray-200 text-gray-400 flex items-center justify-center">
                <Clock size={18} aria-hidden="true" />
              </span>
              {VISIT_SECTION.hoursNote}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
