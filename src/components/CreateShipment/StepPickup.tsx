/** Step 7 — pickup choice: DHL courier, no pickup, or drop-off at a DHL Service Point. Arabic or English. */
import { useState } from 'react';
import { Ban, Clock, MapPin, Search, Store, Truck } from 'lucide-react';
import { dhlShipmentService, type ServicePoint } from '../../services/dhlShipment.service';
import { describeApiError } from '../../utils/apiErrors';
import { Button, ChoiceCards, Field, Note, Section, SelectInput, Skeleton, TextInput } from './ui';
import { PartyFields } from './FormSteps';
import { useCsLang } from './csLang';
import { kg, packageTotals, translateIssue, type PartyForm } from './wizardModel';
import type { Wizard } from './useShipmentWizard';

const DAYS: Record<string, [string, string]> = {
  MONDAY: ['الإثنين', 'Monday'], TUESDAY: ['الثلاثاء', 'Tuesday'], WEDNESDAY: ['الأربعاء', 'Wednesday'], THURSDAY: ['الخميس', 'Thursday'],
  FRIDAY: ['الجمعة', 'Friday'], SATURDAY: ['السبت', 'Saturday'], SUNDAY: ['الأحد', 'Sunday'],
};
const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);
/** The sender's address as the starting point of another pickup address (the Saudi short address goes to line 3). */
const pickupFromShipper = (s: PartyForm): PartyForm => ({ ...s, use_na: false, address_line3: s.country_code === 'SA' ? s.short_address : s.suburb, phone: s.phones[0]?.number ? `+${s.phones[0].code}${s.phones[0].number.replace(/\D/g, '').replace(/^0+/, '')}` : s.phone });

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

