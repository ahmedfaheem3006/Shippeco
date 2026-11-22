/** What DHL answered to the ONE creation request: created, uncertain or rejected. Arabic or English. */
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { AlertOctagon, CheckCircle2, Copy, Download, ExternalLink, FileText, HelpCircle, PackageSearch, Pencil, Plus, X } from 'lucide-react';
import { Dialog } from '../shared/Dialog';
import { useAuthStore } from '../../hooks/useAuthStore';
import { dhlShipmentService, type CreateResult, type ShipmentDocument } from '../../services/dhlShipment.service';
import { downloadBlob } from '../../utils/download';
import { displayAwb } from '../../utils/awb';
import { describeApiError } from '../../utils/apiErrors';
import { Button, Field, Note, Section, Stat, TextInput } from './ui';
import { useCsLang } from './csLang';
import { canShipment, money } from './wizardModel';

const DOC_LABEL: Record<string, [string, string]> = {
  shipping_label: ['ملصق الشحن', 'Shipping label'], waybill: ['بوليصة الشحن (Waybill)', 'Waybill'], commercial_invoice: ['الفاتورة التجارية', 'Commercial invoice'],
  proforma_invoice: ['الفاتورة المبدئية', 'Proforma invoice'], other: ['مستند DHL', 'DHL document'],
};
/** The AWB exactly as DHL issued it — never split into digit groups. */
const formatAwb = (a: string) => displayAwb(a);

function DocumentButton({ shipmentId, d }: { shipmentId: number; d: ShipmentDocument }) {
  const { t } = useCsLang();
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="secondary" loading={busy} onClick={async () => {
      setBusy(true);
      try {
        const { blob, filename } = await dhlShipmentService.downloadDocument(shipmentId, d.id);
        downloadBlob(filename, blob);
      } catch (e) { toast.error(describeApiError(e, t('تعذر تنزيل المستند', 'Could not download the document'))); }
      finally { setBusy(false); }
    }}>
      <Download size={16} /> {DOC_LABEL[d.document_type] ? t(...DOC_LABEL[d.document_type]) : d.document_type}
    </Button>
  );
}

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

