/**
 * Step 2 «تفاصيل الشحنة / Shipment Details» — DHL's Create Shipment
 * information architecture (Documents | Packages, describe / upload items,
 * invoice value, references, protection) on SHIPPEC's design system, AR / EN.
 *
 * Data stays SHIPPEC's model: content_kind, content_description, references
 * ([0] = DHL customer_reference), declared_value + currency, shipment_purpose
 * (+ DHL export reason), the customs items (quantity, unit, unit value,
 * origin, outbound / inbound HS, net / gross weight). What DHL's API is not
 * wired for here (more references, protection / insurance, duties
 * preferences, invoice charges, manufacturer ID, line references) is stored
 * with the draft and NEVER sent to DHL — the screen says so.
 */
import React, { useId, useRef, useState } from 'react';
import {
  AlertTriangle, Calculator, Check, Copy, FileSpreadsheet, FileText, Info, Package, Plus, Shield, Sparkles, Trash2, Upload, X,
} from 'lucide-react';
import { Dialog } from '../shared/Dialog';
import { downloadBlob } from '../../utils/download';
import type { ShipmentPurpose } from '../../services/dhlShipment.service';
import { Button, Field, Note, Section, SelectInput, TextInput } from './ui';
import { CountryCombobox, OptionCombobox } from './Combobox';
import { useCsLang, type CsLang } from './csLang';
import {
  countryName, currencyOptions, derivedContents, detailsGate, DHL_EXPORT_REASONS, DOCUMENT_DESCRIPTIONS, emptyItem, exportReasonLabel, HS_CODE_MAX,
  invoiceTotals, isInternational, isLatin, ITEM_DESCRIPTION_MAX, ITEM_UNITS, itemTotals, kgToLb, PURPOSE_ORDER, purposeLabel, PURPOSES_NEEDING_REASON,
  translateIssue, UNIT_LABELS, type ChargeType, type FieldErrors, type ItemForm, type ReferenceForm, type WizardForm,
} from './wizardModel';
import type { Wizard } from './useShipmentWizard';
import { parseItemRows, UPLOAD_COLUMNS, type UploadRow } from './itemsUpload';

type T = (ar: string, en: string) => string;
const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const num = (v: string) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

/** A small "stored, not sent to DHL yet" marker for the features without a MyDHL mapping. */
function NotWired({ t }: { t: T }) {
  return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">{t('يُحفظ في SHIPPEC — لا يُرسل إلى DHL بعد', 'Saved in SHIPPEC — not sent to DHL yet')}</span>;
}

function CurrencySelect({ id, value, onChange, error, lang, t }: { id: string; value: string; onChange: (v: string) => void; error?: string | null; lang: CsLang; t: T }) {
  const options = currencyOptions(lang).map((c) => ({ value: c.code, label: `${c.code} — ${c.name}`, keywords: c.name }));
  return <OptionCombobox id={id} value={value} options={options} onChange={onChange} error={error} label={t('العملات', 'Currencies')} ltr />;
}

/** Info dialog behind the side-panel actions (no external page until DHL's official links are approved). */
function InfoDialog({ open, title, onClose, children, t }: { open: boolean; title: string; onClose: () => void; children: React.ReactNode; t: T }) {
  const hid = useId();
  const { dir } = useCsLang();
  return (
    <Dialog open={open} onRequestClose={onClose} labelledBy={hid} panelClassName="sm:max-w-lg">
      <div className="p-5 space-y-3" dir={dir}>
        <div className="flex items-start justify-between gap-3">
          <h2 id={hid} className="text-lg font-extrabold text-slate-900 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('إغلاق', 'Close')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
        </div>
        <div className="text-sm text-slate-700 dark:text-slate-200 space-y-2 leading-relaxed">{children}</div>
        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>{t('حسنًا', 'OK')}</Button></div>
      </div>
    </Dialog>
  );
}

