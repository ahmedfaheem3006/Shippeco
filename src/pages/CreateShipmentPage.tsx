/**
 * «إنشاء شحنة» — the DHL Express shipment wizard (route /create-shipment,
 * resume with ?draft=ID). Every DHL step goes through the SHIPPEC Backend.
 */
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileClock, PackagePlus, RotateCcw, Save } from 'lucide-react';
import { useAuthStore } from '../hooks/useAuthStore';
import { dhlShipmentService, type DraftListRow } from '../services/dhlShipment.service';
import { useShipmentWizard } from '../components/CreateShipment/useShipmentWizard';
import { Button, Note, Skeleton, Stepper } from '../components/CreateShipment/ui';
import { StepCustoms, StepDetails, StepPackages, StepParties, StepPayment } from '../components/CreateShipment/FormSteps';
import { StepService } from '../components/CreateShipment/StepService';
import { StepPickup } from '../components/CreateShipment/StepPickup';
import { StepReview } from '../components/CreateShipment/StepReview';
import { CreateOutcome } from '../components/CreateShipment/CreateOutcome';
import { canShipment, countryName, stepMissing, type StepId } from '../components/CreateShipment/wizardModel';

const STATUS_AR: Record<string, string> = { draft: 'مسودة', validated: 'تم التحقق', ready: 'مؤكدة', failed: 'رفضتها DHL', uncertain: 'غير مؤكدة', created: 'أُنشئت', cancelled: 'ملغاة' };