export function CreateOutcome({ result, onNew, onEdit, onResolved, estimatedDelivery }: {
  result: CreateResult; onNew: () => void; onEdit: () => void; onResolved: (s: CreateResult['shipment']) => void; estimatedDelivery: string | null;
}) {
  const { t, lang } = useCsLang();
  const role = useAuthStore((s) => s.user?.role);
  const [resolveOpen, setResolveOpen] = useState(false);
  const sh = result.shipment;
  const canDownload = canShipment(role, 'download_documents');
  const m = (n: number | null) => money(n, 'SAR', lang);
  const plt = result.paperless_trade.status;

  if (result.outcome === 'created') {
    return (
      <div className="space-y-4" data-outcome="created">
        <section className="rounded-3xl border-2 border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/15 p-5 sm:p-8 text-center">
          <CheckCircle2 size={44} className="mx-auto text-green-600" />
          <h2 className="mt-2 text-xl font-extrabold text-green-900 dark:text-green-200">{t('تم إنشاء الشحنة لدى DHL', 'The shipment was created at DHL')}</h2>
          <div className="mt-3 text-[11px] font-bold text-green-800/70">{t('رقم البوليصة AWB', 'AWB number')}</div>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="font-mono text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white" dir="ltr">{formatAwb(result.awb ?? '')}</span>
            <button type="button" aria-label={t('نسخ رقم البوليصة', 'Copy the AWB')} className="p-2 rounded-xl hover:bg-white/60" onClick={() => void navigator.clipboard?.writeText(result.awb ?? '').then(() => toast.success(t('تم النسخ', 'Copied')))}><Copy size={18} /></button>
          </div>
          {result.replayed && <p className="mt-2 text-xs text-green-800">{t('هذه الشحنة أُنشئت سابقًا — لم يُرسل طلب جديد إلى DHL.', 'This shipment was created earlier — no new request was sent to DHL.')}</p>}
        </section>
        <Section title={t('تفاصيل الشحنة', 'Shipment details')}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label={t('فاتورة SHIPPEC', 'SHIPPEC invoice')} value={result.invoice.id ? <Link className="text-indigo-600 hover:underline inline-flex items-center gap-1" to={`/invoices?invoice=${result.invoice.id}`}>{result.invoice.number ?? `#${result.invoice.id}`} <ExternalLink size={12} /></Link> : '—'} />
            <Stat label={t('خدمة DHL', 'DHL service')} value={<span dir="ltr">{sh.product_name ?? sh.product_code}</span>} />
            <Stat label={t('التسليم المتوقع', 'Estimated delivery')} value={estimatedDelivery ? estimatedDelivery.slice(0, 10).split('-').reverse().join('/') : '—'} />
            <Stat label={t('سعر البيع', 'Selling price')} value={m(sh.selling_price != null ? Number(sh.selling_price) : null)} />
            <Stat label={t('تكلفة DHL', 'DHL cost')} value={m(sh.dhl_cost != null ? Number(sh.dhl_cost) : null)} />
            <Stat label={t('مرجع SHIPPEC', 'SHIPPEC reference')} value={<span dir="ltr" className="font-mono text-xs">{result.shippec_reference}</span>} />
            {result.pickup ? <Stat label={t('تأكيد الاستلام', 'Pickup confirmation')} value={result.pickup.dispatch_confirmation_number ? <span dir="ltr" className="font-mono">{result.pickup.dispatch_confirmation_number}</span> : result.pickup.status === 'uncertain' ? t('غير مؤكد — راجع DHL', 'Uncertain — check DHL') : '—'} />
              : <Stat label={t('الاستلام', 'Pickup')} value={sh.pickup_option === 'drop_off' ? t(`تسليم في نقطة خدمة DHL${sh.service_point_name ? `: ${sh.service_point_name}` : ''}`, `Drop-off at a DHL Service Point${sh.service_point_name ? `: ${sh.service_point_name}` : ''}`) : t('بدون استلام — يُسلَّم لمندوب DHL المعتاد', 'No pickup — handed to the regular DHL courier')} />}
            {plt !== 'not_required' && <Stat label="Paperless Trade" value={plt === 'pending' ? t('يُرفع بعد 10 دقائق', 'Uploaded after 10 minutes') : plt === 'uploaded' ? t('تم الرفع', 'Uploaded') : plt === 'uploading' ? t('جارٍ الرفع', 'Uploading') : t('فشل الرفع — يحتاج متابعة', 'Upload failed — needs follow-up')} />}
          </div>
          {result.invoice.link_status === 'failed' && <div className="mt-3"><Note tone="warn" title={t('الشحنة أُنشئت لكن الفاتورة لم تُنشأ', 'The shipment was created but the invoice was not')}>{result.invoice.error ?? ''} — {t('يمكن للمحاسب إعادة إنشاء الفاتورة فقط دون أي طلب جديد إلى DHL.', 'An accountant can retry only the invoice, without any new request to DHL.')}</Note></div>}
          {result.documents_failed > 0 && <div className="mt-3"><Note tone="warn">{t(`تعذر حفظ ${result.documents_failed} من مستندات DHL — الشحنة سليمة.`, `${result.documents_failed} DHL document(s) could not be stored — the shipment is fine.`)}</Note></div>}
        </Section>
        <Section title={t('المستندات', 'Documents')} icon={<FileText size={18} className="text-indigo-600" />}>
          {canDownload ? (
            <div className="flex flex-wrap gap-2">{result.documents.map((d) => <DocumentButton key={d.id} shipmentId={sh.id} d={d} />)}{!result.documents.length && <span className="text-sm text-slate-500">{t('لا توجد مستندات محفوظة.', 'No stored documents.')}</span>}</div>
          ) : <p className="text-sm text-slate-500">{t('تنزيل المستندات غير متاح لدورك.', 'Downloading documents is not available to your role.')}</p>}
        </Section>
        <div className="flex flex-wrap gap-2">
          {result.invoice.id && <Link to={`/invoices?invoice=${result.invoice.id}`} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold min-h-[44px]"><FileText size={16} /> {t('فتح الفاتورة', 'Open the invoice')}</Link>}
          {result.awb && <Link to={`/shipment-tracking/${result.awb}`} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold min-h-[44px]"><PackageSearch size={16} /> {t('متابعة الشحنة', 'Track the shipment')}</Link>}
          <Button onClick={onNew}><Plus size={16} /> {t('إنشاء شحنة أخرى', 'Create another shipment')}</Button>
        </div>
      </div>
    );
  }

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
