/** What DHL answered to the ONE creation request when it is NOT a creation: uncertain or rejected. Arabic or English. (Created → CreateShipmentConfirmationPage.) */
import { useId, useState } from 'react';
import { toast } from 'react-hot-toast';
import { AlertOctagon, HelpCircle, Pencil, Plus, X } from 'lucide-react';
import { Dialog } from '../shared/Dialog';
import { useAuthStore } from '../../hooks/useAuthStore';
import { dhlShipmentService, type CreateResult } from '../../services/dhlShipment.service';
import { describeApiError } from '../../utils/apiErrors';
import { Button, Field, Note, Stat, TextInput } from './ui';
import { useCsLang } from './csLang';
import { canShipment } from './wizardModel';

function ResolveDialog({ open, onClose, shipmentId, onDone }: { open: boolean; onClose: () => void; shipmentId: number; onDone: (r: CreateResult['shipment']) => void }) {
  const hid = useId();
  const { t, dir } = useCsLang();
  const [outcome, setOutcome] = useState<'created' | 'not_created'>('created');
  const [awb, setAwb] = useState('');
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await dhlShipmentService.resolve(shipmentId, outcome === 'created' ? { outcome, awb: awb.replace(/\D/g, ''), evidence } : { outcome, evidence });
      onDone(r.shipment);
      toast.success(outcome === 'created' ? t('تم تسجيل الشحنة كمُنشأة', 'The shipment was recorded as created') : t('تم تسجيل أن DHL لم تُنشئ الشحنة', 'Recorded that DHL did not create the shipment'));
      onClose();
    } catch (e) { setError(describeApiError(e, t('تعذر التسوية', 'Could not settle it'))); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onRequestClose={onClose} labelledBy={hid} panelClassName="sm:max-w-md">
      <div className="p-5 space-y-4" dir={dir}>
        <div className="flex items-start justify-between"><h2 id={hid} className="text-lg font-extrabold">{t('تسوية شحنة غير مؤكدة', 'Settle an uncertain shipment')}</h2><button type="button" onClick={onClose} aria-label={t('إغلاق', 'Close')}><X size={18} /></button></div>
        <Note tone="warn">{t('تحقق أولًا من DHL (MyDHL+ أو البحث بمرجع SHIPPEC) ثم سجّل ما وجدته. لا يُرسل أي طلب إنشاء جديد.', 'Check DHL first (MyDHL+ or a search by the SHIPPEC reference), then record what you found. No new creation request is sent.')}</Note>
        <div className="flex gap-2" role="radiogroup" aria-label={t('النتيجة', 'Outcome')}>
          {(['created', 'not_created'] as const).map((o) => (
            <button key={o} type="button" role="radio" aria-checked={outcome === o} onClick={() => setOutcome(o)}
              className={`flex-1 px-3 py-2 rounded-xl border text-sm font-bold ${outcome === o ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200'}`}>
              {o === 'created' ? t('أنشأتها DHL', 'DHL created it') : t('لم تُنشئها DHL', 'DHL did not create it')}
            </button>
          ))}
        </div>
        {outcome === 'created' && <Field label={t('رقم البوليصة', 'AWB')} required>{(id) => <TextInput id={id} value={awb} onValue={setAwb} ltr inputMode="numeric" placeholder={t('10 أرقام', '10 digits')} />}</Field>}
        <Field label={t('الدليل', 'Evidence')} required hint={t('مثل: نتيجة البحث بالمرجع في MyDHL+ (10 أحرف على الأقل)', 'e.g. the result of the reference search in MyDHL+ (at least 10 characters)')}>{(id) => <TextInput id={id} value={evidence} onValue={setEvidence} />}</Field>
        {error && <Note tone="error">{error}</Note>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button><Button onClick={() => void submit()} loading={busy} disabled={evidence.trim().length < 10 || (outcome === 'created' && awb.replace(/\D/g, '').length !== 10)}>{t('تسجيل', 'Record')}</Button></div>
      </div>
    </Dialog>
  );
}

export function CreateOutcome({ result, onNew, onEdit, onResolved }: {
  result: CreateResult; onNew: () => void; onEdit: () => void; onResolved: (s: CreateResult['shipment']) => void;
}) {
  const { t } = useCsLang();
  const role = useAuthStore((s) => s.user?.role);
  const [resolveOpen, setResolveOpen] = useState(false);
  const sh = result.shipment;

  // `created` never renders here: the wizard opens the confirmation page (/create-shipment/success/:id).

  if (result.outcome === 'uncertain') {
    const canResolve = canShipment(role, 'resolve_uncertain');
    return (
      <div className="space-y-4" data-outcome="uncertain">
        <section className="rounded-3xl border-2 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/15 p-5 sm:p-8">
          <HelpCircle size={40} className="text-amber-600" />
          <h2 className="mt-2 text-xl font-extrabold text-amber-900 dark:text-amber-200">{t('تم إرسال طلب الشحنة إلى DHL ولكن لم نستطع تأكيد النتيجة بعد', 'The shipment request was sent to DHL but the result could not be confirmed yet')}</h2>
          <p className="mt-2 text-sm font-bold text-amber-900 dark:text-amber-200">{t('لا تحاول إنشاء الشحنة مرة أخرى — قد تكون DHL أنشأتها بالفعل.', 'Do not try to create the shipment again — DHL may already have created it.')}</p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Stat label={t('مرجع SHIPPEC (للبحث لدى DHL)', 'SHIPPEC reference (to search at DHL)')} value={<span dir="ltr" className="font-mono">{result.shippec_reference}</span>} />
            <Stat label={t('مرجع الطلب', 'Request reference')} value={<span dir="ltr" className="font-mono text-xs break-all">{result.message_reference ?? '—'}</span>} />
          </div>
          <p className="mt-3 text-xs text-amber-800 dark:text-amber-300">{t('يتحقق المدير من DHL ثم يسجّل النتيجة. لن يُعاد إرسال الطلب تلقائيًا أبدًا.', 'A manager checks DHL and records the result. The request is never re-sent automatically.')}</p>
        </section>
        <div className="flex flex-wrap gap-2">
          {canResolve && <Button onClick={() => setResolveOpen(true)}>{t('تسوية الشحنة', 'Settle the shipment')}</Button>}
          <Button variant="secondary" onClick={onNew}><Plus size={16} /> {t('شحنة جديدة', 'New shipment')}</Button>
        </div>
        <ResolveDialog open={resolveOpen} onClose={() => setResolveOpen(false)} shipmentId={sh.id} onDone={onResolved} />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-outcome="failed">
      <section className="rounded-3xl border-2 border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/15 p-5 sm:p-8">
        <AlertOctagon size={40} className="text-red-600" />
        <h2 className="mt-2 text-xl font-extrabold text-red-900 dark:text-red-200">{t('رفضت DHL إنشاء الشحنة', 'DHL refused to create the shipment')}</h2>
        <p className="mt-2 text-sm text-red-900 dark:text-red-200">{t('لم تُنشأ أي شحنة لدى DHL. صحّح البيانات ثم أعد المحاولة.', 'No shipment was created at DHL. Correct the data and try again.')}</p>
        {result.creation_error?.message && <p className="mt-3 rounded-2xl bg-white/70 dark:bg-slate-900/40 p-3 text-sm font-semibold" dir="auto">{result.creation_error.message}</p>}
      </section>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onEdit}><Pencil size={16} /> {t('تعديل البيانات', 'Edit the data')}</Button>
        <Button variant="secondary" onClick={onNew}><Plus size={16} /> {t('شحنة جديدة', 'New shipment')}</Button>
      </div>
    </div>
  );
}
