/** What DHL answered to the ONE creation request: created, uncertain or rejected. */
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { AlertOctagon, CheckCircle2, Copy, Download, ExternalLink, FileText, HelpCircle, PackageSearch, Pencil, Plus, X } from 'lucide-react';
import { Dialog } from '../shared/Dialog';
import { useAuthStore } from '../../hooks/useAuthStore';
import { dhlShipmentService, type CreateResult, type ShipmentDocument } from '../../services/dhlShipment.service';
import { downloadBlob } from '../../utils/download';
import { describeApiError } from '../../utils/apiErrors';
import { Button, Field, Note, Section, Stat, TextInput } from './ui';
import { canShipment, money } from './wizardModel';

const DOC_LABEL: Record<string, string> = {
  shipping_label: 'ملصق الشحن', waybill: 'بوليصة الشحن (Waybill)', commercial_invoice: 'الفاتورة التجارية', proforma_invoice: 'الفاتورة المبدئية', other: 'مستند DHL',
};
const formatAwb = (a: string) => (/^\d{10}$/.test(a) ? `${a.slice(0, 3)} ${a.slice(3, 6)} ${a.slice(6)}` : a);

function DocumentButton({ shipmentId, d }: { shipmentId: number; d: ShipmentDocument }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button variant="secondary" loading={busy} onClick={async () => {
      setBusy(true);
      try {
        const { blob, filename } = await dhlShipmentService.downloadDocument(shipmentId, d.id);
        downloadBlob(filename, blob);
      } catch (e) { toast.error(describeApiError(e, 'تعذر تنزيل المستند')); }
      finally { setBusy(false); }
    }}>
      <Download size={16} /> {DOC_LABEL[d.document_type] ?? d.document_type}
    </Button>
  );
}

function ResolveDialog({ open, onClose, shipmentId, onDone }: { open: boolean; onClose: () => void; shipmentId: number; onDone: (r: CreateResult['shipment']) => void }) {
  const hid = useId();
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
      toast.success(outcome === 'created' ? 'تم تسجيل الشحنة كمُنشأة' : 'تم تسجيل أن DHL لم تُنشئ الشحنة');
      onClose();
    } catch (e) { setError(describeApiError(e, 'تعذر التسوية')); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onRequestClose={onClose} labelledBy={hid} panelClassName="sm:max-w-md">
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between"><h2 id={hid} className="text-lg font-extrabold">تسوية شحنة غير مؤكدة</h2><button type="button" onClick={onClose} aria-label="إغلاق"><X size={18} /></button></div>
        <Note tone="warn">تحقق أولًا من DHL (MyDHL+ أو البحث بمرجع SHIPPEC) ثم سجّل ما وجدته. لا يُرسل أي طلب إنشاء جديد.</Note>
        <div className="flex gap-2" role="radiogroup" aria-label="النتيجة">
          {(['created', 'not_created'] as const).map((o) => (
            <button key={o} type="button" role="radio" aria-checked={outcome === o} onClick={() => setOutcome(o)}
              className={`flex-1 px-3 py-2 rounded-xl border text-sm font-bold ${outcome === o ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200'}`}>
              {o === 'created' ? 'أنشأتها DHL' : 'لم تُنشئها DHL'}
            </button>
          ))}
        </div>
        {outcome === 'created' && <Field label="رقم البوليصة" required>{(id) => <TextInput id={id} value={awb} onValue={setAwb} ltr inputMode="numeric" placeholder="10 أرقام" />}</Field>}
        <Field label="الدليل" required hint="مثل: نتيجة البحث بالمرجع في MyDHL+ (10 أحرف على الأقل)">{(id) => <TextInput id={id} value={evidence} onValue={setEvidence} />}</Field>
        {error && <Note tone="error">{error}</Note>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>إلغاء</Button><Button onClick={() => void submit()} loading={busy} disabled={evidence.trim().length < 10 || (outcome === 'created' && awb.replace(/\D/g, '').length !== 10)}>تسجيل</Button></div>
      </div>
    </Dialog>
  );
}

