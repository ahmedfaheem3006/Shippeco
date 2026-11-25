/**
 * Step 7 «الاستلام / Pickup» — the MyDHL+ «Do you want to schedule a courier pickup?» on
 * SHIPPEC's design (AR / EN):
 *
 *   Yes — Schedule Pickup   the shipment date (edited on the Service step), DHL's pickup window for
 *                           the chosen product (earliest / latest from pickupCapabilities), the
 *                           courier's place (Reception / Front / Back / Other + details), the pickup
 *                           address (the From address, or another one that never changes From), the
 *                           total pickup weight (from the packages), instructions for the courier
 *   No                      no pickup request at all
 *   Drop off                a DHL Service Point from DHL's own list (no pickup request)
 *
 * DHL_PROD_PICKUP_ENABLED decides whether a courier may be booked (options().features.pickup_booking):
 * while it is off the choice is shown with a notice and the server refuses it — nothing is booked.
 * The Shipment Cost Summary at the bottom shows DHL's figures only (never SHIPPEC's profit).
 */
import { useState } from 'react';
import { useAuthStore } from '../../hooks/useAuthStore';
import { Ban, CalendarDays, Clock, MapPin, Pencil, Receipt, Search, Store, Truck } from 'lucide-react';
import { dhlShipmentService, type ServicePoint } from '../../services/dhlShipment.service';
import { describeApiError } from '../../utils/apiErrors';
import { Button, ChoiceCards, Field, Note, Section, SelectInput, Skeleton, TextInput } from './ui';
import { PartyFields } from './FormSteps';
import { ChargeTable } from './StepService';
import { useCsLang } from './csLang';
import {
  composePhone, countryName, dateParts, dhlDateTime, kg, optionalServiceRows, originToday, packageTotals, PICKUP_LOCATION_LABELS, PICKUP_TEXT_MAX, pickupGate, pickupSlots,
  translateIssue, type PartyForm, type PickupLocationChoice, type StepId,
} from './wizardModel';
import type { Wizard } from './useShipmentWizard';

const DAYS: Record<string, [string, string]> = {
  MONDAY: ['الإثنين', 'Monday'], TUESDAY: ['الثلاثاء', 'Tuesday'], WEDNESDAY: ['الأربعاء', 'Wednesday'], THURSDAY: ['الخميس', 'Thursday'],
  FRIDAY: ['الجمعة', 'Friday'], SATURDAY: ['السبت', 'Saturday'], SUNDAY: ['الأحد', 'Sunday'],
};
const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);
const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
/** The sender's address as the starting point of another pickup address (the Saudi short address goes to line 3). */
const pickupFromShipper = (s: PartyForm): PartyForm => ({
  ...s, phones: s.phones.map((p) => ({ ...p })), na: { ...s.na }, use_na: false,
  address_line3: s.country_code === 'SA' ? s.short_address : s.suburb,
  phone: s.phones[0]?.number ? composePhone(s.phones[0].code, s.phones[0].number) : s.phone,
});

/** The pickup capabilities DHL gave for the chosen product (GET /products first, then the quote — as the Backend checks). */
export function pickupCapabilitiesOf(w: Pick<Wizard, 'form' | 'products' | 'quote'>) {
  return w.products?.find((p) => p.productCode === w.form.product_code)?.pickupCapabilities ?? w.quote?.pickupCapabilities ?? null;
}

