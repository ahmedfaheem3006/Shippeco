import { useState, type FormEvent, type RefObject } from 'react'
import { AlertCircle } from 'lucide-react'
import { JOURNEY, QUOTE_FORM } from '../../../content/landingPageContent'
import { PhoneField } from '../../shared/PhoneField'
import { Honeypot, TextField } from './fields'
import type { JourneyState } from './journeyState'
import { validateContact } from './journeyPhone'
import type { SubmitState, Updater } from './ShippingJourney'
import { StageNav } from './StageNav'

type Props = {
  state: JourneyState
  update: Updater
  headingRef: RefObject<HTMLHeadingElement>
  submit: SubmitState
  honeypot: string
  onHoneypot: (v: string) => void
  onBack: () => void
  onSubmit: () => void
}

const c = JOURNEY.contactForm

export function ContactStage({ state, update, headingRef, submit, honeypot, onHoneypot, onBack, onSubmit }: Props) {
  const [attempted, setAttempted] = useState(false)
  const clientErrors = validateContact(state)
  const serverErrors = submit.kind === 'contact' ? submit.fieldErrors ?? {} : {}
  const errors = {
    name: (attempted && clientErrors.name) || serverErrors.name,
    phone: (attempted && clientErrors.phone) || serverErrors.phone,
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setAttempted(true)
    if (clientErrors.name || clientErrors.phone) {
      setTimeout(() => document.querySelector<HTMLElement>('#quote [aria-invalid="true"]')?.focus(), 0)
      return
    }
    onSubmit()
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="relative flex flex-col gap-5">
      <Honeypot value={honeypot} onChange={onHoneypot} />
      <div>
        <h3 ref={headingRef} tabIndex={-1} className="text-lg font-extrabold text-gray-900 outline-none">
          {c.title}
        </h3>
        <p className="mt-1.5 text-sm text-gray-500 leading-relaxed">{c.description}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField
          id="contact-name"
          label={c.nameLabel}
          required
          autoComplete="name"
          value={state.contact.name}
          onChange={(v) => update((s) => ({ ...s, contact: { ...s.contact, name: v } }))}
          error={errors.name}
        />
        <PhoneField
          id="contact-phone"
          label={c.phoneLabel}
          required
          error={errors.phone}
          country={state.contact.phone.country}
          onCountryChange={(country) => update((s) => ({ ...s, contact: { ...s.contact, phone: { ...s.contact.phone, country } } }))}
          rawValue={state.contact.phone.raw}
          onRawChange={(raw) => update((s) => ({ ...s, contact: { ...s.contact, phone: { ...s.contact.phone, raw } } }))}
        />
      </div>

      {submit.status === 'error' && submit.kind === 'contact' && submit.message && (
        <div role="alert" className="flex items-center gap-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} aria-hidden="true" />
          {submit.message}
        </div>
      )}

      <StageNav onBack={onBack} submitType continueLabel={c.submitLabel} submitting={submit.status === 'submitting'} />
      <p className="text-xs text-gray-400 text-center">{QUOTE_FORM.privacyNote}</p>
    </form>
  )
}
