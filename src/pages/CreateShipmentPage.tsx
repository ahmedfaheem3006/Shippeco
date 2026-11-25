/**
 * «إنشاء شحنة» — the DHL Express shipment wizard (route /create-shipment,
 * resume with ?draft=ID). Every DHL step goes through the SHIPPEC Backend.
 * The page has its own AR | EN switch (this page only — the rest of SHIPPEC
 * keeps its language); Arabic is RTL, English LTR, and the data never changes
 * with the language.
 */
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileClock, PackagePlus, RotateCcw, Save } from 'lucide-react';
import { useAuthStore } from '../hooks/useAuthStore';
import { dhlShipmentService, type DraftListRow } from '../services/dhlShipment.service';
import { useShipmentWizard } from '../components/CreateShipment/useShipmentWizard';
import { Button, Note, Skeleton, Stepper } from '../components/CreateShipment/ui';
import { StepPackages } from '../components/CreateShipment/FormSteps';
import { StepPayment } from '../components/CreateShipment/PaymentStep';
import { StepCustoms } from '../components/CreateShipment/CustomsStep';
import { StepDetails } from '../components/CreateShipment/DetailsStep';
import { StepParties } from '../components/CreateShipment/PartiesStep';
import { StepService } from '../components/CreateShipment/StepService';
import { pickupCapabilitiesOf, StepPickup } from '../components/CreateShipment/StepPickup';
import { StepReview } from '../components/CreateShipment/StepReview';
import { CreateOutcome } from '../components/CreateShipment/CreateOutcome';
import { CsLangProvider, LangToggle } from '../components/CreateShipment/i18n';
import { useCsLang } from '../components/CreateShipment/csLang';
import { canShipment, countryName, customsGate, detailsGate, partiesGate, paymentGate, pickupGate, serviceGate, stepMissing, type FieldErrors, type StepId } from '../components/CreateShipment/wizardModel';

const STATUS: Record<string, [string, string]> = {
  draft: ['مسودة', 'Draft'], validated: ['تم التحقق', 'Validated'], ready: ['مؤكدة', 'Confirmed'], failed: ['رفضتها DHL', 'Refused by DHL'],
  uncertain: ['غير مؤكدة', 'Uncertain'], created: ['أُنشئت', 'Created'], cancelled: ['ملغاة', 'Cancelled'],
};

