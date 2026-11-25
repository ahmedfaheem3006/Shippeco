/**
 * «إنشاء شحنة» → after DHL created the shipment (route /create-shipment/success/:id):
 * the MyDHL+ post-create screens in SHIPPEC's design — documents first
 * (Create Shipment ✓ Pay ✓ Print), then, once «Download Documents» started the
 * browser download, the final «Shipment Confirmation» (?done=1). Every value is
 * what SHIPPEC stored from DHL's answer: AWB, piece ids, pickup confirmation and
 * window, the documents DHL returned. Nothing is invented; no DHL call is made.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { Ban, Check, CheckCircle2, Copy, Download, ExternalLink, FileText, Info, ListChecks, PackagePlus, PackageSearch, Plus, RefreshCcw } from 'lucide-react';
import { useAuthStore } from '../hooks/useAuthStore';
import { dhlShipmentService, type ShipmentDetails } from '../services/dhlShipment.service';
import { downloadBlob } from '../utils/download';
import { displayAwb } from '../utils/awb';
import { describeApiError } from '../utils/apiErrors';
import { CsLangProvider, LangToggle } from '../components/CreateShipment/i18n';
import { useCsLang } from '../components/CreateShipment/csLang';
import { Button, Note, Section, Skeleton, Stat } from '../components/CreateShipment/ui';
import { canShipment } from '../components/CreateShipment/wizardModel';
import { BundleButtons, CancelShipmentDialog, ReplacementDialog, StatusBadge } from '../components/CreateShipment/shipmentManage';
import { blockedReason, bucketOf, DOC_LABELS, formatAt, formatClock, formatDay } from '../components/CreateShipment/shipmentManageModel';
import { useCopyShipment } from '../components/CreateShipment/useShipmentActions';

export const CreateShipmentConfirmationPage: React.FC = () => (
  <CsLangProvider>
    <Confirmation />
  </CsLangProvider>
);

/** Create Shipment ✓ — Pay ✓ — Print (✓ once the documents were downloaded). */
function Progress({ printed }: { printed: boolean }) {
  const { t } = useCsLang();
  const steps: Array<[string, string, boolean]> = [
    ['إنشاء الشحنة', 'Create Shipment', true],
    ['الدفع', 'Pay', true],
    ['المستندات', 'Print', printed],
  ];
  return (
    <ol className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm font-bold" aria-label={t('مراحل الشحنة', 'Shipment progress')} data-testid="confirmation-progress">
      {steps.map(([ar, en, done], i) => (
        <React.Fragment key={en}>
          {i > 0 && <li aria-hidden="true" className="h-px w-6 sm:w-14 bg-slate-300 dark:bg-slate-600" />}
          <li className={`flex items-center gap-1.5 ${done ? 'text-slate-700 dark:text-slate-200' : 'text-indigo-700 dark:text-indigo-300'}`} data-done={done}>
            {t(ar, en)}
            {done
              ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-600 text-white"><Check size={13} aria-label={t('تم', 'done')} /></span>
              : <span className="w-2 h-2 rounded-full bg-indigo-600" aria-label={t('الحالية', 'current')} />}
          </li>
        </React.Fragment>
      ))}
    </ol>
  );
}

