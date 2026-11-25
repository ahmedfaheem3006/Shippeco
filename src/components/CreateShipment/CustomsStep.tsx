/**
 * Step 3 «تفاصيل الفاتورة الجمركية / Customs Invoice Details» — the MyDHL+
 * Customs Invoice workflow on SHIPPEC's design system (AR / EN):
 *
 *   Create Invoice        DHL generates the invoice (commercial / proforma);
 *                         invoice number optional («include an invoice number»),
 *                         remarks, route-aware declaration statements, Paperless
 *                         Trade (only while the server may upload it).
 *   Use My Own Invoice    «My Invoice Number»; no DHL-rendered invoice.
 *   Both                  additional parties (not wired yet — shown as such),
 *                         additional customs documents (DHL type code + ID),
 *                         Electronic Export Filing (US origin only, not wired),
 *                         a read-only summary from Shipment Details / Packages.
 *
 * Every rule that matters is the Backend's (draftIssues / validateDataOnly);
 * customsGate only keeps Next honest. Nothing here is sent to DHL directly.
 */
import React, { useEffect, useState } from 'react';
import { Check, FilePlus2, FileText, Plus, Receipt, Trash2, Users } from 'lucide-react';
import { dhlShipmentService, type ShipmentOptions } from '../../services/dhlShipment.service';
import { Button, ChoiceCards, Field, inputCls, Note, Section, SelectInput, TextInput } from './ui';
import { useCsLang } from './csLang';
import {
  CUSTOMS_DOCUMENT_ID_MAX, CUSTOMS_DOCUMENT_TYPES, customsGate, declarationOptions, declarationPreview, effectiveInvoiceType, invoiceTotals, itemTotals, kg, needsUsExportFiling,
  packageTotals, purposeLabel, remarkLines, REMARK_MAX, REMARKS_MAX_LINES, suggestedInvoiceType, translateIssue, type WizardForm,
} from './wizardModel';
import type { Wizard } from './useShipmentWizard';

const DECLARATION_LABELS: Record<string, [string, string]> = {
  certificate_of_origin: ['شهادة المنشأ (إقرار)', 'Certificate of Origin'],
  usmca: ['إقرار NAFTA / USMCA', 'NAFTA / USMCA (Declaration Statement)'],
};

/** A labelled checkbox row in SHIPPEC style. */
function Check2({ checked, onChange, label, description, disabled, testId }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description?: React.ReactNode; disabled?: boolean; testId?: string;
}) {
  return (
    <label className={`flex items-start gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`} data-testid={testId}>
      <input type="checkbox" className="mt-1 accent-indigo-600" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0">
        <span className="block text-sm font-extrabold text-slate-900 dark:text-white">{label}</span>
        {description && <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">{description}</span>}
      </span>
    </label>
  );
}

/**
 * The invoice number + date DHL requires on every customs shipment (MyDHL REST:
 * content.exportDeclarations[].invoice { number, date }). Both typed by the person — never invented;
 * «Use the shipment date» fills the date only when the person clicks it.
 */
/**
 * «Create Invoice»: the invoice number / date SHIPPEC issues (CI-<draft reference>, the sender's date at first
 * issue) — read-only, nothing to type (as in MyDHL+); stable after save, refresh, validation and reload.
 */
function GeneratedInvoice({ w }: { w: Wizard }) {
  const { t } = useCsLang();
  const sh = w.shipment;
  const issued = sh && (sh['shipment_details_extra'] as { customs_invoice_mode?: string } | null)?.customs_invoice_mode === 'create' && sh.customs_invoice_number
    ? { number: sh.customs_invoice_number, date: sh.customs_invoice_date } : null;
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-3 sm:p-4" data-testid="generated-invoice">
      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{t('رقم الفاتورة وتاريخها', 'Invoice Number and Date')}</h3>
      {issued ? (
        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div><dt className="text-[11px] font-bold text-slate-500">{t('رقم الفاتورة', 'Invoice Number')}</dt><dd className="font-extrabold font-mono" dir="ltr" data-testid="generated-invoice-number">{issued.number}</dd></div>
          <div><dt className="text-[11px] font-bold text-slate-500">{t('تاريخ الفاتورة', 'Invoice Date')}</dt><dd className="font-extrabold tabular-nums" dir="ltr" data-testid="generated-invoice-date">{issued.date ?? '—'}</dd></div>
        </dl>
      ) : (
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300" data-testid="generated-invoice-pending">{t('يُصدره SHIPPEC تلقائيًا عند حفظ المسودة — لا حاجة لإدخاله.', 'Issued automatically by SHIPPEC when the draft is saved — nothing to enter.')}</p>
      )}
      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{t('تُصدر SHIPPEC رقم الفاتورة وتاريخها (بتاريخ بلد المرسل) وتطبعهما DHL على الفاتورة التي تُنشئها.', "SHIPPEC issues the invoice number and date (the sender's date) and DHL prints them on the invoice it creates.")}</p>
    </div>
  );
}

