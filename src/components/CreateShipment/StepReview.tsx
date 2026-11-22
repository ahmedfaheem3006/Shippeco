/**
 * Step 8 — the full review, DHL validation (validateDataOnly: nothing is
 * created), and the ONE explicit «إنشاء الشحنة». Entering this step never
 * creates anything. Arabic or English (the page's own AR | EN).
 */
import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Send, ShieldCheck, X } from 'lucide-react';
import { Dialog } from '../shared/Dialog';
import { useAuthStore } from '../../hooks/useAuthStore';
import { Button, Note, Section, Stat } from './ui';
import { useCsLang } from './csLang';
import {
  ALL_STEPS, canShipment, composePhone, countryName, isInternational, itemTotals, kg, locateIssue, money, packageTotals, purposeLabel, stepLabel, translateIssue, type StepId,
} from './wizardModel';
import type { Wizard } from './useShipmentWizard';

const PHASE_TEXT: Record<string, [string, string]> = {
  saving: ['حفظ البيانات…', 'Saving the data…'], validating: ['التحقق من البيانات لدى DHL…', 'Validating the data with DHL…'], pricing: ['اعتماد السعر…', 'Approving the price…'],
  confirming: ['تأكيد الشحنة وتجميد بياناتها…', 'Confirming the shipment and freezing its data…'],
  sending: ['إرسال طلب الإنشاء إلى DHL — لا تغلق الصفحة…', 'Sending the creation request to DHL — do not close the page…'],
};
const PAYER: Record<string, [string, string]> = { shipper: ['SHIPPEC (المرسل)', 'SHIPPEC (sender)'], receiver: ['المستلم', 'Receiver'], third_party: ['طرف ثالث', 'Third party'] };
const PICKUP: Record<string, [string, string]> = { schedule: ['جدولة مندوب DHL', 'Schedule a DHL courier'], none: ['بدون استلام', 'No pickup'], drop_off: ['التسليم في نقطة خدمة DHL', 'Drop off at a DHL Service Point'] };

function PartySummary({ title, p }: { title: string; p: Wizard['form']['shipper'] }) {
  const { lang } = useCsLang();
  const phone = p.phones[0]?.number ? composePhone(p.phones[0].code, p.phones[0].number) : p.phone;
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold text-slate-400">{title}</div>
      <div className="text-sm font-extrabold text-slate-900 dark:text-white" dir="ltr">{p.contact || p.company || '—'}</div>
      {p.company && p.company !== p.contact && <div className="text-xs text-slate-600 dark:text-slate-300" dir="ltr">{p.company}</div>}
      <div className="text-xs text-slate-500" dir="ltr">
        {[p.address_line1, p.address_line2, p.country_code === 'SA' ? p.short_address : p.suburb].filter((x) => x && x.trim()).join(', ')}
      </div>
      <div className="text-xs text-slate-500">{[p.city, p.postal_code, countryName(p.country_code, lang)].filter(Boolean).join(' · ')}</div>
      <div className="text-xs text-slate-500 tabular-nums" dir="ltr">{phone}</div>
    </div>
  );
}

