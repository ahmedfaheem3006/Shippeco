/**
 * Steps of «إنشاء شحنة»: customs invoice, packages, payment & terms (the
 * Parties screen lives in PartiesStep.tsx, Shipment Details in
 * DetailsStep.tsx), plus the pickup-address fields. Arabic or English (the page's own AR | EN). Field
 * errors come from the Backend's validation (mapped by
 * wizardModel.locateIssue) — never re-implemented here.
 */
import React, { useEffect, useState } from 'react';
import { Copy, Package, Plus, Trash2, Wallet } from 'lucide-react';
import { dhlShipmentService } from '../../services/dhlShipment.service';
import { ChoiceCards, CountrySelect, Field, Note, Section, SelectInput, TextInput, Button } from './ui';
import { useCsLang } from './csLang';
import {
  emptyPackage, isInternational, itemTotals, kg, packageTotals, translateIssue, type FieldErrors, type PartyForm, type WizardForm,
} from './wizardModel';
import type { Wizard } from './useShipmentWizard';

type Props = { w: Wizard };
/** A Backend error for `key`, in the page language. */
function useErr(errors: FieldErrors) {
  const { lang } = useCsLang();
  return (key: string) => (errors[key] ? translateIssue(errors[key], lang) : null);
}

// ── Party (pickup address) ──
function PartyFields({ who, value, onChange, errors, title, icon }: {
  who: 'shipper' | 'receiver' | 'pickup_address'; value: PartyForm; onChange: (p: PartyForm) => void; errors: FieldErrors; title?: string; icon?: React.ReactNode;
}) {
  const { t } = useCsLang();
  const errOf = useErr(errors);
  const set = <K extends keyof PartyForm>(k: K, v: PartyForm[K]) => onChange({ ...value, [k]: v });
  const setNa = (k: keyof PartyForm['na'], v: string) => onChange({ ...value, na: { ...value.na, [k]: v } });
  const e = (k: string) => errOf(`${who}.${k}`);
  const sa = value.country_code === 'SA';
  return (
    <div className="space-y-3" data-party={who}>
      {title && <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">{icon}{title}</h3>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t('اسم جهة الاتصال', 'Contact name')} required error={e('contact')}>{(id) => <TextInput id={id} value={value.contact} onValue={(v) => set('contact', v)} error={e('contact')} ltr autoComplete="name" placeholder="Full name (Latin)" />}</Field>
        <Field label={t('الشركة', 'Company')} error={e('company')} hint={t('للأفراد: اكتب الاسم نفسه', 'Individuals: repeat the name')}>{(id) => <TextInput id={id} value={value.company} onValue={(v) => set('company', v)} error={e('company')} ltr placeholder="Company (Latin)" />}</Field>
        <Field label={t('نوع العنوان', 'Address type')}>{(id) => (
          <SelectInput id={id} value={value.type} onValue={(v) => set('type', v as PartyForm['type'])}>
            <option value="business">{t('تجاري', 'Business')}</option><option value="private">{t('سكني / فرد', 'Residential / individual')}</option>
          </SelectInput>
        )}</Field>
        <Field label={t('الدولة', 'Country')} required error={e('country_code')}>{(id) => <CountrySelect id={id} value={value.country_code} error={e('country_code')} onValue={(v) => onChange({ ...value, country_code: v, use_na: v === 'SA' })} />}</Field>
      </div>

      {sa && value.use_na ? (
        <div className="rounded-2xl border border-slate-100 dark:border-slate-700 p-3 space-y-3 bg-slate-50/50 dark:bg-slate-900/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">{t('العنوان الوطني السعودي', 'Saudi National Address')}</span>
            <button type="button" className="text-[11px] font-bold text-indigo-600 hover:underline" onClick={() => set('use_na', false)}>{t('إدخال أسطر العنوان يدويًا', 'Enter the address lines manually')}</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label={t('رقم المبنى', 'Building number')} required error={e('address_line1')} hint={t('4 أرقام', '4 digits')}>{(id) => <TextInput id={id} value={value.na.building_number} onValue={(v) => setNa('building_number', v.replace(/\D/g, '').slice(0, 4))} error={e('address_line1')} ltr inputMode="numeric" placeholder="1234" />}</Field>
            <Field label={t('اسم الشارع', 'Street')} required className="col-span-1 sm:col-span-3">{(id) => <TextInput id={id} value={value.na.street} onValue={(v) => setNa('street', v)} ltr placeholder="King Fahd Road" />}</Field>
            <Field label={t('الرقم الإضافي', 'Additional number')} required error={e('address_line2')} hint={t('4 أرقام', '4 digits')}>{(id) => <TextInput id={id} value={value.na.additional_number} onValue={(v) => setNa('additional_number', v.replace(/\D/g, '').slice(0, 4))} error={e('address_line2')} ltr inputMode="numeric" placeholder="5678" />}</Field>
            <Field label={t('الحي', 'District')} required className="col-span-1 sm:col-span-2">{(id) => <TextInput id={id} value={value.na.district} onValue={(v) => setNa('district', v)} ltr placeholder="Al Olaya" />}</Field>
            <Field label={t('العنوان المختصر', 'Short address')} error={e('address_line3')} hint={t('4 أحرف + 4 أرقام', '4 letters + 4 digits')}>{(id) => <TextInput id={id} value={value.na.short_address} onValue={(v) => setNa('short_address', v.toUpperCase().slice(0, 8))} error={e('address_line3')} ltr placeholder="RRRD2929" />}</Field>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t('سطر العنوان 1', 'Address line 1')} required error={e('address_line1')} className="sm:col-span-2">{(id) => <TextInput id={id} value={value.address_line1} onValue={(v) => set('address_line1', v)} error={e('address_line1')} ltr />}</Field>
          <Field label={t('سطر العنوان 2', 'Address line 2')} error={e('address_line2')}>{(id) => <TextInput id={id} value={value.address_line2} onValue={(v) => set('address_line2', v)} error={e('address_line2')} ltr />}</Field>
          <Field label={t('الحي / المنطقة', 'District / area')} error={e('address_line3')}>{(id) => <TextInput id={id} value={value.address_line3} onValue={(v) => set('address_line3', v)} error={e('address_line3')} ltr />}</Field>
          {sa && <button type="button" className="text-[11px] font-bold text-indigo-600 hover:underline text-start" onClick={() => set('use_na', true)}>{t('استخدام العنوان الوطني', 'Use the National Address')}</button>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label={t('المدينة', 'City')} required error={e('city')}>{(id) => <TextInput id={id} value={value.city} onValue={(v) => set('city', v)} error={e('city')} ltr placeholder="City (Latin)" />}</Field>
        <Field label={t('الولاية / المقاطعة', 'State / province')} error={e('province')} hint={value.country_code === 'US' ? t('مطلوبة للولايات المتحدة (مثل DE)', 'Required for the United States (e.g. DE)') : undefined}>{(id) => <TextInput id={id} value={value.province} onValue={(v) => set('province', v.toUpperCase())} error={e('province')} ltr />}</Field>
        <Field label={t('الرمز البريدي', 'Postal code')} error={e('postal_code')} required={sa || value.country_code === 'US'}>{(id) => <TextInput id={id} value={value.postal_code} onValue={(v) => set('postal_code', v)} error={e('postal_code')} ltr inputMode="numeric" />}</Field>
        <Field label={t('الجوال', 'Phone')} required error={e('phone')} hint={t('بالصيغة الدولية مثل +9665…', 'International format, e.g. +9665…')}>{(id) => <TextInput id={id} type="tel" value={value.phone} onValue={(v) => set('phone', v)} error={e('phone')} ltr autoComplete="tel" placeholder="+966…" />}</Field>
        <Field label={t('البريد الإلكتروني', 'Email')} error={e('email')} className="sm:col-span-2">{(id) => <TextInput id={id} type="email" value={value.email} onValue={(v) => set('email', v)} error={e('email')} ltr autoComplete="email" />}</Field>
      </div>
    </div>
  );
}
export { PartyFields };

// ── Customs ──
/**
 * The customs invoice header (international goods). The items, purpose and
 * currency are entered on «تفاصيل الشحنة» (Shipment Details).
 */
export function StepCustoms({ w }: Props) {
  const { form, update, errors } = w;
  const { t, lang } = useCsLang();
  const err = useErr(errors);
  const totals = itemTotals(form.items);
  const pk = packageTotals(form.packages);
  return (
    <div className="space-y-4">
      <Section title={t('الفاتورة الجمركية', 'Customs invoice')} description={t('بيانات الفاتورة التي تُرفق بالشحنة للجمارك.', 'The invoice that travels with the shipment for customs.')}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label={t('رقم الفاتورة', 'Invoice number')} required error={err('customs_invoice_number')}>{(id) => <TextInput id={id} value={form.customs_invoice_number} onValue={(v) => update((f) => ({ ...f, customs_invoice_number: v }))} error={err('customs_invoice_number')} ltr maxLength={35} />}</Field>
          <Field label={t('تاريخ الفاتورة', 'Invoice date')} required error={err('customs_invoice_date')}>{(id) => <TextInput id={id} type="date" value={form.customs_invoice_date} onValue={(v) => update((f) => ({ ...f, customs_invoice_date: v }))} error={err('customs_invoice_date')} />}</Field>
          <Field label={t('فاتورة تُنشئها DHL', 'Invoice created by DHL')} error={err('dhl_invoice_type')}>{(id) => (
            <SelectInput id={id} value={form.dhl_invoice_type} onValue={(v) => update((f) => ({ ...f, dhl_invoice_type: v as WizardForm['dhl_invoice_type'] }))} error={err('dhl_invoice_type')}>
              <option value="">{t('لا', 'No')}</option><option value="commercial">{t('فاتورة تجارية (Commercial)', 'Commercial invoice')}</option><option value="proforma">{t('فاتورة مبدئية (Proforma)', 'Proforma invoice')}</option>
            </SelectInput>
          )}</Field>
        </div>
        <label className="mt-3 flex items-start gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 cursor-pointer">
          <input type="checkbox" className="mt-1 accent-indigo-600" checked={form.paperless_trade} onChange={(e) => update((f) => ({ ...f, paperless_trade: e.target.checked, dhl_invoice_type: e.target.checked && !f.dhl_invoice_type ? 'commercial' : f.dhl_invoice_type }))} />
          <span>
            <span className="block text-sm font-extrabold text-slate-900 dark:text-white">Paperless Trade (WY)</span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400">{t('تُرفع فاتورة DHL إلكترونيًا إلى الشحنة بعد إنشائها بعشر دقائق — بدون نسخ ورقية. يتطلب اختيار نوع الفاتورة.', "DHL's invoice is uploaded electronically to the shipment ten minutes after it is created — no paper copies. Requires choosing the invoice type.")}</span>
          </span>
        </label>
      </Section>
      <Section title={t(`البنود (${form.items.length})`, `Items (${form.items.length})`)} description={t('البنود والعملة والغرض تُدخل في «تفاصيل الشحنة».', 'Items, currency and purpose are entered in «Shipment Details».')}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 p-3 text-xs">
          <div><div className="font-bold text-slate-400">{t('القيمة الإجمالية', 'Total value')}</div><div className="font-extrabold tabular-nums" dir="ltr">{totals.value.toFixed(2)} {form.currency}</div></div>
          <div><div className="font-bold text-slate-400">{t('الوزن الصافي', 'Net weight')}</div><div className="font-extrabold tabular-nums">{kg(totals.net, lang)}</div></div>
          <div><div className="font-bold text-slate-400">{t('الوزن الإجمالي للبنود', 'Gross weight of the lines')}</div><div className="font-extrabold tabular-nums">{kg(totals.gross, lang)}</div></div>
          <div><div className="font-bold text-slate-400">{t('وزن الطرود', 'Package weight')}</div><div className={`font-extrabold tabular-nums ${totals.gross != null && Math.abs(totals.gross - pk.weight) > 0.001 ? 'text-amber-600' : ''}`}>{kg(pk.weight, lang)}</div></div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{t('الوزن الإجمالي للبنود يجب أن يساوي وزن الطرود، والإجمالي أكبر من الصافي.', 'The gross weight of the lines must equal the package weight, and gross must exceed net.')}</p>
      </Section>
    </div>
  );
}

// ── Packages ──
export function StepPackages({ w }: Props) {
  const { form, update, errors } = w;
  const { t: tx, lang } = useCsLang();
  const err = useErr(errors);
  const tot = packageTotals(form.packages);
  const quote = w.quote;
  const kgU = lang === 'en' ? 'kg' : 'كغ';
  const cm = lang === 'en' ? 'cm' : 'سم';
  const setPkg = (i: number, k: keyof WizardForm['packages'][number], v: string) =>
    update((f) => ({ ...f, packages: f.packages.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));
  return (
    <Section
      title={tx('الطرود', 'Packages')}
      icon={<Package size={18} className="text-indigo-600" />}
      actions={<Button variant="secondary" onClick={() => update((f) => ({ ...f, packages: [...f.packages, emptyPackage()] }))}><Plus size={16} /> {tx('إضافة طرد', 'Add package')}</Button>}
    >
      {err('packages') && <div className="mb-3"><Note tone="error">{err('packages')}</Note></div>}
      <div className="space-y-3">
        {form.packages.map((p, i) => (
          <article key={i} className={`rounded-2xl border p-3 sm:p-4 ${err(`packages.${i}`) ? 'border-red-200 dark:border-red-900/40' : 'border-slate-200 dark:border-slate-700'}`} data-package={i}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{tx(`الطرد ${i + 1}`, `Package ${i + 1}`)}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => update((f) => ({ ...f, packages: [...f.packages.slice(0, i + 1), { ...p }, ...f.packages.slice(i + 1)] }))} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label={tx(`نسخ الطرد ${i + 1}`, `Copy package ${i + 1}`)}><Copy size={16} /></button>
                {form.packages.length > 1 && <button type="button" onClick={() => update((f) => ({ ...f, packages: f.packages.filter((_, j) => j !== i) }))} className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label={tx(`حذف الطرد ${i + 1}`, `Remove package ${i + 1}`)}><Trash2 size={16} /></button>}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Field label={tx('العدد', 'Quantity')} hint={tx('طرود متطابقة', 'Identical packages')}>{(id) => <TextInput id={id} value={p.quantity} onValue={(v) => setPkg(i, 'quantity', v.replace(/\D/g, '').slice(0, 3))} ltr inputMode="numeric" />}</Field>
              <Field label={tx(`الوزن (${kgU})`, `Weight (${kgU})`)} required error={err(`packages.${i}`)}>{(id) => <TextInput id={id} value={p.weight_kg} onValue={(v) => setPkg(i, 'weight_kg', v)} ltr inputMode="decimal" />}</Field>
              <Field label={tx(`الطول (${cm})`, `Length (${cm})`)} required>{(id) => <TextInput id={id} value={p.length_cm} onValue={(v) => setPkg(i, 'length_cm', v)} ltr inputMode="decimal" />}</Field>
              <Field label={tx(`العرض (${cm})`, `Width (${cm})`)} required>{(id) => <TextInput id={id} value={p.width_cm} onValue={(v) => setPkg(i, 'width_cm', v)} ltr inputMode="decimal" />}</Field>
              <Field label={tx(`الارتفاع (${cm})`, `Height (${cm})`)} required>{(id) => <TextInput id={id} value={p.height_cm} onValue={(v) => setPkg(i, 'height_cm', v)} ltr inputMode="decimal" />}</Field>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 p-3 text-xs" aria-live="polite">
        <div><div className="font-bold text-slate-400">{tx('عدد الطرود', 'Pieces')}</div><div className="text-base font-extrabold tabular-nums">{tot.pieces}</div></div>
        <div><div className="font-bold text-slate-400">{tx('الوزن الفعلي الإجمالي', 'Total actual weight')}</div><div className="text-base font-extrabold tabular-nums">{kg(tot.weight, lang)}</div></div>
        <div><div className="font-bold text-slate-400">{tx('الوزن الحجمي (من DHL)', 'Volumetric weight (DHL)')}</div><div className="text-base font-extrabold tabular-nums">{quote?.weight?.volumetric != null ? kg(quote.weight.volumetric, lang) : '—'}</div></div>
        <div><div className="font-bold text-slate-400">{tx('وزن التسعير (من DHL)', 'Billed weight (DHL)')}</div><div className="text-base font-extrabold tabular-nums">{quote?.weight?.provided != null ? kg(quote.weight.provided, lang) : '—'}</div></div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{tx('الأوزان الحجمية ووزن التسعير تظهر فقط كما تعيدها DHL بعد طلب الأسعار — لا يُحسب وزن مُحاسَب تقديريًا.', 'Volumetric and billed weights appear only as DHL returns them with the rates — no chargeable weight is estimated.')}</p>
    </Section>
  );
}

// ── Payment & terms ──
export function StepPayment({ w }: Props) {
  const { form, update, errors, customs } = w;
  const { t } = useCsLang();
  const err = useErr(errors);
  const [incoterms, setIncoterms] = useState<Array<{ code: string; name: string | null }>>([]);
  useEffect(() => {
    if (!customs) return;
    dhlShipmentService.incoterms().then((r) => setIncoterms(r.items), () => setIncoterms([]));
  }, [customs]);
  return (
    <div className="space-y-4">
      <Section title={t('من يدفع أجرة النقل؟', 'Who pays the transportation charges?')} icon={<Wallet size={18} className="text-indigo-600" />}>
        <ChoiceCards
          name={t('دافع أجرة النقل', 'Transportation payer')} columns={3}
          value={form.transport_payer}
          onChange={(v) => update((f) => ({ ...f, transport_payer: v }))}
          options={[
            { value: 'shipper', title: t('SHIPPEC (المرسل)', 'SHIPPEC (sender)'), description: t('تُحسب على حساب SHIPPEC لدى DHL.', "Billed to SHIPPEC's DHL account.") },
            { value: 'receiver', title: t('المستلم', 'Receiver'), description: t('برقم حساب المستلم لدى DHL.', "With the receiver's DHL account number.") },
            { value: 'third_party', title: t('طرف ثالث', 'Third party'), description: t('برقم حساب DHL لطرف آخر.', "With another party's DHL account number.") },
          ]}
        />
        {form.transport_payer !== 'shipper' && (
          <div className="mt-3 max-w-sm">
            <Field label={t('رقم حساب DHL للدافع', "Payer's DHL account number")} required error={err('transport_payer_account')} hint={t('رقم حساب الطرف الآخر فقط — حساب SHIPPEC لا يُعرض ولا يُطلب.', "The other party's account only — SHIPPEC's account is never shown or asked.")}>
              {(id) => <TextInput id={id} value={form.transport_payer_account} onValue={(v) => update((f) => ({ ...f, transport_payer_account: v.replace(/\D/g, '').slice(0, 12) }))} error={err('transport_payer_account')} ltr inputMode="numeric" />}
            </Field>
          </div>
        )}
      </Section>

      {customs ? (
        <>
          <Section title={t('من يدفع الرسوم والضرائب الجمركية؟', 'Who pays duties and taxes?')}>
            <ChoiceCards
              name={t('دافع الرسوم', 'Duties payer')} columns={3}
              value={form.duties_payer}
              onChange={(v) => update((f) => ({ ...f, duties_payer: v, incoterm: v === 'receiver' ? (f.incoterm === 'DDP' ? 'DAP' : f.incoterm) : 'DDP' }))}
              options={[
                { value: 'receiver', title: t('المستلم', 'Receiver'), description: t('عادةً DAP — يدفعها المستلم عند التسليم.', 'Usually DAP — the receiver pays on delivery.') },
                { value: 'shipper', title: t('SHIPPEC (المرسل)', 'SHIPPEC (sender)'), description: t('DDP — خدمة DUTY TAX PAID.', 'DDP — DUTY TAX PAID service.') },
                { value: 'third_party', title: t('طرف ثالث', 'Third party'), description: t('DDP برقم حساب DHL لطرف آخر.', "DDP with another party's DHL account number.") },
              ]}
            />
            {err('duties_payer') && <p className="mt-2 text-[11px] font-semibold text-red-600" role="alert">{err('duties_payer')}</p>}
            {form.duties_payer === 'third_party' && (
              <div className="mt-3 max-w-sm">
                <Field label={t('رقم حساب DHL لدافع الرسوم', "Duties payer's DHL account number")} required error={err('duties_payer_account')}>
                  {(id) => <TextInput id={id} value={form.duties_payer_account} onValue={(v) => update((f) => ({ ...f, duties_payer_account: v.replace(/\D/g, '').slice(0, 12) }))} error={err('duties_payer_account')} ltr inputMode="numeric" />}
                </Field>
              </div>
            )}
          </Section>
          <Section title={t('شروط التسليم (Incoterm)', 'Terms of trade (Incoterm)')} description={t('القائمة من DHL نفسها. التوافق مع دافع الرسوم يتحقق منه الخادم.', "The list comes from DHL itself. The server checks it against the duties payer.")}>
            <div className="max-w-md">
              <Field label="Incoterm" required error={err('incoterm')}>
                {(id) => (
                  <SelectInput id={id} value={form.incoterm} onValue={(v) => update((f) => ({ ...f, incoterm: v }))} error={err('incoterm')}>
                    {(incoterms.length ? incoterms : [{ code: form.incoterm || 'DAP', name: null }]).map((i) => <option key={i.code} value={i.code}>{i.code}{i.name ? ` — ${i.name}` : ''}</option>)}
                  </SelectInput>
                )}
              </Field>
            </div>
            <div className="mt-3"><Note>{t('المستلم يدفع الرسوم ← عادةً DAP. المرسل أو طرف ثالث يدفعها ← DDP (يشترطه الخادم).', 'Receiver pays duties → usually DAP. Sender or a third party pays → DDP (required by the server).')}</Note></div>
          </Section>
        </>
      ) : (
        <Note>{t(`لا رسوم جمركية على هذه الشحنة (${isInternational(form) ? 'مستندات' : 'شحنة محلية'}).`, `No customs duties on this shipment (${isInternational(form) ? 'documents' : 'domestic'}).`)}</Note>
      )}
    </div>
  );
}
