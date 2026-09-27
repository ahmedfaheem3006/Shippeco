import { Globe, Truck, Route, FileCheck, Warehouse, PackageCheck, Droplet, Building, ShoppingBag, ChevronDown } from 'lucide-react'
import { SERVICES, type ServiceItem } from '../../content/landingPageContent'
import { requestService } from './journey/journeyBus'

const ICONS: Record<ServiceItem['icon'], typeof Globe> = {
  globe: Globe,
  truck: Truck,
  route: Route,
  'file-check': FileCheck,
  warehouse: Warehouse,
  'package-check': PackageCheck,
  droplet: Droplet,
  building: Building,
  'shopping-bag': ShoppingBag,
}

const BEST_PATH_HINT: Record<ServiceItem['bestPath'], string> = {
  waybill: 'الأنسب لهذه الخدمة: استكمال بيانات البوليصة مباشرة من "ابدأ شحنتك".',
  contact: 'الأنسب لهذه الخدمة: اترك بياناتك عبر "تواصلوا معي" ليتولى فريقنا التفاصيل معك.',
}

export function LandingServices() {
  return (
    <section id="services" className="scroll-mt-20 bg-gray-50 border-y border-gray-100">
      <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
        <div className="text-center max-w-2xl mx-auto shp-reveal">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900">خدماتنا</h2>
        </div>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 shp-reveal">
          {SERVICES.map((service) => {
            const Icon = ICONS[service.icon]
            return (
              <article
                key={service.title}
                className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-col gap-3"
              >
                <div className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Icon size={22} aria-hidden="true" />
                </div>
                <h3 className="font-bold text-gray-900">{service.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed flex-1">{service.description}</p>
                <details className="group">
                  <summary className="cursor-pointer list-none inline-flex items-center gap-1 text-sm font-bold text-indigo-600 select-none">
                    تفاصيل الخدمة
                    <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <p className="mt-2 text-xs text-gray-500 leading-relaxed">{BEST_PATH_HINT[service.bestPath]}</p>
                  <button
                    type="button"
                    onClick={() => requestService({ serviceName: service.title, path: service.bestPath })}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold hover:bg-indigo-100 active:scale-[0.98] transition-all"
                  >
                    اطلب هذه الخدمة
                  </button>
                </details>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