function DraftsPanel() {
  const { t, lang } = useCsLang();
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
      <summary className="cursor-pointer text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2"><FileClock size={16} className="text-indigo-600" /> {t(`مسودات محفوظة (${rows.length})`, `Saved drafts (${rows.length})`)}</summary>
      <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-700">
        {rows.map((r) => (
          <li key={r.id} className="py-2.5 flex flex-wrap items-center gap-2 justify-between">
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{r.client_name || r.receiver_company || r.receiver_contact || t(`شحنة #${r.id}`, `Shipment #${r.id}`)}</div>
              <div className="text-[11px] text-slate-500">{STATUS[r.creation_status] ? t(...STATUS[r.creation_status]) : r.creation_status} · {countryName(r.receiver_country_code, lang)}{r.receiver_city ? ` — ${r.receiver_city}` : ''} · {r.shipment_date ?? '—'}</div>
            </div>
            <Link to={`/create-shipment?draft=${r.id}`} className="text-xs font-bold text-indigo-600 hover:underline">{t('متابعة', 'Continue')}</Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

export const CreateShipmentPage: React.FC = () => {
  const [params] = useSearchParams();
  const draftId = Number(params.get('draft')) || null;
  return (
    <CsLangProvider>
      <Wizard key={draftId ?? 'new'} draftId={draftId} />
    </CsLangProvider>
  );
};

function Title() {
  const { t } = useCsLang();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><PackagePlus className="text-indigo-600" /> {t('إنشاء شحنة', 'Create Shipment')}</h1>
      <LangToggle />
    </div>
  );
}

function Wizard({ draftId }: { draftId: number | null }) {
  const role = useAuthStore((s) => s.user?.role);
  const { t, lang, dir } = useCsLang();
  const w = useShipmentWizard({ draftId });
  const { form, step, setStep, steps } = w;
  const idx = steps.findIndex((s) => s.id === step);
  /** After a blocked Next, the missing required fields of that screen are marked (Parties, Shipment Details, Customs Invoice, Payment, Pickup). */
  const [gated, setGated] = useState<Partial<Record<StepId, boolean>>>({});

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
    return <div dir={dir}><Note tone="warn">{t('إنشاء الشحنات متاح للموظفين والمدراء. يمكنك متابعة الشحنات من «متابعة البوليصة».', 'Creating shipments is available to employees and managers. You can follow shipments in «Shipment tracking».')}</Note></div>;
  }
  if (w.loading) {
    return <div className="space-y-4" role="status" aria-label={t('جاري تحميل المسودة', 'Loading the draft')}><Skeleton className="h-16" /><Skeleton className="h-72" /></div>;
  }
  if (w.loadError) {
    return <div dir={dir}><Note tone="error" title={t('تعذر تحميل المسودة', 'Could not load the draft')}>{w.loadError} <Link to="/create-shipment" className="underline font-bold">{t('شحنة جديدة', 'New shipment')}</Link></Note></div>;
  }

  const status = (s: StepId) => {
    if ((w.stepIssues[s] ?? 0) > 0) return 'issues' as const;
    const i = steps.findIndex((x) => x.id === s);
    if (s === 'review') return 'todo' as const;
    if (stepMissing(form, s).length) return i < idx ? ('missing' as const) : ('todo' as const);
    return i < idx ? ('done' as const) : ('todo' as const);
  };
  /**
   * Leaving a gated screen forward (Next or the stepper) needs every required field — Parties
   * (customer, From, To), Shipment Details, the Customs Invoice, Payment, then Pickup. A saved contact, an address
   * suggestion or an uploaded item file never bypasses this.
   */
  const gateOf = (s: StepId): FieldErrors => (
    s === 'parties' ? partiesGate(form, lang) : s === 'details' ? detailsGate(form, lang) : s === 'customs' ? customsGate(form, lang)
      : s === 'payment' ? paymentGate(form, lang) : s === 'service' ? serviceGate(w.servicesStale && !!w.products?.length, lang)
        : s === 'pickup' ? pickupGate(form, pickupCapabilitiesOf(w), lang) : {}
  );
  const blockedBefore = (target: number) => {
    for (const s of ['parties', 'details', 'customs', 'payment', 'service', 'pickup'] as const) {
      const at = steps.findIndex((x) => x.id === s);
      if (at < 0 || target <= at || !Object.keys(gateOf(s)).length) continue;
      setGated((g) => ({ ...g, [s]: true }));
      if (step !== s) setStep(s);
      window.setTimeout(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus?.(), 0);
      return true;
    }
    return false;
  };
  const go = (s: StepId) => {
    const target = steps.findIndex((x) => x.id === s);
    if (target < 0) return;
    if (blockedBefore(target)) return;
    setStep(s);
  };
  const next = () => { if (idx < steps.length - 1) go(steps[idx + 1].id); };
  const back = () => { if (idx > 0) setStep(steps[idx - 1].id); };
  const missing = stepMissing(form, step, lang);

  if (w.result) {
    return (
      <div className="space-y-5 min-w-0" dir={dir}>
        <header><Title /></header>
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

  const PrevIcon = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;
  const gateCount = gated[step] ? Object.keys(gateOf(step)).length : 0;

  return (
    <div className="space-y-4 sm:space-y-5 min-w-0 pb-24" dir={dir} lang={lang}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Title />
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('شحنة DHL Express من SHIPPEC مباشرة', 'A DHL Express shipment straight from SHIPPEC')}{w.shipment ? <> · <span className="font-mono text-xs whitespace-nowrap" dir="ltr">{w.shipment.shippec_reference}</span></> : null}
            {w.shipment?.dhl_env === 'test' && <span className="ms-2 px-2 py-0.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-100 text-[10px] font-bold">{t('بيئة اختبار DHL', 'DHL test environment')}</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {w.shipment && <Button variant="ghost" onClick={() => { if (!w.dirty || window.confirm(t('توجد تعديلات غير محفوظة — بدء شحنة جديدة؟', 'There are unsaved changes — start a new shipment?'))) w.reset(); }}><RotateCcw size={16} /> {t('جديدة', 'New')}</Button>}
          <Button variant="secondary" onClick={() => void w.save(false)} loading={w.saving} disabled={!w.dirty && !!w.shipment}>
            <Save size={16} /> {w.dirty || !w.shipment ? t('حفظ المسودة', 'Save draft') : t('محفوظة', 'Saved')}
          </Button>
        </div>
      </header>

      {!draftId && !w.shipment && <DraftsPanel />}

      <Stepper steps={steps} current={step} onGo={go} status={status} />
      {w.shipment && ['uncertain', 'created'].includes(w.shipment.creation_status) && (
        <Note tone="warn">{t(`هذه الشحنة ${STATUS[w.shipment.creation_status]?.[0]} لدى DHL — لا يمكن تعديلها من هنا.`, `This shipment is ${STATUS[w.shipment.creation_status]?.[1]?.toLowerCase()} at DHL — it cannot be edited here.`)}</Note>
      )}

      <div className="animate-in fade-in">
        {step === 'parties' && <StepParties w={w} showGate={!!gated.parties} />}
        {step === 'details' && <StepDetails w={w} showGate={!!gated.details} />}
        {step === 'customs' && <StepCustoms w={w} showGate={!!gated.customs} />}
        {step === 'packages' && <StepPackages w={w} />}
        {step === 'payment' && <StepPayment w={w} showGate={!!gated.payment} />}
        {step === 'service' && <StepService w={w} />}
        {step === 'pickup' && <StepPickup w={w} onGo={go} showGate={!!gated.pickup} />}
        {step === 'review' && <StepReview w={w} onGo={go} />}
      </div>

      {step !== 'review' && (
        <div className="sticky bottom-0 z-10">
          <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-800/95 backdrop-blur shadow-lg p-3 flex items-center gap-2 justify-between">
            <Button variant="secondary" onClick={back} disabled={idx <= 0}><PrevIcon size={16} /> {t('السابق', 'Back')}</Button>
            {gateCount > 0 ? (
              <span className="min-w-0 text-[11px] sm:text-xs font-bold text-red-600 dark:text-red-400 truncate" role="alert" data-testid="parties-gate-summary">
                {step === 'service' ? gateOf('service').services : t(`أكمل الحقول المطلوبة (${gateCount}) قبل المتابعة.`, `Complete the required fields (${gateCount}) to continue.`)}
              </span>
            ) : (
              <span className="hidden sm:block text-[11px] text-slate-500 truncate" aria-live="polite">
                {missing.length ? `${t('ناقص:', 'Missing:')} ${missing.join(lang === 'en' ? ', ' : '، ')}` : w.dirty ? t('تغييرات غير محفوظة — تُحفظ تلقائيًا عند طلب خدمات DHL', 'Unsaved changes — saved automatically when DHL services are requested') : t('كل التغييرات محفوظة', 'All changes saved')}
              </span>
            )}
            <Button onClick={next}>{t('التالي', 'Next')} <NextIcon size={16} /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
