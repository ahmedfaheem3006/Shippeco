/**
 * Created DHL shipments — what «إنشاء شحنة» offers after DHL created the AWB:
 * the complete documents, Copy, «Create corrected replacement» and «Cancel
 * Shipment». MyDHL REST cannot edit or delete an AWB: nothing here says it
 * does. Every action is re-checked by the Backend.
 */
import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Ban, Download, Printer, RefreshCcw, X } from 'lucide-react';
import { Dialog } from '../shared/Dialog';
import { dhlShipmentService, type ManagedShipmentRow, type ShipmentDetails } from '../../services/dhlShipment.service';
import { describeApiError } from '../../utils/apiErrors';
import { Button, Field, Note } from './ui';
import { useCsLang } from './csLang';
import { LIST_STATUS } from './shipmentManageModel';
import { useDocumentsBundle } from './useShipmentActions';

/** The badge of a shipment: superseded is told apart from cancelled. */
export function StatusBadge({ status, listStatus }: { status: string; listStatus?: string | null }) {
  const { t } = useCsLang();
  const key = status === 'superseded' ? 'superseded' : status === 'cancelled' ? 'cancelled' : listStatus ?? 'ready_to_ship';
  const s = LIST_STATUS[key] ?? LIST_STATUS.ready_to_ship;
  return <span data-testid="shipment-status" data-status={key} className={`inline-flex items-center px-2 py-0.5 rounded-lg border text-[11px] font-bold whitespace-nowrap ${s[2]}`}>{t(s[0], s[1])}</span>;
}

export function BundleButtons({ shipmentId, onDownloaded, primary = true, showPrint = true }: { shipmentId: number; onDownloaded?: () => void; primary?: boolean; showPrint?: boolean }) {
  const { t } = useCsLang();
  const b = useDocumentsBundle(shipmentId);
  return (
    <>
      <Button variant={primary ? 'primary' : 'secondary'} loading={b.busy === 'download'} disabled={!!b.busy} data-testid="download-documents"
        onClick={async () => { if (await b.download()) onDownloaded?.(); }}>
        <Download size={16} /> {t('تنزيل المستندات كاملة', 'Download Documents')}
      </Button>
      {showPrint && (
        <Button variant="secondary" loading={b.busy === 'print'} disabled={!!b.busy} data-testid="reprint-documents" onClick={() => void b.print()}>
          <Printer size={16} /> {t('إعادة طباعة المستندات', 'Reprint Documents')}
        </Button>
      )}
    </>
  );
}

type Target = Pick<ShipmentDetails, 'id' | 'awb'> | Pick<ManagedShipmentRow, 'id' | 'awb'>;