function SummaryCard({ s }: { s: ShipmentDetails }) {
  const { t, lang } = useCsLang();
  const p = s.pickup;
  const bookedPickup = p && p.dispatch_confirmation_number && ['booked', 'cancelled'].includes(p.status);
  return (
    <aside className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-5 space-y-5 min-w-0 h-fit" data-testid="confirmation-summary">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{t('رقم التتبع', 'Your Tracking Number')}</h3>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-2xl font-extrabold text-slate-900 dark:text-white" dir="ltr" data-testid="summary-awb">{displayAwb(s.awb ?? '')}</span>
          <button type="button" aria-label={t('نسخ رقم البوليصة', 'Copy the AWB')} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={() => void navigator.clipboard?.writeText(s.awb ?? '').then(() => toast.success(t('تم النسخ', 'Copied')))}><Copy size={16} /></button>
        </div>
        <ul className="mt-2 space-y-0.5 text-xs text-slate-600 dark:text-slate-300" data-testid="summary-pieces">
          {s.packages.map((pk) => (
            <li key={pk.sequence}>{t(`القطعة رقم ${pk.sequence}:`, `Piece # ${pk.sequence}:`)} <span dir="ltr" className="font-mono">{pk.dhl_piece_id ?? '—'}</span></li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{t('رقم تأكيد الاستلام', 'Pickup Confirmation Number')}</h3>
        {bookedPickup ? (
          <p className="mt-1 font-mono text-lg font-extrabold" dir="ltr" data-testid="summary-pickup-dcn">
            {p!.dispatch_confirmation_number}
            {p!.status === 'cancelled' && <span className="ms-2 text-xs font-bold text-red-600" dir="auto">{t('(أُلغي)', '(cancelled)')}</span>}
          </p>
        ) : p && p.status === 'uncertain' ? (
          <p className="mt-1 text-sm font-semibold text-amber-700">{t('غير مؤكد لدى DHL — راجع DHL', 'Not confirmed by DHL — check DHL')}</p>
        ) : (
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300" data-testid="summary-no-pickup">
            {s.pickup_option === 'drop_off'
              ? t(`تسليم في نقطة خدمة DHL${s.service_point_name ? `: ${s.service_point_name}` : ''}`, `Drop-off at a DHL Service Point${s.service_point_name ? `: ${s.service_point_name}` : ''}`)
              : t('لا يوجد استلام مجدول', 'No courier pickup scheduled')}
          </p>
        )}
      </div>

      {bookedPickup && (
        <div data-testid="summary-pickup-details">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{t('تفاصيل الاستلام', 'Pickup Details')}</h3>
          <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">{formatDay(p!.pickup_date, lang)}</p>
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {t('بين ', 'Between ')}<b>{formatClock(p!.earliest_time, lang)}</b>{t(' و ', ' and ')}<b>{formatClock(p!.close_time, lang)}</b>
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">{t('بتوقيت المرسل', "Sender's local time")}{s.origin_gmt_offset ? <>{' '}<span dir="ltr">(GMT{s.origin_gmt_offset})</span></> : null}</p>
          {(p!.location_type || p!.location) && (
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
              {p!.location_type ? (p!.location_type === 'residence' ? t('سكني', 'Residence') : t('منشأة تجارية', 'Business')) : ''}{p!.location ? ` · ${p!.location}` : ''}
            </p>
          )}
          {p!.instructions && <p className="text-xs text-slate-600 dark:text-slate-300 mt-1" dir="auto">{p!.instructions}</p>}
          <Link to="/create-shipment/shipments?pickup=scheduled" className="mt-1 inline-block text-xs font-bold text-indigo-600 hover:underline">{t('كل الشحنات ذات الاستلام المجدول', 'View all scheduled pickups')}</Link>
        </div>
      )}

      {s.tracking?.estimated_delivery && (
        <div>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{t('التسليم المتوقع', 'Estimated delivery')}</h3>
          <p className="mt-1 text-sm">{formatDay(s.tracking.estimated_delivery.slice(0, 10), lang)}</p>
        </div>
      )}
    </aside>
  );
}

function DocumentsList({ s }: { s: ShipmentDetails }) {
  const { t } = useCsLang();
  const docs = [...s.documents].filter((d) => d.document_type !== 'epod')
    .sort((a, b) => Number(a.sequence ?? 1e9) - Number(b.sequence ?? 1e9) || a.id - b.id);
  if (!docs.length) return <Note tone="warn">{t('لا توجد مستندات DHL محفوظة لهذه الشحنة. يمكن محاولة استرجاعها من صفحة متابعة البوليصة.', 'No DHL documents are stored for this shipment. You can try to recover them from the tracking page.')}</Note>;
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="confirmation-documents">
      {docs.map((d) => (
        <li key={d.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 flex items-center gap-3 min-w-0" data-document-type={d.document_type}>
          <span className="shrink-0 w-10 h-12 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center"><FileText size={20} className="text-indigo-600" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{DOC_LABELS[d.document_type] ? t(...DOC_LABELS[d.document_type]) : d.document_type}</div>
            <div className="text-[11px] text-slate-500">{d.page_count ? t(`${d.page_count} صفحة`, `${d.page_count} page${d.page_count > 1 ? 's' : ''}`) : 'PDF'}{d.origin === 'dhl_image_retrieval' ? t(' · مسترجع من DHL', ' · retrieved from DHL') : ''}</div>
          </div>
          <button type="button" className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700" aria-label={t(`تنزيل ${DOC_LABELS[d.document_type]?.[0] ?? ''}`, `Download ${DOC_LABELS[d.document_type]?.[1] ?? 'document'}`)}
            onClick={async () => {
              try { const { blob, filename } = await dhlShipmentService.downloadDocument(s.id, d.id); downloadBlob(filename, blob); }
              catch (e) { toast.error(describeApiError(e, t('تعذر تنزيل المستند', 'Could not download the document'))); }
            }}><Download size={16} /></button>
        </li>
      ))}
    </ul>
  );
}

/** Copy / corrected replacement / cancel — only what the Backend says is possible now, with the reason otherwise. */
export function ManageShipment({ s, onChanged }: { s: ShipmentDetails; onChanged: (s: ShipmentDetails) => void }) {
  const { t } = useCsLang();
  const navigate = useNavigate();
  const role = useAuthStore((x) => x.user?.role);
  const m = s.management;
  const copy = useCopyShipment();
  const [replace, setReplace] = useState(false);
  const [cancel, setCancel] = useState(false);
  const reason = blockedReason(m.cancel_blocked === 'FORBIDDEN' ? null : m.cancel_blocked, t);
  return (
    <Section title={t('إدارة الشحنة', 'Manage this shipment')} icon={<ListChecks size={18} className="text-indigo-600" />}
      description={t('لا تسمح DHL بتعديل أو حذف بوليصة بعد إنشائها: التصحيح ببوليصة بديلة، والإلغاء يلغي الاستلام ويعلّم الشحنة ملغاة في SHIPPEC.', 'DHL does not allow editing or deleting an AWB once created: corrections use a replacement AWB; cancelling cancels the pickup and marks the shipment cancelled in SHIPPEC.')}>
      <div className="flex flex-wrap gap-2">
        {m.can_copy && <Button variant="secondary" loading={copy.busy} onClick={() => void copy.copy(s.id)} data-testid="copy-shipment"><Copy size={16} /> {t('نسخ الشحنة', 'Copy Shipment')}</Button>}
        {m.replacement_draft_id ? (
          <Button variant="secondary" onClick={() => navigate(`/create-shipment?draft=${m.replacement_draft_id}`)}><RefreshCcw size={16} /> {t('متابعة البوليصة البديلة', 'Continue the replacement')}</Button>
        ) : m.can_replace && (
          <Button variant="secondary" onClick={() => setReplace(true)} data-testid="replace-shipment"><RefreshCcw size={16} /> {t('إنشاء بوليصة بديلة بعد التعديل', 'Create corrected replacement')}</Button>
        )}
        {m.can_cancel && <Button variant="danger" onClick={() => setCancel(true)} data-testid="cancel-shipment"><Ban size={16} /> {t('إلغاء الشحنة', 'Cancel Shipment')}</Button>}
      </div>
      {!m.can_cancel && reason && canShipment(role, 'cancel_shipment') && s.status === 'booked' && <p className="mt-3 text-xs text-slate-500" data-testid="cancel-blocked">{reason}</p>}
      <ReplacementDialog open={replace} onClose={() => setReplace(false)} shipment={s} />
      <CancelShipmentDialog open={cancel} onClose={() => setCancel(false)} shipment={s} hasPickup={(s.pickup?.status ?? m.pickup?.status) === 'booked'} onDone={(r) => onChanged(r.shipment)} />
    </Section>
  );
}

function Confirmation() {
  const { id: rawId } = useParams();
  const id = Number(rawId);
  const [params, setParams] = useSearchParams();
  const done = params.get('done') === '1';
  const { t, lang, dir } = useCsLang();
  const role = useAuthStore((x) => x.user?.role);
  const copy = useCopyShipment();
  const [s, setS] = useState<ShipmentDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const validId = Number.isInteger(id) && id > 0;
  const error = validId ? loadError : t('رقم الشحنة غير صالح', 'Invalid shipment id');

  useEffect(() => {
    if (!validId) return;
    let alive = true;
    dhlShipmentService.details(id).then(
      (x) => { if (alive) { setS(x); setLoadError(null); } },
      (e) => { if (alive) setLoadError(describeApiError(e, t('تعذر تحميل الشحنة', 'Could not load the shipment'))); },
    );
    return () => { alive = false; };
  }, [id, validId, t]);

  const header = (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><PackagePlus className="text-indigo-600" /> {t('إنشاء شحنة', 'Create Shipment')}</h1>
        <LangToggle />
      </div>
      <Link to="/create-shipment/shipments" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold min-h-[44px]" data-testid="all-shipments-link">
        <ListChecks size={16} /> {t('جميع الشحنات', 'All Shipments')}
      </Link>
    </header>
  );

  if (error) return <div className="space-y-4" dir={dir}>{header}<Note tone="error">{error}</Note></div>;
  if (!s) return <div className="space-y-4" dir={dir} role="status" aria-label={t('جاري التحميل', 'Loading')}>{header}<Skeleton className="h-24" /><Skeleton className="h-72" /></div>;
  if (s.creation_status !== 'created' || !s.awb) {
    return (
      <div className="space-y-4" dir={dir}>{header}
        <Note tone="warn">{t('هذه الشحنة لم تُنشئها DHL بعد.', 'DHL has not created this shipment yet.')} <Link className="underline font-bold" to={`/create-shipment?draft=${s.id}`}>{t('فتح المسودة', 'Open the draft')}</Link></Note>
      </div>
    );
  }

  const live = !['cancelled', 'superseded'].includes(s.status);
  const canDocs = canShipment(role, 'download_documents');
  const pickupNote = s.pickup && s.pickup.status === 'booked' && s.pickup.dispatch_confirmation_number;

  return (
    <div className="space-y-5 min-w-0 pb-10" dir={dir} lang={lang} data-testid="shipment-confirmation" data-phase={done ? 'done' : 'documents'}>
      {header}
      <Progress printed={done} />
      {!live && (
        <Note tone="warn" title={s.status === 'superseded' ? t('استُبدلت هذه الشحنة', 'This shipment was superseded') : t('هذه الشحنة ملغاة في SHIPPEC', 'This shipment is cancelled in SHIPPEC')}>
          {s.status === 'superseded' && s.replaced_by
            ? <>{t('البوليصة الجديدة: ', 'New AWB: ')}<Link className="underline font-bold font-mono" dir="ltr" to={`/create-shipment/success/${s.replaced_by.id}`}>{s.replaced_by.awb}</Link></>
            : s.cancellation_reason ? <span dir="auto">{s.cancellation_reason}</span> : null}
          <span className="block mt-1 text-xs">{t('لا تحذف DHL البوليصة؛ سجلها ومستنداتها وتتبعها محفوظة.', 'DHL does not delete the AWB; its record, documents and tracking are kept.')}</span>
        </Note>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <section className="rounded-3xl border border-green-200 dark:border-green-900/50 bg-white dark:bg-slate-800 p-5 sm:p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={34} className="text-green-600 shrink-0" />
              <div className="min-w-0">
                <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">{t('تم إنشاء الشحنة بنجاح', 'Shipment Confirmation')}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                  {done
                    ? t('بدأ تنزيل المستندات في المتصفح — تحقق من مجلد التنزيلات ثم اطبع الملصق.', 'The documents download started in your browser — check your downloads, then print the label.')
                    : t('نزّل المستندات كاملة واطبعها: الملصق على الطرد والبوليصة للمندوب.', 'Download and print the documents: the label on the package, the waybill for the courier.')}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2"><StatusBadge status={s.status} listStatus={bucketOf(s.status, s.tracking)} />
                  {s.dhl_env === 'test' && <span className="px-2 py-0.5 rounded-lg bg-sky-50 text-sky-700 border border-sky-100 text-[10px] font-bold">{t('بيئة اختبار DHL', 'DHL test environment')}</span>}</div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Stat label={t('رقم البوليصة AWB', 'Tracking Number (AWB)')} value={<span dir="ltr" className="font-mono">{displayAwb(s.awb)}</span>} />
              <Stat label={t('مرجع SHIPPEC', 'SHIPPEC reference')} value={<span dir="ltr" className="font-mono text-xs">{s.shippec_reference}</span>} />
              <Stat label={t('خدمة DHL', 'DHL product')} value={<span dir="ltr">{s.product_name ?? s.product_code ?? '—'}</span>} />
              <Stat label={t('تاريخ الشحن', 'Shipment date')} value={formatDay(s.shipment_date, lang)} />
              <Stat label={t('وقت الإنشاء', 'Created')} value={formatAt(s.dhl_created_at, s.origin_gmt_offset, lang)} />
              <Stat label={t('حالة الإنشاء', 'Creation status')} value={t('أنشأتها DHL', 'Created at DHL')} />
              {s.invoice && <Stat label={t('فاتورة SHIPPEC', 'SHIPPEC invoice')} value={<Link className="text-indigo-600 hover:underline inline-flex items-center gap-1" to={`/invoices?invoice=${s.invoice.id}`}>{s.invoice.invoice_number ?? `#${s.invoice.id}`}{s.invoice.payment_status === 3 ? t(' (مرتجعة)', ' (returned)') : ''} <ExternalLink size={12} /></Link>} />}
              {s.supersedes && <Stat label={t('تستبدل البوليصة', 'Replaces AWB')} value={<Link className="text-indigo-600 hover:underline font-mono" dir="ltr" to={`/create-shipment/success/${s.supersedes.id}`}>{s.supersedes.awb}</Link>} />}
            </div>
            {s.invoice_link_status === 'failed' && <div className="mt-3"><Note tone="warn" title={t('الشحنة أُنشئت لكن الفاتورة لم تُنشأ', 'The shipment was created but the invoice was not')}>{s.invoice_link_error ?? ''}</Note></div>}
          </section>

          {!done ? (
            <Section title={t('المستندات', 'Documents')} icon={<FileText size={18} className="text-indigo-600" />}
              description={t('المستندات كما أعادتها DHL لهذه البوليصة — تُجمع في ملف PDF واحد بالترتيب.', 'The documents exactly as DHL returned them for this AWB — combined into one PDF, in order.')}>
              <DocumentsList s={s} />
              <div className="mt-4"><Note tone="info">{t('لا تكتمل الشحنة حتى تطبع الملصق وتسلّم المستندات للمندوب.', 'Your shipment is not completed until the label is printed and the documents are handed to the courier.')}</Note></div>
              {canDocs ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {s.management.documents_bundle.available && <BundleButtons shipmentId={s.id} showPrint={false} onDownloaded={() => setParams({ done: '1' }, { replace: true })} />}
                  <Button variant="ghost" onClick={() => setParams({ done: '1' }, { replace: true })}>{t('تخطي — عرض التأكيد', 'Skip — show the confirmation')}</Button>
                </div>
              ) : <p className="mt-3 text-sm text-slate-500">{t('تنزيل المستندات غير متاح لدورك.', 'Downloading documents is not available to your role.')}</p>}
            </Section>
          ) : (
            <Section title={t('مهم', 'Important')} icon={<Info size={18} className="text-indigo-600" />}>
              <ul className="list-disc ps-5 space-y-1 text-sm text-slate-700 dark:text-slate-200" data-testid="confirmation-important">
                {pickupNote ? <li>{t(`تأكد من الاستلام: رقم التأكيد ${s.pickup!.dispatch_confirmation_number}.`, `Make sure the pickup is confirmed: confirmation ${s.pickup!.dispatch_confirmation_number}.`)}</li>
                  : s.pickup_option === 'drop_off' ? <li>{t('سلّم الطرد في نقطة خدمة DHL المختارة.', 'Hand the package in at the chosen DHL Service Point.')}</li>
                    : <li>{t('لا يوجد استلام مجدول — سلّم الطرد لمندوب DHL المعتاد.', 'No courier pickup is scheduled — hand the package to the regular DHL courier.')}</li>}
                <li>{t('ألصق ملصق الشحن على الطرد وسلّم بوليصة الشحن للمندوب.', 'Attach the shipping label to the package and hand the waybill to the courier.')}</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2" data-testid="confirmation-actions">
                <Link to={`/shipment-tracking/${s.awb}`} className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-bold min-h-[44px]"><PackageSearch size={16} /> {t('متابعة الشحنة', 'Track shipment')}</Link>
                {canDocs && s.management.documents_bundle.available && <BundleButtons shipmentId={s.id} primary={false} />}
                {canShipment(role, 'create_draft') && <Link to="/create-shipment" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold min-h-[44px]"><Plus size={16} /> {t('إنشاء شحنة أخرى', 'Create Another Shipment')}</Link>}
                {s.management.can_copy && <Button variant="secondary" loading={copy.busy} onClick={() => void copy.copy(s.id)}><Copy size={16} /> {t('نسخ الشحنة', 'Copy Shipment')}</Button>}
              </div>
            </Section>
          )}

          {(s.management.can_replace || s.management.can_cancel || s.management.replacement_draft_id || (s.status === 'booked' && canShipment(role, 'cancel_shipment'))) && (
            <ManageShipment s={s} onChanged={(x) => setS(x)} />
          )}
        </div>
        <SummaryCard s={s} />
      </div>
    </div>
  );
}