function DraftsPanel() {
  const [rows, setRows] = useState<DraftListRow[] | null>(null);
  useEffect(() => {
    dhlShipmentService.listDrafts({ limit: 30 }).then(
      (r) => setRows((r?.data ?? []).filter((x) => ['draft', 'validated', 'ready', 'failed', 'uncertain'].includes(x.creation_status)).slice(0, 8)),
      () => setRows([]),
    );
  }, []);
  if (!rows || !rows.length) return null;
  return (
    <details className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 group">
      <summary className="cursor-pointer text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2"><FileClock size={16} className="text-indigo-600" /> مسودات محفوظة ({rows.length})</summary>
      <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
        {rows.map((r) => (
          <li key={r.id} className="py-2.5 flex flex-wrap items-center gap-2 justify-between">
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{r.client_name || r.receiver_company || r.receiver_contact || `شحنة #${r.id}`}</div>
              <div className="text-[11px] text-slate-500">{STATUS_AR[r.creation_status] ?? r.creation_status} · {countryName(r.receiver_country_code)}{r.receiver_city ? ` — ${r.receiver_city}` : ''} · {r.shipment_date ?? '—'}</div>
            </div>
            <Link to={`/create-shipment?draft=${r.id}`} className="text-xs font-bold text-indigo-600 hover:underline">متابعة</Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export const CreateShipmentPage: React.FC = () => {
  const [params] = useSearchParams();
  const draftId = Number(params.get('draft')) || null;
  return <Wizard key={draftId ?? 'new'} draftId={draftId} />;
};

function Wizard({ draftId }: { draftId: number | null }) {
  const role = useAuthStore((s) => s.user?.role);
  const w = useShipmentWizard({ draftId });
  const { form, step, setStep, steps } = w;
  const idx = steps.findIndex((s) => s.id === step);

  // A step that disappeared (customs no longer needed) → the next visible one.
  useEffect(() => {
    if (idx < 0) setStep('packages');
  }, [idx, setStep]);
  // First time on «الخدمة والسعر»: ask DHL for the services once.
  const [askedServices, setAskedServices] = useState(false);
  useEffect(() => {
    if (step === 'service' && !askedServices && !w.products && !w.servicesLoading) {
      setAskedServices(true);
      void w.fetchServices();
    }
  }, [step, askedServices, w]);
  useEffect(() => { window.scrollTo?.({ top: 0 }); }, [step]);

  if (!canShipment(role, 'create_draft') && !draftId) {
    return <Note tone="warn">إنشاء الشحنات متاح للموظفين والمدراء. يمكنك متابعة الشحنات من «متابعة البوليصة».</Note>;
  }
  if (w.loading) {
    return <div className="space-y-4" role="status" aria-label="جاري تحميل المسودة"><Skeleton className="h-16" /><Skeleton className="h-72" /></div>;
  }
  if (w.loadError) {
    return <Note tone="error" title="تعذر تحميل المسودة">{w.loadError} <Link to="/create-shipment" className="underline font-bold">شحنة جديدة</Link></Note>;
  }

  const status = (s: StepId) => {
    if ((w.stepIssues[s] ?? 0) > 0) return 'issues' as const;
    const i = steps.findIndex((x) => x.id === s);
    if (s === 'review') return 'todo' as const;
    if (stepMissing(form, s).length) return i < idx ? ('missing' as const) : ('todo' as const);
    return i < idx ? ('done' as const) : ('todo' as const);
  };
  const go = (s: StepId) => { if (steps.some((x) => x.id === s)) setStep(s); };
  const next = () => { if (idx < steps.length - 1) setStep(steps[idx + 1].id); };
  const back = () => { if (idx > 0) setStep(steps[idx - 1].id); };
  const missing = stepMissing(form, step);

  if (w.result) {
    return (
      <div className="space-y-5 min-w-0" dir="rtl">
        <header><h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><PackagePlus className="text-indigo-600" /> إنشاء شحنة</h1></header>
        <CreateOutcome
          result={w.result}
          estimatedDelivery={w.quote?.deliveryCapabilities?.estimatedDeliveryDateAndTime ?? w.quote?.estimatedDelivery ?? null}
          onNew={w.reset}
          onEdit={() => { w.setResult(null); setStep('parties'); }}
          onResolved={(sh) => { w.setShipment(sh); w.setResult({ ...w.result!, shipment: sh, outcome: sh.creation_status === 'created' ? 'created' : 'failed', awb: sh.awb, creation_error: { code: sh.creation_error_code, message: sh.creation_error_message } }); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0 pb-24" dir="rtl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><PackagePlus className="text-indigo-600" /> إنشاء شحنة</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            شحنة DHL Express من SHIPPEC مباشرة{w.shipment ? <> · <span className="font-mono text-xs whitespace-nowrap" dir="ltr">{w.shipment.shippec_reference}</span></> : null}
            {w.shipment?.dhl_env === 'test' && <span className="ms-2 px-2 py-0.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-100 text-[10px] font-bold">بيئة اختبار DHL</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {w.shipment && <Button variant="ghost" onClick={() => { if (!w.dirty || window.confirm('توجد تعديلات غير محفوظة — بدء شحنة جديدة؟')) w.reset(); }}><RotateCcw size={16} /> جديدة</Button>}
          <Button variant="secondary" onClick={() => void w.save(false)} loading={w.saving} disabled={!w.dirty && !!w.shipment}>
            <Save size={16} /> {w.dirty || !w.shipment ? 'حفظ المسودة' : 'محفوظة'}
          </Button>
        </div>
      </header>

      {!draftId && !w.shipment && <DraftsPanel />}

      <Stepper steps={steps} current={step} onGo={go} status={status} />
      {w.shipment && ['uncertain', 'created'].includes(w.shipment.creation_status) && (
        <Note tone="warn">هذه الشحنة {STATUS_AR[w.shipment.creation_status]} لدى DHL — لا يمكن تعديلها من هنا.</Note>
      )}

      <div className="animate-in fade-in">
        {step === 'parties' && <StepParties w={w} />}
        {step === 'details' && <StepDetails w={w} />}
        {step === 'customs' && <StepCustoms w={w} />}
        {step === 'packages' && <StepPackages w={w} />}
        {step === 'payment' && <StepPayment w={w} />}
        {step === 'service' && <StepService w={w} />}
        {step === 'pickup' && <StepPickup w={w} />}
        {step === 'review' && <StepReview w={w} onGo={go} />}
      </div>

      {step !== 'review' && (
        <div className="sticky bottom-0 z-10">
          <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur shadow-lg p-3 flex items-center gap-2 justify-between">
            <Button variant="secondary" onClick={back} disabled={idx <= 0}><ChevronRight size={16} /> السابق</Button>
            <span className="hidden sm:block text-[11px] text-slate-500 truncate" aria-live="polite">
              {missing.length ? `ناقص: ${missing.join('، ')}` : w.dirty ? 'تغييرات غير محفوظة — تُحفظ تلقائيًا عند طلب خدمات DHL' : 'كل التغييرات محفوظة'}
            </span>
            <Button onClick={next}>التالي <ChevronLeft size={16} /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
