/**
 * Step 8 — the full review, DHL validation (validateDataOnly: nothing is
 * created), and the ONE explicit «إنشاء الشحنة». Entering this step never
 * creates anything.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Send, ShieldCheck, X } from 'lucide-react';
import { Dialog } from '../shared/Dialog';
import { useAuthStore } from '../../hooks/useAuthStore';
import { Button, Note, Section, Stat } from './ui';
import {
  ALL_STEPS, canShipment, countryName, isInternational, itemTotals, locateIssue, money, packageTotals, PURPOSE_LABELS, translateIssue, type StepId,
} from './wizardModel';
import type { Wizard } from './useShipmentWizard';

const PHASE_TEXT: Record<string, string> = {
  saving: 'حفظ البيانات…', validating: 'التحقق من البيانات لدى DHL…', pricing: 'اعتماد السعر…', confirming: 'تأكيد الشحنة وتجميد بياناتها…',
  sending: 'إرسال طلب الإنشاء إلى DHL — لا تغلق الصفحة…',
};
const PAYER: Record<string, string> = { shipper: 'SHIPPEC (المرسل)', receiver: 'المستلم', third_party: 'طرف ثالث' };
const PICKUP: Record<string, string> = { schedule: 'جدولة مندوب DHL', none: 'بدون استلام', drop_off: 'التسليم في نقطة خدمة DHL' };

const PartySummary = ({ title, p }: { title: string; p: Wizard['form']['shipper'] }) => (
  <div className="min-w-0">
    <div className="text-[11px] font-bold text-slate-400">{title}</div>
    <div className="text-sm font-extrabold text-slate-900 dark:text-white" dir="ltr">{p.contact || p.company || '—'}</div>
    {p.company && p.company !== p.contact && <div className="text-xs text-slate-600 dark:text-slate-300" dir="ltr">{p.company}</div>}
    <div className="text-xs text-slate-500" dir="ltr">
      {p.country_code === 'SA' && p.use_na
        ? [`${p.na.building_number} ${p.na.street}`.trim(), `${p.na.additional_number} ${p.na.district}`.trim(), p.na.short_address].filter((x) => x && x.trim()).join(', ')
        : [p.address_line1, p.address_line2, p.address_line3].filter(Boolean).join(', ')}
    </div>
    <div className="text-xs text-slate-500">{[p.city, p.postal_code, countryName(p.country_code)].filter(Boolean).join(' · ')}</div>
    <div className="text-xs text-slate-500 tabular-nums" dir="ltr">{p.phone}</div>
  </div>
);

export function StepReview({ w, onGo }: { w: Wizard; onGo: (s: StepId) => void }) {
  const { form, validation } = w;
  const role = useAuthStore((s) => s.user?.role);
  const canCreate = canShipment(role, 'create');
  const canConfirm = canShipment(role, 'confirm');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cid = useId();
  const autoRan = useRef(false);

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
    (acc[st] ||= []).push(translateIssue(i.message));
    return acc;
  }, {});
  const busy = w.createPhase !== 'idle' && w.createPhase !== 'done';
  const blockers: string[] = [];
  if (!form.client_id) blockers.push('اختر عميل SHIPPEC (صاحب الفاتورة)');
  if (!form.product_code) blockers.push('اختر خدمة DHL');
  if (!priced) blockers.push('أدخل سعر البيع للعميل');
  if (w.pricing.cost_mode === 'manual' && w.pricing.manual_cost.trim() === '') blockers.push('أدخل تكلفة DHL أو اختر «غير معروفة»');
  if (w.servicesStale) blockers.push('حدّث خدمات DHL وأسعارها — تغيّرت بيانات الشحنة');
  const ready = blockers.length === 0 && validation?.ok && validation.dhl_validation.status === 'passed' && w.validationCurrent;

  return (
    <div className="space-y-4">
      <Section title="التحقق" icon={<ShieldCheck size={18} className="text-indigo-600" />} actions={<Button variant="secondary" onClick={() => void w.validate()} loading={w.validating}>إعادة التحقق</Button>}>
        {w.validating ? (
          <p className="text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2" role="status"><Loader2 size={16} className="animate-spin" /> جاري التحقق من البيانات (محليًا ثم لدى DHL دون إنشاء أي شحنة)…</p>
        ) : validation ? (
          <div className="space-y-3">
            {issues.length > 0 ? (
              <Note tone="error" title={`أخطاء تمنع الإنشاء (${issues.length})`}>
                <ul className="space-y-2 mt-1">
                  {Object.entries(grouped).map(([st, msgs]) => (
                    <li key={st}>
                      <button type="button" className="font-extrabold underline" onClick={() => onGo(st as StepId)}>{ALL_STEPS.find((s) => s.id === st)?.label ?? 'المراجعة'}</button>
                      <ul className="list-disc ps-5 mt-0.5">{msgs.map((m, i) => <li key={i} dir="auto">{m}</li>)}</ul>
                    </li>
                  ))}
                </ul>
              </Note>
            ) : validation.dhl_validation.status === 'passed' ? (
              <Note tone="success">اجتازت البيانات التحقق المحلي وتحقق DHL (validateDataOnly).</Note>
            ) : (
              <Note tone="warn">نجح التحقق المحلي، لكن DHL لم تُعطِ حكمًا الآن ({validation.dhl_validation.status === 'unavailable' ? 'ربط DHL غير مفعّل على الخادم' : 'لا رد من DHL'}). أعد التحقق قبل الإنشاء.</Note>
            )}
            {warnings.length > 0 && (
              <Note tone="warn" title="تنبيهات (لا تمنع الإنشاء)">
                <ul className="list-disc ps-5">{warnings.map((x, i) => <li key={i} dir="auto">{translateIssue(x.message)}</li>)}</ul>
              </Note>
            )}
          </div>
        ) : <p className="text-sm text-slate-500">لم يتم التحقق بعد.</p>}
      </Section>

      <Section title="ملخص الشحنة">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PartySummary title="المرسل" p={form.shipper} />
          <PartySummary title="المستلم" p={form.receiver} />
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-slate-100 dark:border-slate-700 pt-4">
          <Stat label="العميل" value={form.client_name || (form.client_id ? `#${form.client_id}` : '—')} />
          <Stat label="نوع الشحنة" value={`${form.content_kind === 'documents' ? 'مستندات' : 'بضائع'} · ${isInternational(form) ? 'دولية' : 'محلية'}`} />
          <Stat label="الغرض" value={form.shipment_purpose ? PURPOSE_LABELS[form.shipment_purpose] : '—'} />
          <Stat label="الطرود" value={`${pk.pieces} · ${pk.weight} كغ`} />
          {w.customs && <Stat label="قيمة البنود" value={`${it.value.toFixed(2)} ${form.currency}`} />}
          {w.customs && <Stat label="Incoterm" value={form.incoterm || '—'} />}
          <Stat label="أجرة النقل على" value={PAYER[form.transport_payer]} />
          {w.customs && <Stat label="الرسوم والضرائب على" value={PAYER[form.duties_payer]} />}
          {w.customs && <Stat label="Paperless Trade" value={form.paperless_trade ? `نعم (${form.dhl_invoice_type === 'proforma' ? 'Proforma' : 'Commercial'})` : 'لا'} />}
          <Stat label="الاستلام" value={PICKUP[form.pickup_option]} />
          {form.pickup_option === 'schedule' && <Stat label="موعد الاستلام" value={`${form.shipment_date} · ${form.pickup_earliest_time || '—'}–${form.pickup_latest_time || '—'}`} />}
          {form.pickup_option === 'drop_off' && <Stat label="نقطة الخدمة" value={form.service_point_name || '—'} />}
        </div>
      </Section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="خدمة DHL">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="الخدمة" value={<span dir="ltr">{quote?.productName ?? form.product_code ?? '—'}</span>} />
            <Stat label="التسليم المتوقع" value={est ? `${est.slice(0, 10)}${est.slice(11, 16) === '23:59' ? ' · بنهاية اليوم' : ` · ${est.slice(11, 16)}`}` : '—'} />
            <Stat label="تكلفة DHL" value={money(w.dhlCost)} />
            <Stat label="تاريخ الشحن" value={form.shipment_date} />
          </div>
        </Section>
        <section className="rounded-3xl border-2 border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-900/10 p-4 sm:p-6">
          <h2 className="text-base font-extrabold text-emerald-900 dark:text-emerald-300 mb-4">تسعير SHIPPEC</h2>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="سعر البيع للعميل" value={priced ? money(sell) : '—'} />
            <Stat label="الربح المتوقع" value={money(profit)} tone={profit != null && profit < 0 ? 'bad' : 'good'} />
          </div>
          <p className="mt-3 text-[11px] text-emerald-800/80 dark:text-emerald-300/80">تُنشأ فاتورة SHIPPEC تلقائيًا بسعر البيع بعد إنشاء الشحنة.</p>
        </section>
      </div>

      {blockers.length > 0 && <Note tone="warn" title="قبل الإنشاء"><ul className="list-disc ps-5">{blockers.map((b) => <li key={b}>{b}</li>)}</ul></Note>}
      {w.createError && (
        <Note tone="error" title="لم تُنشأ الشحنة">
          {w.createError.message}
          {w.createError.issues.length > 0 && <ul className="list-disc ps-5 mt-1">{w.createError.issues.map((i, k) => <li key={k} dir="auto">{i.message}</li>)}</ul>}
        </Note>
      )}

      <div className="sticky bottom-0 z-10 -mx-1 px-1 pb-1">
        <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur shadow-lg p-3 sm:p-4 flex flex-wrap items-center gap-3 justify-between">
          <div className="text-xs text-slate-500 min-w-0">
            {busy ? <span className="flex items-center gap-2 font-bold text-indigo-700 dark:text-indigo-300" role="status"><Loader2 size={14} className="animate-spin" /> {PHASE_TEXT[w.createPhase]}</span>
              : canCreate ? 'سيُرسل طلب واحد فقط إلى DHL بعد التأكيد.' : 'إنشاء الشحنة لدى DHL للمدير أو المسؤول فقط.'}
          </div>
          <Button onClick={() => setConfirmOpen(true)} disabled={!canCreate || !canConfirm || !ready || busy} loading={busy} className="w-full sm:w-auto px-6">
            <Send size={16} /> إنشاء الشحنة
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onRequestClose={() => setConfirmOpen(false)} labelledBy={cid} panelClassName="sm:max-w-md">
        <div className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h2 id={cid} className="text-lg font-extrabold text-slate-900 dark:text-white">تأكيد إنشاء الشحنة لدى DHL</h2>
            <button type="button" onClick={() => setConfirmOpen(false)} aria-label="إغلاق" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X size={18} /></button>
          </div>
          <ul className="text-sm space-y-1.5 text-slate-700 dark:text-slate-200">
            <li className="flex gap-2"><CheckCircle2 size={16} className="text-indigo-600 shrink-0 mt-0.5" /> الخدمة: <span dir="ltr" className="font-bold">{quote?.productName ?? form.product_code}</span></li>
            <li className="flex gap-2"><CheckCircle2 size={16} className="text-indigo-600 shrink-0 mt-0.5" /> سعر البيع: <span className="font-bold">{money(sell)}</span> · تكلفة DHL: <span className="font-bold">{money(w.dhlCost)}</span></li>
            <li className="flex gap-2"><CheckCircle2 size={16} className="text-indigo-600 shrink-0 mt-0.5" /> {PICKUP[form.pickup_option]}</li>
          </ul>
          <Note tone="warn">ستُنشأ شحنة حقيقية لدى DHL برقم بوليصة، وتُنشأ فاتورة SHIPPEC تلقائيًا. لا يمكن التراجع عن الإنشاء من هنا.</Note>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>رجوع</Button>
            <Button onClick={() => { setConfirmOpen(false); void w.create(); }} disabled={busy}><Send size={16} /> نعم، أنشئ الشحنة</Button>
          </div>
        </div>
      </Dialog>
      {!canCreate && <p className="text-[11px] text-slate-500 flex items-center gap-1"><AlertTriangle size={12} /> يمكنك حفظ المسودة وتجهيزها؛ يكمل المدير الإنشاء.</p>}
    </div>
  );
}
