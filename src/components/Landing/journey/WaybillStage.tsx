import { useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { AlertCircle, Pencil, Clock } from 'lucide-react'
import { JOURNEY, QUOTE_FORM } from '../../../content/landingPageContent'
import { countryNameAr as countryName } from '../../../utils/countries'
import { PhoneField } from '../../shared/PhoneField'
import { Honeypot, NumberUnitField, TextField } from './fields'
import { buildShipmentPayload, isInternational, type JourneyState, type PartyState, type Stage } from './journeyState'
import { hasWaybillErrors, validatePhone, validateWaybill, type PartyErrors } from './journeyPhone'
import type { SubmitState, Updater } from './ShippingJourney'
import { StageNav } from './StageNav'

const w = JOURNEY.waybillForm
const CURRENCIES = [
  { code: 'SAR', label: 'ريال سعودي' },
  { code: 'EGP', label: 'جنيه مصري' },
  { code: 'USD', label: 'دولار أمريكي' },
  { code: 'EUR', label: 'يورو' },
]

function PartyBlock({
  prefix, title, party, errors, onChange,
}: {
  prefix: 'sender' | 'receiver'
  title: string
  party: PartyState
  errors: PartyErrors
  onChange: (fn: (p: PartyState) => PartyState) => void
}) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-2xl border border-gray-200 p-4">
      <legend className="px-2 text-sm font-extrabold text-gray-800">{title}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField id={`${prefix}-name`} label={w.nameLabel} required autoComplete="name" value={party.name} onChange={(v) => onChange((p) => ({ ...p, name: v }))} error={errors.name} />
        <PhoneField
          id={`${prefix}-phone`}
          label={w.phoneLabel}
          required
          error={errors.phone}
          country={party.phone.country}
          onCountryChange={(country) => onChange((p) => ({ ...p, phone: { ...p.phone, country } }))}
          rawValue={party.phone.raw}
          onRawChange={(raw) => onChange((p) => ({ ...p, phone: { ...p.phone, raw } }))}
        />
        <div className="sm:col-span-2">
          <TextField id={`${prefix}-address`} label={w.addressLabel} required autoComplete="street-address" value={party.address_line} onChange={(v) => onChange((p) => ({ ...p, address_line: v }))} error={errors.address_line} />
        </div>
        <TextField id={`${prefix}-city`} label={w.cityLabel} required autoComplete="address-level2" value={party.city} onChange={(v) => onChange((p) => ({ ...p, city: v }))} error={errors.city} />
        <TextField id={`${prefix}-postal`} label={w.postalCodeLabel} autoComplete="postal-code" dir="ltr" value={party.postal_code} onChange={(v) => onChange((p) => ({ ...p, postal_code: v }))} />
      </div>
    </fieldset>
  )
}

/** Maps server errors like "sender.phone" onto the per-party error shape. */
function serverPartyErrors(server: Record<string, string> | undefined, prefix: 'sender' | 'receiver'): PartyErrors {
  const out: PartyErrors = {}
  for (const key of ['name', 'phone', 'address_line', 'city'] as const) {
    const msg = server?.[`${prefix}.${key}`]
    if (msg) out[key] = msg
  }
  return out
}

export function WaybillStage({
  state, update, headingRef, serverErrors, onBack, onContinue,
}: {
  state: JourneyState
  update: Updater
  headingRef: RefObject<HTMLHeadingElement>
  serverErrors?: Record<string, string>
  onBack: () => void
  onContinue: () => void
}) {
  const [attempted, setAttempted] = useState(false)
  const client = validateWaybill(state)
  const international = isInternational(state)

  const senderErrors = { ...serverPartyErrors(serverErrors, 'sender'), ...(attempted ? client.sender : {}) }
  const receiverErrors = { ...serverPartyErrors(serverErrors, 'receiver'), ...(attempted ? client.receiver : {}) }
  const contentsError = (attempted && client.contents) || serverErrors?.contents
  const valueError = (attempted && client.declaredValue) || serverErrors?.declared_value

  const setWaybill = (patch: Partial<JourneyState['waybill']>) => update((s) => ({ ...s, waybill: { ...s.waybill, ...patch } }))

  const handleContinue = (e: FormEvent) => {
    e.preventDefault()
    setAttempted(true)
    if (hasWaybillErrors(client)) {
      setTimeout(() => document.querySelector<HTMLElement>('#quote [aria-invalid="true"]')?.focus(), 0)
      return
    }
    onContinue()
  }

  return (
    <form onSubmit={handleContinue} noValidate className="flex flex-col gap-5">
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-extrabold text-gray-900 outline-none">
        {w.title}
      </h3>

      {serverErrors && Object.keys(serverErrors).length > 0 && (
        <div role="alert" className="flex items-center gap-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} aria-hidden="true" />
          {QUOTE_FORM.fieldErrorsMessage}
        </div>
      )}

      <PartyBlock
        prefix="sender"
        title={w.senderTitle}
        party={state.waybill.sender}
        errors={senderErrors}
        onChange={(fn) => update((s) => ({ ...s, waybill: { ...s.waybill, sender: fn(s.waybill.sender) } }))}
      />
      <PartyBlock
        prefix="receiver"
        title={w.receiverTitle}
        party={state.waybill.receiver}
        errors={receiverErrors}
        onChange={(fn) => update((s) => ({ ...s, waybill: { ...s.waybill, receiver: fn(s.waybill.receiver) } }))}
      />

      <TextField
        id="waybill-contents"
        label={w.contentsLabel}
        required
        multiline
        placeholder="مثال: ملابس، مستندات رسمية، إكسسوارات..."
        value={state.waybill.contents}
        onChange={(v) => setWaybill({ contents: v })}
        error={contentsError || undefined}
      />

      {/* Value / customs only matter when the shipment crosses a border. */}
      {international && (
        <fieldset className="flex flex-col gap-4 rounded-2xl border border-gray-200 p-4">
          <legend className="px-2 text-sm font-extrabold text-gray-800">معلومات الشحن الدولي</legend>
          <div className="grid grid-cols-2 gap-4">
            <NumberUnitField
              id="waybill-value"
              label={w.declaredValueLabel}
              unit={state.waybill.declaredCurrency}
              value={state.waybill.declaredValue}
              onChange={(v) => setWaybill({ declaredValue: v })}
              error={valueError || undefined}
            />
            <div className="flex flex-col gap-1.5 text-sm">
              <label htmlFor="waybill-currency" className="font-bold text-gray-700">{w.declaredCurrencyLabel}</label>
              <select
                id="waybill-currency"
                value={state.waybill.declaredCurrency}
                onChange={(e) => setWaybill({ declaredCurrency: e.target.value })}
                className="w-full h-12 bg-gray-50 border border-gray-200 rounded-xl px-4 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.label} ({c.code})</option>
                ))}
              </select>
            </div>
          </div>
          <TextField
            id="waybill-customs"
            label={w.customsInfoLabel}
            multiline
            placeholder="أي معلومات تساعد في إجراءات التخليص (اختياري)"
            value={state.waybill.customsInfo}
            onChange={(v) => setWaybill({ customsInfo: v })}
          />
        </fieldset>
      )}

      <StageNav onBack={onBack} submitType continueLabel="مراجعة الطلب" />
    </form>
  )
}

