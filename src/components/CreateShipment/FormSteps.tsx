/**
 * Steps of «إنشاء شحنة»: packages (the Parties screen lives in
 * PartiesStep.tsx, Shipment Details in DetailsStep.tsx, the Customs Invoice in
 * CustomsStep.tsx, Payment in PaymentStep.tsx), plus the pickup-address fields. Arabic or English (the page's own AR | EN). Field
 * errors come from the Backend's validation (mapped by
 * wizardModel.locateIssue) — never re-implemented here.
 */
import React from 'react';
import { Copy, Package, Plus, Trash2 } from 'lucide-react';
import { CountrySelect, Field, Note, Section, SelectInput, TextInput, Button } from './ui';
import { useCsLang } from './csLang';
import {
  emptyPackage, kg, packageTotals, translateIssue, type FieldErrors, type PartyForm, type WizardForm,
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