/** «Create corrected replacement»: MyDHL REST cannot change a created AWB — a NEW one is prepared. */
export function ReplacementDialog({ open, onClose, shipment }: { open: boolean; onClose: () => void; shipment: Target }) {
  const hid = useId();
  const { t, dir } = useCsLang();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const d = await dhlShipmentService.replacement(shipment.id);
      navigate(`/create-shipment?draft=${d.id}`);
    } catch (e) {
      setError(describeApiError(e, t('تعذر إنشاء البديل', 'Could not start the replacement')));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onRequestClose={onClose} labelledBy={hid} panelClassName="sm:max-w-lg">
      <div className="p-5 space-y-4" dir={dir} data-testid="replacement-dialog">
        <div className="flex items-start justify-between gap-2">
          <h2 id={hid} className="text-lg font-extrabold">{t('إنشاء بوليصة بديلة بعد التعديل', 'Create corrected replacement')}</h2>
          <button type="button" onClick={onClose} aria-label={t('إغلاق', 'Close')}><X size={18} /></button>
        </div>
        <Note tone="warn" title={t('لا تسمح DHL بتعديل بوليصة أُنشئت', 'DHL does not allow editing a created AWB')}>
          {t(
            `واجهة MyDHL لا تغيّر المرسل أو المستلم أو المحتوى أو الطرود أو الخدمة أو الدافع أو شرط التسليم لبوليصة موجودة. تُفتح مسودة جديدة بنفس البيانات لتعدّلها، ثم تُنشئ DHL بوليصة جديدة. بعد إنشائها تصبح البوليصة ${shipment.awb ?? ''} «مستبدلة» وتبقى في السجل، وتُرجَع فاتورتها إن كانت غير مدفوعة.`,
            `MyDHL cannot change the shipper, receiver, contents, packages, product, payer or Incoterm of an existing AWB. A new draft opens with the same data for you to correct; DHL then creates a NEW AWB. Once it is created, AWB ${shipment.awb ?? ''} becomes «superseded» and stays on record; its invoice is returned when unpaid.`,
          )}
        </Note>
        <p className="text-xs text-slate-500">{t('إن كان للبوليصة القديمة استلام محجوز فيمكنك إلغاؤه من صفحتها بعد ذلك.', 'If the old AWB has a booked pickup, you can cancel it from its page afterwards.')}</p>
        {error && <Note tone="error">{error}</Note>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('رجوع', 'Back')}</Button>
          <Button onClick={() => void go()} loading={busy} data-testid="replacement-confirm"><RefreshCcw size={16} /> {t('متابعة إلى المسودة البديلة', 'Continue to the replacement draft')}</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** «Cancel Shipment»: the DHL courier pickup is cancelled, the shipment cancelled in SHIPPEC — the AWB is never deleted at DHL. */
export function CancelShipmentDialog({ open, onClose, shipment, hasPickup, onDone }: {
  open: boolean; onClose: () => void; shipment: Target; hasPickup: boolean; onDone: (r: Awaited<ReturnType<typeof dhlShipmentService.cancelShipment>>) => void;
}) {
  const hid = useId();
  const { t, dir } = useCsLang();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await dhlShipmentService.cancelShipment(shipment.id, reason.trim());
      toast.success(t('أُلغيت الشحنة في SHIPPEC', 'The shipment was cancelled in SHIPPEC'));
      onDone(r);
      onClose();
    } catch (e) {
      setError(describeApiError(e, t('تعذر إلغاء الشحنة', 'Could not cancel the shipment')));
    } finally {
      setBusy(false);
    }
  };
  const ok = reason.trim().length >= 3 && reason.trim().length <= 200;
  return (
    <Dialog open={open} onRequestClose={onClose} labelledBy={hid} panelClassName="sm:max-w-lg">
      <div className="p-5 space-y-4" dir={dir} data-testid="cancel-shipment-dialog">
        <div className="flex items-start justify-between gap-2">
          <h2 id={hid} className="text-lg font-extrabold flex items-center gap-2"><Ban size={18} className="text-red-600" /> {t('إلغاء الشحنة', 'Cancel Shipment')} <span dir="ltr" className="font-mono text-sm">{shipment.awb}</span></h2>
          <button type="button" onClick={onClose} aria-label={t('إغلاق', 'Close')}><X size={18} /></button>
        </div>
        <Note tone="warn" title={t('ما الذي يحدث بالضبط', 'What exactly happens')}>
          <ul className="list-disc ps-5 space-y-1">
            {hasPickup && <li>{t('يُلغى استلام المندوب المحجوز لدى DHL.', 'The booked DHL courier pickup is cancelled at DHL.')}</li>}
            <li>{t('تُعلَّم الشحنة «ملغاة» في SHIPPEC وتتوقف متابعتها التلقائية.', 'The shipment is marked «cancelled» in SHIPPEC and is no longer tracked automatically.')}</li>
            <li>{t('لا توفّر DHL حذف البوليصة: يبقى رقمها في سجلات DHL لكن لا تُسلَّم الشحنة.', 'DHL offers no way to delete an AWB: it stays in DHL records but is never handed over.')}</li>
            <li>{t('تُرجَع فاتورة SHIPPEC إن كانت غير مدفوعة؛ المدفوعة أو المرحّلة تُحال لمراجعة المدير. لا يُحذف شيء.', 'The SHIPPEC invoice is returned when unpaid; a paid or synced one is flagged for an admin. Nothing is deleted.')}</li>
          </ul>
        </Note>
        <Field label={t('سبب الإلغاء', 'Reason')} required hint={t('3–200 حرف — يُحفظ في سجل الشحنة', '3–200 characters — kept in the shipment history')}>
          {(id) => <textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 text-sm" />}
        </Field>
        {error && <Note tone="error">{error}</Note>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('رجوع', 'Back')}</Button>
          <Button variant="danger" onClick={() => void submit()} loading={busy} disabled={!ok} data-testid="cancel-shipment-confirm"><Ban size={16} /> {t('إلغاء الشحنة', 'Cancel Shipment')}</Button>
        </div>
      </div>
    </Dialog>
  );
}


