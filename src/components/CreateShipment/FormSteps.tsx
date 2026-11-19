/**
 * Steps 1–5 of «إنشاء شحنة»: parties, shipment details, customs, packages,
 * payment & terms. Field errors come from the Backend's validation (mapped
 * by wizardModel.locateIssue) — never re-implemented here.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight, Building2, Copy, FileText, Loader2, Package, Plus, Search, Trash2, User, UserCheck, Wallet,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../../utils/apiClient';
import { useAuthStore } from '../../hooks/useAuthStore';
import { dhlShipmentService, searchClients, type ShipmentPurpose } from '../../services/dhlShipment.service';
import {
  Button, ChoiceCards, CountrySelect, Field, Note, Section, SelectInput, TextInput,
} from './ui';
import {
  DHL_EXPORT_REASONS, emptyItem, emptyPackage, emptyParty, isInternational, ITEM_UNITS, itemTotals, packageTotals, PURPOSE_LABELS, toContent,
  type FieldErrors, type ItemForm, type PartyForm, type WizardForm,
} from './wizardModel';
import type { Wizard } from './useShipmentWizard';

type Props = { w: Wizard };
const err = (errors: FieldErrors, key: string) => errors[key] ?? null;

// ── Party ──
function PartyFields({ who, value, onChange, errors, title, icon }: {
  who: 'shipper' | 'receiver' | 'pickup_address'; value: PartyForm; onChange: (p: PartyForm) => void; errors: FieldErrors; title?: string; icon?: React.ReactNode;
}) {
  const set = <K extends keyof PartyForm>(k: K, v: PartyForm[K]) => onChange({ ...value, [k]: v });
  const setNa = (k: keyof PartyForm['na'], v: string) => onChange({ ...value, na: { ...value.na, [k]: v } });
  const e = (k: string) => err(errors, `${who}.${k}`);
  const sa = value.country_code === 'SA';
  return (
    <div className="space-y-3" data-party={who}>
      {title && <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">{icon}{title}</h3>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="اسم جهة الاتصال" required error={e('contact')}>{(id) => <TextInput id={id} value={value.contact} onValue={(v) => set('contact', v)} error={e('contact')} ltr autoComplete="name" placeholder="Full name (Latin)" />}</Field>
        <Field label="الشركة" error={e('company')} hint="للأفراد: اكتب الاسم نفسه">{(id) => <TextInput id={id} value={value.company} onValue={(v) => set('company', v)} error={e('company')} ltr placeholder="Company (Latin)" />}</Field>
        <Field label="نوع العنوان">{(id) => (
          <SelectInput id={id} value={value.type} onValue={(v) => set('type', v as PartyForm['type'])}>
            <option value="business">تجاري</option><option value="private">سكني / فرد</option>
          </SelectInput>
        )}</Field>
        <Field label="الدولة" required error={e('country_code')}>{(id) => <CountrySelect id={id} value={value.country_code} error={e('country_code')} onValue={(v) => onChange({ ...value, country_code: v, use_na: v === 'SA' })} />}</Field>
      </div>

      {sa && value.use_na ? (
        <div className="rounded-2xl border border-slate-100 dark:border-slate-700 p-3 space-y-3 bg-slate-50/50 dark:bg-slate-900/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-slate-700 dark:text-slate-200">العنوان الوطني السعودي</span>
            <button type="button" className="text-[11px] font-bold text-indigo-600 hover:underline" onClick={() => set('use_na', false)}>إدخال أسطر العنوان يدويًا</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="رقم المبنى" required error={e('address_line1')} hint="4 أرقام">{(id) => <TextInput id={id} value={value.na.building_number} onValue={(v) => setNa('building_number', v.replace(/\D/g, '').slice(0, 4))} error={e('address_line1')} ltr inputMode="numeric" placeholder="1234" />}</Field>
            <Field label="اسم الشارع" required className="col-span-1 sm:col-span-3">{(id) => <TextInput id={id} value={value.na.street} onValue={(v) => setNa('street', v)} ltr placeholder="King Fahd Road" />}</Field>
            <Field label="الرقم الإضافي" required error={e('address_line2')} hint="4 أرقام">{(id) => <TextInput id={id} value={value.na.additional_number} onValue={(v) => setNa('additional_number', v.replace(/\D/g, '').slice(0, 4))} error={e('address_line2')} ltr inputMode="numeric" placeholder="5678" />}</Field>
            <Field label="الحي" required className="col-span-1 sm:col-span-2">{(id) => <TextInput id={id} value={value.na.district} onValue={(v) => setNa('district', v)} ltr placeholder="Al Olaya" />}</Field>
            <Field label="العنوان المختصر" error={e('address_line3')} hint="4 أحرف + 4 أرقام">{(id) => <TextInput id={id} value={value.na.short_address} onValue={(v) => setNa('short_address', v.toUpperCase().slice(0, 8))} error={e('address_line3')} ltr placeholder="RRRD2929" />}</Field>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="سطر العنوان 1" required error={e('address_line1')} className="sm:col-span-2">{(id) => <TextInput id={id} value={value.address_line1} onValue={(v) => set('address_line1', v)} error={e('address_line1')} ltr />}</Field>
          <Field label="سطر العنوان 2" error={e('address_line2')}>{(id) => <TextInput id={id} value={value.address_line2} onValue={(v) => set('address_line2', v)} error={e('address_line2')} ltr />}</Field>
          <Field label="الحي / المنطقة" error={e('address_line3')}>{(id) => <TextInput id={id} value={value.address_line3} onValue={(v) => set('address_line3', v)} error={e('address_line3')} ltr />}</Field>
          {sa && <button type="button" className="text-[11px] font-bold text-indigo-600 hover:underline text-start" onClick={() => set('use_na', true)}>استخدام العنوان الوطني</button>}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="المدينة" required error={e('city')}>{(id) => <TextInput id={id} value={value.city} onValue={(v) => set('city', v)} error={e('city')} ltr placeholder="City (Latin)" />}</Field>
        <Field label="الولاية / المقاطعة" error={e('province')} hint={value.country_code === 'US' ? 'مطلوبة للولايات المتحدة (مثل DE)' : undefined}>{(id) => <TextInput id={id} value={value.province} onValue={(v) => set('province', v.toUpperCase())} error={e('province')} ltr />}</Field>
        <Field label="الرمز البريدي" error={e('postal_code')} required={sa || value.country_code === 'US'}>{(id) => <TextInput id={id} value={value.postal_code} onValue={(v) => set('postal_code', v)} error={e('postal_code')} ltr inputMode="numeric" />}</Field>
        <Field label="الجوال" required error={e('phone')} hint="بالصيغة الدولية مثل +9665…">{(id) => <TextInput id={id} type="tel" value={value.phone} onValue={(v) => set('phone', v)} error={e('phone')} ltr autoComplete="tel" placeholder="+966…" />}</Field>
        <Field label="البريد الإلكتروني" error={e('email')} className="sm:col-span-2">{(id) => <TextInput id={id} type="email" value={value.email} onValue={(v) => set('email', v)} error={e('email')} ltr autoComplete="email" />}</Field>
      </div>
    </div>
  );
}
export { PartyFields };

function ClientPicker({ w }: Props) {
  const { form, update } = w;
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchClients>>>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (form.client_id && !form.client_name) {
      // GET /clients/:id answers { client: {...}, invoices, ... }
      api.get<any>(`/clients/${form.client_id}`).then((c) => update((f) => ({ ...f, client_name: c?.client?.name ?? c?.name ?? `#${f.client_id}` })), () => undefined);
    }
  }, [form.client_id, form.client_name, update]);
  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setResults([]); return; }
    const h = window.setTimeout(() => {
      setBusy(true);
      searchClients(t).then((r) => { setResults(r); setOpen(true); }, () => setResults([])).finally(() => setBusy(false));
    }, 300);
    return () => window.clearTimeout(h);
  }, [q]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const fill = (who: 'shipper' | 'receiver', c: { name: string; phone: string | null; email: string | null; city: string | null }) =>
    update((f) => ({ ...f, [who]: { ...f[who], contact: f[who].contact || c.name, company: f[who].company || c.name, phone: f[who].phone || (c.phone ?? ''), email: f[who].email || (c.email ?? ''), city: f[who].city || (c.city ?? '') } }));
  const selected = form.client_id ? { id: form.client_id, name: form.client_name } : null;
  return (
    <div ref={box} className="space-y-2">
      {selected ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-900/20 px-3 py-2">
          <UserCheck size={16} className="text-indigo-600" />
          <span className="text-sm font-extrabold text-slate-900 dark:text-white">{selected.name || `#${selected.id}`}</span>
          <span className="text-[11px] text-slate-500">— تُنشأ فاتورة SHIPPEC باسم هذا العميل</span>
          <button type="button" className="ms-auto text-xs font-bold text-red-600 hover:underline" onClick={() => update((f) => ({ ...f, client_id: null, client_name: '' }))}>تغيير</button>
        </div>
      ) : (
        <Field label="عميل SHIPPEC (صاحب الفاتورة)" required error={w.errors.client ?? null} hint="ابحث بالاسم أو الجوال — لا يتغير سجل العميل الأصلي عند تعديل بيانات الشحنة">
          {(id) => (
            <div className="relative">
              <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <TextInput id={id} value={q} onValue={setQ} className="ps-9" placeholder="اسم العميل أو رقم الجوال" onFocus={() => results.length && setOpen(true)} role="combobox" aria-expanded={open} aria-autocomplete="list" />
              {busy && <Loader2 size={14} className="absolute end-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
              {open && results.length > 0 && (
                <ul role="listbox" className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
                  {results.map((c) => (
                    <li key={c.id} role="option" aria-selected={false}>
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <button type="button" className="text-start flex-1 min-w-0" onClick={() => { update((f) => ({ ...f, client_id: c.id, client_name: c.name })); setOpen(false); setQ(''); }}>
                          <span className="block text-sm font-bold text-slate-900 dark:text-white truncate">{c.name}</span>
                          <span className="block text-[11px] text-slate-500" dir="ltr">{c.phone ?? ''}{c.city ? ` · ${c.city}` : ''}</span>
                        </button>
                        <button type="button" className="text-[11px] font-bold text-indigo-600 hover:underline" onClick={() => { update((f) => ({ ...f, client_id: c.id, client_name: c.name })); fill('receiver', c); setOpen(false); setQ(''); }}>عميل + تعبئة المستلم</button>
                        <button type="button" className="text-[11px] font-bold text-indigo-600 hover:underline" onClick={() => { update((f) => ({ ...f, client_id: c.id, client_name: c.name })); fill('shipper', c); setOpen(false); setQ(''); }}>عميل + تعبئة المرسل</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Field>
      )}
    </div>
  );
}

export function StepParties({ w }: Props) {
  const { form, update, errors } = w;
  const role = useAuthStore((s) => s.user?.role);
  const canSetDefault = role === 'admin' || role === 'manager';
  const [savingDefault, setSavingDefault] = useState(false);
  const useDefault = async () => {
    try {
      const p = await dhlShipmentService.defaultShipper();
      if (!p) { toast('لا يوجد مرسل افتراضي محفوظ بعد'); return; }
      const sa = p.country_code === 'SA';
      const l1 = /^(\d{4}),?\s+(.+)$/.exec(p.address_line1 ?? ''); const l2 = /^(\d{4}),?\s+(.+)$/.exec(p.address_line2 ?? '');
      update((f) => ({ ...f, shipper: { ...emptyParty(p.country_code ?? 'SA'), ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v ?? ''])),
        type: p.type, use_na: sa && !!l1 && !!l2,
        na: { building_number: l1?.[1] ?? '', street: l1?.[2] ?? '', additional_number: l2?.[1] ?? '', district: l2?.[2] ?? '', short_address: p.address_line3 ?? '' } } as PartyForm }));
      toast.success('تمت تعبئة المرسل الافتراضي');
    } catch { toast.error('تعذر جلب المرسل الافتراضي'); }
  };
  const saveDefault = async () => {
    setSavingDefault(true);
    try {
      await dhlShipmentService.setDefaultShipper(toContent(form).shipper as never);
      toast.success('تم حفظ المرسل الافتراضي لكل الشحنات الجديدة');
    } catch (e) { toast.error(e instanceof Error && /[؀-ۿ]/.test(e.message) ? e.message : 'تعذر حفظ المرسل الافتراضي — تحقق من الحقول'); }
    finally { setSavingDefault(false); }
  };
  const swap = () => {
    if (form.items.length && !window.confirm('تبديل المرسل والمستلم يغيّر اتجاه الشحنة وقد يغيّر بيانات الجمارك — متابعة؟')) return;
    update((f) => ({ ...f, shipper: f.receiver, receiver: f.shipper }));
  };
  return (
    <div className="space-y-4">
      <Section title="العميل" icon={<UserCheck size={18} className="text-indigo-600" />} description="الفاتورة تُنشأ تلقائيًا لهذا العميل بعد إنشاء الشحنة لدى DHL.">
        <ClientPicker w={w} />
      </Section>
      <Section
        title="المرسل"
        icon={<Building2 size={18} className="text-indigo-600" />}
        actions={<>
          <Button variant="secondary" onClick={() => void useDefault()}>المرسل الافتراضي</Button>
          {canSetDefault && <Button variant="ghost" loading={savingDefault} onClick={() => void saveDefault()}>حفظ كافتراضي</Button>}
        </>}
      >
        <PartyFields who="shipper" value={form.shipper} errors={errors} onChange={(p) => update((f) => ({ ...f, shipper: p }))} />
      </Section>
      <div className="flex justify-center">
        <Button variant="secondary" onClick={swap} aria-label="تبديل المرسل والمستلم"><ArrowLeftRight size={16} /> تبديل المرسل والمستلم</Button>
      </div>
      <Section title="المستلم" icon={<User size={18} className="text-indigo-600" />}>
        <PartyFields who="receiver" value={form.receiver} errors={errors} onChange={(p) => update((f) => ({ ...f, receiver: p }))} />
      </Section>
      <Note>DHL تقبل الأحرف اللاتينية فقط في بيانات الشحنة. العناوين السعودية بصيغة العنوان الوطني (رقم المبنى + الشارع، الرقم الإضافي + الحي).</Note>
    </div>
  );
}

// ── Details ──
export function StepDetails({ w }: Props) {
  const { form, update, errors, customs } = w;
  const international = isInternational(form);
  const purposeNeedsReason = form.shipment_purpose === 'return_for_repair' || form.shipment_purpose === 'return_after_repair';
  return (
    <div className="space-y-4">
      <Section title="نوع المحتوى" icon={<FileText size={18} className="text-indigo-600" />}>
        <ChoiceCards
          name="نوع المحتوى"
          value={form.content_kind}
          onChange={(v) => update((f) => ({ ...f, content_kind: v, items: v === 'goods' && !f.items.length && international ? [emptyItem()] : f.items }))}
          options={[
            { value: 'documents', title: 'مستندات', description: 'أوراق ومستندات بلا قيمة تجارية — لا تحتاج بيانات جمركية.', icon: <FileText size={18} /> },
            { value: 'goods', title: 'طرود / بضائع', description: international ? 'بضائع دولية — تتطلب فاتورة وبيانات جمركية لكل بند.' : 'بضائع داخل الدولة — بدون بيانات جمركية.', icon: <Package size={18} /> },
          ]}
        />
        {customs && <div className="mt-3"><Note>هذه شحنة بضائع دولية: ستظهر خطوة «الجمارك» لأن الجمارك في بلد الوصول تحتاج وصف كل بند وقيمته ووزنه ورمزه (HS) وبلد المنشأ.</Note></div>}
      </Section>
      <Section title="وصف الشحنة">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="وصف المحتوى" required error={err(errors, 'content_description')} className="sm:col-span-2" hint="بالإنجليزية كما سيظهر على الملصق، مثل: Cotton T-Shirts">
            {(id) => <TextInput id={id} value={form.content_description} onValue={(v) => update((f) => ({ ...f, content_description: v }))} error={err(errors, 'content_description')} ltr maxLength={255} />}
          </Field>
          <Field label="مرجع العميل (اختياري)" error={err(errors, 'customer_reference')} hint="يطبع على الملصق، 35 حرفًا كحد أقصى">
            {(id) => <TextInput id={id} value={form.customer_reference} onValue={(v) => update((f) => ({ ...f, customer_reference: v }))} ltr maxLength={35} />}
          </Field>
          {!customs && (
            <Field label="القيمة المصرّح بها (اختياري)" error={err(errors, 'declared_value')}>
              {(id) => (
                <div className="flex gap-2">
                  <TextInput id={id} value={form.declared_value} onValue={(v) => update((f) => ({ ...f, declared_value: v }))} ltr inputMode="decimal" />
                  <TextInput aria-label="العملة" value={form.currency} onValue={(v) => update((f) => ({ ...f, currency: v.toUpperCase().slice(0, 3) }))} ltr className="!w-20" />
                </div>
              )}
            </Field>
          )}
        </div>
      </Section>
      {customs && (
        <Section title="غرض الشحنة" description="يُرسل إلى DHL كسبب التصدير ويُطبع على الفاتورة الجمركية.">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="غرض الشحنة">
            {(Object.keys(PURPOSE_LABELS) as ShipmentPurpose[]).map((p) => (
              <button key={p} type="button" role="radio" aria-checked={form.shipment_purpose === p}
                onClick={() => update((f) => ({ ...f, shipment_purpose: p, export_reason_type: p === 'return_for_repair' || p === 'return_after_repair' ? f.export_reason_type : '' }))}
                className={`px-3 py-3 rounded-2xl border text-sm font-bold text-start ${form.shipment_purpose === p ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 ring-2 ring-indigo-100 dark:ring-indigo-900/40' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-300'}`}>
                {PURPOSE_LABELS[p]}
              </button>
            ))}
          </div>
          {err(errors, 'shipment_purpose') && <p className="mt-2 text-[11px] font-semibold text-red-600" role="alert">{err(errors, 'shipment_purpose')}</p>}
          {purposeNeedsReason && (
            <div className="mt-3 space-y-2">
              <Note tone="warn">لا يوجد لدى DHL رمز موثّق لـ«{PURPOSE_LABELS[form.shipment_purpose as ShipmentPurpose]}». اختر سبب التصدير من قائمة DHL نفسها — لن يُفترض أي رمز تلقائيًا.</Note>
              <Field label="سبب التصدير لدى DHL" required error={err(errors, 'export_reason_type')}>
                {(id) => (
                  <SelectInput id={id} value={form.export_reason_type} onValue={(v) => update((f) => ({ ...f, export_reason_type: v }))} error={err(errors, 'export_reason_type')}>
                    <option value="">اختر</option>
                    {DHL_EXPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </SelectInput>
                )}
              </Field>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}

// ── Customs ──
function ItemCard({ it, i, onChange, onRemove, onCopy, errors, canRemove }: {
  it: ItemForm; i: number; onChange: (x: ItemForm) => void; onRemove: () => void; onCopy: () => void; errors: FieldErrors; canRemove: boolean;
}) {
  const set = <K extends keyof ItemForm>(k: K, v: ItemForm[K]) => onChange({ ...it, [k]: v });
  const e = (k: string) => err(errors, `items.${i}.${k}`);
  const qty = Number(it.quantity) || 0;
  const total = qty * (Number(it.unit_value) || 0);
  return (
    <article className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-3" data-item={i}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">البند {i + 1}</span>
        <div className="flex gap-1">
          <button type="button" onClick={onCopy} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label={`نسخ البند ${i + 1}`}><Copy size={16} /></button>
          {canRemove && <button type="button" onClick={onRemove} className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label={`حذف البند ${i + 1}`}><Trash2 size={16} /></button>}
        </div>
      </div>
      <Field label="الوصف" required error={e('description')}>{(id) => <TextInput id={id} value={it.description} onValue={(v) => set('description', v)} error={e('description')} ltr placeholder="Men's 100% cotton T-shirt" />}</Field>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="الكمية" required error={e('quantity')}>{(id) => <TextInput id={id} value={it.quantity} onValue={(v) => set('quantity', v.replace(/[^\d]/g, ''))} error={e('quantity')} ltr inputMode="numeric" />}</Field>
        <Field label="الوحدة" error={e('unit')}>{(id) => <SelectInput id={id} value={it.unit} onValue={(v) => set('unit', v)}>{ITEM_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</SelectInput>}</Field>
        <Field label="سعر الوحدة" required error={e('unit_value')}>{(id) => <TextInput id={id} value={it.unit_value} onValue={(v) => set('unit_value', v)} error={e('unit_value')} ltr inputMode="decimal" />}</Field>
        <Field label="الإجمالي">{() => <div className="px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-sm font-extrabold tabular-nums" dir="ltr">{total.toFixed(2)}</div>}</Field>
        <Field label="بلد المنشأ" required error={e('country_of_origin')} className="col-span-2">{(id) => <CountrySelect id={id} value={it.country_of_origin} onValue={(v) => set('country_of_origin', v)} error={e('country_of_origin')} />}</Field>
        <Field label="رمز HS للتصدير" required error={e('outbound_hs_code')}>{(id) => <TextInput id={id} value={it.outbound_hs_code} onValue={(v) => set('outbound_hs_code', v)} error={e('outbound_hs_code')} ltr placeholder="6109.10" />}</Field>
        <Field label="رمز HS للاستيراد" required error={e('inbound_hs_code')}>{(id) => <TextInput id={id} value={it.inbound_hs_code} onValue={(v) => set('inbound_hs_code', v)} error={e('inbound_hs_code')} ltr placeholder="6109.10" />}</Field>
        <Field label="الوزن الصافي للوحدة (كغ)" required error={e('unit_net_weight_kg')} className="col-span-2 sm:col-span-1">{(id) => <TextInput id={id} value={it.unit_net_weight_kg} onValue={(v) => set('unit_net_weight_kg', v)} error={e('unit_net_weight_kg')} ltr inputMode="decimal" />}</Field>
        <Field label="الوزن الإجمالي (كغ)" error={e('gross_weight_kg')} className="col-span-2 sm:col-span-3" hint="شامل التغليف — أكبر من الصافي">
          {(id) => (
            <div className="flex gap-2">
              <TextInput id={id} value={it.gross_weight_kg} onValue={(v) => set('gross_weight_kg', v)} error={e('gross_weight_kg')} ltr inputMode="decimal" />
              <SelectInput aria-label="الوزن الإجمالي لكل" value={it.gross_mode} onValue={(v) => set('gross_mode', v as ItemForm['gross_mode'])} className="!w-40">
                <option value="line">للبند كاملًا</option><option value="unit">لكل وحدة</option>
              </SelectInput>
            </div>
          )}
        </Field>
      </div>
    </article>
  );
}

export function StepCustoms({ w }: Props) {
  const { form, update, errors } = w;
  const totals = itemTotals(form.items);
  const pk = packageTotals(form.packages);
  return (
    <div className="space-y-4">
      <Section title="الفاتورة الجمركية" description="بيانات الفاتورة التي تُرفق بالشحنة للجمارك.">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Field label="رقم الفاتورة" required error={err(errors, 'customs_invoice_number')}>{(id) => <TextInput id={id} value={form.customs_invoice_number} onValue={(v) => update((f) => ({ ...f, customs_invoice_number: v }))} error={err(errors, 'customs_invoice_number')} ltr maxLength={35} />}</Field>
          <Field label="تاريخ الفاتورة" required error={err(errors, 'customs_invoice_date')}>{(id) => <TextInput id={id} type="date" value={form.customs_invoice_date} onValue={(v) => update((f) => ({ ...f, customs_invoice_date: v }))} error={err(errors, 'customs_invoice_date')} />}</Field>
          <Field label="العملة" required error={err(errors, 'currency')}>{(id) => <TextInput id={id} value={form.currency} onValue={(v) => update((f) => ({ ...f, currency: v.toUpperCase().slice(0, 3) }))} error={err(errors, 'currency')} ltr placeholder="USD" />}</Field>
          <Field label="فاتورة تُنشئها DHL" error={err(errors, 'dhl_invoice_type')}>{(id) => (
            <SelectInput id={id} value={form.dhl_invoice_type} onValue={(v) => update((f) => ({ ...f, dhl_invoice_type: v as WizardForm['dhl_invoice_type'] }))} error={err(errors, 'dhl_invoice_type')}>
              <option value="">لا</option><option value="commercial">فاتورة تجارية (Commercial)</option><option value="proforma">فاتورة مبدئية (Proforma)</option>
            </SelectInput>
          )}</Field>
        </div>
        <label className="mt-3 flex items-start gap-2 rounded-2xl border border-slate-200 dark:border-slate-700 p-3 cursor-pointer">
          <input type="checkbox" className="mt-1 accent-indigo-600" checked={form.paperless_trade} onChange={(e) => update((f) => ({ ...f, paperless_trade: e.target.checked, dhl_invoice_type: e.target.checked && !f.dhl_invoice_type ? 'commercial' : f.dhl_invoice_type }))} />
          <span>
            <span className="block text-sm font-extrabold text-slate-900 dark:text-white">Paperless Trade (WY)</span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400">تُرفع فاتورة DHL إلكترونيًا إلى الشحنة بعد إنشائها بعشر دقائق — بدون نسخ ورقية. يتطلب اختيار نوع الفاتورة.</span>
          </span>
        </label>
      </Section>

      <Section
        title={`البنود (${form.items.length})`}
        actions={<Button variant="secondary" onClick={() => update((f) => ({ ...f, items: [...f.items, emptyItem()] }))}><Plus size={16} /> إضافة بند</Button>}
      >
        {err(errors, 'items') && <div className="mb-3"><Note tone="error">{err(errors, 'items')}</Note></div>}
        <div className="space-y-3">
          {form.items.map((it, i) => (
            <ItemCard key={i} it={it} i={i} errors={errors} canRemove={form.items.length > 1}
              onChange={(x) => update((f) => ({ ...f, items: f.items.map((y, j) => (j === i ? x : y)) }))}
              onRemove={() => update((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
              onCopy={() => update((f) => ({ ...f, items: [...f.items.slice(0, i + 1), { ...it }, ...f.items.slice(i + 1)] }))} />
          ))}
          {!form.items.length && <Button variant="secondary" onClick={() => update((f) => ({ ...f, items: [emptyItem()] }))}><Plus size={16} /> إضافة أول بند</Button>}
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 p-3 text-xs">
          <div><div className="font-bold text-slate-400">القيمة الإجمالية</div><div className="font-extrabold tabular-nums" dir="ltr">{totals.value.toFixed(2)} {form.currency}</div></div>
          <div><div className="font-bold text-slate-400">الوزن الصافي</div><div className="font-extrabold tabular-nums">{totals.net} كغ</div></div>
          <div><div className="font-bold text-slate-400">الوزن الإجمالي للبنود</div><div className="font-extrabold tabular-nums">{totals.gross ?? '—'} كغ</div></div>
          <div><div className="font-bold text-slate-400">وزن الطرود</div><div className={`font-extrabold tabular-nums ${totals.gross != null && Math.abs(totals.gross - pk.weight) > 0.001 ? 'text-amber-600' : ''}`}>{pk.weight} كغ</div></div>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">الوزن الإجمالي للبنود يجب أن يساوي وزن الطرود، والإجمالي أكبر من الصافي. قد ترفض DHL عناوين أو قيمًا جمركية حتى بعد نجاح التحقق المحلي.</p>
      </Section>
    </div>
  );
}

// ── Packages ──
export function StepPackages({ w }: Props) {
  const { form, update, errors } = w;
  const t = packageTotals(form.packages);
  const quote = w.quote;
  const setPkg = (i: number, k: keyof WizardForm['packages'][number], v: string) =>
    update((f) => ({ ...f, packages: f.packages.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));
  return (
    <Section
      title="الطرود"
      icon={<Package size={18} className="text-indigo-600" />}
      actions={<Button variant="secondary" onClick={() => update((f) => ({ ...f, packages: [...f.packages, emptyPackage()] }))}><Plus size={16} /> إضافة طرد</Button>}
    >
      {err(errors, 'packages') && <div className="mb-3"><Note tone="error">{err(errors, 'packages')}</Note></div>}
      <div className="space-y-3">
        {form.packages.map((p, i) => (
          <article key={i} className={`rounded-2xl border p-3 sm:p-4 ${err(errors, `packages.${i}`) ? 'border-red-200 dark:border-red-900/40' : 'border-slate-200 dark:border-slate-700'}`} data-package={i}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">الطرد {i + 1}</span>
              <div className="flex gap-1">
                <button type="button" onClick={() => update((f) => ({ ...f, packages: [...f.packages.slice(0, i + 1), { ...p }, ...f.packages.slice(i + 1)] }))} className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" aria-label={`نسخ الطرد ${i + 1}`}><Copy size={16} /></button>
                {form.packages.length > 1 && <button type="button" onClick={() => update((f) => ({ ...f, packages: f.packages.filter((_, j) => j !== i) }))} className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label={`حذف الطرد ${i + 1}`}><Trash2 size={16} /></button>}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Field label="العدد" hint="طرود متطابقة">{(id) => <TextInput id={id} value={p.quantity} onValue={(v) => setPkg(i, 'quantity', v.replace(/\D/g, '').slice(0, 3))} ltr inputMode="numeric" />}</Field>
              <Field label="الوزن (كغ)" required error={err(errors, `packages.${i}`)}>{(id) => <TextInput id={id} value={p.weight_kg} onValue={(v) => setPkg(i, 'weight_kg', v)} ltr inputMode="decimal" />}</Field>
              <Field label="الطول (سم)" required>{(id) => <TextInput id={id} value={p.length_cm} onValue={(v) => setPkg(i, 'length_cm', v)} ltr inputMode="decimal" />}</Field>
              <Field label="العرض (سم)" required>{(id) => <TextInput id={id} value={p.width_cm} onValue={(v) => setPkg(i, 'width_cm', v)} ltr inputMode="decimal" />}</Field>
              <Field label="الارتفاع (سم)" required>{(id) => <TextInput id={id} value={p.height_cm} onValue={(v) => setPkg(i, 'height_cm', v)} ltr inputMode="decimal" />}</Field>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 p-3 text-xs" aria-live="polite">
        <div><div className="font-bold text-slate-400">عدد الطرود</div><div className="text-base font-extrabold tabular-nums">{t.pieces}</div></div>
        <div><div className="font-bold text-slate-400">الوزن الفعلي الإجمالي</div><div className="text-base font-extrabold tabular-nums">{t.weight} كغ</div></div>
        <div><div className="font-bold text-slate-400">الوزن الحجمي (من DHL)</div><div className="text-base font-extrabold tabular-nums">{quote?.weight?.volumetric != null ? `${quote.weight.volumetric} كغ` : '—'}</div></div>
        <div><div className="font-bold text-slate-400">وزن التسعير (من DHL)</div><div className="text-base font-extrabold tabular-nums">{quote?.weight?.provided != null ? `${quote.weight.provided} كغ` : '—'}</div></div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">الأوزان الحجمية ووزن التسعير تظهر فقط كما تعيدها DHL بعد طلب الأسعار — لا يُحسب وزن مُحاسَب تقديريًا.</p>
    </Section>
  );
}

// ── Payment & terms ──
export function StepPayment({ w }: Props) {
  const { form, update, errors, customs } = w;
  const [incoterms, setIncoterms] = useState<Array<{ code: string; name: string | null }>>([]);
  useEffect(() => {
    if (!customs) return;
    dhlShipmentService.incoterms().then((r) => setIncoterms(r.items), () => setIncoterms([]));
  }, [customs]);
  return (
    <div className="space-y-4">
      <Section title="من يدفع أجرة النقل؟" icon={<Wallet size={18} className="text-indigo-600" />}>
        <ChoiceCards
          name="دافع أجرة النقل" columns={3}
          value={form.transport_payer}
          onChange={(v) => update((f) => ({ ...f, transport_payer: v }))}
          options={[
            { value: 'shipper', title: 'SHIPPEC (المرسل)', description: 'تُحسب على حساب SHIPPEC لدى DHL.' },
            { value: 'receiver', title: 'المستلم', description: 'برقم حساب المستلم لدى DHL.' },
            { value: 'third_party', title: 'طرف ثالث', description: 'برقم حساب DHL لطرف آخر.' },
          ]}
        />
        {form.transport_payer !== 'shipper' && (
          <div className="mt-3 max-w-sm">
            <Field label="رقم حساب DHL للدافع" required error={err(errors, 'transport_payer_account')} hint="رقم حساب الطرف الآخر فقط — حساب SHIPPEC لا يُعرض ولا يُطلب.">
              {(id) => <TextInput id={id} value={form.transport_payer_account} onValue={(v) => update((f) => ({ ...f, transport_payer_account: v.replace(/\D/g, '').slice(0, 12) }))} error={err(errors, 'transport_payer_account')} ltr inputMode="numeric" />}
            </Field>
          </div>
        )}
      </Section>

      {customs ? (
        <>
          <Section title="من يدفع الرسوم والضرائب الجمركية؟">
            <ChoiceCards
              name="دافع الرسوم" columns={3}
              value={form.duties_payer}
              onChange={(v) => update((f) => ({ ...f, duties_payer: v, incoterm: v === 'receiver' ? (f.incoterm === 'DDP' ? 'DAP' : f.incoterm) : 'DDP' }))}
              options={[
                { value: 'receiver', title: 'المستلم', description: 'عادةً DAP — يدفعها المستلم عند التسليم.' },
                { value: 'shipper', title: 'SHIPPEC (المرسل)', description: 'DDP — خدمة DUTY TAX PAID.' },
                { value: 'third_party', title: 'طرف ثالث', description: 'DDP برقم حساب DHL لطرف آخر.' },
              ]}
            />
            {err(errors, 'duties_payer') && <p className="mt-2 text-[11px] font-semibold text-red-600" role="alert">{err(errors, 'duties_payer')}</p>}
            {form.duties_payer === 'third_party' && (
              <div className="mt-3 max-w-sm">
                <Field label="رقم حساب DHL لدافع الرسوم" required error={err(errors, 'duties_payer_account')}>
                  {(id) => <TextInput id={id} value={form.duties_payer_account} onValue={(v) => update((f) => ({ ...f, duties_payer_account: v.replace(/\D/g, '').slice(0, 12) }))} error={err(errors, 'duties_payer_account')} ltr inputMode="numeric" />}
                </Field>
              </div>
            )}
          </Section>
          <Section title="شروط التسليم (Incoterm)" description="القائمة من DHL نفسها. التوافق مع دافع الرسوم يتحقق منه الخادم.">
            <div className="max-w-md">
              <Field label="Incoterm" required error={err(errors, 'incoterm')}>
                {(id) => (
                  <SelectInput id={id} value={form.incoterm} onValue={(v) => update((f) => ({ ...f, incoterm: v }))} error={err(errors, 'incoterm')}>
                    {(incoterms.length ? incoterms : [{ code: form.incoterm || 'DAP', name: null }]).map((i) => <option key={i.code} value={i.code}>{i.code}{i.name ? ` — ${i.name}` : ''}</option>)}
                  </SelectInput>
                )}
              </Field>
            </div>
            <div className="mt-3"><Note>المستلم يدفع الرسوم ← عادةً DAP. المرسل أو طرف ثالث يدفعها ← DDP (يشترطه الخادم).</Note></div>
          </Section>
        </>
      ) : (
        <Note>لا رسوم جمركية على هذه الشحنة ({isInternational(form) ? 'مستندات' : 'شحنة محلية'}).</Note>
      )}
    </div>
  );
}
