/**
 * Step 6 — shipment date, DHL's own products and quotes (through the
 * Backend), and SHIPPEC's selling price. DHL figures are shown exactly as
 * DHL returned them; SHIPPEC's price lives in a visibly separate panel.
 * Arabic or English (the page's own AR | EN).
 */
import { useId, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Clock, Info, Leaf, Loader2, RefreshCw, Tag, Truck, X } from 'lucide-react';
import { Dialog } from '../shared/Dialog';
import { useAuthStore } from '../../hooks/useAuthStore';
import type { ProductOption, RateQuote } from '../../services/dhlShipment.service';
import { Button, Field, Note, Section, SelectInput, Skeleton, Stat, TextInput } from './ui';
import { useCsLang } from './csLang';
import {
  canShipment, CHARGE_LABELS, CHARGE_LABELS_EN, countryName, isOriginWeekend, kg, money, needsOriginOffset, nextBusinessDay, packageTotals, translateIssue,
} from './wizardModel';
import type { CostMode, Wizard } from './useShipmentWizard';

const deliveryText = (iso: string | null | undefined) => {
  if (!iso) return null;
  const date = iso.slice(0, 10).split('-').reverse().join('/');
  const time = iso.slice(11, 16);
  return { date, time, eod: time === '23:59' };
};

