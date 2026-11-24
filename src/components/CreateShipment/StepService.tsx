/**
 * Step 6 «الخدمة والسعر / Service» — the MyDHL+ service screen on SHIPPEC's
 * design (AR / EN):
 *
 *   I'm sending my shipment on   date cards (Today, Tomorrow, …) + «More +» — only dates DHL accepts
 *                                (sender's today … the Backend's limit); a new date asks DHL again
 *   DHL services                 one result card per product DHL returned (GET /products + POST /rates):
 *                                delivery date, delivered by, DHL's price, Select / Selected, Details
 *                                (booking cut-off, latest pickup, delivery type, code, DHL breakdown)
 *   Optional Services            only those DHL listed for the chosen product; ticking one saves it and
 *                                DHL prices the shipment again (the charge comes from DHL, never typed)
 *   GoGreen                      only when DHL's quote has it
 *   SHIPPEC price                selling price / profit — visibly apart from DHL's figures
 *
 * Nothing here invents a product, a date, a time, a charge or a total: what DHL did not
 * return is not shown.
 */
import { useId, useState } from 'react';
import { AlertTriangle, Banknote, CalendarDays, Check, ChevronDown, Clock, Leaf, Loader2, Plus, RefreshCw, Sparkles, Tag, Truck } from 'lucide-react';
import { useAuthStore } from '../../hooks/useAuthStore';
import type { ProductOption, RateQuote } from '../../services/dhlShipment.service';
import { Button, Field, Note, Section, SelectInput, Skeleton, TextInput } from './ui';
import { useCsLang } from './csLang';
import {
  canShipment, chargeRows, countryName, dateParts, dhlDateTime, goGreenOf, isOriginWeekend, kg, money, needsOriginOffset, nextBusinessDay, optionalServiceRows,
  shipDateCards, shipDateRange, translateIssue,
} from './wizardModel';
import type { CostMode, Wizard } from './useShipmentWizard';

/** DHL's priced lines, tax and DHL's own total (the MyDHL+ breakdown). */
export function ChargeTable({ q, testId }: { q: Pick<RateQuote, 'breakdown' | 'amount' | 'currency' | 'taxTotal'>; testId?: string }) {
  const { t, lang } = useCsLang();
  const c = chargeRows(q, lang);
  const m = (n: number | null | undefined, cur?: string | null) => money(n, cur ?? c.currency ?? 'SAR', lang);
  return (
    <table className="w-full text-sm" data-testid={testId}>
      <tbody>
        {c.rows.map((r) => (
          <tr key={r.key} className="border-b border-slate-100 dark:border-slate-700/60" data-charge={r.code ?? 'transport'}>
            <td className="py-1.5 pe-3 min-w-0">
              <div className="font-bold text-slate-800 dark:text-slate-100">{r.label}</div>
              {r.dhlName && r.dhlName !== r.label && <div className="text-[10px] text-slate-400" dir="ltr">{r.dhlName}{r.code ? ` (${r.code})` : ''}</div>}
            </td>
            <td className="py-1.5 text-end tabular-nums font-bold whitespace-nowrap" dir="ltr">{m(r.amount, r.currency)}</td>
          </tr>
        ))}
        {c.tax != null && (
          <tr className="border-b border-slate-100 dark:border-slate-700/60" data-charge="tax">
            <td className="py-1.5 font-bold text-slate-800 dark:text-slate-100">{t('ضريبة القيمة المضافة / الضرائب', 'VAT/Tax')}</td>
            <td className="py-1.5 text-end tabular-nums font-bold whitespace-nowrap" dir="ltr">{m(c.tax)}</td>
          </tr>
        )}
      </tbody>
      <tfoot>
        <tr data-charge="total">
          <td className="pt-2 font-extrabold">{c.taxIncluded != null ? t('الإجمالي (شامل الضريبة)', 'Total (VAT included)') : t('الإجمالي', 'Total')}</td>
          <td className="pt-2 text-end font-extrabold tabular-nums text-indigo-700 dark:text-indigo-300 whitespace-nowrap" dir="ltr">{m(c.total)}</td>
        </tr>
        {c.taxIncluded != null && <tr><td className="text-[11px] text-slate-500">{t('منها ضرائب', 'of which taxes')}</td><td className="text-[11px] text-end tabular-nums" dir="ltr">{m(c.taxIncluded)}</td></tr>}
      </tfoot>
    </table>
  );
}

