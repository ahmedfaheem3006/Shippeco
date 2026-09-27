import { Layers, Boxes, Headset } from 'lucide-react'
import { FEATURES } from '../../content/landingPageContent'

const ICONS = [Layers, Boxes, Headset]

/** Three short benefit cards directly under the shipping tool. Worded
 *  only around what the company actually does — no "cheapest", guaranteed
 *  delivery times, or partner-carrier logos. */
export function LandingFeatures() {
  return (
    <section className="max-w-5xl mx-auto px-5 pb-16 md:pb-20">
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-3 shp-reveal">
        {FEATURES.map((f, i) => {
          const Icon = ICONS[i] ?? Layers
          return (
            <li
              key={f.title}
              className="flex items-start gap-3 bg-white border border-gray-200 rounded-2xl px-5 py-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <span className="shrink-0 w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Icon size={20} aria-hidden="true" />
              </span>
              <span>
                <span className="block font-extrabold text-gray-900 text-sm">{f.title}</span>
                <span className="block mt-1 text-sm text-gray-500 leading-relaxed">{f.description}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