function SidePanel({ w, t, lang }: { w: Wizard; t: T; lang: CsLang }) {
  const { form, customs } = w;
  const [open, setOpen] = useState<null | 'document' | 'prohibited'>(null);
  const dest = form.receiver.country_code ? countryName(form.receiver.country_code, lang) : t('بلد الوصول', 'the destination country');
  const card = 'rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 space-y-1.5';
  return (
    <aside className="space-y-3 min-w-0" aria-label={t('معلومات مساعدة', 'Helpful information')} data-testid="details-side-panel">
      {form.content_kind === 'documents' && (
        <div className={card}>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{t('هل هي مستندات؟', 'Is it a document?')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('بعض ما قد تظنه مستندات ليس كذلك — تحقق قبل إكمال الشحنة.', 'Some items you might think are documents are not — check before completing your shipment.')}</p>
          <button type="button" onClick={() => setOpen('document')} className="text-xs font-bold text-indigo-600 dark:text-indigo-300 hover:underline">{t('ساعدني في معرفة إن كانت مستندات', 'Help me determine if my item is a document')}</button>
        </div>
      )}
      <div className={card} data-testid="prohibited-items-card">
        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{t('المواد المحظورة', 'Prohibited Items')}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t(`بعض المواد محظورة عند الشحن إلى ${dest}.`, `Some items that are prohibited when shipping to ${dest}.`)}</p>
        <button type="button" onClick={() => setOpen('prohibited')} className="text-xs font-bold text-indigo-600 dark:text-indigo-300 hover:underline">{t('عرض المواد المحظورة', 'View Prohibited Items')}</button>
      </div>
      {form.content_kind === 'goods' && customs && (
        <div className={card}>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{t('تحتاج إضافة تفاصيل أخرى للفاتورة الجمركية؟', 'Need to add other details to the customs invoice?')}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">{t('رقم الفاتورة وتاريخها ونوع فاتورة DHL وPaperless Trade تُكمَل في خطوة «الجمارك» التالية.', "The invoice number, date, DHL invoice type and Paperless Trade are completed in the following «Customs» step.")}</p>
        </div>
      )}
      <InfoDialog open={open === 'document'} title={t('هل هي مستندات؟', 'Is it a document?')} onClose={() => setOpen(null)} t={t}>
        <p>{t('المستندات: أوراق قانونية أو مالية أو تجارية بلا قيمة تجارية — عقود، مراسلات، فواتير، شهادات.', 'Documents: legal, financial or business paperwork with no commercial value — contracts, correspondence, invoices, certificates.')}</p>
        <p>{t('ليست مستندات: أي شيء له قيمة نقدية أو يُباع — كتب ومجلات مطبوعة للبيع، بطاقات، تذاكر، صور، وسائط تخزين، نماذج.', 'Not documents: anything with monetary value or sold — printed books or magazines for sale, cards, tickets, photos, storage media, samples.')}</p>
        <p>{t('عند الشك اختر «طرود / بضائع» وصِف المحتوى بدقة.', 'If in doubt, choose «Packages» and describe the contents precisely.')}</p>
      </InfoDialog>
      <InfoDialog open={open === 'prohibited'} title={t(`المواد المحظورة — ${dest}`, `Prohibited Items — ${dest}`)} onClose={() => setOpen(null)} t={t}>
        <p>{t('لا تقبل DHL Express عادةً: النقود والأوراق ذات القيمة، المواد الخطرة والقابلة للاشتعال، الأسلحة والذخيرة، المواد المخدرة، الحيوانات الحية، والمواد الممنوعة بقوانين بلد الوصول.', 'DHL Express generally does not accept: cash and negotiable items, dangerous or flammable goods, weapons and ammunition, narcotics, live animals, and anything banned by the destination country.')}</p>
        <p>{t(`لكل بلد قيوده الخاصة (${dest}). راجع قائمة DHL الرسمية لهذا البلد مع فريق العمليات قبل الشحن عند الشك.`, `Each country has its own restrictions (${dest}). Check DHL's official list for this country with the operations team before shipping when in doubt.`)}</p>
      </InfoDialog>
    </aside>
  );
}

/** Shipment references: the first is printed on the label / waybill (DHL customer reference). */
function References({ refs, onChange, err, t }: { refs: ReferenceForm[]; onChange: (r: ReferenceForm[]) => void; err: (k: string) => string | null; t: T }) {
  const set = (i: number, v: string) => onChange(refs.map((r, j) => (j === i ? { ...r, value: v.slice(0, 35) } : r)));
  const dup = (i: number) => refs.findIndex((r, j) => j !== i && r.value.trim() && r.value.trim().toLowerCase() === refs[i].value.trim().toLowerCase()) >= 0;
  return (
    <Section title={t('إضافة مراجع للشحنة', 'Add Shipment References')} description={t('يظهر المرجع الأول على ملصق الشحن / البوليصة. المراجع الإضافية لا تظهر على الشحنة.', 'Your first reference will appear on your shipping label/waybill. All additional references will not show on shipping.')}>
      <div className="space-y-2" data-testid="references">
        {refs.map((r, i) => (
          <div key={i} className="flex items-start gap-2">
            <Field label={i === 0 ? t('المرجع 1 (على الملصق)', 'Reference 1 (on the label)') : t(`المرجع ${i + 1}`, `Reference ${i + 1}`)} className="flex-1"
              error={err(`references.${i}`) ?? (dup(i) ? t('هذا المرجع مكرر.', 'This reference is repeated.') : null)}>
              {(id) => <TextInput id={id} value={r.value} onValue={(v) => set(i, v)} ltr maxLength={35} />}
            </Field>
            <button type="button" onClick={() => onChange(refs.filter((_, j) => j !== i))} aria-label={t(`حذف المرجع ${i + 1}`, `Remove reference ${i + 1}`)}
              className="mt-6 p-2.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={16} /></button>
          </div>
        ))}
        {refs.length < 10 && <Button variant="secondary" onClick={() => onChange([...refs, { type: refs.length ? 'AAO' : 'CU', value: '' }])}><Plus size={16} /> {t('إضافة مرجع', 'Add Reference')}</Button>}
        {refs.length > 1 && <div className="pt-1"><NotWired t={t} /></div>}
      </div>
    </Section>
  );
}