export function StepReview({ w, onGo }: { w: Wizard; onGo: (s: StepId) => void }) {
  const { form, validation } = w;
  const { t, lang, dir } = useCsLang();
  const role = useAuthStore((s) => s.user?.role);
  const canCreate = canShipment(role, 'create');
  const canConfirm = canShipment(role, 'confirm');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cid = useId();
  const autoRan = useRef(false);
  const m = (n: number | null | undefined) => money(n, 'SAR', lang);

  // Entering the review checks the draft with DHL once (validateDataOnly — creates nothing).
  useEffect(() => {
    if (autoRan.current || w.validationCurrent || w.validating) return;
    autoRan.current = true;
    void w.validate();
  }, [w]);

  const pk = packageTotals(form.packages);
  const it = itemTotals(form.items);
  const quote = w.quote;
  const sell = Number(w.pricing.selling_price);
  const priced = w.pricing.selling_price !== '' && Number.isFinite(sell) && sell > 0;
  const profit = priced && w.dhlCost != null ? Math.round((sell - w.dhlCost) * 100) / 100 : null;
  const est = quote?.deliveryCapabilities?.estimatedDeliveryDateAndTime ?? quote?.estimatedDelivery ?? null;
  const issues = validation?.issues ?? [];
  const warnings = validation?.warnings ?? [];
  const grouped = issues.reduce<Record<string, string[]>>((acc, i) => {
    const st = locateIssue(i.field).step;
    (acc[st] ||= []).push(translateIssue(i.message, lang));
    return acc;
  }, {});
  const busy = w.createPhase !== 'idle' && w.createPhase !== 'done';
  const blockers: string[] = [];
  if (!form.client_id) blockers.push(t('اختر عميل SHIPPEC (صاحب الفاتورة)', 'Select the SHIPPEC customer (invoice owner)'));
  if (!form.product_code) blockers.push(t('اختر خدمة DHL', 'Choose a DHL service'));
  if (!priced) blockers.push(t('أدخل سعر البيع للعميل', 'Enter the selling price for the customer'));
  if (w.pricing.cost_mode === 'manual' && w.pricing.manual_cost.trim() === '') blockers.push(t('أدخل تكلفة DHL أو اختر «غير معروفة»', 'Enter the DHL cost or choose «Unknown»'));
  if (w.servicesStale) blockers.push(t('حدّث خدمات DHL وأسعارها — تغيّرت بيانات الشحنة', 'Refresh the DHL services and prices — the shipment data changed'));
  const ready = blockers.length === 0 && validation?.ok && validation.dhl_validation.status === 'passed' && w.validationCurrent;
  const phase = PHASE_TEXT[w.createPhase];

  return (
    <div className="space-y-4">
      <Section title={t('التحقق', 'Validation')} icon={<ShieldCheck size={18} className="text-indigo-600" />} actions={<Button variant="secondary" onClick={() => void w.validate()} loading={w.validating}>{t('إعادة التحقق', 'Validate again')}</Button>}>
        {w.validating ? (
          <p className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2" role="status"><Loader2 size={16} className="animate-spin" /> {t('جاري التحقق من البيانات (محليًا ثم لدى DHL دون إنشاء أي شحنة)…', 'Validating the data (locally, then with DHL — nothing is created)…')}</p>
        ) : validation ? (
          <div className="space-y-3">
            {issues.length > 0 ? (
              <Note tone="error" title={t(`أخطاء تمنع الإنشاء (${issues.length})`, `Errors blocking creation (${issues.length})`)}>
                <ul className="space-y-2 mt-1">
                  {Object.entries(grouped).map(([st, msgs]) => (
                    <li key={st}>
                      <button type="button" className="font-extrabold underline" onClick={() => onGo(st as StepId)}>{stepLabel(ALL_STEPS.find((s) => s.id === st), lang) || t('المراجعة', 'Review')}</button>
                      <ul className="list-disc ps-5 mt-0.5">{msgs.map((x, i) => <li key={i} dir="auto">{x}</li>)}</ul>
                    </li>
                  ))}
                </ul>
              </Note>
            ) : validation.dhl_validation.status === 'passed' ? (
              <Note tone="success">{t('اجتازت البيانات التحقق المحلي وتحقق DHL (validateDataOnly).', 'The data passed the local checks and DHL validation (validateDataOnly).')}</Note>
            ) : (
              <Note tone="warn">{t(`نجح التحقق المحلي، لكن DHL لم تُعطِ حكمًا الآن (${validation.dhl_validation.status === 'unavailable' ? 'ربط DHL غير مفعّل على الخادم' : 'لا رد من DHL'}). أعد التحقق قبل الإنشاء.`,
                `The local checks passed, but DHL gave no verdict now (${validation.dhl_validation.status === 'unavailable' ? 'the DHL connection is not enabled on the server' : 'no answer from DHL'}). Validate again before creating.`)}</Note>
            )}
            {warnings.length > 0 && (
              <Note tone="warn" title={t('تنبيهات (لا تمنع الإنشاء)', 'Warnings (do not block creation)')}>
                <ul className="list-disc ps-5">{warnings.map((x, i) => <li key={i} dir="auto">{translateIssue(x.message, lang)}</li>)}</ul>
              </Note>
            )}
          </div>
        ) : <p className="text-sm text-slate-500">{t('لم يتم التحقق بعد.', 'Not validated yet.')}</p>}
      </Section>

      <Section title={t('ملخص الشحنة', 'Shipment summary')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PartySummary title={t('المرسل', 'From')} p={form.shipper} />
          <PartySummary title={t('المستلم', 'To')} p={form.receiver} />
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-100 dark:border-slate-700 pt-4">
          <Stat label={t('العميل', 'Customer')} value={form.client_name || (form.client_id ? `#${form.client_id}` : '—')} />
          <Stat label={t('نوع الشحنة', 'Shipment type')} value={`${form.content_kind === 'documents' ? t('مستندات', 'Documents') : t('بضائع', 'Goods')} · ${isInternational(form) ? t('دولية', 'International') : t('محلية', 'Domestic')}`} />
          <Stat label={t('الغرض', 'Purpose')} value={form.shipment_purpose ? purposeLabel(form.shipment_purpose, lang) : '—'} />
          <Stat label={t('الطرود', 'Packages')} value={`${pk.pieces} · ${kg(pk.weight, lang)}`} />
          {w.customs && <Stat label={t('قيمة البنود', 'Lines value')} value={`${it.value.toFixed(2)} ${form.currency}`} />}
          {w.customs && <Stat label="Incoterm" value={form.incoterm || '—'} />}
          <Stat label={t('أجرة النقل على', 'Transportation paid by')} value={t(...PAYER[form.transport_payer])} />
          {w.customs && <Stat label={t('الرسوم والضرائب على', 'Duties & taxes paid by')} value={t(...PAYER[form.duties_payer])} />}
          {w.customs && <Stat label="Paperless Trade" value={form.paperless_trade ? `${t('نعم', 'Yes')} (${form.dhl_invoice_type === 'proforma' ? 'Proforma' : 'Commercial'})` : t('لا', 'No')} />}
          <Stat label={t('الاستلام', 'Pickup')} value={t(...PICKUP[form.pickup_option])} />
          {form.pickup_option === 'schedule' && <Stat label={t('موعد الاستلام', 'Pickup time')} value={`${form.shipment_date} · ${form.pickup_earliest_time || '—'}–${form.pickup_latest_time || '—'}`} />}
          {form.pickup_option === 'drop_off' && <Stat label={t('نقطة الخدمة', 'Service point')} value={form.service_point_name || '—'} />}
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title={t('خدمة DHL', 'DHL service')}>
          <div className="grid grid-cols-2 gap-4">
            <Stat label={t('الخدمة', 'Service')} value={<span dir="ltr">{quote?.productName ?? form.product_code ?? '—'}</span>} />
            <Stat label={t('التسليم المتوقع', 'Estimated delivery')} value={est ? `${est.slice(0, 10)}${est.slice(11, 16) === '23:59' ? t(' · بنهاية اليوم', ' · by end of day') : ` · ${est.slice(11, 16)}`}` : '—'} />
            <Stat label={t('تكلفة DHL', 'DHL cost')} value={m(w.dhlCost)} />
            <Stat label={t('تاريخ الشحن', 'Shipment date')} value={form.shipment_date} />
          </div>
        </Section>
        <section className="rounded-3xl border-2 border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-900/10 p-4 sm:p-6">
          <h2 className="text-base font-extrabold text-emerald-900 dark:text-emerald-300 mb-4">{t('تسعير SHIPPEC', 'SHIPPEC pricing')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <Stat label={t('سعر البيع للعميل', 'Selling price to the customer')} value={priced ? m(sell) : '—'} />
            <Stat label={t('الربح المتوقع', 'Expected profit')} value={m(profit)} tone={profit != null && profit < 0 ? 'bad' : 'good'} />
          </div>
          <p className="mt-3 text-[11px] text-emerald-800/80 dark:text-emerald-300/80">{t('تُنشأ فاتورة SHIPPEC تلقائيًا بسعر البيع بعد إنشاء الشحنة.', 'The SHIPPEC invoice is created automatically at the selling price once the shipment exists.')}</p>
        </section>
      </div>

      {blockers.length > 0 && <Note tone="warn" title={t('قبل الإنشاء', 'Before creating')}><ul className="list-disc ps-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul></Note>}
      {w.createError && (
        <Note tone="error" title={t('لم تُنشأ الشحنة', 'The shipment was not created')}>
          {w.createError.message}
          {w.createError.issues.length > 0 && <ul className="list-disc ps-5 mt-1">{w.createError.issues.map((i, k) => <li key={k} dir="auto">{translateIssue(i.message, lang)}</li>)}</ul>}
        </Note>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 px-1 pb-1">
        <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur shadow-lg p-3 sm:p-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="text-xs text-slate-500 min-w-0">
            {busy && phase ? <span className="flex items-center gap-2 font-bold text-indigo-700 dark:text-indigo-300" role="status"><Loader2 size={14} className="animate-spin" /> {t(...phase)}</span>
              : canCreate ? t('سيُرسل طلب واحد فقط إلى DHL بعد التأكيد.', 'Only one request is sent to DHL after confirmation.') : t('إنشاء الشحنة لدى DHL للمدير أو المسؤول فقط.', 'Creating the shipment at DHL is for a manager or admin only.')}
          </div>
          <Button onClick={() => setConfirmOpen(true)} disabled={!canCreate || !canConfirm || !ready || busy} loading={busy} className="w-full sm:w-auto px-6">
            <Send size={16} /> {t('إنشاء الشحنة', 'Create shipment')}
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onRequestClose={() => setConfirmOpen(false)} labelledBy={cid} panelClassName="sm:max-w-md">
        <div className="p-5 space-y-4" dir={dir}>
          <div className="flex items-start justify-between gap-3">
            <h2 id={cid} className="text-lg font-extrabold text-slate-900 dark:text-white">{t('تأكيد إنشاء الشحنة لدى DHL', 'Confirm creating the shipment at DHL')}</h2>
            <button type="button" onClick={() => setConfirmOpen(false)} aria-label={t('إغلاق', 'Close')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>
          <ul className="text-sm space-y-1.5 text-slate-700 dark:text-slate-200">
            <li className="flex gap-2"><CheckCircle2 size={16} className="text-indigo-600 shrink-0 mt-0.5" /> {t('الخدمة:', 'Service:')} <span dir="ltr" className="font-bold">{quote?.productName ?? form.product_code}</span></li>
            <li className="flex gap-2"><CheckCircle2 size={16} className="text-indigo-600 shrink-0 mt-0.5" /> {t('سعر البيع:', 'Selling price:')} <span className="font-bold">{m(sell)}</span> · {t('تكلفة DHL:', 'DHL cost:')} <span className="font-bold">{m(w.dhlCost)}</span></li>
            <li className="flex gap-2"><CheckCircle2 size={16} className="text-indigo-600 shrink-0 mt-0.5" /> {t(...PICKUP[form.pickup_option])}</li>
          </ul>
          <Note tone="warn">{t('ستُنشأ شحنة حقيقية لدى DHL برقم بوليصة، وتُنشأ فاتورة SHIPPEC تلقائيًا. لا يمكن التراجع عن الإنشاء من هنا.', 'A real DHL shipment with an AWB is created, and the SHIPPEC invoice is created automatically. The creation cannot be undone from here.')}</Note>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>{t('رجوع', 'Back')}</Button>
            <Button onClick={() => { setConfirmOpen(false); void w.create(); }} disabled={busy}><Send size={16} /> {t('نعم، أنشئ الشحنة', 'Yes, create the shipment')}</Button>
          </div>
        </div>
      </Dialog>
      {!canCreate && <p className="text-[11px] text-slate-500 flex items-center gap-1"><AlertTriangle size={12} /> {t('يمكنك حفظ المسودة وتجهيزها؛ يكمل المدير الإنشاء.', 'You can save and prepare the draft; a manager completes the creation.')}</p>}
    </div>
  );
}
