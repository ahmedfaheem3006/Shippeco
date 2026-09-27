import type { RefObject } from 'react'
import { m } from 'framer-motion'
import { ClipboardList, PhoneCall, ArrowLeft } from 'lucide-react'
import { JOURNEY } from '../../../content/landingPageContent'
import { DURATION, useMotionTransition } from '../motion'
import { StageNav } from './StageNav'

type Props = {
  headingRef: RefObject<HTMLHeadingElement>
  onBack: () => void
  onChoose: (path: 'waybill' | 'contact') => void
}

const OPTIONS = [
  { id: 'waybill' as const, icon: ClipboardList, ...JOURNEY.path.waybill },
  { id: 'contact' as const, icon: PhoneCall, ...JOURNEY.path.contact },
]

export function PathStage({ headingRef, onBack, onChoose }: Props) {
  const tap = useMotionTransition(DURATION.fast)
  return (
    <div className="flex flex-col gap-5">
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-extrabold text-gray-900 outline-none">
        {JOURNEY.path.title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OPTIONS.map(({ id, icon: Icon, title, description }) => (
          <m.button
            key={id}
            type="button"
            onClick={() => onChoose(id)}
            whileTap={{ scale: 0.98 }}
            transition={tap}
            className="group text-right p-5 rounded-2xl border-2 border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 transition-all"
          >
            <span className="w-11 h-11 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Icon size={22} aria-hidden="true" />
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-gray-900">{title}</span>
              <ArrowLeft size={18} className="text-gray-300 group-hover:text-indigo-600 transition-colors" aria-hidden="true" />
            </span>
            <span className="block mt-1.5 text-sm text-gray-500 leading-relaxed">{description}</span>
          </m.button>
        ))}
      </div>
      <StageNav onBack={onBack} />
    </div>
  )
}
