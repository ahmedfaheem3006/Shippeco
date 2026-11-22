/**
 * «إنشاء شحنة» wizard — the form model (pure functions, no React):
 * form ⇄ Backend draft content, steps, Backend issue → step / field, totals.
 * Business rules stay in the Backend (validation is the Backend's answer);
 * the few checks here only tell the user which step still misses data.
 */
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import type {
  DhlShipment, DraftContent, DutiesPayer, Issue, ItemInput, Party, PartyDetailsContent, PhoneEntry, PhoneType, PickupOption, ShipmentPurpose, TransportPayer,
} from '../../services/dhlShipment.service';
import { tr, type CsLang } from './csLang';

// ── Countries (full ISO list, names in Arabic and English from the browser, calling codes) ──
export interface CountryOption { code: string; name: string; ar: string; en: string; dial: string }
const countryCache: Partial<Record<CsLang, CountryOption[]>> = {};
const FIRST_COUNTRIES = ['SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'EG', 'JO', 'US', 'GB', 'CN', 'TR', 'DE'];
const displayNames = (lang: CsLang) => { try { return new Intl.DisplayNames([lang], { type: 'region' }); } catch { return null; } };
/** International calling code of a country ("SA" → "966"), '' when unknown. */
export function callingCode(country: string | null | undefined): string {
  try { return country ? getCountryCallingCode(country.toUpperCase() as CountryCode) : ''; } catch { return ''; }
}
export function allCountries(lang: CsLang = 'ar'): CountryOption[] {
  const cached = countryCache[lang];
  if (cached) return cached;
  const ar = displayNames('ar');
  const en = displayNames('en');
  const list = getCountries().map((code) => {
    const a = ar?.of(code) ?? code; const e = en?.of(code) ?? code;
    return { code, ar: a, en: e, name: lang === 'en' ? e : a, dial: callingCode(code) };
  });
  list.sort((a, b) => {
    const ia = FIRST_COUNTRIES.indexOf(a.code); const ib = FIRST_COUNTRIES.indexOf(b.code);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    return a.name.localeCompare(b.name, lang);
  });
  countryCache[lang] = list;
  return list;
}
export const countryName = (code: string | null | undefined, lang: CsLang = 'ar') => (code ? allCountries(lang).find((c) => c.code === code)?.name ?? code : '—');
/** Backend ORIGIN_GMT_OFFSETS: origins with one fixed time zone. */
export const FIXED_OFFSET_COUNTRIES = ['SA', 'KW', 'BH', 'QA', 'IQ', 'JO', 'YE', 'AE', 'OM'];

// ── Form shapes ──
export interface NationalAddress { building_number: string; street: string; additional_number: string; district: string; short_address: string }
export interface PartyForm {
  company: string; contact: string; phone: string; email: string;
  address_line1: string; address_line2: string; address_line3: string;
  city: string; postal_code: string; province: string; country_code: string; type: 'business' | 'private';
  /** Saudi National Address parts (pickup address only — the Parties screen uses lines 1–2 + short address). */
  use_na: boolean;
  na: NationalAddress;
  // ── Parties screen (DHL-like From / To) ──
  business_contact: boolean;
  /** Residential address → DHL type "private". */
  residential: boolean;
  /** Saudi short address (DHL address line 3 for SA). */
  short_address: string;
  /** Suburb / district (DHL address line 3 outside SA). */
  suburb: string;
  /** The first one is the phone sent to DHL. */
  phones: PhoneEntry[];
  vat_tax_id: string;
  eori: string;
  notes: string;
  /** The saved contact this party was filled from (never re-created just by selecting it). */
  saved_contact_id: number | null;
}
export type { PhoneEntry, PhoneType };
export interface PackageForm { weight_kg: string; length_cm: string; width_cm: string; height_cm: string; quantity: string }
export interface ItemForm {
  description: string; quantity: string; unit: string; unit_value: string; country_of_origin: string;
  outbound_hs_code: string; inbound_hs_code: string; unit_net_weight_kg: string; gross_mode: 'unit' | 'line'; gross_weight_kg: string;
}
export type ContentKind = 'documents' | 'goods';
export interface WizardForm {
  client_id: number | null;
  client_name: string;
  content_kind: ContentKind;
  content_description: string;
  customer_reference: string;
  declared_value: string;
  currency: string;
  shipment_purpose: ShipmentPurpose | '';
  export_reason_type: string;
  customs_invoice_number: string;
  customs_invoice_date: string;
  dhl_invoice_type: 'commercial' | 'proforma' | '';
  paperless_trade: boolean;
  incoterm: string;
  transport_payer: TransportPayer;
  transport_payer_account: string;
  duties_payer: DutiesPayer;
  duties_payer_account: string;
  shipment_date: string;
  origin_gmt_offset: string;
  product_code: string;
  local_product_code: string;
  service_codes: string[];
  pickup_option: PickupOption;
  pickup_earliest_time: string;
  pickup_latest_time: string;
  pickup_location: string;
  pickup_location_type: 'business' | 'residence' | '';
  pickup_instructions: string;
  pickup_other_address: boolean;
  pickup_address: PartyForm;
  service_point_id: string;
  service_point_name: string;
  shipper: PartyForm;
  receiver: PartyForm;
  packages: PackageForm[];
  items: ItemForm[];
}

const emptyNa = (): NationalAddress => ({ building_number: '', street: '', additional_number: '', district: '', short_address: '' });
export const emptyPhone = (country = '', type: PhoneType = 'mobile'): PhoneEntry => ({ type, code: callingCode(country), number: '', extension: '', sms: false });
export const emptyParty = (country = 'SA', phoneType: PhoneType = 'mobile'): PartyForm => ({
  company: '', contact: '', phone: '', email: '', address_line1: '', address_line2: '', address_line3: '',
  city: '', postal_code: '', province: '', country_code: country, type: 'business', use_na: country === 'SA', na: emptyNa(),
  business_contact: false, residential: false, short_address: '', suburb: '', phones: [emptyPhone(country, phoneType)],
  vat_tax_id: '', eori: '', notes: '', saved_contact_id: null,
});
/** «من» on a new shipment: SHIPPEC's own Operations contact and National Address (Dammam). */
export const fromDefaultParty = (): PartyForm => ({
  ...emptyParty('SA'),
  use_na: false,
  contact: 'Operations Management - SHIPPEC',
  business_contact: true,
  company: 'SHIPPEC EXPRESS',
  address_line1: '7540 Prince Mutaib bin Abdulaziz',
  address_line2: '3538 Al Rawdah Dist',
  short_address: 'EDMA7540',
  city: 'DAMMAM',
  province: 'EASTERN PROVINCE',
  postal_code: '32256',
  email: 'info@altakamullog.com',
  phones: [{ type: 'mobile', code: '966', number: '53 729 9636', extension: '', sms: false }],
});
/** «إلى» on a new shipment: empty, no country chosen yet, an office phone by default. */
export const toDefaultParty = (): PartyForm => ({ ...emptyParty('', 'office'), use_na: false });
export const emptyPackage = (): PackageForm => ({ weight_kg: '', length_cm: '', width_cm: '', height_cm: '', quantity: '1' });
export const emptyItem = (): ItemForm => ({
  description: '', quantity: '1', unit: 'PCS', unit_value: '', country_of_origin: '', outbound_hs_code: '', inbound_hs_code: '',
  unit_net_weight_kg: '', gross_mode: 'line', gross_weight_kg: '',
});

/** Next business day in Riyadh (Fri/Sat weekend), YYYY-MM-DD. */
/** Countries whose weekend is Friday + Saturday; everywhere else DHL works Monday–Friday. */
const FRI_SAT_WEEKEND = new Set(['SA', 'KW', 'QA', 'BH', 'OM', 'EG', 'JO', 'IQ', 'YE', 'DZ', 'LY', 'SD', 'SY']);
const weekendOf = (country: string) => (FRI_SAT_WEEKEND.has((country || 'SA').toUpperCase()) ? [5, 6] : [0, 6]);

/** True when `ymd` falls on the shipper country's weekend (DHL will not pick up / ship that day). */
export function isOriginWeekend(ymd: string, country: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  return weekendOf(country).includes(new Date(`${ymd}T12:00:00Z`).getUTCDay());
}

/** The next business day in the shipper's country (Riyadh "today"), from `from` (YYYY-MM-DD) when given. */
export function nextBusinessDay(now = new Date(), country = 'SA', from?: string): string {
  const d = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T12:00:00Z`) : new Date(now.getTime() + 3 * 3600_000);
  if (!from) d.setUTCDate(d.getUTCDate() + 1);
  const weekend = weekendOf(country);
  while (weekend.includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function emptyForm(): WizardForm {
  return {
    client_id: null, client_name: '', content_kind: 'documents', content_description: '', customer_reference: '', declared_value: '', currency: 'SAR',
    shipment_purpose: '', export_reason_type: '', customs_invoice_number: '', customs_invoice_date: '', dhl_invoice_type: '', paperless_trade: false,
    incoterm: 'DAP', transport_payer: 'shipper', transport_payer_account: '', duties_payer: 'receiver', duties_payer_account: '',
    shipment_date: nextBusinessDay(), origin_gmt_offset: '', product_code: '', local_product_code: '', service_codes: [],
    pickup_option: 'none', pickup_earliest_time: '', pickup_latest_time: '', pickup_location: '', pickup_location_type: '', pickup_instructions: '',
    pickup_other_address: false, pickup_address: emptyParty(), service_point_id: '', service_point_name: '',
    shipper: fromDefaultParty(), receiver: toDefaultParty(), packages: [emptyPackage()], items: [],
  };
}

// ── Derived facts ──
export const isInternational = (f: Pick<WizardForm, 'shipper' | 'receiver'>) =>
  !!f.shipper.country_code && !!f.receiver.country_code && f.shipper.country_code !== f.receiver.country_code;
/** Customs declaration: goods crossing a border (the Backend refuses it for a domestic shipment). */
export const needsCustoms = (f: WizardForm) => f.content_kind === 'goods' && isInternational(f);
export const needsOriginOffset = (f: WizardForm) => !!f.shipper.country_code && !FIXED_OFFSET_COUNTRIES.includes(f.shipper.country_code);

const num = (v: string | number | null | undefined) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
export function packageTotals(packages: PackageForm[]) {
  let pieces = 0;
  let weight = 0;
  for (const p of packages) {
    const q = Math.max(1, Math.floor(num(p.quantity) ?? 1));
    pieces += q;
    weight += (num(p.weight_kg) ?? 0) * q;
  }
  return { pieces, weight: Math.round(weight * 1000) / 1000 };
}
export function itemTotals(items: ItemForm[]) {
  let value = 0; let net = 0; let gross = 0; let grossKnown = true;
  for (const it of items) {
    const q = num(it.quantity) ?? 0;
    value += q * (num(it.unit_value) ?? 0);
    net += q * (num(it.unit_net_weight_kg) ?? 0);
    const g = num(it.gross_weight_kg);
    if (g == null) grossKnown = false;
    else gross += it.gross_mode === 'unit' ? g * q : g;
  }
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return { value: r(value), net: r(net), gross: grossKnown ? r(gross) : null };
}

// ── Form → Backend content ──
const t = (s: string | null | undefined) => (typeof s === 'string' && s.trim() ? s.trim() : null);
function partyOut(p: PartyForm) {
  const base = {
    company: t(p.company), contact: t(p.contact), phone: t(p.phone), email: t(p.email), city: t(p.city), postal_code: t(p.postal_code),
    province: t(p.province), country_code: t(p.country_code), type: p.type,
  };
  if (p.country_code === 'SA' && p.use_na) {
    const na = p.na;
    const complete = na.building_number.trim() && na.street.trim() && na.additional_number.trim() && na.district.trim();
    if (complete) {
      return { ...base, national_address: { building_number: na.building_number.trim(), street: na.street.trim(), additional_number: na.additional_number.trim(),
        district: na.district.trim(), short_address: t(na.short_address) } };
    }
    // Incomplete parts: sent as lines so the Backend reports exactly what is missing.
    return { ...base, address_line1: t([na.building_number, na.street].filter((x) => x.trim()).join(', ')),
      address_line2: t([na.additional_number, na.district].filter((x) => x.trim()).join(', ')), address_line3: t(na.short_address) };
  }
  return { ...base, address_line1: t(p.address_line1), address_line2: t(p.address_line2), address_line3: t(p.address_line3) };
}

/** An untouched row (only its defaults): not sent, so a draft can be saved before the packages / items step is filled. */
/**
 * "53 729 9636" with code 966 → "+966537299636" (a leading 0 of the national
 * form is dropped; a number typed with + / 00 is kept as international).
 */
export function composePhone(code: string, number: string): string {
  const raw = number.trim();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('+')) return `+${digits}`;
  if (raw.startsWith('00')) return `+${digits.slice(2)}`;
  const cc = code.replace(/\D/g, '');
  return cc ? `+${cc}${digits.replace(/^0+/, '')}` : digits;
}
/** "+966537299636" → { code: "966", number: "537299636" } (falls back to the country's code). */
export function splitPhone(value: string, country: string): { code: string; number: string } {
  const v = value.trim();
  if (!v) return { code: callingCode(country), number: '' };
  const p = parsePhoneNumberFromString(v.startsWith('+') ? v : `+${v.replace(/\D/g, '')}`);
  if (p?.countryCallingCode && p.nationalNumber) return { code: String(p.countryCallingCode), number: String(p.nationalNumber) };
  return { code: callingCode(country), number: v.replace(/^\+/, '') };
}

/** From / To of the Parties screen → DHL party (lines 1–2, short address or suburb in line 3, the first phone). */
function partiesPartyOut(p: PartyForm) {
  const sa = p.country_code === 'SA';
  const first = p.phones[0];
  const phone = first && first.number.trim() ? composePhone(first.code, first.number) : p.phone;
  return {
    company: t(p.company), contact: t(p.contact), phone: t(phone), email: t(p.email), city: t(p.city), postal_code: t(p.postal_code),
    province: t(p.province), country_code: t(p.country_code), type: p.residential ? 'private' as const : 'business' as const,
    address_line1: t(p.address_line1), address_line2: t(p.address_line2),
    address_line3: sa ? t(p.short_address.toUpperCase()) : t(p.suburb),
  };
}
function detailsOut(p: PartyForm): PartyDetailsContent {
  return {
    business_contact: p.business_contact, residential: p.residential, country_name: t(countryName(p.country_code, 'en') === '—' ? '' : countryName(p.country_code, 'en')),
    short_address: p.country_code === 'SA' ? t(p.short_address.toUpperCase()) : null, suburb: t(p.suburb),
    phones: p.phones.filter((x) => x.number.trim()).map((x) => ({ type: x.type, code: t(x.code), number: t(x.number), extension: t(x.extension), sms: x.sms })),
    vat_tax_id: t(p.vat_tax_id), eori: t(p.eori), notes: t(p.notes), saved_contact_id: p.saved_contact_id,
  };
}

const blank = (...v: Array<string | null | undefined>) => v.every((x) => !String(x ?? '').trim());
const blankPackage = (p: PackageForm) => blank(p.weight_kg, p.length_cm, p.width_cm, p.height_cm);
const blankItem = (it: ItemForm) => blank(it.description, it.unit_value, it.country_of_origin, it.outbound_hs_code, it.inbound_hs_code, it.unit_net_weight_kg, it.gross_weight_kg);

export function toContent(f: WizardForm): Partial<DraftContent> {
  const customs = needsCustoms(f);
  const items: ItemInput[] = customs ? f.items.filter((it) => !blankItem(it)).map((it) => ({
    description: it.description.trim(), quantity: it.quantity, unit: it.unit, unit_value: it.unit_value,
    country_of_origin: t(it.country_of_origin), outbound_hs_code: t(it.outbound_hs_code), inbound_hs_code: t(it.inbound_hs_code),
    unit_net_weight_kg: t(it.unit_net_weight_kg),
    ...(it.gross_mode === 'unit' ? { unit_gross_weight_kg: t(it.gross_weight_kg) } : { line_gross_weight_kg: t(it.gross_weight_kg) }),
  })) : [];
  const schedule = f.pickup_option === 'schedule';
  const services = f.service_codes.filter((s) => s !== 'WY' && s !== 'DD');
  return {
    client_id: f.client_id,
    customer_reference: t(f.customer_reference),
    product_code: t(f.product_code),
    local_product_code: t(f.local_product_code),
    service_codes: customs && f.paperless_trade ? [...services, 'WY'] : services,
    customs_required: customs,
    paperless_trade: customs && f.paperless_trade,
    content_description: t(f.content_description),
    incoterm: customs ? t(f.incoterm) : null,
    currency: customs ? t(f.currency) : f.declared_value.trim() ? t(f.currency) : null,
    declared_value: !customs && f.declared_value.trim() ? f.declared_value : null,
    shipment_purpose: customs && f.shipment_purpose ? f.shipment_purpose : null,
    export_reason_type: customs && t(f.export_reason_type) ? f.export_reason_type : null,
    shipment_type: null,
    customs_invoice_number: customs ? t(f.customs_invoice_number) : null,
    customs_invoice_date: customs ? t(f.customs_invoice_date) : null,
    dhl_invoice_type: customs && f.dhl_invoice_type ? f.dhl_invoice_type : null,
    shipment_date: t(f.shipment_date),
    origin_gmt_offset: needsOriginOffset(f) ? t(f.origin_gmt_offset) : null,
    transport_payer: f.transport_payer,
    transport_payer_account: f.transport_payer === 'shipper' ? null : t(f.transport_payer_account),
    duties_payer: customs ? f.duties_payer : 'receiver',
    duties_payer_account: customs && f.duties_payer === 'third_party' ? t(f.duties_payer_account) : null,
    pickup_option: f.pickup_option,
    pickup_earliest_time: schedule ? t(f.pickup_earliest_time) : null,
    pickup_latest_time: schedule ? t(f.pickup_latest_time) : null,
    pickup_location: schedule ? t(f.pickup_location) : null,
    pickup_location_type: schedule && f.pickup_location_type ? f.pickup_location_type : null,
    pickup_instructions: schedule ? t(f.pickup_instructions) : null,
    pickup_address: schedule && f.pickup_other_address ? (partyOut(f.pickup_address) as unknown as Party) : null,
    service_point_id: f.pickup_option === 'drop_off' ? t(f.service_point_id) : null,
    service_point_name: f.pickup_option === 'drop_off' ? t(f.service_point_name) : null,
    shipper: partiesPartyOut(f.shipper) as DraftContent['shipper'],
    receiver: partiesPartyOut(f.receiver) as DraftContent['receiver'],
    party_details: { shipper: detailsOut(f.shipper), receiver: detailsOut(f.receiver) },
    packages: f.packages.filter((p) => !blankPackage(p)).map((p) => ({
      weight_kg: p.weight_kg, length_cm: t(p.length_cm), width_cm: t(p.width_cm), height_cm: t(p.height_cm),
      quantity: Math.max(1, Math.floor(num(p.quantity) ?? 1)),
    })),
    items,
  };
}

// ── Backend shipment → form ──
const s = (v: unknown) => (v == null ? '' : String(v));
const LINE1 = /^(\d{4}),?\s+(.+)$/;
const SHORT = /^[A-Z]{4}\d{4}$/;
function partyIn(src: Record<string, any>, prefix: string): PartyForm {
  const get = (k: string) => s(src[`${prefix}${k}`]);
  const country = get('country_code') || 'SA';
  const p: PartyForm = {
    ...emptyParty(country),
    company: get('company'), contact: get('contact'), phone: get('phone'), email: get('email'),
    address_line1: get('address_line1'), address_line2: get('address_line2'), address_line3: get('address_line3'),
    city: get('city'), postal_code: get('postal_code'), province: get('province'), country_code: country,
    type: get('type') === 'private' ? 'private' : 'business', use_na: false, na: emptyNa(),
  };
  if (country === 'SA') {
    const l1 = LINE1.exec(p.address_line1); const l2 = LINE1.exec(p.address_line2);
    if ((l1 && l2) || (!p.address_line1 && !p.address_line2)) {
      p.use_na = true;
      p.na = { building_number: l1?.[1] ?? '', street: l1?.[2] ?? '', additional_number: l2?.[1] ?? '', district: l2?.[2] ?? '',
        short_address: SHORT.test(p.address_line3) ? p.address_line3 : '' };
    }
  }
  return p;
}
const flatParty = (p: Record<string, any> | null | undefined) => p ?? {};

/** A stored From / To (+ its Parties-screen details) → the form. Lines stay as stored (no National Address split). */
function partiesPartyIn(src: Record<string, unknown>, prefix: string, details: Partial<PartyDetailsContent> | null | undefined, phoneType: PhoneType): PartyForm {
  const get = (k: string) => s(src[`${prefix}${k}`]);
  const country = get('country_code');
  const sa = country === 'SA';
  const line3 = get('address_line3');
  const stored = Array.isArray(details?.phones) ? details!.phones! : [];
  const phones: PhoneEntry[] = stored.length
    ? stored.map((x) => ({ type: (x.type ?? 'mobile') as PhoneType, code: s(x.code), number: s(x.number), extension: s(x.extension), sms: !!x.sms }))
    : [{ type: phoneType, ...splitPhone(get('phone'), country), extension: '', sms: false }];
  return {
    ...emptyParty(country, phoneType),
    use_na: false,
    company: get('company'), contact: get('contact'), phone: get('phone'), email: get('email'),
    address_line1: get('address_line1'), address_line2: get('address_line2'), address_line3: '',
    city: get('city'), postal_code: get('postal_code'), province: get('province'), country_code: country,
    type: get('type') === 'private' ? 'private' : 'business',
    business_contact: details?.business_contact ?? get('type') !== 'private',
    residential: details?.residential ?? get('type') === 'private',
    short_address: s(details?.short_address) || (sa && SHORT.test(line3) ? line3 : ''),
    suburb: s(details?.suburb) || (sa ? '' : line3),
    phones,
    vat_tax_id: s(details?.vat_tax_id), eori: s(details?.eori), notes: s(details?.notes),
    saved_contact_id: details?.saved_contact_id ?? null,
  };
}

/** Identical consecutive pieces → one row with a quantity (the Backend stores one row per piece). */
export function groupPieces(rows: DhlShipment['packages']): PackageForm[] {
  const out: PackageForm[] = [];
  for (const r of rows) {
    const p: PackageForm = { weight_kg: s(num(r.weight_kg)), length_cm: s(num(r.length_cm) ?? ''), width_cm: s(num(r.width_cm) ?? ''), height_cm: s(num(r.height_cm) ?? ''), quantity: '1' };
    const last = out[out.length - 1];
    if (last && last.weight_kg === p.weight_kg && last.length_cm === p.length_cm && last.width_cm === p.width_cm && last.height_cm === p.height_cm) {
      last.quantity = String(Number(last.quantity) + 1);
    } else out.push(p);
  }
  return out.length ? out : [emptyPackage()];
}

export function fromShipment(sh: DhlShipment, clientName = ''): WizardForm {
  const f = emptyForm();
  const pa = sh.pickup_address ? partyIn(Object.fromEntries(Object.entries(flatParty(sh.pickup_address)).map(([k, v]) => [k, v])), '') : emptyParty(sh['shipper_country_code'] as string || 'SA');
  return {
    ...f,
    client_id: sh.client_id, client_name: clientName,
    content_kind: sh.customs_required ? 'goods' : (sh.items?.length ? 'goods' : f.content_kind),
    content_description: s(sh.content_description), customer_reference: s(sh.customer_reference),
    declared_value: sh.customs_required ? '' : s(sh.declared_value != null ? num(sh.declared_value) : ''), currency: s(sh.currency) || 'SAR',
    shipment_purpose: sh.shipment_purpose ?? '', export_reason_type: s(sh.export_reason_type),
    customs_invoice_number: s(sh.customs_invoice_number), customs_invoice_date: s(sh.customs_invoice_date),
    dhl_invoice_type: sh.dhl_invoice_type ?? '', paperless_trade: !!sh.paperless_trade, incoterm: s(sh.incoterm) || 'DAP',
    transport_payer: sh.transport_payer ?? 'shipper', transport_payer_account: s(sh.transport_payer_account),
    duties_payer: sh.duties_payer ?? 'receiver', duties_payer_account: s(sh.duties_payer_account),
    shipment_date: s(sh.shipment_date) || f.shipment_date, origin_gmt_offset: s(sh.origin_gmt_offset),
    product_code: s(sh.product_code), local_product_code: s(sh.local_product_code), service_codes: Array.isArray(sh.service_codes) ? sh.service_codes : [],
    pickup_option: sh.pickup_option ?? 'none', pickup_earliest_time: s(sh.pickup_earliest_time), pickup_latest_time: s(sh.pickup_latest_time),
    pickup_location: s(sh.pickup_location), pickup_location_type: sh.pickup_location_type ?? '', pickup_instructions: s(sh.pickup_instructions),
    pickup_other_address: !!sh.pickup_address, pickup_address: pa,
    service_point_id: s(sh.service_point_id), service_point_name: s(sh.service_point_name),
    shipper: partiesPartyIn(sh as Record<string, unknown>, 'shipper_', sh['shipper_details'] as PartyDetailsContent | null, 'mobile'),
    receiver: partiesPartyIn(sh as Record<string, unknown>, 'receiver_', sh['receiver_details'] as PartyDetailsContent | null, 'office'),
    packages: sh.packages?.length ? groupPieces(sh.packages) : [emptyPackage()],
    items: (sh.items ?? []).map((i: Record<string, any>) => ({
      description: s(i.description), quantity: s(i.quantity), unit: s(i.unit) || 'PCS', unit_value: s(num(i.unit_value)), country_of_origin: s(i.country_of_origin),
      outbound_hs_code: s(i.outbound_hs_code), inbound_hs_code: s(i.inbound_hs_code), unit_net_weight_kg: s(num(i.unit_net_weight_kg) ?? ''),
      gross_mode: i.unit_gross_weight_kg != null ? 'unit' : 'line', gross_weight_kg: s(num(i.unit_gross_weight_kg ?? i.line_gross_weight_kg) ?? ''),
    })),
  };
}

// ── Steps ──
export type StepId = 'parties' | 'details' | 'customs' | 'packages' | 'payment' | 'service' | 'pickup' | 'review';
export interface StepDef { id: StepId; label: string; short: string; label_en: string; short_en: string }
export const ALL_STEPS: StepDef[] = [
  { id: 'parties', label: 'المرسل والمستلم', short: 'الأطراف', label_en: 'From & To', short_en: 'Parties' },
  { id: 'details', label: 'تفاصيل الشحنة', short: 'التفاصيل', label_en: 'Shipment details', short_en: 'Details' },
  { id: 'customs', label: 'الجمارك', short: 'الجمارك', label_en: 'Customs', short_en: 'Customs' },
  { id: 'packages', label: 'الطرود', short: 'الطرود', label_en: 'Packages', short_en: 'Packages' },
  { id: 'payment', label: 'الدفع والشروط', short: 'الدفع', label_en: 'Payment & terms', short_en: 'Payment' },
  { id: 'service', label: 'الخدمة والسعر', short: 'الخدمة', label_en: 'Service & price', short_en: 'Service' },
  { id: 'pickup', label: 'الاستلام', short: 'الاستلام', label_en: 'Pickup', short_en: 'Pickup' },
  { id: 'review', label: 'المراجعة والإنشاء', short: 'المراجعة', label_en: 'Review & create', short_en: 'Review' },
];
export const stepLabel = (st: Pick<StepDef, 'label' | 'label_en'> | undefined, lang: CsLang) => (st ? (lang === 'en' ? st.label_en : st.label) : '');
export const stepShort = (st: Pick<StepDef, 'short' | 'short_en'>, lang: CsLang) => (lang === 'en' ? st.short_en : st.short);
export const visibleSteps = (f: WizardForm) => ALL_STEPS.filter((st) => st.id !== 'customs' || needsCustoms(f));

const DHL_TO_FORM: Record<string, string> = {
  addressLine1: 'address_line1', addressLine2: 'address_line2', addressLine3: 'address_line3', cityName: 'city', postalCode: 'postal_code',
  countryCode: 'country_code', provinceCode: 'province', companyName: 'company', fullName: 'contact', phone: 'phone', email: 'email',
};
const CUSTOMS_TO_FORM: Record<string, string> = {
  description: 'description', quantity: 'quantity', quantityUnit: 'unit', unitPrice: 'unit_value', manufacturerCountry: 'country_of_origin',
  netWeightKg: 'unit_net_weight_kg', grossWeightKg: 'gross_weight_kg', lineGrossWeightKg: 'gross_weight_kg', hsCode: 'outbound_hs_code', inboundHsCode: 'inbound_hs_code',
};

/**
 * A Backend issue / zod path → the step and the form key that shows it.
 * Keys: "shipper.city", "items.0.outbound_hs_code", "packages.1", "incoterm" …
 */
export function locateIssue(field: string): { step: StepId; key: string } {
  let f = field.replace(/^customerDetails\.(shipper|receiver)Details\.(postalAddress|contactInformation)\./, '$1.');
  f = f.replace(/\[(\d+)\]/g, (_m, n) => `.${Number(n) - 1}`); // Backend issue paths are 1-based ("items[1]")
  const party = /^(shipper|receiver|pickup_address)\.(?:national_address\.)?([A-Za-z0-9_]+)/.exec(f);
  if (party) {
    const k = DHL_TO_FORM[party[2]] ?? party[2];
    return { step: party[1] === 'pickup_address' ? 'pickup' : 'parties', key: `${party[1]}.${k}` };
  }
  const line = /^customs\.lineItems\.(\d+)\.([A-Za-z]+)/.exec(f);
  if (line) return { step: 'customs', key: `items.${line[1]}.${CUSTOMS_TO_FORM[line[2]] ?? line[2]}` };
  if (/^customs\.lineItems$/.test(f)) return { step: 'customs', key: 'items' };
  const item = /^items\.(\d+)\.?([a-z_]*)/.exec(f);
  if (item) return { step: 'customs', key: item[2] ? `items.${item[1]}.${item[2]}` : 'items' };
  const pkg = /^packages\.?(\d*)/.exec(f);
  if (pkg) return { step: 'packages', key: pkg[1] ? `packages.${pkg[1]}` : 'packages' };
  const top = f.split('.')[0];
  const STEP_OF: Record<string, StepId> = {
    content_description: 'details', customer_reference: 'details', customs_required: 'details', declared_value: 'details', shipment_purpose: 'details',
    export_reason_type: 'details', shipment_type: 'details',
    items: 'customs', customs_invoice_number: 'customs', customs_invoice_date: 'customs', dhl_invoice_type: 'customs', paperless_trade: 'customs',
    service_codes: 'customs', currency: 'customs', customs: 'customs',
    incoterm: 'payment', transport_payer: 'payment', transport_payer_account: 'payment', duties_payer: 'payment', duties_payer_account: 'payment',
    product_code: 'service', shipment_date: 'service', origin_gmt_offset: 'service', dhl: 'service',
    pickup_option: 'pickup', pickup_earliest_time: 'pickup', pickup_latest_time: 'pickup', pickup_location: 'pickup', pickup_location_type: 'pickup',
    pickup_instructions: 'pickup', service_point_id: 'pickup', service_point_name: 'pickup',
  };
  return { step: STEP_OF[top] ?? 'review', key: top };
}

export type FieldErrors = Record<string, string>;
export function issuesToErrors(issues: Issue[]): { errors: FieldErrors; byStep: Partial<Record<StepId, number>> } {
  const errors: FieldErrors = {};
  const byStep: Partial<Record<StepId, number>> = {};
  for (const i of issues) {
    const { step, key } = locateIssue(i.field);
    // stored as the Backend wrote it; shown with translateIssue() in the page's current language
    if (!errors[key]) errors[key] = i.message;
    byStep[step] = (byStep[step] ?? 0) + 1;
  }
  return { errors, byStep };
}

/** Backend validation texts are English (DHL rules) — the common ones in Arabic; DHL's own reasons stay as DHL wrote them. */
const TRANSLATIONS: Array<[RegExp, string]> = [
  [/is required$/i, 'حقل مطلوب'],
  [/Non-Latin character/i, 'أحرف لاتينية فقط (DHL لا تقبل العربية)'],
  [/Saudi National Address: line 1/i, 'العنوان الوطني: رقم المبنى (4 أرقام) واسم الشارع'],
  [/Saudi National Address: line 2/i, 'العنوان الوطني: الرقم الإضافي (4 أرقام) والحي'],
  [/Saudi National Address: line 3/i, 'العنوان المختصر: 4 أحرف و4 أرقام مثل RRRD2929'],
  [/Saudi National Address: postal code/i, 'الرمز البريدي السعودي 5 أرقام'],
  [/Not a valid phone number/i, 'رقم جوال غير صحيح لهذه الدولة'],
  [/Phone must be 7–15 digits/i, 'رقم الجوال من 7 إلى 15 رقمًا'],
  [/Not an existing country code/i, 'رمز دولة غير موجود'],
  [/Package dimensions/i, 'أبعاد الطرد (الطول والعرض والارتفاع) مطلوبة'],
  [/At least one package/i, 'أضف طردًا واحدًا على الأقل'],
  [/Shipment date is in the past/i, 'تاريخ الشحن في الماضي'],
  [/at most 10 days ahead/i, 'DHL تقبل تاريخ شحن حتى 10 أيام قادمة فقط'],
  [/Gross weight .* must be greater than the net weight/i, 'الوزن الإجمالي يجب أن يكون أكبر من الوزن الصافي'],
  [/Invoice total gross weight .* must equal the shipment weight/i, 'مجموع الوزن الإجمالي للبنود يجب أن يساوي وزن الطرود'],
  [/Total net weight .* exceeds the package weight/i, 'الوزن الصافي للبنود أكبر من وزن الطرود'],
  [/Outbound HS/i, 'رمز HS للتصدير مطلوب'],
  [/Inbound HS/i, 'رمز HS للاستيراد مطلوب'],
  [/Country of manufacture/i, 'بلد المنشأ مطلوب'],
  [/Net weight per unit/i, 'الوزن الصافي للوحدة مطلوب'],
  [/DDP \(Delivered Duty Paid\)/i, 'دفع الرسوم من المرسل أو طرف ثالث يعني DDP'],
  [/DDP means the duties/i, 'DDP يعني أن المستلم لا يدفع الرسوم — اختر من يدفعها'],
  [/DHL account number of the paying party/i, 'رقم حساب DHL للطرف الدافع مطلوب'],
  [/DHL account number of the party paying duties/i, 'رقم حساب DHL لدافع الرسوم مطلوب'],
  [/SHIPPEC's own DHL account/i, 'هذا رقم حساب SHIPPEC نفسه — اختر SHIPPEC كدافع'],
  [/no documented MyDHL export reason type/i, 'هذا الغرض ليس له سبب تصدير موثّق لدى DHL — اختر سبب التصدير من قائمة DHL'],
  [/Paperless Trade: choose the customs invoice/i, 'Paperless Trade: اختر نوع الفاتورة التي تُنشئها DHL (تجارية / مبدئية)'],
  [/Latest pickup time must be after/i, 'آخر وقت للاستلام يجب أن يكون بعد أبكر وقت'],
  [/DHL picks up from/i, 'أبكر وقت يسبق نافذة استلام DHL'],
  [/DHL picks up until/i, 'آخر وقت يتجاوز نافذة استلام DHL'],
  [/earliest pickup time today has already passed/i, 'أبكر وقت للاستلام اليوم قد مضى'],
  [/DHL product is required/i, 'اختر خدمة DHL'],
  [/Shipment contents description/i, 'وصف المحتوى مطلوب'],
  [/Contents must be the real product description/i, 'اكتب الوصف الحقيقي للمحتوى (بدون كلمة TEST)'],
  [/Origin time zone/i, 'حدد المنطقة الزمنية لبلد المرسل'],
];
/** Arabic names of the fields DHL needs before products / rates (Backend ROUTE_INCOMPLETE issues). */
const ROUTE_FIELD_AR: Record<string, string> = {
  origin_gmt_offset: 'المنطقة الزمنية لبلد المرسل', shipment_date: 'تاريخ الشحن',
  'shipper.country_code': 'دولة المرسل', 'shipper.city': 'مدينة المرسل', 'shipper.postal_code': 'الرمز البريدي للمرسل',
  'receiver.country_code': 'دولة المستلم', 'receiver.city': 'مدينة المستلم', 'receiver.postal_code': 'الرمز البريدي للمستلم',
};
const ROUTE_FIELD_EN: Record<string, string> = {
  origin_gmt_offset: "the sender country's time zone", shipment_date: 'the shipment date',
  'shipper.country_code': 'the sender country', 'shipper.city': 'the sender city', 'shipper.postal_code': 'the sender postal code',
  'receiver.country_code': 'the receiver country', 'receiver.city': 'the receiver city', 'receiver.postal_code': 'the receiver postal code',
};
export function routeIssuesText(issues: Issue[], lang: CsLang = 'ar'): string {
  const names = [...new Set(issues.map((i) => {
    const { key } = locateIssue(i.field);
    if (lang === 'en') return ROUTE_FIELD_EN[key] ?? (key.startsWith('packages') ? 'the packages (weight and dimensions)' : i.message);
    return ROUTE_FIELD_AR[key] ?? (key.startsWith('packages') ? 'الطرود (الوزن والأبعاد)' : translateIssue(i.message));
  }))];
  if (lang === 'en') return names.length ? `Before asking DHL, complete: ${names.join(', ')}` : 'Complete the route (country and city of both parties) and the packages with their dimensions first';
  return names.length ? `قبل سؤال DHL أكمل: ${names.join('، ')}` : 'أكمل بيانات المسار (الدولة والمدينة للطرفين) والطرود بأبعادها أولًا';
}

/** DHL refusals (validateDataOnly / create) that an employee can act on — the DHL code stays visible. */
const DHL_TRANSLATIONS: Array<[RegExp, string]> = [
  [/destination location is invalid/i, 'DHL لم تتعرف على عنوان المستلم — تحقق من المدينة والرمز البريدي والدولة'],
  [/origin location is invalid/i, 'DHL لم تتعرف على عنوان المرسل — تحقق من المدينة والرمز البريدي والدولة'],
  [/^7142\b|shipment data validation has failed/i, 'رفضت DHL بيانات الشحنة دون سبب محدد — راجع البيانات أو أعد المحاولة لاحقًا'],
];

/** Backend / DHL message in the page language: Arabic for the common rules; English = as the Backend wrote it. */
export function translateIssue(message: string, lang: CsLang = 'ar'): string {
  if (lang === 'en') return message;
  for (const [re, ar] of TRANSLATIONS) if (re.test(message)) return ar;
  const code = /^(\d{4,6})\s*:/.exec(message)?.[1];
  for (const [re, ar] of DHL_TRANSLATIONS) if (re.test(message)) return code ? `${ar} (DHL ${code})` : ar;
  return message;
}

/** The required fields of one party, in display order. */
type PartyField = 'contact' | 'company' | 'country_code' | 'address_line1' | 'address_line2' | 'city' | 'postal_code' | 'province' | 'phone_code' | 'phone';
const PARTY_FIELD_NAME: Record<PartyField, [string, string]> = {
  contact: ['الاسم', 'Name'], company: ['الشركة', 'Company'], country_code: ['البلد/الإقليم', 'Country/Territory'], address_line1: ['العنوان 1', 'Address 1'],
  address_line2: ['عنوان 2', 'Address 2'], city: ['المدينة', 'City'], postal_code: ['الرمز البريدي', 'Postal Code'], province: ['الولاية / المنطقة', 'State'],
  phone_code: ['الرمز', 'Code'], phone: ['الهاتف', 'Phone'],
};
const PARTY_FIELD_MESSAGE: Record<PartyField, [string, string]> = {
  contact: ['الاسم مطلوب.', 'Name is required.'], company: ['اسم الشركة مطلوب.', 'Company is required.'], country_code: ['البلد/الإقليم مطلوب.', 'Country is required.'],
  address_line1: ['العنوان 1 مطلوب.', 'Address 1 is required.'], address_line2: ['عنوان 2 مطلوب للعناوين السعودية (الرقم الإضافي والحي).', 'Address 2 is required for Saudi addresses (additional number and district).'],
  city: ['المدينة مطلوبة.', 'City is required.'], postal_code: ['الرمز البريدي مطلوب لهذا البلد.', 'Postal code is required for this country.'],
  province: ['الولاية مطلوبة لهذا البلد.', 'State is required for this country.'], phone_code: ['رمز الاتصال الدولي مطلوب.', 'Phone code is required.'],
  phone: ['رقم الهاتف مطلوب.', 'Phone number is required.'],
};
/** Required for Next on the Parties screen — plus the country rules DHL enforces (Saudi National Address, US state + ZIP). */
export function partyMissing(p: PartyForm): PartyField[] {
  const out: PartyField[] = [];
  const first = p.phones[0];
  if (!p.contact.trim()) out.push('contact');
  if (!p.company.trim()) out.push('company');
  if (!p.country_code) out.push('country_code');
  if (!p.address_line1.trim()) out.push('address_line1');
  if (p.country_code === 'SA' && !p.address_line2.trim()) out.push('address_line2');
  if (!p.city.trim()) out.push('city');
  if ((p.country_code === 'SA' || p.country_code === 'US') && !p.postal_code.trim()) out.push('postal_code');
  if (p.country_code === 'US' && !p.province.trim()) out.push('province');
  if (!first || !first.code.replace(/\D/g, '')) out.push('phone_code');
  if (!first || !first.number.trim()) out.push('phone');
  return out;
}
/**
 * The Parties gate: field key → message (client, shipper.*, receiver.*). Empty = Next allowed.
 * Saved contacts and address suggestions fill the form; they never bypass this check.
 */
export function partiesGate(f: WizardForm, lang: CsLang = 'ar'): FieldErrors {
  const errors: FieldErrors = {};
  if (!f.client_id) errors.client = tr(lang, 'اختر عميل SHIPPEC (صاحب الفاتورة).', 'Select the SHIPPEC customer (invoice owner).');
  for (const who of ['shipper', 'receiver'] as const) {
    for (const k of partyMissing(f[who])) errors[`${who}.${k}`] = tr(lang, ...PARTY_FIELD_MESSAGE[k]);
  }
  return errors;
}

/** Light presence checks — which steps visibly still need input (the Backend decides validity). */
export function stepMissing(f: WizardForm, step: StepId, lang: CsLang = 'ar'): string[] {
  const miss: string[] = [];
  const T = (ar: string, en: string) => tr(lang, ar, en);
  switch (step) {
    case 'parties':
      for (const [who, label] of [['shipper', T('المرسل', 'From')], ['receiver', T('المستلم', 'To')]] as const) {
        for (const k of partyMissing(f[who])) miss.push(`${label}: ${tr(lang, ...PARTY_FIELD_NAME[k])}`);
      }
      if (!f.client_id) miss.push(T('العميل (للفاتورة)', 'Customer (invoice)'));
      break;
    case 'details': if (!f.content_description.trim()) miss.push(T('وصف المحتوى', 'Contents description')); if (needsCustoms(f) && !f.shipment_purpose) miss.push(T('غرض الشحنة', 'Purpose of shipment')); break;
    case 'customs': if (!f.items.length) miss.push(T('بند جمركي واحد على الأقل', 'At least one customs line')); if (!f.customs_invoice_number.trim()) miss.push(T('رقم الفاتورة الجمركية', 'Customs invoice number')); break;
    case 'packages': if (!f.packages.length || f.packages.some((p) => !(num(p.weight_kg) ?? 0))) miss.push(T('وزن كل طرد', 'Weight of each package')); break;
    case 'service': if (!f.product_code) miss.push(T('خدمة DHL', 'DHL service')); break;
    case 'pickup': if (f.pickup_option === 'schedule' && (!f.pickup_earliest_time || !f.pickup_latest_time)) miss.push(T('وقت الاستلام', 'Pickup time')); if (f.pickup_option === 'drop_off' && !f.service_point_id) miss.push(T('نقطة الخدمة', 'Service point')); break;
    default: break;
  }
  return miss;
}

/** What DHL's products / quotes depend on — a change here makes them stale (Backend routeFingerprint is final). */
export function routeSnapshot(f: WizardForm): string {
  const side = (p: PartyForm) => [p.country_code, p.city.trim().toLowerCase(), p.postal_code.trim()];
  return JSON.stringify({
    s: side(f.shipper), r: side(f.receiver), d: f.shipment_date, c: needsCustoms(f), cur: needsCustoms(f) ? f.currency : null,
    v: needsCustoms(f) ? itemTotals(f.items).value : null,
    p: f.packages.map((p) => [p.weight_kg, p.length_cm, p.width_cm, p.height_cm, p.quantity]),
    pay: [f.transport_payer, f.transport_payer_account, needsCustoms(f) ? f.duties_payer : 'receiver', f.duties_payer_account],
    wy: needsCustoms(f) && f.paperless_trade,
  });
}

// ── Labels ──
export const PURPOSE_LABELS_EN: Record<ShipmentPurpose, string> = {
  commercial: 'Commercial (sale)', gift: 'Gift', personal_not_for_resale: 'Personal, not for resale', sample: 'Sample',
  return_for_repair: 'Return for repair', return_after_repair: 'Return after repair',
};
export const purposeLabel = (p: ShipmentPurpose, lang: CsLang) => (lang === 'en' ? PURPOSE_LABELS_EN[p] : PURPOSE_LABELS[p]);
export const PURPOSE_LABELS: Record<ShipmentPurpose, string> = {
  commercial: 'تجاري (بيع)',
  gift: 'هدية',
  personal_not_for_resale: 'شخصي — ليس للبيع',
  sample: 'عيّنة',
  return_for_repair: 'إرجاع للإصلاح',
  return_after_repair: 'إرجاع بعد الإصلاح',
};
/** DHL's exportReasonType enum (MyDHL OpenAPI) — chosen explicitly for purposes without a documented mapping. */
export const DHL_EXPORT_REASONS: Array<{ value: string; label: string }> = [
  { value: 'temporary', label: 'تصدير مؤقت (temporary)' },
  { value: 'return', label: 'إرجاع (return)' },
  { value: 'return_to_origin', label: 'إرجاع إلى بلد المنشأ (return_to_origin)' },
  { value: 'warranty_replacement', label: 'استبدال ضمان (warranty_replacement)' },
  { value: 'permanent', label: 'تصدير دائم (permanent)' },
  { value: 'commercial_purpose_or_sale', label: 'غرض تجاري أو بيع (commercial_purpose_or_sale)' },
  { value: 'personal_belongings_or_personal_use', label: 'أغراض شخصية (personal_belongings_or_personal_use)' },
  { value: 'sample', label: 'عيّنة (sample)' },
  { value: 'gift', label: 'هدية (gift)' },
  { value: 'intercompany_use', label: 'استخدام بين الشركات (intercompany_use)' },
  { value: 'used_exhibition_goods_to_origin', label: 'بضائع معرض مستعملة إلى المنشأ (used_exhibition_goods_to_origin)' },
  { value: 'diplomatic_goods', label: 'بضائع دبلوماسية (diplomatic_goods)' },
  { value: 'defence_material', label: 'مواد دفاعية (defence_material)' },
];
export const ITEM_UNITS = ['PCS', 'PRS', 'SET', 'BOX', 'DOZ', 'EA', 'NO', 'KG', 'GM', 'LTR', 'M', 'ROLL'];
export const CHARGE_LABELS: Record<string, string> = {
  transportation: 'أجرة النقل', fuel_surcharge: 'رسوم الوقود', demand_surcharge: 'رسوم الطلب', premium: 'خدمة مميزة', gogreen: 'GoGreen', other: 'رسوم أخرى',
};
export const CHARGE_LABELS_EN: Record<string, string> = {
  transportation: 'Transportation', fuel_surcharge: 'Fuel surcharge', demand_surcharge: 'Demand surcharge', premium: 'Premium service', gogreen: 'GoGreen', other: 'Other charges',
};
/** DHL's export reason value itself is the English label. */
export const exportReasonLabel = (r: { value: string; label: string }, lang: CsLang) => (lang === 'en' ? r.value.replace(/_/g, ' ') : r.label);

// ── Permissions (re-exported; the map lives in utils/dhlShipmentPermissions) ──
export { canShipment, type ShipmentPermission } from '../../utils/dhlShipmentPermissions';

export const money = (n: number | null | undefined, currency = 'SAR', lang: CsLang = 'ar') =>
  n == null || !Number.isFinite(n) ? '—' : `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === 'SAR' && lang === 'ar' ? 'ر.س' : currency}`;
/** Kilograms in the page language. */
export const kg = (v: number | string | null | undefined, lang: CsLang = 'ar') => (v == null || v === '' ? '—' : `${v} ${lang === 'en' ? 'kg' : 'كغ'}`);