function RateDetailsDialog({ quote, onClose }: { quote: RateQuote | null; onClose: () => void }) {
  const hid = useId();
  const { t, lang, dir } = useCsLang();
  const m = (n: number | null | undefined, c?: string | null) => money(n, c ?? quote?.currency ?? 'SAR', lang);
  return (
    <Dialog open={!!quote} onRequestClose={onClose} labelledBy={hid} panelClassName="sm:max-w-lg max-h-[90dvh]">
      {quote && (
        <div dir={dir} className="contents">
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3 border-b border-slate-100 dark:border-slate-700">
            <div>
              <div className="text-[10px] font-bold text-slate-400">{t('تفاصيل سعر DHL', 'DHL price details')}</div>
              <h2 id={hid} className="text-lg font-extrabold text-slate-900 dark:text-white" dir="ltr">{quote.productName}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label={t('إغلاق', 'Close')} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
          </div>
          <div className="overflow-y-auto px-5 py-4 space-y-4">
            <table className="w-full text-sm">
              <tbody>
                {quote.breakdown.map((b, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-700/60">
                    <td className="py-2">
                      <div className="font-bold text-slate-800 dark:text-slate-100">{(lang === 'en' ? CHARGE_LABELS_EN : CHARGE_LABELS)[b.category]}</div>
                      <div className="text-[11px] text-slate-400" dir="ltr">{b.name}{b.serviceCode ? ` (${b.serviceCode})` : ''}</div>
                    </td>
                    <td className="py-2 text-end tabular-nums font-extrabold" dir="ltr">
                      {m(b.amount, b.currency)}
                      {b.tax ? <div className="text-[10px] text-slate-400 font-semibold">{t('شامل ضريبة', 'incl. tax')} {m(b.tax, b.currency)}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><td className="pt-3 font-extrabold">{t('الإجمالي من DHL', 'Total from DHL')}</td><td className="pt-3 text-end font-extrabold tabular-nums text-indigo-700 dark:text-indigo-300" dir="ltr">{m(quote.amount)}</td></tr>
                {quote.taxTotal != null && <tr><td className="text-xs text-slate-500">{t('منها ضرائب', 'of which taxes')}</td><td className="text-xs text-end tabular-nums" dir="ltr">{m(quote.taxTotal)}</td></tr>}
              </tfoot>
            </table>
            {quote.weight && (
              <div className="grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 p-3">
                <Stat label={t('الوزن الحجمي (DHL)', 'Volumetric weight (DHL)')} value={quote.weight.volumetric != null ? kg(quote.weight.volumetric, lang) : '—'} />
                <Stat label={t('وزن التسعير (DHL)', 'Billed weight (DHL)')} value={quote.weight.provided != null ? kg(quote.weight.provided, lang) : '—'} />
              </div>
            )}
            {quote.optionalServices.length > 0 && (
              <div>
                <h3 className="text-xs font-extrabold text-slate-700 dark:text-slate-200 mb-2">{t('خدمات اختيارية تعرضها DHL (بدون سعر في هذا العرض)', 'Optional services DHL offers (not priced in this quote)')}</h3>
                <ul className="flex flex-wrap gap-1.5">
                  {quote.optionalServices.slice(0, 24).map((s) => (
                    <li key={s.serviceCode} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700/60 text-[10px] font-bold text-slate-600 dark:text-slate-300" dir="ltr">{s.name ?? s.serviceCode}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-slate-400">{t('الأسعار كما أعادتها DHL لحساب SHIPPEC — لا يضيف SHIPPEC أي رسوم عليها هنا.', "Prices exactly as DHL returned them for SHIPPEC's account — SHIPPEC adds nothing here.")}</p>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function ProductCard({ p, q, selected, onSelect, onDetails, busy, disabled }: {
  p: ProductOption; q: RateQuote | null; selected: boolean; onSelect: () => void; onDetails: () => void; busy: boolean; disabled: boolean;
}) {
  const { t, lang } = useCsLang();
  const est = deliveryText(q?.deliveryCapabilities?.estimatedDeliveryDateAndTime ?? p.deliveryCapabilities?.estimatedDeliveryDateAndTime ?? q?.estimatedDelivery);
  const transit = q?.deliveryCapabilities?.totalTransitDays ?? p.deliveryCapabilities?.totalTransitDays ?? q?.totalTransitDays;
  const fuel = q?.breakdown.find((b) => b.category === 'fuel_surcharge');
  const green = q?.breakdown.some((b) => b.category === 'gogreen');
  return (
    <article className={`rounded-2xl border p-4 flex flex-col gap-3 min-w-0 transition-colors ${selected ? 'border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-900/15' : 'border-slate-200 dark:border-slate-700'}`} data-product={p.productCode}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white" dir="ltr">{p.productName ?? p.productCode}</h3>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {p.isCustomerAgreement && <span className="px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-100 text-[10px] font-bold">{t('باتفاقية مع DHL', 'DHL customer agreement')}</span>}
            {green && <span className="px-2 py-0.5 rounded-lg bg-green-50 text-green-700 border border-green-100 text-[10px] font-bold inline-flex items-center gap-1"><Leaf size={10} /> GoGreen</span>}
          </div>
        </div>
        {selected && <CheckCircle2 className="text-indigo-600 shrink-0" size={20} />}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="font-bold text-slate-400 flex items-center gap-1"><CalendarDays size={12} /> {t('التسليم المتوقع', 'Estimated delivery')}</div>
          <div className="font-extrabold tabular-nums">{est ? est.date : '—'}</div>
          {est && <div className="text-[11px] text-slate-500">{est.eod ? t('بنهاية اليوم', 'by end of day') : t(`قبل ${est.time}`, `by ${est.time}`)}{transit != null ? t(` · ${transit} أيام`, ` · ${transit} days`) : ''}</div>}
        </div>
        <div className="text-end">
          <div className="font-bold text-slate-400">{t('سعر DHL', 'DHL price')}</div>
          <div className="text-lg font-extrabold tabular-nums text-slate-900 dark:text-white" dir="ltr">{q?.amount != null ? money(q.amount, q.currency ?? 'SAR', lang) : '—'}</div>
          {fuel?.amount != null && <div className="text-[11px] text-slate-500">{t('منها وقود', 'incl. fuel')} {money(fuel.amount, fuel.currency ?? 'SAR', lang)}</div>}
        </div>
      </div>
      {q && q.amount === 0 && p.isCustomerAgreement && <p className="text-[11px] text-amber-700">{t('DHL لم تُسعّر هذه الخدمة (اتفاقية خاصة).', 'DHL did not price this service (special agreement).')}</p>}
      {!q && <p className="text-[11px] text-slate-500">{t('لم تُرجع DHL سعرًا لهذه الخدمة.', 'DHL returned no price for this service.')}</p>}
      <div className="flex gap-2 mt-auto">
        <Button className="flex-1" variant={selected ? 'secondary' : 'primary'} onClick={onSelect} loading={busy} disabled={disabled || selected}>
          {selected ? t('مختارة', 'Selected') : t('اختيار', 'Select')}
        </Button>
        {q && <Button variant="ghost" onClick={onDetails}>{t('عرض التفاصيل', 'View details')}</Button>}
      </div>
    </article>
  );
}

export function StepService({ w }: { w: Wizard }) {
  const { form, update, errors } = w;
  const { t, lang } = useCsLang();
  const role = useAuthStore((s) => s.user?.role);
  const canPrice = canShipment(role, 'price');
  const [details, setDetails] = useState<RateQuote | null>(null);
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

  return (
    <div className="space-y-4">
      <Section title={t('تاريخ الشحن', 'Shipment date')} icon={<CalendarDays size={18} className="text-indigo-600" />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={t('تاريخ الشحن', 'Shipment date')} required error={e('shipment_date')} hint={t('DHL تقبل حتى 10 أيام قادمة', 'DHL accepts up to 10 days ahead')}>
            {(id) => <TextInput id={id} type="date" value={form.shipment_date} onValue={(v) => update((f) => ({ ...f, shipment_date: v }))} error={e('shipment_date')} />}
          </Field>
          {needsOriginOffset(form) && (
            <Field label={t('المنطقة الزمنية لبلد المرسل', "Sender country's time zone")} required error={e('origin_gmt_offset')} hint={t('مثل -05:00 (نيويورك شتاءً)', 'e.g. -05:00 (New York in winter)')}>
              {(id) => <TextInput id={id} value={form.origin_gmt_offset} onValue={(v) => update((f) => ({ ...f, origin_gmt_offset: v }))} error={e('origin_gmt_offset')} ltr placeholder="+03:00" />}
            </Field>
          )}
          {isOriginWeekend(form.shipment_date, form.shipper.country_code) && (
            <div className="sm:col-span-3 sm:order-last">
              <Note tone="warn" title={t('تاريخ الشحن يوم عطلة في بلد المرسل', "The shipment date is a weekend day in the sender's country")}>
                {t(`DHL لا تستلم ولا تشحن في عطلة نهاية الأسبوع في ${countryName(form.shipper.country_code) || 'بلد المرسل'}.`, `DHL does not pick up or ship on the weekend in ${countryName(form.shipper.country_code, 'en') || "the sender's country"}.`)}{' '}
                <button type="button" className="font-bold underline" onClick={() => update((f) => ({ ...f, shipment_date: nextBusinessDay(new Date(), f.shipper.country_code, f.shipment_date) }))}>
                  {t('نقل إلى أقرب يوم عمل', 'Move to the next business day')}
                </button>
              </Note>
            </div>
          )}
          <div className="flex items-end">
            <Button onClick={() => void w.fetchServices()} loading={w.servicesLoading} className="w-full">
              <RefreshCw size={16} /> {products.length ? t('تحديث الخدمات والأسعار', 'Refresh services and prices') : t('عرض خدمات DHL المتاحة', 'Show available DHL services')}
            </Button>
          </div>
        </div>
      </Section>

      <Section title={t('خدمات DHL المتاحة', 'Available DHL services')} icon={<Truck size={18} className="text-indigo-600" />} description={t('المنتجات والأسعار كما تعيدها DHL لهذا المسار والتاريخ والطرود.', 'Products and prices exactly as DHL returns them for this route, date and packages.')}>
        {w.servicesStale && products.length > 0 && (
          <div className="mb-3"><Note tone="warn" title={t('تغيّرت بيانات الشحنة', 'The shipment data changed')}>{t('الخدمات والأسعار المعروضة قد لا تخص البيانات الحالية — اضغط «تحديث الخدمات والأسعار» قبل الاختيار.', 'The services and prices shown may not match the current data — press «Refresh services and prices» before choosing.')}</Note></div>
        )}
        {w.servicesError && <div className="mb-3"><Note tone="error">{w.servicesError}</Note></div>}
        {e('product_code') && <div className="mb-3"><Note tone="error">{e('product_code')}</Note></div>}
        {w.servicesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" role="status" aria-label={t('جاري جلب خدمات DHL', 'Loading DHL services')}>
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : products.length ? (
          <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 ${w.servicesStale ? 'opacity-60' : ''}`}>
            {products.map((p) => (
              <ProductCard key={p.productCode} p={p} q={quoteOf(p.productCode)} selected={form.product_code === p.productCode}
                onSelect={() => void w.chooseProduct(p.productCode)} onDetails={() => setDetails(quoteOf(p.productCode))}
                busy={w.selecting === p.productCode} disabled={!!w.selecting || w.servicesStale} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
            {t('اضغط «عرض خدمات DHL المتاحة» — يُحفظ الطلب كمسودة ويسأل SHIPPEC شركة DHL عن الخدمات والأسعار لهذا المسار.', 'Press «Show available DHL services» — the shipment is saved as a draft and SHIPPEC asks DHL for the services and prices of this route.')}
          </div>
        )}
      </Section>

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

      {w.quote && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><Info size={12} /> {t('الوزن الفعلي:', 'Actual weight:')} {kg(packageTotals(form.packages).weight, lang)}</span>
          {w.quote.weight?.volumetric != null && <span>{t('الحجمي (DHL):', 'Volumetric (DHL):')} {kg(w.quote.weight.volumetric, lang)}</span>}
          {w.quote.weight?.provided != null && <span>{t('وزن التسعير (DHL):', 'Billed weight (DHL):')} {kg(w.quote.weight.provided, lang)}</span>}
          {w.quote.pickupCapabilities?.localCutoffDateAndTime && <span className="flex items-center gap-1"><Clock size={12} /> {t('آخر موعد لاستلام اليوم:', "Today's pickup cut-off:")} {w.quote.pickupCapabilities.localCutoffDateAndTime.slice(11, 16)}</span>}
        </div>
      )}
      {w.selecting && <p className="text-xs text-slate-500 flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> {t('جاري تثبيت الخدمة…', 'Selecting the service…')}</p>}
      {!w.products && !w.servicesLoading && <p className="text-[11px] text-slate-400 flex items-center gap-1"><AlertTriangle size={12} /> {t('لا تُعرض أسعار مخمّنة: الأسعار تأتي من DHL فقط.', 'No guessed prices: prices come from DHL only.')}</p>}
      <RateDetailsDialog quote={details} onClose={() => setDetails(null)} />
    </div>
  );
}