export function CreateOutcome({ result, onNew, onEdit, onResolved, estimatedDelivery }: {
  result: CreateResult; onNew: () => void; onEdit: () => void; onResolved: (s: CreateResult['shipment']) => void; estimatedDelivery: string | null;
}) {
  const role = useAuthStore((s) => s.user?.role);
  const [resolveOpen, setResolveOpen] = useState(false);
  const sh = result.shipment;
  const canDownload = canShipment(role, 'download_documents');

  if (result.outcome === 'created') {
    return (
      <div className="space-y-4" data-outcome="created">
        <section className="rounded-3xl border-2 border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/15 p-5 sm:p-8 text-center">
          <CheckCircle2 size={44} className="mx-auto text-green-600" />
          <h2 className="mt-2 text-xl font-extrabold text-green-900 dark:text-green-200">تم إنشاء الشحنة لدى DHL</h2>
          <div className="mt-3 text-[11px] font-bold text-green-800/70">رقم البوليصة AWB</div>
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="font-mono text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white" dir="ltr">{formatAwb(result.awb ?? '')}</span>
            <button type="button" aria-label="نسخ رقم البوليصة" className="p-2 rounded-xl hover:bg-white/60" onClick={() => void navigator.clipboard?.writeText(result.awb ?? '').then(() => toast.success('تم النسخ'))}><Copy size={18} /></button>
          </div>
          {result.replayed && <p className="mt-2 text-xs text-green-800">هذه الشحنة أُنشئت سابقًا — لم يُرسل طلب جديد إلى DHL.</p>}
        </section>
        <Section title="تفاصيل الشحنة">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Stat label="فاتورة SHIPPEC" value={result.invoice.id ? <Link className="text-indigo-600 hover:underline inline-flex items-center gap-1" to={`/invoices?invoice=${result.invoice.id}`}>{result.invoice.number ?? `#${result.invoice.id}`} <ExternalLink size={12} /></Link> : '—'} />
            <Stat label="خدمة DHL" value={<span dir="ltr">{sh.product_name ?? sh.product_code}</span>} />
            <Stat label="التسليم المتوقع" value={estimatedDelivery ? estimatedDelivery.slice(0, 10).split('-').reverse().join('/') : '—'} />
            <Stat label="سعر البيع" value={money(sh.selling_price != null ? Number(sh.selling_price) : null)} />
            <Stat label="تكلفة DHL" value={money(sh.dhl_cost != null ? Number(sh.dhl_cost) : null)} />
            <Stat label="مرجع SHIPPEC" value={<span dir="ltr" className="font-mono text-xs">{result.shippec_reference}</span>} />
            {result.pickup ? <Stat label="تأكيد الاستلام" value={result.pickup.dispatch_confirmation_number ? <span dir="ltr" className="font-mono">{result.pickup.dispatch_confirmation_number}</span> : result.pickup.status === 'uncertain' ? 'غير مؤكد — راجع DHL' : '—'} />
              : <Stat label="الاستلام" value={sh.pickup_option === 'drop_off' ? `تسليم في نقطة خدمة DHL${sh.service_point_name ? `: ${sh.service_point_name}` : ''}` : 'بدون استلام — يُسلَّم لمندوب DHL المعتاد'} />}
            {result.paperless_trade.status !== 'not_required' && <Stat label="Paperless Trade" value={result.paperless_trade.status === 'pending' ? 'يُرفع بعد 10 دقائق' : result.paperless_trade.status === 'uploaded' ? 'تم الرفع' : result.paperless_trade.status === 'uploading' ? 'جارٍ الرفع' : 'فشل الرفع — يحتاج متابعة'} />}
          </div>
          {result.invoice.link_status === 'failed' && <div className="mt-3"><Note tone="warn" title="الشحنة أُنشئت لكن الفاتورة لم تُنشأ">{result.invoice.error ?? ''} — يمكن للمحاسب إعادة إنشاء الفاتورة فقط دون أي طلب جديد إلى DHL.</Note></div>}
          {result.documents_failed > 0 && <div className="mt-3"><Note tone="warn">تعذر حفظ {result.documents_failed} من مستندات DHL — الشحنة سليمة.</Note></div>}
        </Section>
        <Section title="المستندات" icon={<FileText size={18} className="text-indigo-600" />}>
          {canDownload ? (
            <div className="flex flex-wrap gap-2">{result.documents.map((d) => <DocumentButton key={d.id} shipmentId={sh.id} d={d} />)}{!result.documents.length && <span className="text-sm text-slate-500">لا توجد مستندات محفوظة.</span>}</div>
          ) : <p className="text-sm text-slate-500">تنزيل المستندات غير متاح لدورك.</p>}
        </Section>
        <div className="flex flex-wrap gap-2">
          {result.invoice.id && <Link to={`/invoices?invoice=${result.invoice.id}`} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold min-h-[44px]"><FileText size={16} /> فتح الفاتورة</Link>}
          {result.awb && <Link to={`/shipment-tracking/${result.awb}`} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold min-h-[44px]"><PackageSearch size={16} /> متابعة الشحنة</Link>}
          <Button onClick={onNew}><Plus size={16} /> إنشاء شحنة أخرى</Button>
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
          <h2 className="mt-2 text-xl font-extrabold text-amber-900 dark:text-amber-200">تم إرسال طلب الشحنة إلى DHL ولكن لم نستطع تأكيد النتيجة بعد</h2>
          <p className="mt-2 text-sm font-bold text-amber-900 dark:text-amber-200">لا تحاول إنشاء الشحنة مرة أخرى — قد تكون DHL أنشأتها بالفعل.</p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Stat label="مرجع SHIPPEC (للبحث لدى DHL)" value={<span dir="ltr" className="font-mono">{result.shippec_reference}</span>} />
            <Stat label="مرجع الطلب" value={<span dir="ltr" className="font-mono text-xs break-all">{result.message_reference ?? '—'}</span>} />
          </div>
          <p className="mt-3 text-xs text-amber-800 dark:text-amber-300">يتحقق المدير من DHL ثم يسجّل النتيجة. لن يُعاد إرسال الطلب تلقائيًا أبدًا.</p>
        </section>
        <div className="flex flex-wrap gap-2">
          {canResolve && <Button onClick={() => setResolveOpen(true)}>تسوية الشحنة</Button>}
          <Button variant="secondary" onClick={onNew}><Plus size={16} /> شحنة جديدة</Button>
        </div>
        <ResolveDialog open={resolveOpen} onClose={() => setResolveOpen(false)} shipmentId={sh.id} onDone={onResolved} />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-outcome="failed">
      <section className="rounded-3xl border-2 border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/15 p-5 sm:p-8">
        <AlertOctagon size={40} className="text-red-600" />
        <h2 className="mt-2 text-xl font-extrabold text-red-900 dark:text-red-200">رفضت DHL إنشاء الشحنة</h2>
        <p className="mt-2 text-sm text-red-900 dark:text-red-200">لم تُنشأ أي شحنة لدى DHL. صحّح البيانات ثم أعد المحاولة.</p>
        {result.creation_error?.message && <p className="mt-3 rounded-2xl bg-white/70 dark:bg-slate-900/40 p-3 text-sm font-semibold" dir="auto">{result.creation_error.message}</p>}
      </section>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onEdit}><Pencil size={16} /> تعديل البيانات</Button>
        <Button variant="secondary" onClick={onNew}><Plus size={16} /> شحنة جديدة</Button>
      </div>
    </div>
  );
}
