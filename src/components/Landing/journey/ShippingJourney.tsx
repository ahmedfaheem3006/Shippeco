import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { LazyMotion, m, AnimatePresence } from 'framer-motion'
import { Check, CheckCircle2, Loader2, Pencil, X } from 'lucide-react'
import { JOURNEY } from '../../../content/landingPageContent'
import { countryNameAr as countryName } from '../../../utils/countries'
import { newClientRequestId, submitQuoteRequest, QuoteRequestError } from '../../../services/quoteRequestService'
import { AutoHeight, DURATION, stageMotion, useMotionTransition } from '../motion'
import { onServiceRequested } from './journeyBus'
import { initialJourneyState, parseDecimal, type JourneyState, type Stage } from './journeyState'
import { RouteTypeStage } from './RouteTypeStage'
import { DetailsStage } from './DetailsStage'
import { PathStage } from './PathStage'

// The stages with phone fields (and libphonenumber-js's metadata) load on
// demand — they're prefetched a moment after the page settles, so by the
// time a visitor reaches them they're usually already there.
const loadContactStage = () => import('./ContactStage')
const loadWaybillStage = () => import('./WaybillStage')
const ContactStage = lazy(() => loadContactStage().then((mod) => ({ default: mod.ContactStage })))
const WaybillStage = lazy(() => loadWaybillStage().then((mod) => ({ default: mod.WaybillStage })))
const WaybillReviewStage = lazy(() => loadWaybillStage().then((mod) => ({ default: mod.WaybillReviewStage })))
const loadMotionFeatures = () => import('../motionFeatures').then((mod) => mod.default)

function StageFallback() {
  return (
    <div className="py-12 flex justify-center text-indigo-600" role="status" aria-label="جارِ التحميل">
      <Loader2 size={24} className="animate-spin" aria-hidden="true" />
    </div>
  )
}

export type Updater = (fn: (s: JourneyState) => JourneyState) => void

export type SubmitState = {
  status: 'idle' | 'submitting' | 'success' | 'error'
  kind?: 'contact' | 'waybill'
  message?: string
  /** Server-side field errors keyed by payload path, e.g. "sender.phone". */
  fieldErrors?: Record<string, string>
}

function stepIndex(stage: Stage, s: JourneyState): number {
  if (stage === 'route') return s.origin && s.destination ? 1 : 0
  if (stage === 'details') return 2
  return 3
}