export function StepPickup({ w }: { w: Wizard }) {
  const { form, update, errors } = w;
  const { t, lang } = useCsLang();
  const e = (k: string) => (errors[k] ? translateIssue(errors[k], lang) : null);
  const cap = w.quote?.pickupCapabilities ?? w.products?.find((p) => p.productCode === form.product_code)?.pickupCapabilities ?? null;
  const minT = hm(cap?.pickupEarliest);
  const maxT = hm(cap?.pickupLatest);
  const windowIssue = form.pickup_option === 'schedule' && (
    (minT && form.pickup_earliest_time && form.pickup_earliest_time < minT) || (maxT && form.pickup_latest_time && form.pickup_latest_time > maxT) ||
    (form.pickup_earliest_time && form.pickup_latest_time && form.pickup_earliest_time >= form.pickup_latest_time));
  // DHL takes Latin text only; the country goes separately as countryCode.
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
    } catch (err) {
      setSearchError(describeApiError(err, t('تعذر البحث عن نقاط خدمة DHL', 'Could not search DHL service points')));
    } finally {
      setSearching(false);
    }
  };
  const total = packageTotals(form.packages);

  return (
    <div className="space-y-4">
      <Section title={t('طريقة تسليم الشحنة إلى DHL', 'How the shipment reaches DHL')} icon={<Truck size={18} className="text-indigo-600" />}>
        <ChoiceCards
          name={t('طريقة الاستلام', 'Pickup method')} columns={3}
          value={form.pickup_option}
          onChange={(v) => update((f) => ({ ...f, pickup_option: v }))}
          options={[
            { value: 'schedule', title: t('جدولة مندوب DHL', 'Schedule a DHL courier'), description: t('يحضر مندوب DHL للاستلام في الموعد المحدد.', 'A DHL courier collects at the chosen time.'), icon: <Truck size={18} /> },
            { value: 'none', title: t('بدون استلام', 'No pickup'), description: t('مندوب DHL المعتاد أو ترتيب لاحق.', 'The regular DHL courier or a later arrangement.'), icon: <Ban size={18} /> },
            { value: 'drop_off', title: t('التسليم في نقطة خدمة DHL', 'Drop off at a DHL Service Point'), description: t('تُسلَّم الشحنة في نقطة تقبل التسليم.', 'Hand the shipment in at a point that accepts drop-off.'), icon: <Store size={18} /> },
          ]}
        />
      </Section>

      {form.pickup_option === 'schedule' && (
        <Section title={t('موعد الاستلام', 'Pickup time')} icon={<Clock size={18} className="text-indigo-600" />} description={cap
          ? t(`نافذة DHL لهذه الخدمة: من ${minT ?? '—'} حتى ${maxT ?? '—'}${cap.localCutoffDateAndTime ? ` · آخر موعد للطلب اليوم ${cap.localCutoffDateAndTime.slice(11, 16)}` : ''}`,
            `DHL's window for this service: from ${minT ?? '—'} to ${maxT ?? '—'}${cap.localCutoffDateAndTime ? ` · today's booking cut-off ${cap.localCutoffDateAndTime.slice(11, 16)}` : ''}`)
          : t('اختر خدمة DHL أولًا لمعرفة نافذة الاستلام المتاحة.', 'Choose a DHL service first to see the available pickup window.')}>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Field label={t('تاريخ الاستلام', 'Pickup date')} hint={t('يوم الشحن نفسه', 'The shipment date')}>{(id) => <TextInput id={id} type="date" value={form.shipment_date} onValue={(v) => update((f) => ({ ...f, shipment_date: v }))} />}</Field>
            <Field label={t('أبكر وقت', 'Earliest time')} required error={e('pickup_earliest_time')}>{(id) => <TextInput id={id} type="time" value={form.pickup_earliest_time} min={minT ?? undefined} max={maxT ?? undefined} onValue={(v) => update((f) => ({ ...f, pickup_earliest_time: v }))} error={e('pickup_earliest_time')} />}</Field>
            <Field label={t('آخر وقت', 'Latest time')} required error={e('pickup_latest_time')}>{(id) => <TextInput id={id} type="time" value={form.pickup_latest_time} min={minT ?? undefined} max={maxT ?? undefined} onValue={(v) => update((f) => ({ ...f, pickup_latest_time: v }))} error={e('pickup_latest_time')} />}</Field>
            <Field label={t('إجمالي وزن الاستلام', 'Total pickup weight')}>{() => <div className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-sm font-extrabold tabular-nums">{kg(total.weight, lang)} · {t(`${total.pieces} طرد`, `${total.pieces} pieces`)}</div>}</Field>
            <Field label={t('مكان الاستلام', 'Pickup location')} hint={t('مثل: الاستقبال', 'e.g. Reception')} error={e('pickup_location')}>{(id) => <TextInput id={id} value={form.pickup_location} onValue={(v) => update((f) => ({ ...f, pickup_location: v }))} ltr maxLength={80} />}</Field>
            <Field label={t('نوع الموقع', 'Location type')}>{(id) => (
              <SelectInput id={id} value={form.pickup_location_type} onValue={(v) => update((f) => ({ ...f, pickup_location_type: v as typeof f.pickup_location_type }))}>
                <option value="">—</option><option value="business">{t('تجاري', 'Business')}</option><option value="residence">{t('سكني', 'Residence')}</option>
              </SelectInput>
            )}</Field>
            <Field label={t('تعليمات للمندوب', 'Courier instructions')} className="sm:col-span-2" error={e('pickup_instructions')}>{(id) => <TextInput id={id} value={form.pickup_instructions} onValue={(v) => update((f) => ({ ...f, pickup_instructions: v }))} ltr maxLength={80} placeholder="Call on arrival" />}</Field>
          </div>
          {windowIssue && <div className="mt-3"><Note tone="error">{t('الموعد خارج نافذة DHL أو آخر وقت قبل أبكر وقت — اختر موعدًا ممكنًا.', "The time is outside DHL's window or the latest time is before the earliest — choose a possible time.")}</Note></div>}
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              <input type="checkbox" className="accent-indigo-600" checked={form.pickup_other_address} onChange={(ev) => update((f) => ({ ...f, pickup_other_address: ev.target.checked, pickup_address: ev.target.checked && !f.pickup_address.city ? pickupFromShipper(f.shipper) : f.pickup_address }))} />
              {t('الاستلام من عنوان غير عنوان المرسل', 'Pick up from an address other than the sender address')}
            </label>
            {form.pickup_other_address ? (
              <PartyFields who="pickup_address" value={form.pickup_address} errors={errors} onChange={(p) => update((f) => ({ ...f, pickup_address: p }))} />
            ) : (
              <p className="text-xs text-slate-500 flex items-center gap-1"><MapPin size={12} /> {t('عنوان الاستلام: عنوان المرسل', 'Pickup address: the sender address')} ({form.shipper.city || '—'})</p>
            )}
          </div>
        </Section>
      )}

      {form.pickup_option === 'none' && <Note>{t('لن يُطلب مندوب مع هذه الشحنة. يمكن حجز استلام لاحقًا من صفحة الشحنة.', 'No courier is requested with this shipment. A pickup can be booked later from the shipment page.')}</Note>}

      {form.pickup_option === 'drop_off' && (
        <Section title={t('نقاط خدمة DHL', 'DHL Service Points')} icon={<Store size={18} className="text-indigo-600" />} description={t('تظهر فقط النقاط التي تقبل التسليم كخيارات قابلة للاختيار.', 'Only points that accept drop-off can be chosen.')}>
          <div className="flex gap-2">
            <label className="relative flex-1 min-w-0">
              <span className="sr-only">{t('ابحث بالعنوان أو المدينة', 'Search by address or city')}</span>
              <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <TextInput value={q} onValue={setQ} className="ps-9" placeholder={t('المدينة أو العنوان (بالإنجليزية)', 'City or address (in English)')} ltr onKeyDown={(ev) => { if (ev.key === 'Enter') void search(); }} />
            </label>
            <Button onClick={() => void search()} loading={searching} disabled={q.trim().length < 2}>{t('بحث', 'Search')}</Button>
          </div>
          {form.service_point_id && <p className="mt-2 text-xs font-bold text-indigo-700 dark:text-indigo-300">{t('النقطة المختارة:', 'Selected point:')} <span dir="ltr">{form.service_point_name}</span> ({form.service_point_id})</p>}
          {e('service_point_id') && <p className="mt-2 text-[11px] text-red-600 font-semibold">{e('service_point_id')}</p>}
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
    </div>
  );
}
