import { ArrowLeft, ArrowRight, Loader2, PhoneCall } from 'lucide-react'
import { JOURNEY } from '../../../content/landingPageContent'

const primaryBtn =
  'inline-flex items-center justify-center gap-2 px-6 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white font-bold shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100'
const secondaryBtn =
  'inline-flex items-center justify-center gap-2 px-5 h-12 rounded-xl border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 active:scale-[0.98] transition-all'

/** Back / continue row shared by every stage. The primary button is full
 *  width on mobile and sits at the visual end (left, in RTL) on desktop. */
export function StageNav({
  onBack,
  onContinue,
  continueLabel = JOURNEY.continueLabel,
  continueDisabled,
  submitting,
  submitType,
}: {
  onBack?: () => void
  onContinue?: () => void
  continueLabel?: string
  continueDisabled?: boolean
  submitting?: boolean
  /** Renders the primary button as type="submit" for an enclosing <form>. */
  submitType?: boolean
}) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
      {onBack ? (
        <button type="button" onClick={onBack} className={secondaryBtn}>
          <ArrowRight size={18} aria-hidden="true" />
          {JOURNEY.backLabel}
        </button>
      ) : (
        <span className="hidden sm:block" />
      )}
      {(onContinue || submitType) && (
        <button
          type={submitType ? 'submit' : 'button'}
          onClick={submitType ? undefined : onContinue}
          disabled={continueDisabled || submitting}
          aria-busy={submitting || undefined}
          className={`${primaryBtn} w-full sm:w-auto`}
        >
          {submitting && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}
          {submitting ? 'جارِ الإرسال...' : continueLabel}
          {!submitting && !submitType && <ArrowLeft size={18} aria-hidden="true" />}
        </button>
      )}
    </div>
  )
}

/** The always-available way out to the short "تواصلوا معي" path — for
 *  visitors who don't know their shipment's measurements (or anything else
 *  yet) and would rather talk to the team. */
export function ContactShortcut({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <p className="text-center text-sm text-gray-500">
      {text}{' '}
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:underline">
        <PhoneCall size={14} aria-hidden="true" />
        {JOURNEY.path.contact.title}
      </button>
    </p>
  )
}