function PointCard({ p, selected, onSelect }: { p: ServicePoint; selected: boolean; onSelect: () => void }) {
  const { t } = useCsLang();
  const dropOff = p.capabilities.dropOff === true;
  return (
    <article className={`rounded-2xl border p-3 sm:p-4 space-y-2 ${selected ? 'border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900/40' : 'border-slate-200 dark:border-slate-700'} ${dropOff ? '' : 'opacity-70'}`} data-service-point={p.id ?? ''}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white" dir="ltr">{p.localName || p.name}</h3>
          <p className="text-[11px] text-slate-500" dir="ltr">{[p.address.line1, p.address.line2, p.address.city].filter(Boolean).join(', ')}</p>
        </div>
        <span className="text-xs font-bold text-slate-500 tabular-nums shrink-0">{p.distance ?? ''}</span>
      </div>
      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
        <span className={`px-2 py-0.5 rounded-lg border ${dropOff ? 'bg-green-50 text-green-700 border-green-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{dropOff ? t('تقبل التسليم', 'Accepts drop-off') : t('للاستلام فقط — لا تقبل التسليم', 'Collection only — no drop-off')}</span>
        {p.shippingCutoff && <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 inline-flex items-center gap-1"><Clock size={10} /> {t('آخر موعد للشحن', 'Shipping cut-off')} {hm(p.shippingCutoff)}</span>}
        {p.limits.maxPieceWeightKg != null && <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300">{t(`حتى ${p.limits.maxPieceWeightKg} كغ للقطعة`, `Up to ${p.limits.maxPieceWeightKg} kg per piece`)}</span>}
      </div>
      {p.openingHours.length > 0 && (
        <details className="text-[11px] text-slate-500">
          <summary className="cursor-pointer font-bold">{t('ساعات العمل', 'Opening hours')}</summary>
          <ul className="mt-1 grid grid-cols-2 gap-x-3">{p.openingHours.map((o) => <li key={o.day} className="tabular-nums">{DAYS[o.day] ? t(...DAYS[o.day]) : o.day}: {o.open}–{o.close}</li>)}</ul>
        </details>
      )}
      <Button variant={selected ? 'secondary' : 'primary'} onClick={onSelect} disabled={!dropOff || selected} className="w-full">
        {selected ? t('النقطة المختارة', 'Selected point') : dropOff ? t('اختيار هذه النقطة', 'Choose this point') : t('غير متاحة للتسليم', 'Not available for drop-off')}
      </Button>
    </article>
  );
}

/** Read-only pickup address (MyDHL+ «Pickup Address»): each line only when it has a value. */
function AddressCard({ p }: { p: PartyForm }) {
  const { lang } = useCsLang();
  const phone = p.phones[0]?.number ? composePhone(p.phones[0].code, p.phones[0].number) : p.phone;
  const lines = [
    p.contact, p.company && p.company !== p.contact ? p.company : '', countryName(p.country_code, lang), p.address_line1, p.address_line2,
    p.country_code === 'SA' ? p.short_address : p.suburb || p.address_line3,
    [p.city, p.province].filter((x) => x && x.trim()).join(', '), p.postal_code, p.email, phone,
  ].filter((x) => x && String(x).trim());
  return (
    <address className="not-italic text-sm text-slate-700 dark:text-slate-200 leading-relaxed" data-testid="pickup-address">
      {lines.map((l, i) => <div key={i} dir={i === 2 ? undefined : 'ltr'} className={i === 0 ? 'font-extrabold text-slate-900 dark:text-white' : ''}>{l}</div>)}
    </address>
  );
}

/** MyDHL+ «Shipment Cost Summary» — DHL's product, delivery, weights and charges (never SHIPPEC's price or profit). */
function CostSummary({ w }: { w: Wizard }) {
  const { t, lang } = useCsLang();
  const q = w.quote;
  if (!q || !w.form.product_code) return null;
  const est = dhlDateTime(q.deliveryCapabilities?.estimatedDeliveryDateAndTime ?? q.estimatedDelivery);
  const parts = est ? dateParts(est.date, lang) : null;
  const total = packageTotals(w.form.packages);
  const optional = optionalServiceRows(q, w.form.service_codes, lang).filter((r) => r.selected);
  return (
    <Section title={t('ملخص تكلفة الشحنة', 'Shipment Cost Summary')} icon={<Receipt size={18} className="text-indigo-600" />}
      description={t('أرقام DHL كما أعادتها لهذه الشحنة. سعر البيع لعميل SHIPPEC منفصل عنها.', "DHL's figures exactly as returned for this shipment. SHIPPEC's selling price is separate.")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5" data-testid="cost-summary">
        <div className="space-y-2 text-sm">
          <div className="font-extrabold text-slate-900 dark:text-white" dir="ltr">{q.productName ?? w.form.product_code}</div>
          {parts && est && <div className="text-xs text-slate-600 dark:text-slate-300">{parts.weekday} {parts.day} {parts.month} · {est.eod ? t('نهاية اليوم', 'End of Day') : est.time ? t(`قبل ${est.time}`, `By ${est.time}`) : ''}</div>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs mt-2">
            <dt className="font-bold text-slate-500">{t('الوزن الحجمي (DHL)', 'Volumetric Weight (DHL)')}</dt><dd className="font-extrabold tabular-nums" data-testid="cs-volumetric">{q.weight?.volumetric != null ? kg(q.weight.volumetric, lang) : '—'}</dd>
            <dt className="font-bold text-slate-500">{t('الوزن الإجمالي', 'Total Weight')}</dt><dd className="font-extrabold tabular-nums" data-testid="cs-total-weight">{kg(total.weight, lang)}</dd>
            <dt className="font-bold text-slate-500">{t('الوزن المحتسب', 'Chargeable Weight')}</dt><dd className="text-slate-500" data-testid="cs-chargeable">{t('لا تعيده DHL عبر الواجهة البرمجية', 'Not returned by the DHL API')}</dd>
          </dl>
          {optional.length > 0 && <p className="text-xs"><span className="font-bold text-slate-500">{t('الخدمات الاختيارية:', 'Optional services:')}</span> {optional.map((o) => o.name).join(lang === 'en' ? ', ' : '، ')}</p>}
          {w.servicesStale && <Note tone="warn">{t('تغيّرت بيانات الشحنة بعد هذا العرض — حدّث الخدمات والأسعار.', 'The shipment changed after this quote — refresh the services and prices.')}</Note>}
        </div>
        <div className="min-w-0"><ChargeTable q={q} testId="cost-summary-charges" /></div>
      </div>
    </Section>
  );
}

export function StepPickup({ w, onGo, showGate = false }: { w: Wizard; onGo?: (s: StepId) => void; showGate?: boolean }) {
  const { form, update, errors } = w;
  const { t, lang } = useCsLang();
  const role = useAuthStore((s) => s.user?.role);
  // DHL_PROD_PICKUP_ENABLED off on the server → «Yes — Schedule Pickup» cannot be chosen (the Backend refuses it too)
  const bookingOff = w.pickupBookingEnabled === false;
  const cap = pickupCapabilitiesOf(w);
  const minT = hm(cap?.pickupEarliest);
  const maxT = hm(cap?.pickupLatest);
  const slots = pickupSlots(minT, maxT);
  const gate = pickupGate(form, cap, lang, bookingOff);
  // the window is checked as soon as both times are chosen; the rest after a blocked Next
  const live = (k: string) => (k === 'pickup_earliest_time' || k === 'pickup_latest_time') && !!form.pickup_earliest_time && !!form.pickup_latest_time;
  const err = (k: string) => (showGate || live(k) ? gate[k] : null) ?? (errors[k] ? translateIssue(errors[k], lang) : null);
  const total = packageTotals(form.packages);
  const today = originToday(form);
  const date = form.shipment_date ? dateParts(form.shipment_date, lang) : null;
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const rel = form.shipment_date === today ? t('اليوم', 'Today') : form.shipment_date === tomorrow ? t('غدًا', 'Tomorrow') : date?.weekday ?? '';

  const choose = (v: typeof form.pickup_option) => update((f) => {
    if (v !== 'schedule' || f.pickup_option === 'schedule') return { ...f, pickup_option: v };
    // DHL's window as the starting times (shown, changeable)
    return { ...f, pickup_option: v, pickup_earliest_time: f.pickup_earliest_time || minT || '', pickup_latest_time: f.pickup_latest_time || maxT || '' };
  });
  const timeOptions = (value: string) => (value && !slots.includes(value) ? [value, ...slots] : slots);

  // Drop-off search — DHL takes Latin text only; the country goes separately as countryCode.
  const [q, setQ] = useState(() => form.shipper.city);
  const [points, setPoints] = useState<ServicePoint[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const search = async () => {
    setSearching(true);
    setSearchError(null);
    try {
      const r = await dhlShipmentService.servicePoints(q.trim(), form.shipper.country_code || 'SA');
      setPoints(r.points);
    } catch (e) {
      setSearchError(describeApiError(e, t('تعذر البحث عن نقاط خدمة DHL', 'Could not search DHL service points')));
    } finally {
      setSearching(false);
    }
  };

  const bar = minT && maxT && toMin(maxT) > toMin(minT) && form.pickup_earliest_time && form.pickup_latest_time
    ? (() => {
        const span = toMin(maxT) - toMin(minT);
        const a = Math.max(0, Math.min(1, (toMin(form.pickup_earliest_time) - toMin(minT)) / span));
        const b = Math.max(0, Math.min(1, (toMin(form.pickup_latest_time) - toMin(minT)) / span));
        return { start: a * 100, width: Math.max(0, b - a) * 100 };
      })()
    : null;

  return (
    <div className="space-y-4" data-testid="pickup-step">
      <Section title={t('هل تريد جدولة استلام الشحنة بواسطة مندوب DHL؟', 'Do you want to schedule a courier pickup?')} icon={<Truck size={18} className="text-indigo-600" />}>
        <ChoiceCards
          name={t('هل تريد جدولة استلام الشحنة بواسطة مندوب DHL؟', 'Do you want to schedule a courier pickup?')} columns={3}
          value={form.pickup_option}
          onChange={choose}
          options={[
            { value: 'schedule', title: t('نعم — جدولة استلام', 'Yes — Schedule Pickup'), icon: <Truck size={18} />, disabled: bookingOff,
              description: bookingOff ? t('حجز مندوب DHL غير مفعّل حاليًا.', 'Courier pickup booking is not enabled yet.') : t('يحضر مندوب DHL للاستلام ضمن نافذة DHL.', 'A DHL courier collects within DHL\'s window.') },
            { value: 'none', title: t('لا', 'No'), description: t('لا يُطلب مندوب مع هذه الشحنة.', 'No courier is requested with this shipment.'), icon: <Ban size={18} /> },
            { value: 'drop_off', title: t('التسليم في نقطة خدمة DHL', 'Drop off at DHL Service Point'), description: t('تُسلَّم الشحنة في نقطة تقبل التسليم.', 'Hand the shipment in at a point that accepts drop-off.'), icon: <Store size={18} /> },
          ]}
        />
        {bookingOff && (
          <div className="mt-3" data-testid="pickup-gate-off">
            <Note tone={form.pickup_option === 'schedule' ? 'error' : 'info'}>
              {form.pickup_option === 'schedule'
                ? t('استلام الشحنة بواسطة مندوب DHL غير متاح حاليًا. اختر "لا" أو التسليم في نقطة خدمة DHL.', 'Courier pickup is currently unavailable. Choose No or Drop off.')
                : t('استلام الشحنة بواسطة مندوب DHL غير متاح حاليًا. اختر "لا" أو التسليم في نقطة خدمة DHL.', 'Courier pickup is not currently available. Choose No or drop off at a DHL Service Point.')}
              {role === 'admin' && <span className="block mt-1 text-[10px] font-mono opacity-80" data-testid="pickup-gate-admin">admin: DHL_PROD_PICKUP_ENABLED=false</span>}
            </Note>
          </div>
        )}
      </Section>

      {form.pickup_option === 'schedule' && !bookingOff && (
        <>
          <Section title={t('نافذة الاستلام — متى قد يصل المندوب وتكون الشحنة جاهزة', 'Pickup Window — When courier may arrive and shipment is ready')} icon={<Clock size={18} className="text-indigo-600" />}>
            <div className="grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-4">
              <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3" data-testid="pickup-date">
                <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1"><CalendarDays size={12} /> {t('سأرسل شحنتي في', "I'm sending my shipment on")}</div>
                {date ? (
                  <div className="mt-1"><div className="text-[11px] text-slate-500">{date.month}</div><div className="text-2xl font-extrabold tabular-nums">{date.day}</div><div className="text-[11px] font-bold">{rel}</div></div>
                ) : <div className="text-sm">—</div>}
                {onGo && <Button variant="secondary" className="mt-2 !py-1 text-xs w-full" onClick={() => onGo('service')}><Pencil size={12} /> {t('تعديل', 'Edit')}</Button>}
                <p className="mt-1 text-[10px] text-slate-500">{t('تغيير التاريخ يعيد طلب الخدمات والأسعار من DHL.', 'Changing the date asks DHL for services and prices again.')}</p>
              </div>
              <div className="min-w-0 space-y-3">
                {cap && minT && maxT ? (
                  <div data-testid="pickup-window">
                    <div className="flex justify-between text-[11px] font-bold text-slate-500">
                      <span>{t('الأبكر', 'Earliest')} <span className="tabular-nums text-slate-900 dark:text-white" dir="ltr">{minT}</span></span>
                      <span>{t('الأخير', 'Latest')} <span className="tabular-nums text-slate-900 dark:text-white" dir="ltr">{maxT}</span></span>
                    </div>
                    <div className="relative mt-1.5 h-2.5 rounded-full bg-slate-200 dark:bg-slate-700" dir="ltr" aria-hidden="true">
                      {bar && <div className="absolute inset-y-0 rounded-full bg-indigo-500" style={{ left: `${bar.start}%`, width: `${bar.width}%` }} />}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{t('نافذة DHL لهذه الخدمة على هذا المسار.', "DHL's window for this service on this route.")}{cap.localCutoffDateAndTime ? t(` آخر موعد لطلب الاستلام: ${cap.localCutoffDateAndTime.slice(11, 16)}`, ` Booking cut-off: ${cap.localCutoffDateAndTime.slice(11, 16)}`) : ''}</p>
                  </div>
                ) : <Note tone="warn">{t('اختر خدمة DHL أولًا لمعرفة نافذة الاستلام التي تعيدها DHL.', 'Choose a DHL service first to see the pickup window DHL returns.')}</Note>}
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t('جاهزة للاستلام من', 'Ready from (earliest)')} required error={err('pickup_earliest_time')}>
                    {(id) => slots.length ? (
                      <SelectInput id={id} value={form.pickup_earliest_time} onValue={(v) => update((f) => ({ ...f, pickup_earliest_time: v }))} error={err('pickup_earliest_time')}>
                        <option value="">—</option>{timeOptions(form.pickup_earliest_time).map((s) => <option key={s} value={s}>{s}</option>)}
                      </SelectInput>
                    ) : <TextInput id={id} type="time" value={form.pickup_earliest_time} onValue={(v) => update((f) => ({ ...f, pickup_earliest_time: v }))} error={err('pickup_earliest_time')} />}
                  </Field>
                  <Field label={t('آخر وقت للاستلام', 'Latest pickup time')} required error={err('pickup_latest_time')}>
                    {(id) => slots.length ? (
                      <SelectInput id={id} value={form.pickup_latest_time} onValue={(v) => update((f) => ({ ...f, pickup_latest_time: v }))} error={err('pickup_latest_time')}>
                        <option value="">—</option>{timeOptions(form.pickup_latest_time).map((s) => <option key={s} value={s}>{s}</option>)}
                      </SelectInput>
                    ) : <TextInput id={id} type="time" value={form.pickup_latest_time} onValue={(v) => update((f) => ({ ...f, pickup_latest_time: v }))} error={err('pickup_latest_time')} />}
                  </Field>
                </div>
              </div>
            </div>
          </Section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Section title={t('تفاصيل الاستلام', 'Pickup details')} icon={<MapPin size={18} className="text-indigo-600" />}>
              <div className="space-y-3">
                <Field label={t('من أين يستلم المندوب الشحنة؟', 'Where should the courier pick up the shipment?')} required={showGate} error={null}>
                  {(id) => (
                    <SelectInput id={id} value={form.pickup_location_choice} onValue={(v) => update((f) => ({ ...f, pickup_location_choice: v as PickupLocationChoice, pickup_location: v === 'other' ? f.pickup_location : '' }))}>
                      <option value="">{t('اختر', 'Select One')}</option>
                      {(Object.keys(PICKUP_LOCATION_LABELS) as Array<keyof typeof PICKUP_LOCATION_LABELS>).map((k) => <option key={k} value={k}>{t(...PICKUP_LOCATION_LABELS[k])}</option>)}
                    </SelectInput>
                  )}
                </Field>
                {form.pickup_location_choice === 'other' && (
                  <Field label={t('تفاصيل مكان الاستلام', 'Pickup location details')} required error={err('pickup_location')} hint={t(`بالإنجليزية، حتى ${PICKUP_TEXT_MAX} حرفًا — مثل: Security gate 2`, `In English, up to ${PICKUP_TEXT_MAX} characters — e.g. Security gate 2`)}>
                    {(id) => <TextInput id={id} value={form.pickup_location} onValue={(v) => update((f) => ({ ...f, pickup_location: v.slice(0, PICKUP_TEXT_MAX) }))} error={err('pickup_location')} ltr maxLength={PICKUP_TEXT_MAX} placeholder="Warehouse loading area" />}
                  </Field>
                )}
                <Field label={t('إجمالي وزن الاستلام', 'Total Pickup Weight')} hint={t('من الطرود — يتغير من خطوة الطرود', 'From the packages — changed on the Packages step')}>
                  {() => <div className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-sm font-extrabold tabular-nums" data-testid="pickup-weight">{kg(total.weight, lang)} · {t(`${total.pieces} طرد`, `${total.pieces} pieces`)}</div>}
                </Field>
                <Field label={t('تعليمات للمندوب', 'Instructions for the courier')} error={err('pickup_instructions')} hint={`${form.pickup_instructions.length}/${PICKUP_TEXT_MAX}`}>
                  {(id) => (
                    <textarea id={id} rows={3} dir="ltr" maxLength={PICKUP_TEXT_MAX} value={form.pickup_instructions}
                      onChange={(ev) => update((f) => ({ ...f, pickup_instructions: ev.target.value.slice(0, PICKUP_TEXT_MAX) }))}
                      placeholder={t('اكتب أي تعليمات أخرى تريد أن تصل للمندوب (بالإنجليزية)', "Provide other instructions you'd like the courier to receive")}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/40" />
                  )}
                </Field>
              </div>
            </Section>

            <Section title={t('عنوان الاستلام', 'Pickup Address')} icon={<MapPin size={18} className="text-indigo-600" />}
              actions={form.pickup_other_address
                ? <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => update((f) => ({ ...f, pickup_other_address: false }))}>{t('استخدام عنوان المرسل', 'Use the sender address')}</Button>
                : <Button variant="secondary" className="!py-1.5 text-xs" onClick={() => update((f) => ({ ...f, pickup_other_address: true, pickup_address: f.pickup_address.city ? f.pickup_address : pickupFromShipper(f.shipper) }))}><Pencil size={12} /> {t('تعديل', 'Edit')}</Button>}>
              {form.pickup_other_address ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-500">{t('عنوان استلام منفصل — لا يغيّر عنوان المرسل في الشحنة.', 'A separate pickup address — the shipment\'s From address is not changed.')}</p>
                  <PartyFields who="pickup_address" value={form.pickup_address} errors={errors} onChange={(p) => update((f) => ({ ...f, pickup_address: p }))} />
                </div>
              ) : (
                <>
                  <AddressCard p={form.shipper} />
                  <p className="mt-2 text-[11px] text-slate-500">{t('عنوان المرسل (من).', 'The sender (From) address.')}</p>
                </>
              )}
            </Section>
          </div>
        </>
      )}

      {form.pickup_option === 'none' && <Note>{t('لن يُطلب مندوب مع هذه الشحنة ولا يُرسل أي طلب استلام إلى DHL. يمكن حجز استلام لاحقًا من صفحة الشحنة.', 'No courier is requested with this shipment and no pickup request is sent to DHL. A pickup can be booked later from the shipment page.')}</Note>}

      {form.pickup_option === 'drop_off' && (
        <Section title={t('نقاط خدمة DHL', 'DHL Service Points')} icon={<Store size={18} className="text-indigo-600" />} description={t('من قائمة DHL. تظهر فقط النقاط التي تقبل التسليم كخيارات قابلة للاختيار، ولا يُرسل طلب استلام.', "From DHL's list. Only points that accept drop-off can be chosen; no pickup request is sent.")}>
          <div className="flex gap-2">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">{t('ابحث بالعنوان أو المدينة', 'Search by address or city')}</span>
              <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <TextInput value={q} onValue={setQ} className="ps-9" placeholder={t('المدينة أو العنوان (بالإنجليزية)', 'City or address (in English)')} ltr onKeyDown={(ev) => { if (ev.key === 'Enter') void search(); }} />
            </label>
            <Button onClick={() => void search()} loading={searching} disabled={q.trim().length < 2}>{t('بحث', 'Search')}</Button>
          </div>
          {form.service_point_id && <p className="mt-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">{t('النقطة المختارة:', 'Selected point:')} <span dir="ltr">{form.service_point_name}</span> ({form.service_point_id})</p>}
          {err('service_point_id') && <p className="mt-2 text-[11px] text-red-600 font-semibold">{err('service_point_id')}</p>}
          {searchError && <div className="mt-3"><Note tone="error">{searchError}</Note></div>}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            {searching ? [0, 1].map((i) => <Skeleton key={i} className="h-36" />) : points?.map((p) => (
              <PointCard key={p.id ?? p.name ?? ''} p={p} selected={form.service_point_id === p.id}
                onSelect={() => update((f) => ({ ...f, service_point_id: p.id ?? '', service_point_name: (p.localName || p.name || '').slice(0, 100) }))} />
            ))}
          </div>
          {points && !points.length && <p className="mt-3 text-sm text-slate-500">{t('لا توجد نقاط قريبة من هذا العنوان.', 'No points near this address.')}</p>}
        </Section>
      )}

      <CostSummary w={w} />
    </div>
  );
}