/** «I'm sending my shipment on» — the next dates as cards, «More +» for the rest of DHL's range. */
function DateSelector({ w }: { w: Wizard }) {
  const { form } = w;
  const { t, lang } = useCsLang();
  const [more, setMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const pid = useId();
  const range = shipDateRange(form);
  const cards = shipDateCards(form, 7);
  const busy = w.servicesLoading || !!w.selecting;
  const outside = form.shipment_date && !cards.some((c) => c.ymd === form.shipment_date);
  const pick = (ymd: string) => {
    if (ymd < range.min || ymd > range.max) {
      setMoreError(t(`اختر تاريخًا من ${range.min} إلى ${range.max}.`, `Choose a date from ${range.min} to ${range.max}.`));
      return;
    }
    setMoreError(null);
    setMore(false);
    w.changeShipmentDate(ymd);
  };
  const selectedParts = form.shipment_date ? dateParts(form.shipment_date, lang) : null;
  return (
    <div className="space-y-3" data-testid="ship-date">
      <div role="radiogroup" aria-label={t('سأرسل شحنتي في', "I'm sending my shipment on")} className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {cards.map((c) => {
          const p = dateParts(c.ymd, lang);
          const active = form.shipment_date === c.ymd;
          const rel = c.rel === 'today' ? t('اليوم', 'Today') : c.rel === 'tomorrow' ? t('غدًا', 'Tomorrow') : p.weekday;
          return (
            <button
              key={c.ymd} type="button" role="radio" aria-checked={active} disabled={busy} data-date={c.ymd} onClick={() => pick(c.ymd)}
              aria-label={`${p.day} ${p.month} — ${rel}`}
              className={`shrink-0 w-[84px] rounded-2xl border px-2 py-2 text-center transition-colors disabled:opacity-60 ${
                active ? 'border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900/40 bg-indigo-600 text-white' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 bg-white dark:bg-slate-800'}`}
            >
              <span className={`block text-[10px] font-bold ${active ? 'text-indigo-100' : 'text-slate-500'}`}>{p.month}</span>
              <span className="block text-2xl font-extrabold tabular-nums leading-tight">{p.day}</span>
              <span className={`block text-[10px] font-bold truncate ${active ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`}>{rel}</span>
            </button>
          );
        })}
        <button
          type="button" aria-expanded={more} aria-controls={pid} disabled={busy} onClick={() => setMore((v) => !v)} data-testid="ship-date-more"
          className={`shrink-0 w-[84px] rounded-2xl border px-2 py-2 text-center transition-colors disabled:opacity-60 ${
            outside ? 'border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900/40 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 bg-white dark:bg-slate-800'}`}
        >
          {outside && selectedParts ? (
            <><span className="block text-[10px] font-bold text-slate-500">{selectedParts.month}</span><span className="block text-2xl font-extrabold tabular-nums leading-tight">{selectedParts.day}</span><span className="block text-[10px] font-bold text-indigo-700 dark:text-indigo-300">{t('المزيد', 'More')}</span></>
          ) : (
            <><span className="block text-[10px] font-bold text-slate-500">{t('المزيد', 'More')}</span><Plus size={22} className="mx-auto my-1 text-indigo-600" /><span className="block text-[10px] font-bold text-slate-500">{t('تاريخ آخر', 'Other date')}</span></>
          )}
        </button>
      </div>
      {more && (
        <div id={pid} className="max-w-xs rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3 shadow-sm">
          <Field label={t('تاريخ الشحن', 'Shipment date')} hint={t(`من ${range.min} حتى ${range.max} (حد DHL)`, `From ${range.min} to ${range.max} (DHL's limit)`)} error={moreError}>
            {(id) => <TextInput id={id} type="date" min={range.min} max={range.max} value={form.shipment_date} onValue={(v) => { if (v) pick(v); }} error={moreError} />}
          </Field>
        </div>
      )}
      {form.shipment_date && form.shipment_date < range.min && (
        <Note tone="warn">{t('تاريخ الشحن المحفوظ مضى — اختر تاريخًا جديدًا.', 'The saved shipment date has passed — choose a new date.')}</Note>
      )}
    </div>
  );
}

const deliveredByText = (iso: string | null | undefined, t: (a: string, e: string) => string) => {
  const d = dhlDateTime(iso);
  if (!d?.time) return null;
  return d.eod ? t('نهاية اليوم', 'End of Day') : t(`قبل ${d.time}`, `By ${d.time}`);
};

function ServiceResult({ p, q, selected, onSelect, busy, disabled }: {
  p: ProductOption; q: RateQuote | null; selected: boolean; onSelect: () => void; busy: boolean; disabled: boolean;
}) {
  const { t, lang } = useCsLang();
  const [open, setOpen] = useState(false);
  const did = useId();
  const est = q?.deliveryCapabilities?.estimatedDeliveryDateAndTime ?? p.deliveryCapabilities?.estimatedDeliveryDateAndTime ?? q?.estimatedDelivery ?? null;
  const d = dhlDateTime(est);
  const parts = d ? dateParts(d.date, lang) : null;
  const by = deliveredByText(est, t);
  const transit = q?.deliveryCapabilities?.totalTransitDays ?? p.deliveryCapabilities?.totalTransitDays ?? q?.totalTransitDays ?? null;
  const cap = q?.pickupCapabilities ?? p.pickupCapabilities ?? null;
  const cutoff = dhlDateTime(cap?.localCutoffDateAndTime);
  const cutoffParts = cutoff ? dateParts(cutoff.date, lang) : null;
  const deliveryType = q?.deliveryCapabilities?.deliveryTypeCode ?? p.deliveryCapabilities?.deliveryTypeCode ?? null;
  const green = q?.breakdown.some((b) => b.category === 'gogreen');
  const head = 'text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1';
  return (
    <article
      data-product={p.productCode}
      className={`rounded-2xl border overflow-hidden transition-colors ${selected ? 'border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900/40' : 'border-slate-200 dark:border-slate-700'}`}
    >
      <div className={`p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-[1.2fr_1fr_1.2fr_auto] gap-3 sm:gap-4 items-center ${selected ? 'bg-indigo-50/60 dark:bg-indigo-900/15' : 'bg-white dark:bg-slate-800'}`}>
        <div className="min-w-0">
          <div className={head}><CalendarDays size={12} /> {t('تاريخ التسليم', 'Delivery Date')}</div>
          {parts ? (
            <div data-testid="delivery-date"><div className="text-sm font-extrabold text-slate-900 dark:text-white">{parts.month} <span className="tabular-nums">{parts.day}</span></div><div className="text-[11px] text-slate-500">{parts.weekday}</div></div>
          ) : <div className="text-sm font-bold text-slate-400">—</div>}
          <h3 className="mt-1.5 text-xs font-extrabold text-slate-700 dark:text-slate-200 uppercase" dir="ltr">{p.productName ?? p.productCode}</h3>
        </div>
        <div className="min-w-0">
          <div className={head}><Clock size={12} /> {t('موعد التسليم', 'Delivered By')}</div>
          <div className="text-sm font-extrabold text-slate-900 dark:text-white" data-testid="delivered-by">{by ?? '—'}</div>
          {transit != null && <div className="text-[11px] text-slate-500">{t(`${transit} أيام عبور`, `${transit} transit days`)}</div>}
        </div>
        <div className="min-w-0">
          <div className={head}><Banknote size={12} /> {t('السعر التقديري', 'Estimated Price')}</div>
          <div className="text-lg sm:text-xl font-extrabold tabular-nums text-slate-900 dark:text-white" dir="ltr" data-testid="estimated-price">{q?.amount != null ? money(q.amount, q.currency ?? 'SAR', lang) : '—'}</div>
          {!q && <div className="text-[11px] text-slate-500">{t('لم تُرجع DHL سعرًا لهذه الخدمة.', 'DHL returned no price for this service.')}</div>}
          {q && q.amount === 0 && p.isCustomerAgreement && <div className="text-[11px] text-amber-700">{t('DHL لم تُسعّر هذه الخدمة (اتفاقية خاصة).', 'DHL did not price this service (special agreement).')}</div>}
        </div>
        <div className="col-span-2 sm:col-span-1 flex sm:flex-col gap-2 items-stretch">
          <Button className="flex-1 sm:flex-none" variant={selected ? 'secondary' : 'primary'} onClick={onSelect} loading={busy} disabled={disabled || selected} aria-pressed={selected}>
            {selected ? <><Check size={16} className="text-emerald-600" /> {t('تم الاختيار', 'Selected')}</> : t('اختيار', 'Select')}
          </Button>
          <Button variant="ghost" className="flex-1 sm:flex-none !py-1.5 text-xs" aria-expanded={open} aria-controls={did} onClick={() => setOpen((v) => !v)}>
            {t('التفاصيل', 'Details')} <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      </div>
      {(p.isCustomerAgreement || green) && (
        <div className="px-3 sm:px-4 pb-2 flex flex-wrap gap-1.5 bg-inherit">
          {p.isCustomerAgreement && <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-bold">{t('باتفاقية مع DHL', 'DHL customer agreement')}</span>}
          {green && <span className="px-2 py-0.5 rounded-lg bg-green-50 text-green-700 border border-green-100 text-[10px] font-bold inline-flex items-center gap-1"><Leaf size={10} /> GoGreen</span>}
        </div>
      )}
      {open && (
        <div id={did} className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3 sm:p-4 grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="service-details">
          <dl className="space-y-2 text-xs">
            {cutoff?.time && cutoffParts && <div><dt className="font-bold text-slate-500">{t('احجز الشحنة قبل', 'Book Shipment By')}</dt><dd className="font-extrabold">{cutoffParts.month} {cutoffParts.day}{t('، ', ', ')}<span className="tabular-nums">{cutoff.time}</span></dd></div>}
            {cap?.pickupLatest && <div><dt className="font-bold text-slate-500">{t('آخر موعد لاستلام المندوب', 'Latest Courier Pickup')}</dt><dd className="font-extrabold tabular-nums">{cap.pickupLatest.slice(0, 5)}</dd></div>}
            {d && <div><dt className="font-bold text-slate-500">{t('التسليم المتوقع (DHL)', 'Estimated delivery (DHL)')}</dt><dd className="font-extrabold tabular-nums">{d.date}{by ? ` · ${by}` : ''}</dd></div>}
            {deliveryType && <div><dt className="font-bold text-slate-500">{t('نوع التسليم لدى DHL', 'DHL delivery type')}</dt><dd className="font-extrabold font-mono" dir="ltr">{deliveryType}</dd></div>}
            <div><dt className="font-bold text-slate-500">{t('رمز منتج DHL', 'DHL product code')}</dt><dd className="font-extrabold font-mono" dir="ltr">{p.productCode}{p.localProductCode && p.localProductCode !== p.productCode ? ` / ${p.localProductCode}` : ''}</dd></div>
            {q?.weight && (q.weight.volumetric != null || q.weight.provided != null) && (
              <div><dt className="font-bold text-slate-500">{t('الأوزان (DHL)', 'Weights (DHL)')}</dt><dd className="font-extrabold">{t('حجمي', 'Volumetric')} {kg(q.weight.volumetric, lang)} · {t('مُرسل', 'Provided')} {kg(q.weight.provided, lang)}</dd></div>
            )}
          </dl>
          <div className="min-w-0">
            {q ? <ChargeTable q={q} testId={`charges-${p.productCode}`} /> : <p className="text-xs text-slate-500">{t('لا تفاصيل سعر من DHL لهذه الخدمة.', 'No DHL price details for this service.')}</p>}
          </div>
        </div>
      )}
    </article>
  );
}

function OptionalServices({ w }: { w: Wizard }) {
  const { form } = w;
  const { t, lang } = useCsLang();
  const rows = optionalServiceRows(w.quote, form.service_codes, lang);
  const busy = w.servicesLoading || !!w.selecting;
  return (
    <Section title={t('الخدمات الاختيارية', 'Optional Services')} icon={<Sparkles size={18} className="text-indigo-600" />}
      description={t('تظهر فقط الخدمات التي تعرضها DHL لهذه الخدمة. عند اختيار خدمة تُسعّر DHL الشحنة من جديد.', 'Only the services DHL offers for this service are shown. Choosing one asks DHL to price the shipment again.')}>
      {!form.product_code || !w.quote ? (
        <p className="text-xs text-slate-500">{t('اختر خدمة DHL أولًا لعرض خدماتها الاختيارية.', 'Choose a DHL service first to see its optional services.')}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-500" data-testid="optional-services-none">{t('لا تعرض DHL خدمات اختيارية يمكن إضافتها لهذه الخدمة.', 'DHL offers no optional services that can be added to this service.')}</p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700" data-testid="optional-services">
          {rows.map((r) => (
            <li key={r.code} className="py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4" data-service={r.code}>
              <label className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer">
                <input type="checkbox" className="mt-1 accent-indigo-600 shrink-0" checked={r.selected} disabled={busy} onChange={() => w.toggleService(r.code)} />
                <span className="min-w-0">
                  <span className="text-sm font-extrabold text-slate-900 dark:text-white inline-flex items-center gap-1">{r.code === 'FT' && <Leaf size={14} className="text-green-600" />}{r.name}</span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{r.description}</span>
                </span>
              </label>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums sm:text-end sm:w-44 shrink-0 ps-6 sm:ps-0" data-testid={`service-price-${r.code}`}>
                {r.selected && r.price != null
                  ? <>{t('رسوم إضافية', 'Charges apply')} <span dir="ltr">{money(r.price, r.currency ?? 'SAR', lang)}</span></>
                  : t('السعر تحسبه DHL', 'Price calculated by DHL')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {w.servicesLoading && form.product_code && <p className="mt-2 text-[11px] text-slate-500 flex items-center gap-1" role="status"><Loader2 size={12} className="animate-spin" /> {t('DHL تُسعّر الشحنة من جديد…', 'DHL is pricing the shipment again…')}</p>}
    </Section>
  );
}

function GoGreenCard({ q }: { q: RateQuote | null }) {
  const { t, lang } = useCsLang();
  const g = goGreenOf(q);
  if (!g) return null;
  return (
    <aside className="rounded-2xl border border-green-200 dark:border-green-900/50 bg-green-50/70 dark:bg-green-900/15 p-4 flex gap-3" data-testid="gogreen-card">
      <Leaf size={22} className="text-green-600 shrink-0" />
      <div className="min-w-0">
        <h3 className="text-sm font-extrabold text-green-900 dark:text-green-300">{t('GoGreen Plus — شحن بانبعاثات كربونية أقل', 'GoGreen Plus — Carbon Reduced Shipping')}</h3>
        <p className="text-[11px] text-green-900/80 dark:text-green-300/80 mt-0.5">{t('تُخفَّض انبعاثات ثاني أكسيد الكربون من النقل الجوي باستخدام وقود الطيران المستدام.', 'CO2 emissions from air transport are reduced (inset) through the use of Sustainable Aviation Fuel.')}</p>
        {g.charged?.amount != null && <p className="text-[11px] font-bold text-green-900 dark:text-green-300 mt-1">{t('ضمن عرض DHL هذا:', 'In this DHL quote:')} <span dir="ltr">{money(g.charged.amount, g.charged.currency ?? 'SAR', lang)}</span></p>}
      </div>
    </aside>
  );
}

export function StepService({ w }: { w: Wizard }) {
  const { form, update, errors } = w;
  const { t, lang } = useCsLang();
  const role = useAuthStore((s) => s.user?.role);
  const canPrice = canShipment(role, 'price');
  const products = w.products ?? [];
  const quoteOf = (code: string) => w.quotes?.find((q) => q.productCode === code) ?? null;
  const sell = Number(w.pricing.selling_price);
  const cost = w.dhlCost;
  const profit = Number.isFinite(sell) && w.pricing.selling_price !== '' && cost != null ? Math.round((sell - cost) * 100) / 100 : null;
  const quote = w.quote;
  const quoteNotSar = !!quote && quote.currency !== 'SAR';
  const e = (k: string) => (errors[k] ? translateIssue(errors[k], lang) : null);
  const setMode = (m: CostMode) => w.setPricing((p) => ({ ...p, cost_mode: m }));
  const m = (n: number | null | undefined) => money(n, 'SAR', lang);
  const quotedAt = w.quotedAt ? new Date(w.quotedAt) : null;

  return (
    <div className="space-y-4" data-testid="service-step">
      <Section title={t('سأرسل شحنتي في', "I'm sending my shipment on")} icon={<CalendarDays size={18} className="text-indigo-600" />}
        actions={<Button variant="secondary" onClick={() => void w.fetchServices()} loading={w.servicesLoading}><RefreshCw size={16} /> {products.length ? t('تحديث الخدمات والأسعار', 'Refresh services and prices') : t('عرض خدمات DHL المتاحة', 'Show available DHL services')}</Button>}>
        <DateSelector w={w} />
        {e('shipment_date') && <p className="mt-2 text-[11px] font-semibold text-red-600" role="alert">{e('shipment_date')}</p>}
        {needsOriginOffset(form) && (
          <div className="mt-3 max-w-xs">
            <Field label={t('المنطقة الزمنية لبلد المرسل', "Sender country's time zone")} required error={e('origin_gmt_offset')} hint={t('مثل -05:00 (نيويورك شتاءً)', 'e.g. -05:00 (New York in winter)')}>
              {(id) => <TextInput id={id} value={form.origin_gmt_offset} onValue={(v) => update((f) => ({ ...f, origin_gmt_offset: v }))} error={e('origin_gmt_offset')} ltr placeholder="+03:00" />}
            </Field>
          </div>
        )}
        {isOriginWeekend(form.shipment_date, form.shipper.country_code) && (
          <div className="mt-3">
            <Note tone="warn" title={t('تاريخ الشحن يوم عطلة في بلد المرسل', "The shipment date is a weekend day in the sender's country")}>
              {t(`DHL لا تستلم ولا تشحن في عطلة نهاية الأسبوع في ${countryName(form.shipper.country_code) || 'بلد المرسل'}.`, `DHL does not pick up or ship on the weekend in ${countryName(form.shipper.country_code, 'en') || "the sender's country"}.`)}{' '}
              <button type="button" className="font-bold underline" onClick={() => w.changeShipmentDate(nextBusinessDay(new Date(), form.shipper.country_code, form.shipment_date))}>
                {t('نقل إلى أقرب يوم عمل', 'Move to the next business day')}
              </button>
            </Note>
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-4 items-start">
        <Section title={t('خدمات DHL المتاحة', 'Available DHL services')} icon={<Truck size={18} className="text-indigo-600" />} description={t('المنتجات والأسعار كما تعيدها DHL لهذا المسار والتاريخ والطرود.', 'Products and prices exactly as DHL returns them for this route, date and packages.')}>
          {w.servicesStale && products.length > 0 && !w.servicesLoading && (
            <div className="mb-3"><Note tone="warn" title={t('تغيّرت بيانات الشحنة', 'The shipment data changed')}>{t('الخدمات والأسعار المعروضة قد لا تخص البيانات الحالية — اضغط «تحديث الخدمات والأسعار» قبل الاختيار.', 'The services and prices shown may not match the current data — press «Refresh services and prices» before choosing.')}</Note></div>
          )}
          {w.servicesError && <div className="mb-3"><Note tone="error">{w.servicesError}</Note></div>}
          {e('product_code') && <div className="mb-3"><Note tone="error">{e('product_code')}</Note></div>}
          {e('service_codes') && <div className="mb-3"><Note tone="error">{e('service_codes')}</Note></div>}
          {w.servicesLoading ? (
            <div className="space-y-3" role="status" aria-label={t('جاري جلب خدمات DHL', 'Loading DHL services')}>
              {[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}
            </div>
          ) : products.length ? (
            <div className={`space-y-3 ${w.servicesStale ? 'opacity-60' : ''}`}>
              {products.map((p) => (
                <ServiceResult key={p.productCode} p={p} q={quoteOf(p.productCode)} selected={form.product_code === p.productCode}
                  onSelect={() => void w.chooseProduct(p.productCode)} busy={w.selecting === p.productCode} disabled={!!w.selecting || w.servicesStale} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
              {t('اضغط «عرض خدمات DHL المتاحة» — يُحفظ الطلب كمسودة ويسأل SHIPPEC شركة DHL عن الخدمات والأسعار لهذا المسار.', 'Press «Show available DHL services» — the shipment is saved as a draft and SHIPPEC asks DHL for the services and prices of this route.')}
            </div>
          )}
          {quotedAt && !Number.isNaN(quotedAt.getTime()) && products.length > 0 && (
            <p className="mt-3 text-[11px] text-slate-500" data-testid="rate-timestamp">
              {t('تقدير سعر DHL بتاريخ', 'DHL rate estimate as of')}{' '}
              <span dir="ltr">{new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ar-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short' }).format(quotedAt)}</span>
              {' · '}{t('الأسعار كما أعادتها DHL لحساب SHIPPEC.', "Prices exactly as DHL returned them for SHIPPEC's account.")}
            </p>
          )}
        </Section>
        {form.product_code && <GoGreenCard q={quote} />}
      </div>

      <OptionalServices w={w} />

      <section className="rounded-3xl border-2 border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-900/10 p-4 sm:p-6" aria-labelledby="shippec-pricing">
        <h2 id="shippec-pricing" className="text-base font-extrabold text-emerald-900 dark:text-emerald-300 flex items-center gap-2"><Tag size={18} /> {t('تسعير SHIPPEC للعميل', 'SHIPPEC price for the customer')}</h2>
        <p className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-1">{t('سعر البيع يحدده SHIPPEC — ليس من DHL. الفاتورة تُنشأ بسعر البيع.', 'The selling price is set by SHIPPEC — not by DHL. The invoice uses the selling price.')}</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            <div className="text-[11px] font-bold text-slate-400">{t('تكلفة DHL', 'DHL cost')}</div>
            <SelectInput aria-label={t('مصدر تكلفة DHL', 'DHL cost source')} value={w.pricing.cost_mode} onValue={(v) => setMode(v as CostMode)} disabled={!canPrice}>
              <option value="dhl_quote" disabled={!quote || quote.amount == null || quoteNotSar}>{t('من عرض DHL', "From DHL's quote")}</option>
              <option value="manual">{t('إدخال يدوي', 'Manual entry')}</option>
              <option value="unknown">{t('غير معروفة الآن', 'Unknown for now')}</option>
            </SelectInput>
            {w.pricing.cost_mode === 'dhl_quote' ? (
              <div className="text-lg font-extrabold tabular-nums" dir="ltr">{quote?.amount != null && !quoteNotSar ? m(quote.amount) : '—'}</div>
            ) : w.pricing.cost_mode === 'manual' ? (
              <TextInput aria-label={t('تكلفة DHL بالريال', 'DHL cost in SAR')} value={w.pricing.manual_cost} onValue={(v) => w.setPricing((p) => ({ ...p, manual_cost: v }))} ltr inputMode="decimal" disabled={!canPrice} />
            ) : <div className="text-xs text-slate-500">{t('سيُحسب الربح كاملًا حتى تُعرف التكلفة (من مطابقة فواتير DHL).', 'The profit counts in full until the cost is known (from DHL invoice reconciliation).')}</div>}
            {quoteNotSar && <p className="text-[11px] text-amber-700">{t(`عرض DHL بعملة ${quote?.currency} — أدخل التكلفة بالريال يدويًا.`, `DHL's quote is in ${quote?.currency} — enter the cost in SAR manually.`)}</p>}
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            <label htmlFor="selling-price" className="text-[11px] font-bold text-slate-400 block">{t('سعر البيع للعميل (ريال)', 'Selling price to the customer (SAR)')}</label>
            <TextInput id="selling-price" value={w.pricing.selling_price} onValue={(v) => w.setPricing((p) => ({ ...p, selling_price: v }))} ltr inputMode="decimal" disabled={!canPrice} error={e('price')} placeholder="0.00" />
            {!canPrice && <p className="text-[11px] text-slate-500">{t('التسعير متاح للموظفين والمحاسبين والمدراء.', 'Pricing is available to employees, accountants and managers.')}</p>}
            {e('price') && <p className="text-[11px] text-red-600 font-semibold">{e('price')}</p>}
          </div>
          <div className={`rounded-2xl border p-3 ${profit != null && profit < 0 ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900/50' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
            <div className="text-[11px] font-bold text-slate-400">{t('الربح المتوقع', 'Expected profit')}</div>
            <div className={`text-2xl font-extrabold tabular-nums ${profit != null && profit < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}`} dir="ltr">{profit != null ? m(profit) : '—'}</div>
            <div className="text-[11px] text-slate-500">{t('سعر البيع − تكلفة DHL', 'Selling price − DHL cost')}</div>
          </div>
        </div>
        {profit != null && profit < 0 && (
          <div className="mt-3"><Note tone="error" title={t('سعر البيع أقل من تكلفة DHL', 'The selling price is below the DHL cost')}>{t(`ستُسجَّل هذه الشحنة بخسارة ${m(Math.abs(profit))}. تأكد من السعر قبل الإنشاء.`, `This shipment will be recorded at a loss of ${m(Math.abs(profit))}. Check the price before creating it.`)}</Note></div>
        )}
      </section>

      {w.selecting && <p className="text-xs text-slate-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {t('جاري تثبيت الخدمة…', 'Selecting the service…')}</p>}
      {!w.products && !w.servicesLoading && <p className="text-[11px] text-slate-400 flex items-center gap-1"><AlertTriangle size={12} /> {t('لا تُعرض أسعار مخمّنة: الأسعار تأتي من DHL فقط.', 'No guessed prices: prices come from DHL only.')}</p>}
    </div>
  );
}
