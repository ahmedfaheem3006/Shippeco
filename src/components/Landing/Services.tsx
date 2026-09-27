import { Globe2, Calculator, FileCheck2, ChevronLeft } from 'lucide-react'
import { SERVICES, HERO, type ServiceItem } from '../../content/landingPageContent'

const ICONS: Record<ServiceItem['icon'], typeof Globe2> = {
  globe: Globe2,
  calculator: Calculator,
  'file-check': FileCheck2,
}

export function LandingServices() {
  return (
    <section id="services" className="bg-gray-50 border-y border-gray-100">
      <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
        <div className="text-center max-w-2xl mx-auto shp-animate-in">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">حلول شحن تناسب احتياجك</h2>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-5">
          {SERVICES.map((service) => {
            const Icon = ICONS[service.icon]
            return (
              <article
                key={service.title}
                className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col gap-3"
              >
                <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Icon size={22} aria-hidden="true" />
                </div>
                <h3 className="font-bold text-gray-900">{service.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed flex-1">{service.description}</p>
                <a
                  href={HERO.primaryCta.href}
                  className="inline-flex items-center gap-1 text-sm font-bold text-indigo-600 hover:underline"
                >
                  اطلب عرض سعر
                  <ChevronLeft size={16} aria-hidden="true" />
                </a>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