function InvoiceIdentity({ w, err, numberLabel }: { w: Wizard; err: (k: string) => string | null; numberLabel: string }) {
  const { form, update } = w;
  const { t } = useCsLang();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="invoice-identity">
      <Field label={numberLabel} required error={err('customs_invoice_number')} hint={t('بالأحرف اللاتينية، حتى 35 حرفًا.', 'Latin characters, up to 35.')}>
        {(id) => <TextInput id={id} value={form.customs_invoice_number} onValue={(v) => update((f) => ({ ...f, customs_invoice_number: v.slice(0, 35) }))} error={err('customs_invoice_number')} ltr maxLength={35} />}
      </Field>
      <div className="min-w-0">
        <Field label={t('تاريخ الفاتورة', 'Invoice Date')} required error={err('customs_invoice_date')}>
          {(id) => <TextInput id={id} type="date" value={form.customs_invoice_date} onValue={(v) => update((f) => ({ ...f, customs_invoice_date: v }))} error={err('customs_invoice_date')} />}
        </Field>
        {!form.customs_invoice_date && form.shipment_date && (
          <button type="button" className="mt-1 text-[11px] font-bold text-indigo-600 hover:underline" onClick={() => update((f) => ({ ...f, customs_invoice_date: f.shipment_date }))}>
            {t('استخدام تاريخ الشحن', 'Use the shipment date')} (<span dir="ltr">{form.shipment_date}</span>)
          </button>
        )}
      </div>
    </div>
  );
}