/** «إنشاء وصف»: a deterministic helper (no AI): item + material + intended use → an English customs description. */
function DescriptionHelper({ open, onClose, onUse, t }: { open: boolean; onClose: () => void; onUse: (d: string) => void; t: T }) {
  const hid = useId();
  const { dir } = useCsLang();
  const [item, setItem] = useState('');
  const [material, setMaterial] = useState('');
  const [use, setUse] = useState('');
  const text = [material.trim() && `${material.trim()}`, item.trim()].filter(Boolean).join(' ') + (use.trim() ? ` for ${use.trim()}` : '');
  const ok = !!item.trim() && isLatin(text) && text.length <= ITEM_DESCRIPTION_MAX;
  return (
    <Dialog open={open} onRequestClose={onClose} labelledBy={hid} panelClassName="sm:max-w-md">
      <div className="p-5 space-y-3" dir={dir} data-testid="description-helper">
        <div className="flex items-start justify-between gap-3">
          <h2 id={hid} className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2"><Sparkles size={18} className="text-indigo-600" /> {t('إنشاء وصف', 'Create Description')}</h2>
          <button type="button" onClick={onClose} aria-label={t('إغلاق', 'Close')} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X size={18} /></button>
        </div>
        <p className="text-xs text-slate-500">{t('أجب بالإنجليزية — الجمارك تحتاج وصفًا دقيقًا لما هو البند، ومادته، واستخدامه.', 'Answer in English — customs need what the item is, what it is made of and what it is for.')}</p>
        <Field label={t('ما هو البند؟', 'What is it?')} required>{(id) => <TextInput id={id} value={item} onValue={setItem} ltr placeholder="T-shirt" />}</Field>
        <Field label={t('المادة', 'Material')}>{(id) => <TextInput id={id} value={material} onValue={setMaterial} ltr placeholder="Men's 100% cotton" />}</Field>
        <Field label={t('الاستخدام', 'Intended use')}>{(id) => <TextInput id={id} value={use} onValue={setUse} ltr placeholder="personal use" />}</Field>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-900/40 p-3 text-sm font-bold text-slate-800 dark:text-slate-100" dir="ltr" data-testid="description-preview">{text || '—'}</div>
        {text && !isLatin(text) && <p className="text-[11px] font-semibold text-red-600">{t('بالإنجليزية فقط.', 'English only.')}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('إلغاء', 'Cancel')}</Button>
          <Button disabled={!ok} onClick={() => { onUse(text); onClose(); }}><Check size={16} /> {t('استخدام الوصف', 'Use description')}</Button>
        </div>
      </div>
    </Dialog>
  );
}

