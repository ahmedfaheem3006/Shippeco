import { PackageSearch, Users, CheckCircle2 } from 'lucide-react'
import { HOW_IT_WORKS } from '../../content/landingPageContent'

const STEP_ICONS = [PackageSearch, Users, CheckCircle2]

export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 bg-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-5 py-16 md:py-20">
        <h2 className="text-2xl sm:text-3xl font-extrabold text-center shp-animate-in">ثلاث خطوات لبدء طلبك</h2>

        <ol className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-6">
          {HOW_IT_WORKS.map((item, i) => {
            const Icon = STEP_ICONS[i] ?? CheckCircle2
            return (
              <li key={item.step} className="relative flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                  <Icon size={26} aria-hidden="true" />
                </div>
                <span className="text-xs font-bold text-indigo-300 tracking-widest">
                  الخطوة {item.step}
                </span>
                <h3 className="font-bold">{item.title}</h3>
                <p className="text-sm text-slate-300 leading-relaxed max-w-xs">{item.description}</p>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
