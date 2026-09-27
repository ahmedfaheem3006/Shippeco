import { ChevronDown } from 'lucide-react'
import { FAQ } from '../../content/landingPageContent'

export function LandingFAQ() {
  return (
    <section id="faq" className="bg-gray-50 border-y border-gray-100">
      <div className="max-w-3xl mx-auto px-5 py-16 md:py-20">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-center text-gray-900 shp-animate-in">
          الأسئلة الشائعة
        </h2>

        {/* Native <details>/<summary>: keyboard-accessible (Tab + Enter/Space)
            and screen-reader friendly by default, with zero JS needed. */}
        <div className="mt-8 flex flex-col gap-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group bg-white rounded-2xl border border-gray-200 shadow-sm open:shadow-md transition-shadow"
            >
              <summary className="flex items-center justify-between gap-3 px-5 py-4 cursor-pointer list-none font-bold text-gray-900 text-sm sm:text-base">
                {item.q}
                <ChevronDown
                  size={18}
                  className="shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <p className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