export function LandingShippingJourney() {
  const [state, setState] = useState<JourneyState>(initialJourneyState)
  const [contactFrom, setContactFrom] = useState<Stage>('path')
  const [submit, setSubmit] = useState<SubmitState>({ status: 'idle' })
  const [honeypot, setHoneypot] = useState('')
  // One idempotency key per submission "attempt set": a retry after a
  // failure reuses it (so a request the server DID save isn't saved twice),
  // and it's only replaced after a confirmed success.
  const clientRequestId = useRef<string>('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const stageTransition = useMotionTransition(DURATION.base)

  const update: Updater = (fn) => setState((s) => fn(s))
  const goTo = (stage: Stage) => {
    setSubmit((prev) => (prev.status === 'error' ? { status: 'idle' } : prev))
    update((s) => ({ ...s, stage }))
  }

  // Warm the lazily-loaded stages once the page has settled.
  useEffect(() => {
    const t = setTimeout(() => {
      loadContactStage().catch(() => {})
      loadWaybillStage().catch(() => {})
    }, 2500)
    return () => clearTimeout(t)
  }, [])

  // Service cards elsewhere on the page hand their service to the journey.
  useEffect(
    () =>
      onServiceRequested(({ serviceName, path }) => {
        setSubmit({ status: 'idle' })
        if (path === 'contact') setContactFrom('route')
        update((s) => ({ ...s, serviceName, stage: path === 'contact' ? 'contact' : 'route' }))
      }),
    []
  )

  // On every stage change after the first render: move focus to the new
  // stage's heading (keyboard/screen-reader users land in the right place)
  // and bring the card's top back into view if it scrolled above the fold.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const t = setTimeout(() => {
      headingRef.current?.focus({ preventScroll: true })
      const top = sectionRef.current?.getBoundingClientRect().top ?? 0
      if (top < 0) sectionRef.current?.scrollIntoView({ block: 'start' })
    }, 40)
    return () => clearTimeout(t)
  }, [state.stage, submit.status === 'success'])

  const send = async (kind: 'contact' | 'waybill') => {
    if (submit.status === 'submitting') return // duplicate-click guard
    if (!clientRequestId.current) clientRequestId.current = newClientRequestId()
    setSubmit({ status: 'submitting', kind })
    try {
      const { buildContactPayload, buildWaybillPayload } = await import('./journeyPhone')
      const payload =
        kind === 'contact'
          ? buildContactPayload(state, clientRequestId.current)
          : buildWaybillPayload(state, clientRequestId.current)
      await submitQuoteRequest({ ...payload, website: honeypot })
      // Success is only shown once the server has confirmed the save.
      setSubmit({ status: 'success', kind })
      clientRequestId.current = ''
    } catch (err) {
      const fieldErrors: Record<string, string> = {}
      if (err instanceof QuoteRequestError) {
        for (const fe of err.fieldErrors ?? []) if (fe.field && fe.field !== 'website') fieldErrors[fe.field] = fe.message
      }
      setSubmit({
        status: 'error',
        kind,
        message: err instanceof QuoteRequestError ? err.message : 'تعذر إرسال الطلب، حاول مرة أخرى.',
        fieldErrors,
      })
      // A waybill rejected by the server over a specific field goes back to
      // the form so the visitor can see and fix it (data is kept as-is).
      if (kind === 'waybill' && Object.keys(fieldErrors).length) update((s) => ({ ...s, stage: 'waybill' }))
    }
  }

  const startOver = () => {
    setState(initialJourneyState())
    setSubmit({ status: 'idle' })
    setContactFrom('path')
  }

  const current = stepIndex(state.stage, state)
  const showSummary = state.stage !== 'route' && (state.origin || state.destination || state.shipmentType)

  const totalWeight = (() => {
    if (state.shipmentType === 'document') return parseDecimal(state.documentWeight)
    if (state.shipmentType === 'package') {
      const sum = state.packages.reduce((acc, p) => acc + (parseDecimal(p.weight) ?? 0), 0)
      return sum > 0 ? sum : null
    }
    return null
  })()

  return (
    <section id="quote" ref={sectionRef} className="scroll-mt-20 px-5 pb-16 md:pb-20">
      <LazyMotion features={loadMotionFeatures} strict>
        <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-3xl shadow-xl shadow-indigo-900/5 p-4 sm:p-6 md:p-8">
          {/* Step indicator */}
          <ol className="flex items-center gap-2 mb-6" aria-label="مراحل طلب الشحنة">
            {JOURNEY.stepLabels.map((label, i) => {
              const done = submit.status === 'success' || i < current
              const active = submit.status !== 'success' && i === current
              return (
                <li key={label} className="flex-1 flex flex-col gap-1.5" aria-current={active ? 'step' : undefined}>
                  <span className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <m.span
                      className="block h-full bg-indigo-600 rounded-full origin-right"
                      initial={false}
                      animate={{ scaleX: done || active ? 1 : 0 }}
                      transition={stageTransition}
                    />
                  </span>
                  <span className={`text-[11px] sm:text-xs font-bold flex items-center gap-1 ${active ? 'text-indigo-600' : done ? 'text-gray-700' : 'text-gray-400'}`}>
                    {done && <Check size={12} aria-hidden="true" />}
                    {label}
                  </span>
                </li>
              )
            })}
          </ol>

          {/* Short summary of what's been chosen so far, editable. */}
          {showSummary && submit.status !== 'success' && (
            <div className="mb-5 flex flex-wrap items-center gap-2 text-xs">
              {state.origin && state.destination && (
                <span className="px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 font-bold text-gray-700">
                  {countryName(state.origin)} ← {countryName(state.destination)}
                </span>
              )}
              {state.shipmentType && (
                <span className="px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 font-bold text-gray-700">
                  {state.shipmentType === 'document' ? (
                    JOURNEY.type.document.title
                  ) : (
                    <>
                      {JOURNEY.type.package.title} × <bdi>{state.packages.length}</bdi>
                    </>
                  )}
                  {totalWeight ? (
                    <>
                      {' · '}
                      <bdi>{Math.round(totalWeight * 100) / 100}</bdi> كجم
                    </>
                  ) : null}
                </span>
              )}
              {state.origin && (
                <button
                  type="button"
                  onClick={() => goTo('route')}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-full text-indigo-600 font-bold hover:bg-indigo-50"
                >
                  <Pencil size={12} aria-hidden="true" />
                  تعديل
                </button>
              )}
            </div>
          )}
          {state.serviceName && submit.status !== 'success' && (
            <div className="mb-5 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">
              الخدمة المطلوبة: {state.serviceName}
              <button type="button" onClick={() => update((s) => ({ ...s, serviceName: '' }))} aria-label="إزالة الخدمة المختارة" className="hover:text-indigo-900">
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          )}

          <AutoHeight>
            <AnimatePresence mode="wait" initial={false}>
              {submit.status === 'success' ? (
                <m.div
                  key="success"
                  {...stageMotion}
                  transition={stageTransition}
                  className="py-8 flex flex-col items-center text-center gap-4"
                  role="status"
                >
                  <m.span
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ ...stageTransition, delay: 0.08 }}
                    className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"
                  >
                    <CheckCircle2 size={36} aria-hidden="true" />
                  </m.span>
                  <h3 ref={headingRef} tabIndex={-1} className="text-xl font-extrabold text-gray-900 outline-none max-w-md">
                    {submit.kind === 'waybill' ? JOURNEY.waybillForm.successMessage : JOURNEY.contactForm.successMessage}
                  </h3>
                  <button
                    type="button"
                    onClick={startOver}
                    className="mt-2 px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 active:scale-[0.98] transition-all"
                  >
                    إرسال طلب آخر
                  </button>
                </m.div>
              ) : (
                <m.div key={state.stage} {...stageMotion} transition={stageTransition}>
                  <Suspense fallback={<StageFallback />}>
                  {state.stage === 'route' && (
                    <RouteTypeStage
                      state={state}
                      update={update}
                      headingRef={headingRef}
                      onContinue={() => goTo('details')}
                      onContactInstead={() => {
                        setContactFrom('route')
                        goTo('contact')
                      }}
                    />
                  )}
                  {state.stage === 'details' && (
                    <DetailsStage
                      state={state}
                      update={update}
                      headingRef={headingRef}
                      onBack={() => goTo('route')}
                      onContinue={() => goTo('path')}
                      onContactInstead={() => {
                        setContactFrom('details')
                        goTo('contact')
                      }}
                    />
                  )}
                  {state.stage === 'path' && (
                    <PathStage
                      headingRef={headingRef}
                      onBack={() => goTo('details')}
                      onChoose={(path) => {
                        if (path === 'contact') setContactFrom('path')
                        goTo(path)
                      }}
                    />
                  )}
                  {state.stage === 'contact' && (
                    <ContactStage
                      state={state}
                      update={update}
                      headingRef={headingRef}
                      submit={submit}
                      honeypot={honeypot}
                      onHoneypot={setHoneypot}
                      onBack={() => goTo(contactFrom)}
                      onSubmit={() => send('contact')}
                    />
                  )}
                  {state.stage === 'waybill' && (
                    <WaybillStage
                      state={state}
                      update={update}
                      headingRef={headingRef}
                      serverErrors={submit.kind === 'waybill' ? submit.fieldErrors : undefined}
                      onBack={() => goTo('path')}
                      onContinue={() => goTo('review')}
                    />
                  )}
                  {state.stage === 'review' && (
                    <WaybillReviewStage
                      state={state}
                      headingRef={headingRef}
                      submit={submit}
                      honeypot={honeypot}
                      onHoneypot={setHoneypot}
                      onEdit={goTo}
                      onBack={() => goTo('waybill')}
                      onSubmit={() => send('waybill')}
                    />
                  )}
                  </Suspense>
                </m.div>
              )}
            </AnimatePresence>
          </AutoHeight>
        </div>
      </LazyMotion>
    </section>
  )
}