export function StepCustoms({ w, showGate }: { w: Wizard; showGate: boolean }) {
  const { form, update, errors } = w;
  const { t, lang } = useCsLang();
  const gate = showGate ? customsGate(form, lang) : {};
  const err = (k: string) => gate[k] ?? (errors[k] ? translateIssue(errors[k], lang) : null);
  const [opts, setOpts] = useState<ShipmentOptions | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.resolve(dhlShipmentService.options()).then((o) => { if (alive) setOpts(o ?? null); }, () => { if (alive) setOpts(null); });
    return () => { alive = false; };
  }, []);
  // Unknown until the server answers: Paperless is offered only when the upload may really run here.
  const paperlessAvailable = opts?.features?.paperless_upload === true;
  const set = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => update((f) => ({ ...f, [k]: v }));
  const create = form.customs_invoice_mode === 'create';
  const suggestion = suggestedInvoiceType(form.shipment_purpose);
  const totals = itemTotals(form.items);
  const inv = invoiceTotals(form);
  const pk = packageTotals(form.packages);
  const lines = remarkLines(form.invoice_remarks);
  const declarations = declarationOptions(form);

  return (
    <div className="space-y-4" data-testid="customs-step">
      <Section
        title={t('تفاصيل الفاتورة الجمركية', 'Customs Invoice Details')}
        icon={<Receipt size={18} className="text-indigo-600" />}
        description={t(
          'يمكنك تقديم معلومات إضافية تظهر على فاتورة DHL الجمركية، أو استخدام فاتورتك الجمركية الخاصة. ويمكنك أيضًا تقديم أي مستندات جمركية إضافية لهذه الشحنة.',
          'You can provide additional information to appear on your DHL customs invoice or use your own customs invoice. You can also provide additional customs-related documents for this shipment.',
        )}
      >
        <ChoiceCards
          name={t('طريقة الفاتورة الجمركية', 'Customs invoice option')}
          value={form.customs_invoice_mode}
          onChange={(v) => update((f) => ({ ...f, customs_invoice_mode: v }))}
          options={[
            { value: 'create', title: t('إنشاء فاتورة', 'Create Invoice'), icon: <FilePlus2 size={18} />, description: t('تُنشئ DHL الفاتورة من بنود الشحنة.', 'DHL creates the invoice from the shipment items.') },
            { value: 'own', title: t('استخدام فاتورتي الخاصة', 'Use My Own Invoice'), icon: <FileText size={18} />, description: t('ترفق فاتورتك مع الشحنة؛ لا تُنشئ DHL فاتورة.', 'Your invoice travels with the shipment; DHL creates none.') },
          ]}
        />
      </Section>

      <Section title={t('تفاصيل الفاتورة', 'Invoice Details')}>
        {create ? (
          <div className="space-y-4" data-testid="create-invoice">
            <div>
              <span className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">{t('نوع الفاتورة', 'Invoice type')}<span className="text-red-500 ms-0.5" aria-hidden="true">*</span></span>
              <ChoiceCards
                name={t('نوع الفاتورة', 'Invoice type')}
                value={effectiveInvoiceType(form) as 'commercial' | 'proforma'}
                onChange={(v) => set('dhl_invoice_type', v)}
                options={[
                  { value: 'commercial', title: t('فاتورة تجارية (Commercial)', 'Commercial Invoice'), description: t('للبيع والشحنات التجارية.', 'For sales and commercial shipments.') },
                  { value: 'proforma', title: t('فاتورة مبدئية (Proforma)', 'Proforma Invoice'), description: t('للهدايا والعينات والأغراض الشخصية — دون بيع.', 'For gifts, samples and personal goods — no sale.') },
                ]}
              />
              {err('dhl_invoice_type') && (
                <p className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-400" role="alert">{err('dhl_invoice_type')}</p>
              )}
              {suggestion && form.shipment_purpose ? (
                <p className="mt-1 text-[11px] text-slate-500" data-testid="invoice-type-suggestion">
                  {t(`غرض الشحنة «${purposeLabel(form.shipment_purpose, 'ar')}» يُستخدم معه عادةً `, `For the purpose «${purposeLabel(form.shipment_purpose, 'en')}» DHL usually uses a `)}
                  <b>{suggestion === 'commercial' ? t('فاتورة تجارية', 'Commercial Invoice') : t('فاتورة مبدئية', 'Proforma Invoice')}</b>
                  {effectiveInvoiceType(form) !== suggestion ? (
                    <> · <button type="button" className="font-bold text-indigo-600 hover:underline" onClick={() => set('dhl_invoice_type', suggestion)}>{t('استخدامها', 'Use it')}</button></>
                  ) : !form.dhl_invoice_type && (
                    <span data-testid="invoice-type-preselected"> · {t('محدّدة تلقائيًا من غرض الشحنة — يمكنك تغييرها.', 'Selected from the purpose — you can change it.')}</span>
                  )}
                </p>
              ) : null}
            </div>

            <GeneratedInvoice w={w} />

            <Field
              label={t('معلومات إضافية على الفاتورة (ملاحظات)', 'Additional Invoice Information (Remarks)')}
              error={err('invoice_remarks')}
              hint={t(`حتى ${REMARKS_MAX_LINES} أسطر، ${REMARK_MAX} حرفًا لكل سطر، بالإنجليزية (حد DHL) · ${lines.length}/${REMARKS_MAX_LINES}`, `Up to ${REMARKS_MAX_LINES} lines, ${REMARK_MAX} characters each, English (DHL limit) · ${lines.length}/${REMARKS_MAX_LINES}`)}
            >
              {(id) => (
                <textarea id={id} value={form.invoice_remarks} rows={3} dir="ltr" aria-invalid={!!err('invoice_remarks')}
                  onChange={(e) => set('invoice_remarks', e.target.value.slice(0, (REMARK_MAX + 1) * REMARKS_MAX_LINES + 2))}
                  className={`${inputCls(err('invoice_remarks'))} resize-y text-start`} />
              )}
            </Field>

            <div data-testid="declaration-statements">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white mb-2">{t('إقرارات جمركية', 'Declaration Statements')}</h3>
              {err('declaration_statements') && <p className="mb-2 text-[11px] font-semibold text-red-600" role="alert">{err('declaration_statements')}</p>}
              <div className="space-y-2">
                {declarations.map((d) => {
                  const preview = declarationPreview(d.id, form);
                  return (
                    <Check2
                      key={d.id}
                      testId={`declaration-${d.id}`}
                      checked={d.supported && form.declaration_statements.includes(d.id)}
                      disabled={!d.supported}
                      onChange={(v) => update((f) => ({ ...f, declaration_statements: v ? [...new Set([...f.declaration_statements, d.id])] : f.declaration_statements.filter((x) => x !== d.id) }))}
                      label={t(...(DECLARATION_LABELS[d.id] ?? [d.id, d.id]))}
                      description={!d.supported
                        ? t('لهذا المسار في أمريكا الشمالية فقط — غير مربوط بـ DHL في SHIPPEC بعد.', 'North-American routes only — not connected to DHL in SHIPPEC yet.')
                        : preview
                          ? <>{t('يُطبع على فاتورة DHL:', 'Printed on the DHL invoice:')} <span dir="ltr" className="font-mono">“{preview}”</span></>
                          : t('يُبنى النص من بلد صنع البنود — أكمل بلد الصنع في «تفاصيل الشحنة».', 'The text is built from the items\' country of manufacture — complete it in «Shipment Details».')}
                    />
                  );
                })}
              </div>
            </div>

            <div data-testid="paperless-box">
              <Check2
                checked={form.paperless_trade}
                disabled={!paperlessAvailable && !form.paperless_trade}
                onChange={(v) => set('paperless_trade', v)}
                label="Paperless Trade (WY)"
                description={t(
                  'تستلم DHL مستندات الجمارك إلكترونيًا بدل الاعتماد على النسخ الورقية فقط: تُرفع فاتورة DHL إلى الشحنة بعد إنشائها بعشر دقائق.',
                  "DHL receives the customs documents electronically instead of relying only on paper copies: DHL's invoice is uploaded to the shipment ten minutes after it is created.",
                )}
              />
              {!paperlessAvailable && (
                <div className="mt-2" data-testid="paperless-unavailable">
                  <Note tone={form.paperless_trade ? 'warn' : 'info'}>
                    {opts == null
                      ? t('جارٍ التحقق من إتاحة رفع Paperless Trade…', 'Checking whether the Paperless Trade upload is available…')
                      : t('رفع Paperless Trade غير مفعّل على هذا الخادم — لا يمكن اختياره الآن. اختياره وحده لا يرفع شيئًا.', 'The Paperless Trade upload is not enabled on this server — it cannot be chosen now. Ticking it alone never uploads anything.')}
                    {form.paperless_trade && opts != null && <> {t('ألغِ الخيار للمتابعة.', 'Clear it to continue.')}</>}
                  </Note>
                </div>
              )}
              {err('paperless_trade') && <p className="mt-1 text-[11px] font-semibold text-red-600" role="alert">{err('paperless_trade')}</p>}
            </div>
          </div>
        ) : (
          <div className="space-y-3" data-testid="own-invoice">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">{t('رقم الفاتورة', 'Invoice Number')}</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('إذا كانت فواتيرك مرقّمة فأدخل الرقم كما هو تمامًا.', 'If you number your invoices, provide the number exactly the same.')}</p>
              </div>
              <InvoiceIdentity w={w} err={err} numberLabel={t('رقم فاتورتي', 'My Invoice Number')} />
            </div>
            <Note>{t('مع فاتورتك الخاصة لا تُنشئ DHL فاتورة، ولا يتوفر Paperless Trade (يتطلب رفع ملف فاتورتك — غير مربوط بعد).', 'With your own invoice DHL creates none, and Paperless Trade is not available (it needs your invoice file uploaded — not connected yet).')}</Note>
            {(err('paperless_trade') || err('dhl_invoice_type')) && <Note tone="error">{err('paperless_trade') ?? err('dhl_invoice_type')}</Note>}
          </div>
        )}
      </Section>

      <Section title={t('أطراف إضافية', 'Additional Parties')} icon={<Users size={18} className="text-indigo-600" />}>
        <fieldset data-testid="additional-parties">
          <legend className="text-sm text-slate-700 dark:text-slate-200 mb-2">{t('هل توجد أطراف أخرى مشاركة في الشحنة؟', 'Are there other parties involved in the shipment?')}</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2 opacity-60 cursor-not-allowed"><input type="radio" name="additional-parties" disabled checked={false} onChange={() => undefined} /> {t('نعم', 'Yes')}</label>
            <label className="flex items-center gap-2"><input type="radio" name="additional-parties" className="accent-indigo-600" checked readOnly /> {t('لا', 'No')}</label>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{t('الأطراف الإضافية (المشتري، المستورد، المصدّر، البائع) غير مربوطة بـ DHL في SHIPPEC بعد — لذلك «نعم» غير متاح.', 'Additional parties (buyer, importer, exporter, seller) are not connected to DHL in SHIPPEC yet — so «Yes» is unavailable.')}</p>
        </fieldset>
      </Section>

      <Section
        title={t('مستندات جمركية إضافية', 'Additional Customs Documents')}
        description={t('حدّد أي مستندات جمركية إضافية ترفقها مع هذه الشحنة (النوع ورقم المستند — لا تُرفع ملفات).', 'Identify any additional customs documentation you are including with this shipment (type and document ID — no file is uploaded).')}
      >
        {err('customs_documents') && <div className="mb-3"><Note tone="error">{err('customs_documents')}</Note></div>}
        <div className="space-y-2" data-testid="customs-documents">
          {form.customs_documents.map((d, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-start rounded-2xl border border-slate-200 dark:border-slate-700 p-3" data-document={i}>
              <Field label={t('نوع المستند', 'Document type')} error={err(`customs_documents.${i}`)}>
                {(id) => (
                  <SelectInput id={id} value={d.type_code} error={err(`customs_documents.${i}`)}
                    onValue={(v) => update((f) => ({ ...f, customs_documents: f.customs_documents.map((x, j) => (j === i ? { ...x, type_code: v } : x)) }))}>
                    <option value="">{t('اختر…', 'Choose…')}</option>
                    {CUSTOMS_DOCUMENT_TYPES.map((o) => <option key={o.code} value={o.code}>{t(o.ar, o.en)} ({o.code})</option>)}
                  </SelectInput>
                )}
              </Field>
              <Field label={t('رقم المستند', 'Document ID')}>
                {(id) => (
                  <TextInput id={id} value={d.value} ltr maxLength={CUSTOMS_DOCUMENT_ID_MAX}
                    onValue={(v) => update((f) => ({ ...f, customs_documents: f.customs_documents.map((x, j) => (j === i ? { ...x, value: v.slice(0, CUSTOMS_DOCUMENT_ID_MAX) } : x)) }))} />
                )}
              </Field>
              <button type="button" className="sm:mt-5 p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 justify-self-end" aria-label={t(`حذف المستند ${i + 1}`, `Remove document ${i + 1}`)}
                onClick={() => update((f) => ({ ...f, customs_documents: f.customs_documents.filter((_, j) => j !== i) }))}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <Button variant="secondary" onClick={() => update((f) => ({ ...f, customs_documents: [...f.customs_documents, { type_code: '', value: '' }] }))}>
            <Plus size={16} /> {t('إضافة مستند آخر', 'Add Another')}
          </Button>
        </div>
      </Section>

      {needsUsExportFiling(form) && (
        <Section title={t('الإيداع الإلكتروني للتصدير', 'Electronic Export Filing')}>
          <div data-testid="us-export-filing">
            <Note>{t(
              'خاص بالصادرات من الولايات المتحدة (إعفاء FTR 30.37(a) أو رقم ITN). غير مربوط بـ DHL في SHIPPEC بعد — لا يُرسل شيء منه.',
              'US exports only (FTR 30.37(a) exemption or an ITN). Not connected to DHL in SHIPPEC yet — nothing of it is sent.',
            )}</Note>
          </div>
        </Section>
      )}

      <Section title={t('ملخص الجمارك', 'Customs summary')} description={t('من «تفاصيل الشحنة» و«الطرود» — للعرض فقط.', 'From «Shipment Details» and «Packages» — read only.')}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 p-3 text-xs" data-testid="customs-summary">
          <div><div className="font-bold text-slate-400">{t('البنود', 'Items')}</div><div className="font-extrabold tabular-nums">{form.items.length} · {inv.units} {t('وحدة', 'units')}</div></div>
          <div><div className="font-bold text-slate-400">{t('القيمة الجمركية', 'Customs value')}</div><div className="font-extrabold tabular-nums" dir="ltr">{totals.value.toFixed(2)} {form.currency}</div></div>
          <div><div className="font-bold text-slate-400">{t('الوزن الصافي', 'Net weight')}</div><div className="font-extrabold tabular-nums">{kg(totals.net, lang)}</div></div>
          <div><div className="font-bold text-slate-400">{t('الوزن الإجمالي للبنود', 'Gross weight (lines)')}</div><div className="font-extrabold tabular-nums">{kg(totals.gross, lang)}</div></div>
          <div><div className="font-bold text-slate-400">{t('وزن الطرود', 'Package weight')}</div><div className={`font-extrabold tabular-nums ${totals.gross != null && Math.abs(totals.gross - pk.weight) > 0.001 ? 'text-amber-600' : ''}`}>{kg(pk.weight, lang)}</div></div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 flex items-center gap-1"><Check size={12} /> {t('تُدخل البنود والعملة والغرض في «تفاصيل الشحنة»، والأوزان في «الطرود».', 'Items, currency and purpose are entered in «Shipment Details»; weights in «Packages».')}</p>
      </Section>
    </div>
  );
}