function ItemCard({ it, i, count, form, onChange, onRemove, onCopy, err, t, lang }: {
  it: ItemForm; i: number; count: number; form: WizardForm; onChange: (x: ItemForm) => void; onRemove: () => void; onCopy: () => void;
  err: (k: string) => string | null; t: T; lang: CsLang;
}) {
  const [helper, setHelper] = useState(false);
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => onChange({ ...it, [k]: v });
  const e = (k: string) => err(`items.${i}.${k}`);
  const kg = num(it.unit_net_weight_kg);
  const unitOptions = ITEM_UNITS.map((u) => ({ value: u, label: `${t(...UNIT_LABELS[u])} (${u})`, keywords: UNIT_LABELS[u].join(' ') }));
  return (
    <article className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-3" data-item={i}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{t(`${i + 1}. وصف البند`, `${i + 1}. Unique Item Description`)}</h3>
        <div className="flex gap-1">
          <button type="button" onClick={onCopy} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label={t(`نسخ البند ${i + 1}`, `Copy item ${i + 1}`)}><Copy size={16} /></button>
          {count > 1 && <button type="button" onClick={onRemove} className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label={t(`حذف البند ${i + 1}`, `Remove item ${i + 1}`)}><Trash2 size={16} /></button>}
        </div>
      </div>
      <Field label={t('ما هو البند؟', 'What is the item?')} required error={e('description')}
        hint={`${it.description.length}/${ITEM_DESCRIPTION_MAX} · ${t('بالإنجليزية فقط', 'English only')}`}>
        {(id) => (
          <div className="flex flex-col sm:flex-row gap-2">
            <TextInput id={id} value={it.description} onValue={(v) => set('description', v.slice(0, ITEM_DESCRIPTION_MAX))} error={e('description')} ltr maxLength={ITEM_DESCRIPTION_MAX}
              placeholder={t(`أدخل وصف البند (${ITEM_DESCRIPTION_MAX} حرفًا كحد أقصى)`, `Enter your item description (${ITEM_DESCRIPTION_MAX} Character Maximum)`)} />
            <Button variant="secondary" className="shrink-0" onClick={() => setHelper(true)}><Sparkles size={15} /> {t('إنشاء وصف', 'Create Description')}</Button>
          </div>
        )}
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Optional (MyDHL schema): an empty code is left out of the DHL request; DHL's validation says when a route needs one. */}
        <Field label={t('رمز HS للتصدير / Schedule B', 'Schedule B / export HS code')} error={e('outbound_hs_code')}
          hint={t('يُدخل يدويًا — لا توجد خدمة بحث رموز مربوطة بعد.', 'Entered manually — no code lookup service is connected yet.')}>
          {(id) => <TextInput id={id} value={it.outbound_hs_code} onValue={(v) => set('outbound_hs_code', v.replace(/[^\d.]/g, '').slice(0, HS_CODE_MAX))} error={e('outbound_hs_code')} ltr placeholder="6109.10" />}
        </Field>
        <Field label={t('رمز HS للاستيراد في بلد الوجهة', 'HS code (import, destination)')} error={e('inbound_hs_code')}>
          {(id) => <TextInput id={id} value={it.inbound_hs_code} onValue={(v) => set('inbound_hs_code', v.replace(/[^\d.]/g, '').slice(0, HS_CODE_MAX))} error={e('inbound_hs_code')} ltr placeholder="6109.10" />}
        </Field>
      </div>
      <Field label={t('معرّف المُصنِّع', "Manufacturer's ID")}>{(id) => <TextInput id={id} value={it.manufacturer_id} onValue={(v) => set('manufacturer_id', v.slice(0, 50))} ltr />}</Field>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label={t('الكمية', 'Quantity')} required error={e('quantity')}>{(id) => <TextInput id={id} value={it.quantity} onValue={(v) => set('quantity', v.replace(/\D/g, '').slice(0, 6))} error={e('quantity')} ltr inputMode="numeric" />}</Field>
        <Field label={t('الوحدة (طريقة التعبئة)', 'Units (How the item is packaged)')} required error={e('unit')}>{(id) => (
          <OptionCombobox id={id} value={it.unit} options={unitOptions} onChange={(v) => set('unit', v)} error={e('unit')} label={t('الوحدات', 'Units')} />
        )}</Field>
        <Field label={t(`القيمة (لكل بند) ${form.currency}`, `Value (Per Item) ${form.currency}`)} required error={e('unit_value')}>{(id) => (
          <TextInput id={id} value={it.unit_value} onValue={(v) => set('unit_value', v.replace(/[^\d.]/g, ''))} error={e('unit_value')} ltr inputMode="decimal" />
        )}</Field>
        <Field label={t('الوزن (لكل بند) كغ', 'Weight (Per Item) kg')} required error={e('unit_net_weight_kg')} hint={<span dir="ltr" className="tabular-nums">{kg != null ? `${fmt(kgToLb(kg), 3)} LB` : '0.000 LB'}</span>}>{(id) => (
          <TextInput id={id} value={it.unit_net_weight_kg} onValue={(v) => set('unit_net_weight_kg', v.replace(/[^\d.]/g, ''))} error={e('unit_net_weight_kg')} ltr inputMode="decimal" />
        )}</Field>
      </div>
      <Field label={t('الوزن الإجمالي مع التغليف (كغ)', 'Gross weight incl. packaging (kg)')} error={e('gross_weight_kg')} hint={t('أكبر من الصافي — تشترطه الفاتورة الجمركية لـ DHL', "Greater than the net weight — DHL's customs invoice needs it")}>
        {(id) => (
          <div className="flex gap-2">
            <TextInput id={id} value={it.gross_weight_kg} onValue={(v) => set('gross_weight_kg', v.replace(/[^\d.]/g, ''))} error={e('gross_weight_kg')} ltr inputMode="decimal" />
            <SelectInput aria-label={t('الوزن الإجمالي لكل', 'Gross weight per')} value={it.gross_mode} onValue={(v) => set('gross_mode', v as ItemForm['gross_mode'])} className="!w-40">
              <option value="line">{t('للبند كاملًا', 'Whole line')}</option><option value="unit">{t('لكل وحدة', 'Per unit')}</option>
            </SelectInput>
          </div>
        )}
      </Field>
      <Field label={t('أين صُنع البند؟', 'Where was the item made?')} required error={e('country_of_origin')}>{(id) => (
        <CountryCombobox id={id} value={it.country_of_origin} onChange={(v) => set('country_of_origin', v)} error={e('country_of_origin')} lang={lang} t={t} />
      )}</Field>
      <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
        <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={it.show_reference} onChange={(ev) => set('show_reference', ev.target.checked)} />
        {t('إضافة مرجع للبند', 'Add line item reference')}
      </label>
      {it.show_reference && (
        <Field label={t('مرجع البند', 'Line item reference')}>{(id) => <TextInput id={id} value={it.line_reference} onValue={(v) => set('line_reference', v.slice(0, 35))} ltr />}</Field>
      )}
      <DescriptionHelper open={helper} onClose={() => setHelper(false)} onUse={(d) => set('description', d)} t={t} />
    </article>
  );
}