function ReviewRow({ label, children, onEdit }: { label: string; children: ReactNode; onEdit?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-gray-100 last:border-0">
      <div className="min-w-0">
        <div className="text-xs font-bold text-gray-500">{label}</div>
        <div className="mt-1 text-sm text-gray-900 break-words">{children}</div>
      </div>
      {onEdit && (
        <button type="button" onClick={onEdit} className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg">
          <Pencil size={12} aria-hidden="true" />
          تعديل
        </button>
      )}
    </div>
  )
}

function partySummary(p: PartyState) {
  const phone = validatePhone(p.phone).e164
  return (
    <>
      {p.name} — <bdi dir="ltr">{phone}</bdi>
      <br />
      {p.address_line}، {p.city}
      {p.postal_code ? <> — <bdi dir="ltr">{p.postal_code}</bdi></> : null}
    </>
  )
}

export function WaybillReviewStage({
  state, headingRef, submit, honeypot, onHoneypot, onEdit, onBack, onSubmit,
}: {
  state: JourneyState
  headingRef: RefObject<HTMLHeadingElement>
  submit: SubmitState
  honeypot: string
  onHoneypot: (v: string) => void
  onEdit: (stage: Stage) => void
  onBack: () => void
  onSubmit: () => void
}) {
  const shipment = buildShipmentPayload(state)
  const international = isInternational(state)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      className="relative flex flex-col gap-4"
    >
      <Honeypot value={honeypot} onChange={onHoneypot} />
      <h3 ref={headingRef} tabIndex={-1} className="text-lg font-extrabold text-gray-900 outline-none">
        {w.reviewTitle}
      </h3>

      <div className="rounded-2xl border border-gray-200 px-4">
        <ReviewRow label="المسار" onEdit={() => onEdit('route')}>
          {countryName(state.origin)} ← {countryName(state.destination)}
        </ReviewRow>
        <ReviewRow label="الشحنة" onEdit={() => onEdit('details')}>
          {shipment.shipment_type === 'document' ? 'مستندات' : `طرد × ${shipment.packages?.length ?? 0}`}
          <ul className="mt-1 text-xs text-gray-600" dir="ltr">
            {shipment.packages?.map((p, i) => (
              <li key={i}>
                {p.weight_kg} kg{p.length_cm ? ` · ${p.length_cm}×${p.width_cm}×${p.height_cm} cm` : ''}
              </li>
            ))}
          </ul>
        </ReviewRow>
        <ReviewRow label={w.senderTitle} onEdit={() => onEdit('waybill')}>{partySummary(state.waybill.sender)}</ReviewRow>
        <ReviewRow label={w.receiverTitle} onEdit={() => onEdit('waybill')}>{partySummary(state.waybill.receiver)}</ReviewRow>
        <ReviewRow label={w.contentsLabel} onEdit={() => onEdit('waybill')}>{state.waybill.contents}</ReviewRow>
        {international && state.waybill.declaredValue && (
          <ReviewRow label="القيمة التقريبية" onEdit={() => onEdit('waybill')}>
            <bdi dir="ltr">{state.waybill.declaredValue} {state.waybill.declaredCurrency}</bdi>
          </ReviewRow>
        )}
        {state.serviceName && <ReviewRow label="الخدمة المطلوبة">{state.serviceName}</ReviewRow>}
      </div>

      <p className="flex items-start gap-2 text-sm text-amber-900 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
        <Clock size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
        {w.pendingReviewNote}
      </p>

      {submit.status === 'error' && submit.kind === 'waybill' && submit.message && (
        <div role="alert" className="flex items-center gap-2 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} aria-hidden="true" />
          {submit.message}
        </div>
      )}

      <StageNav onBack={onBack} submitType continueLabel={w.submitLabel} submitting={submit.status === 'submitting'} />
      <p className="text-xs text-gray-400 text-center">{QUOTE_FORM.privacyNote}</p>
    </form>
  )
}
