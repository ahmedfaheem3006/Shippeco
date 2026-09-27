import type { RefObject } from 'react'
import { AnimatePresence, m } from 'framer-motion'
import { FileText, Package, Check, ArrowLeftRight } from 'lucide-react'
import { JOURNEY } from '../../../content/landingPageContent'
import { collapseMotion, DURATION, useMotionTransition } from '../motion'
import { CountryPicker } from './CountryPicker'
import { newPackageRow, type JourneyState, type ShipmentType } from './journeyState'
import type { Updater } from './ShippingJourney'
import { StageNav, ContactShortcut } from './StageNav'

type Props = {
  state: JourneyState
  update: Updater
  headingRef: RefObject<HTMLHeadingElement>
  onContinue: () => void
  onContactInstead: () => void
}

const TYPES: { id: ShipmentType; icon: typeof FileText; title: string; description: string }[] = [
  { id: 'document', icon: FileText, ...JOURNEY.type.document },
  { id: 'package', icon: Package, ...JOURNEY.type.package },
]

export function RouteTypeStage({ state, update, headingRef, onContinue, onContactInstead }: Props) {
  const reveal = useMotionTransition(DURATION.slow)
  const tap = useMotionTransition(DURATION.fast)
  const routeComplete = !!state.origin && !!state.destination

  const chooseType = (type: ShipmentType) =>
    update((s) => ({
      ...s,
      shipmentType: type,
      // First time "package" is picked, start with one row. Rows typed
      // earlier are kept if the visitor switches away and back.
      packages: type === 'package' && s.packages.length === 0 ? [newPackageRow()] : s.packages,
    }))

  return (
    <div className="flex flex-col gap-5">
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-extrabold text-gray-900 outline-none">
        {JOURNEY.route.title}
      </h3>

      <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CountryPicker
          id="journey-origin"
          label={JOURNEY.route.pickupLabel}
          value={state.origin}
          onChange={(iso) => update((s) => ({ ...s, origin: iso }))}
        />
        <CountryPicker
          id="journey-destination"
          label={JOURNEY.route.deliveryLabel}
          value={state.destination}
          onChange={(iso) => update((s) => ({ ...s, destination: iso }))}
        />
        {routeComplete && (
          <button
            type="button"
            onClick={() => update((s) => ({ ...s, origin: s.destination, destination: s.origin }))}
            className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white border border-gray-200 shadow-sm items-center justify-center text-gray-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors"
            aria-label="تبديل الاستلام والتسليم"
          >
            <ArrowLeftRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {routeComplete && (
          <m.div key="types" {...collapseMotion} transition={reveal} style={{ overflow: 'hidden' }}>
            <fieldset className="pt-1">
              <legend className="text-sm font-extrabold text-gray-800 mb-3">{JOURNEY.type.title}</legend>
              <div className="grid grid-cols-2 gap-3">
                {TYPES.map(({ id, icon: Icon, title, description }) => {
                  const selected = state.shipmentType === id
                  return (
                    <m.button
                      key={id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => chooseType(id)}
                      whileTap={{ scale: 0.97 }}
                      transition={tap}
                      className={`relative text-right p-4 rounded-2xl border-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 ${
                        selected ? 'border-indigo-600 bg-indigo-50/60' : 'border-gray-200 hover:border-indigo-200 bg-white'
                      }`}
                    >
                      <span
                        className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                          selected ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <span className="block font-extrabold text-gray-900">{title}</span>
                      <span className="block mt-1 text-xs text-gray-500">{description}</span>
                      <AnimatePresence>
                        {selected && (
                          <m.span
                            key="check"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={tap}
                            className="absolute top-3 left-3 w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center"
                          >
                            <Check size={14} aria-hidden="true" />
                          </m.span>
                        )}
                      </AnimatePresence>
                    </m.button>
                  )
                })}
              </div>
            </fieldset>
          </m.div>
        )}
      </AnimatePresence>

      <StageNav continueDisabled={!routeComplete || !state.shipmentType} onContinue={onContinue} />
      <ContactShortcut text="تفضّل أن يتواصل معك فريقنا مباشرة؟" onClick={onContactInstead} />
    </div>
  )
}