// ── Upload item details (CSV / Excel → the item cards; nothing is sent to DHL) ──
function UploadItems({ onUse, t, lang }: { onUse: (items: ItemForm[]) => void; t: T; lang: CsLang }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<{ name: string; items: ItemForm[]; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const read = async (file: File) => {
    setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const rows = XLSX.utils.sheet_to_json<UploadRow>(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
      setResult({ name: file.name, ...parseItemRows(rows, lang) });
    } catch {
      setResult({ name: file.name, items: [], errors: [t('تعذرت قراءة الملف — استخدم القالب (CSV أو Excel).', 'The file could not be read — use the template (CSV or Excel).')] });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const template = () => {
    const csv = `${UPLOAD_COLUMNS.join(',')}\n"Men's cotton T-shirt",2,PCS,10.00,0.20,0.25,CN,6109.10,6109.10,,\n`;
    downloadBlob('shippec-items-template.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  };
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-4 space-y-3" data-testid="upload-items">
      <p className="text-sm text-slate-700 dark:text-slate-200">{t('ارفع ملف CSV أو Excel (‎.csv ‎.xlsx) بأعمدة القالب — يُملأ منه نموذج البنود هنا فقط، ولا يُرسل أي ملف إلى DHL.', 'Upload a CSV or Excel file (.csv .xlsx) with the template columns — it only fills the item form here; no file is sent to DHL.')}</p>
      <p className="text-[11px] text-slate-500" dir="ltr">{UPLOAD_COLUMNS.join(' · ')}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={template}><FileSpreadsheet size={16} /> {t('تنزيل القالب', 'Download template')}</Button>
        <Button onClick={() => fileRef.current?.click()} loading={busy}><Upload size={16} /> {t('اختيار ملف', 'Choose file')}</Button>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden"
          aria-label={t('ملف البنود', 'Items file')} onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void read(f); }} />
      </div>
      {result && (
        <div className="space-y-2" data-testid="upload-result">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{result.name}: {t(`${result.items.length} بند صالح`, `${result.items.length} valid item(s)`)}{result.errors.length ? t(` · ${result.errors.length} خطأ`, ` · ${result.errors.length} error(s)`) : ''}</p>
          {result.errors.length > 0 && <Note tone="error"><ul className="list-disc ps-4">{result.errors.slice(0, 20).map((x) => <li key={x}>{x}</li>)}</ul></Note>}
          {result.items.length > 0 && !result.errors.length && (
            <Button onClick={() => { onUse(result.items); setResult(null); }}><Check size={16} /> {t(`استخدام ${result.items.length} بند`, `Use ${result.items.length} item(s)`)}</Button>
          )}
        </div>
      )}
    </div>
  );
}

const CHARGE_TYPES: Array<[ChargeType, string, string]> = [['freight', 'أجرة الشحن', 'Freight'], ['insurance', 'التأمين', 'Insurance'], ['other', 'رسوم أخرى', 'Other']];

export function StepDetails({ w, showGate }: { w: Wizard; showGate: boolean }) {
  const { form, update, errors, customs } = w;
  const { t, lang } = useCsLang();
  const gate: FieldErrors = showGate ? detailsGate(form, lang) : {};
  const err = (k: string) => gate[k] ?? (errors[k] ? translateIssue(errors[k], lang) : null);
  const international = isInternational(form);
  const docs = form.content_kind === 'documents';
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => update((f) => ({ ...f, [k]: v }));
  const totals = itemTotals(form.items);
  const inv = invoiceTotals(form);
  const reasonNeeded = PURPOSES_NEEDING_REASON.includes(form.shipment_purpose as ShipmentPurpose);
  const docOptions = DOCUMENT_DESCRIPTIONS.map(([en, ar]) => ({ value: en, label: lang === 'en' ? en : `${ar} (${en})`, keywords: ar }));
  const purposeOptions = PURPOSE_ORDER.map((p) => ({ value: p, label: purposeLabel(p, lang) }));
  const kindCard = (kind: 'documents' | 'goods', icon: React.ReactNode, title: string, help: string) => {
    const on = form.content_kind === kind;
    return (
      <div className="min-w-0 space-y-1.5">
        <button type="button" role="radio" aria-checked={on} onClick={() => update((f) => ({ ...f, content_kind: kind, items: kind === 'goods' && !f.items.length && international ? [emptyItem()] : f.items }))}
          className={`w-full flex items-center gap-2 px-4 py-3.5 rounded-2xl border text-start text-sm font-extrabold transition-colors min-h-[52px] ${on ? 'border-indigo-500 bg-indigo-600 text-white shadow-sm' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300'}`}>
          {icon}<span className="flex-1">{title}</span>{on && <Check size={18} />}
        </button>
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{help}</p>
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="details-step">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] gap-4 items-start">
        <div className="space-y-4 min-w-0">
          <section className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm p-4 sm:p-6 space-y-4 min-w-0">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">{t('تفاصيل الشحنة', 'Shipment Details')}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('ماذا تقوم بشحنه؟', 'What are you shipping?')}</p>
            </div>
            <div role="radiogroup" aria-label={t('نوع المحتوى', 'Contents type')} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {kindCard('documents', <FileText size={18} />, t('مستندات', 'Documents'),
                t('تشمل المستندات الأوراق القانونية أو المالية أو التجارية. لا تُعتبر المواد ذات القيمة النقدية شحنة مستندات.', 'Documents include legal, financial or business paperwork. Items with monetary value are NOT considered a document shipment.'))}
              {kindCard('goods', <Package size={18} />, t('طرود / بضائع', 'Packages'),
                t('تشمل الطرود البضائع والسلع والمنتجات المرسلة لأغراض شخصية أو تجارية.', 'Packages are goods, merchandise or commodities for personal or commercial purposes.'))}
            </div>
          </section>

          {(docs || !customs) && (
            <Section title={docs ? t('صف المستندات في شحنتك', 'Describe the documents in your shipment') : t('صف محتوى الطرود', 'Describe the contents of your packages')}>
              <Field label={docs ? t('اختر وصفًا', 'Select a description') : t('وصف المحتوى', 'Contents description')} required error={err('content_description')}
                hint={t('بالإنجليزية كما سيظهر على الملصق — يمكنك الكتابة أو الاختيار.', 'In English as printed on the label — type or choose.')}>
                {(id) => docs
                  ? <OptionCombobox id={id} value={form.content_description} options={docOptions} onChange={(v) => set('content_description', v.slice(0, 255))} error={err('content_description')}
                      label={t('أوصاف المستندات', 'Document descriptions')} freeText ltr maxLength={255} placeholder={t('مثل: أوراق قانونية أو مالية أو تجارية', 'Such as legal, financial or business paperwork, etc.')} />
                  : <TextInput id={id} value={form.content_description} onValue={(v) => set('content_description', v.slice(0, 255))} error={err('content_description')} ltr maxLength={255} placeholder="Cotton T-shirts" />}
              </Field>
            </Section>
          )}

          {customs && (
            <>
              <Section title={t('ما الغرض من شحنتك؟', 'What is the purpose of your shipment?')}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={t('غرض الشحنة', 'Purpose')} required error={err('shipment_purpose')}>{(id) => (
                    <OptionCombobox id={id} value={form.shipment_purpose} options={purposeOptions} label={t('أغراض الشحن', 'Purposes')} error={err('shipment_purpose')}
                      onChange={(v) => update((f) => ({ ...f, shipment_purpose: v as ShipmentPurpose, export_reason_type: PURPOSES_NEEDING_REASON.includes(v as ShipmentPurpose) ? f.export_reason_type : '' }))}
                      placeholder={t('اختر الغرض', 'Choose the purpose')} />
                  )}</Field>
                  {reasonNeeded && (
                    <Field label={t('سبب التصدير لدى DHL', 'DHL export reason')} required error={err('export_reason_type')}
                      hint={t('لا يوجد لدى DHL رمز موثّق لهذا الغرض — اختر من قائمة DHL نفسها.', 'DHL documents no code for this purpose — choose from DHL\'s own list.')}>
                      {(id) => (
                        <SelectInput id={id} value={form.export_reason_type} onValue={(v) => set('export_reason_type', v)} error={err('export_reason_type')}>
                          <option value="">{t('اختر', 'Choose')}</option>
                          {DHL_EXPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{exportReasonLabel(r, lang)}</option>)}
                        </SelectInput>
                      )}
                    </Field>
                  )}
                </div>
              </Section>

              <Section title={t('أخبرنا بما تشحنه', "Tell Us What You're Shipping")} description={t('اختر طريقة إدخال تفاصيل البنود', 'Select how you would like to provide your item details')}>
                <div role="radiogroup" aria-label={t('طريقة إدخال البنود', 'Item entry')} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {(['describe', 'upload'] as const).map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={form.item_entry === m} onClick={() => set('item_entry', m)}
                      className={`flex items-center gap-2 px-4 py-3 rounded-2xl border text-sm font-extrabold min-h-[48px] ${form.item_entry === m ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300'}`}>
                      {m === 'describe' ? <Plus size={16} /> : <Upload size={16} />}
                      <span className="flex-1 text-start">{m === 'describe' ? t('وصف البنود', 'Describe Items') : t('رفع تفاصيل البنود', 'Upload Item Details')}</span>
                      {form.item_entry === m && <Check size={16} />}
                    </button>
                  ))}
                </div>
                {form.item_entry === 'upload' && (
                  <div className="mb-4">
                    <UploadItems t={t} lang={lang} onUse={(items) => {
                      if (form.items.some((x) => x.description.trim()) && !window.confirm(t('استبدال البنود الحالية ببنود الملف؟', 'Replace the current items with the file items?'))) return;
                      update((f) => ({ ...f, items }));
                    }} />
                  </div>
                )}
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{t('صف كل بند مختلف في شحنتك على حدة', 'Describe each unique item in your shipment separately')}</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('تجنّب تأخير الشحنة! الدقة مهمة لسلطات الجمارك. أضف كل بند على حدة. أوصاف البنود بالإنجليزية فقط (شرط DHL).', 'Avoid shipment delays! Accuracy matters to customs authorities. Add each unique item One At a Time. Provide details in English only.')}</p>
                  </div>
                  <label className="flex items-start gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                    <input type="checkbox" className="mt-1 w-4 h-4 accent-indigo-600" checked={form.estimated_duties} onChange={(ev) => set('estimated_duties', ev.target.checked)} />
                    <span>
                      {t('أرغب في رؤية الرسوم والضرائب التقديرية', 'I would like to see estimated duties and taxes')}
                      <span className="block text-[11px] font-semibold text-slate-500">{t('يجب إدخال رمز من 6 إلى 12 رقمًا لكل بند.', 'You must provide a 6-12 digit item code for each unique item in your shipment.')}</span>
                      {form.estimated_duties && <span className="block mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">{t('حساب الرسوم التقديرية من DHL غير مربوط بعد — يُحفظ اختيارك فقط.', "DHL's estimated duties calculation is not connected yet — your choice is only saved.")}</span>}
                    </span>
                  </label>
                  <Field label={t('عملة الفاتورة', 'Invoice currency')} required error={err('currency')} className="max-w-xs">{(id) => (
                    <CurrencySelect id={id} value={form.currency} onChange={(v) => set('currency', v)} error={err('currency')} lang={lang} t={t} />
                  )}</Field>
                  {err('items') && <Note tone="error">{err('items')}</Note>}
                  {form.items.map((it, i) => (
                    <ItemCard key={i} it={it} i={i} count={form.items.length} form={form} err={err} t={t} lang={lang}
                      onChange={(x) => update((f) => ({ ...f, items: f.items.map((y, j) => (j === i ? x : y)) }))}
                      onRemove={() => update((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                      onCopy={() => update((f) => ({ ...f, items: [...f.items.slice(0, i + 1), { ...it }, ...f.items.slice(i + 1)] }))} />
                  ))}
                  <Button variant="secondary" onClick={() => update((f) => ({ ...f, items: [...f.items, emptyItem()] }))}><Plus size={16} /> {t('إضافة بند آخر', 'Add Another Item')}</Button>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 p-3 text-xs" data-testid="item-totals" aria-live="polite">
                    <div><div className="font-bold text-slate-400">{t('إجمالي الوحدات', 'Total Units')}</div><div className="text-base font-extrabold tabular-nums">{inv.units}</div></div>
                    <div><div className="font-bold text-slate-400">{t('إجمالي الوزن', 'Total Weight')}</div><div className="text-base font-extrabold tabular-nums" dir="ltr">{fmt(totals.net, 3)} kg</div><div className="text-[11px] text-slate-500 tabular-nums" dir="ltr">{fmt(kgToLb(totals.net), 3)} LB</div></div>
                    <div><div className="font-bold text-slate-400">{t('إجمالي القيمة', 'Total Value')}</div><div className="text-base font-extrabold tabular-nums" dir="ltr">{fmt(totals.value)} {form.currency}</div></div>
                  </div>
                </div>
              </Section>

              <Section title={t('قيمة الفاتورة', 'Invoice Value')} icon={<Calculator size={18} className="text-indigo-600" />} description={t('أضف أي رسوم إضافية لهذه الشحنة.', 'Include any additional charges for this shipment.')}>
                <div className="space-y-3" data-testid="invoice-value">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">{t('إجمالي قيمة البضائع/البنود فقط (دون الرسوم الأخرى)', 'Total value for all goods/items only (excluding other charges)')}</span>
                    <span className="font-extrabold tabular-nums" dir="ltr">{fmt(inv.goods)} {form.currency}</span>
                  </div>
                  {form.charges.map((c, i) => (
                    <div key={i} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_minmax(0,7rem)_auto] gap-2 items-start" data-charge={i}>
                      <SelectInput aria-label={t('نوع الرسوم', 'Charge type')} value={c.type} onValue={(v) => update((f) => ({ ...f, charges: f.charges.map((x, j) => (j === i ? { ...x, type: v as ChargeType } : x)) }))}>
                        {CHARGE_TYPES.map(([v, ar, en]) => <option key={v} value={v}>{t(ar, en)}</option>)}
                      </SelectInput>
                      <TextInput aria-label={t('الوصف', 'Description')} value={c.description} onValue={(v) => update((f) => ({ ...f, charges: f.charges.map((x, j) => (j === i ? { ...x, description: v.slice(0, 100) } : x)) }))} ltr />
                      <TextInput aria-label={t('المبلغ', 'Amount')} value={c.amount} error={err(`charges.${i}`)} onValue={(v) => update((f) => ({ ...f, charges: f.charges.map((x, j) => (j === i ? { ...x, amount: v.replace(/[^\d.]/g, '') } : x)) }))} ltr inputMode="decimal" />
                      <button type="button" aria-label={t(`حذف الرسوم ${i + 1}`, `Remove charge ${i + 1}`)} onClick={() => update((f) => ({ ...f, charges: f.charges.filter((_, j) => j !== i) }))} className="p-2.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="secondary" onClick={() => update((f) => ({ ...f, charges: [...f.charges, { type: 'freight', description: '', amount: '' }] }))}><Plus size={16} /> {t('إضافة رسوم', 'Add Charges')}</Button>
                    {form.charges.length > 0 && <NotWired t={t} />}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3">
                    <span className="text-sm font-extrabold text-indigo-900 dark:text-indigo-200">{t('إجمالي قيمة الفاتورة (للأغراض الجمركية)', 'Total Invoice Value (for customs purposes)')}</span>
                    <span className="text-lg font-black tabular-nums text-indigo-900 dark:text-indigo-100" dir="ltr" data-testid="invoice-total">{fmt(inv.total)} {form.currency}</span>
                  </div>
                  <label className="flex items-start gap-2 text-sm font-bold text-slate-400 cursor-not-allowed">
                    <input type="checkbox" className="mt-1 w-4 h-4" disabled checked={false} readOnly />
                    <span>
                      {t('أرغب في تضمين رسوم وضرائب محسوبة مسبقًا لهذه الشحنة', 'I want to include pre-calculated duties and taxes for this shipment')}
                      <span className="block text-[11px] font-semibold">{t('غير متاح بعد — غير مدعوم في ربط DHL الحالي.', 'Not available yet — not supported by the current DHL integration.')}</span>
                    </span>
                  </label>
                </div>
              </Section>
              <Section title={t('ملخص المحتوى على الملصق', 'Contents summary on the label')}>
                <Field label={t('ملخص المحتوى (اختياري)', 'Contents summary (optional)')} error={err('content_description')} hint={t('يُؤخذ من أوصاف البنود إن تُرك فارغًا.', 'Taken from the item descriptions when left empty.')}>
                  {(id) => <TextInput id={id} value={form.content_description} onValue={(v) => set('content_description', v.slice(0, 255))} error={err('content_description')} ltr maxLength={255} placeholder={derivedContents(form) || 'Cotton T-shirts'} />}
                </Field>
              </Section>
            </>
          )}

          {!customs && (
            <Section title={t('ما قيمة شحنتك؟', 'What is the value of your shipment?')}>
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,14rem)] gap-2 max-w-lg">
                <Field label={t('القيمة', 'Value')} error={err('declared_value')}>{(id) => <TextInput id={id} value={form.declared_value} onValue={(v) => set('declared_value', v.replace(/[^\d.]/g, ''))} error={err('declared_value')} ltr inputMode="decimal" />}</Field>
                <Field label={t('العملة', 'Currency')}>{(id) => <CurrencySelect id={id} value={form.currency} onChange={(v) => set('currency', v)} lang={lang} t={t} />}</Field>
              </div>
            </Section>
          )}

          <References refs={form.references} onChange={(r) => set('references', r)} err={err} t={t} />

          <Section title={t('احمِ شحنتك', 'Protect Your Shipment')} icon={<Shield size={18} className="text-indigo-600" />}
            description={t('شحنتك ثمينة لك ولنا — لا تنسَ حمايتها!', "You value your shipment and so do we — don't forget to protect your shipment!")}>
            <label className="flex items-start gap-2 text-sm font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
              <input type="checkbox" className="mt-1 w-4 h-4 accent-indigo-600" checked={docs ? form.document_protection : form.insurance}
                onChange={(ev) => set(docs ? 'document_protection' : 'insurance', ev.target.checked)} />
              <span>{docs
                ? t('أرغب في إضافة حماية لشحنتي (خدمة المسؤولية الممتدة للمستندات)', 'I would like to add shipment protection to my shipment (Document Extended Liability Service)')
                : t('أرغب في تأمين شحنتي', 'I would like to insure my shipment')}</span>
            </label>
            {(docs ? form.document_protection : form.insurance) && (
              <p className="mt-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-start gap-1.5">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                {t('اختيارك محفوظ، لكن خدمة الحماية/التأمين لدى DHL غير مربوطة بعد — لا تُضاف إلى الشحنة ولا إلى سعرها.', "Your choice is saved, but DHL's protection / insurance service is not connected yet — it is not added to the shipment or its price.")}
              </p>
            )}
          </Section>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />{t('DHL تقبل الأحرف اللاتينية فقط في بيانات الشحنة.', 'DHL accepts Latin characters only in shipment data.')}</p>
        </div>
        <SidePanel w={w} t={t} lang={lang} />
      </div>
    </div>
  );
}
