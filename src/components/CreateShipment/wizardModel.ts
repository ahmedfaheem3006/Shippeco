/**
 * «إنشاء شحنة» wizard — the form model (pure functions, no React):
 * form ⇄ Backend draft content, steps, Backend issue → step / field, totals.
 * Business rules stay in the Backend (validation is the Backend's answer);
 * the few checks here only tell the user which step still misses data.
 */
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import type {
  CustomsDocument, CustomsInvoiceMode, DetailsExtraContent, DhlShipment, DraftContent, DutiesPayer, Issue, ItemInput, Party, PartyDetailsContent, PhoneEntry, PhoneType,
  PickupOption, RateQuote, ShipmentPurpose, TransportPayer,
} from '../../services/dhlShipment.service';
import { tr, type CsLang } from './csLang';
import { normalizeSubdivision, originZone, subdivisionName, zoneOffset } from './geoRules';

// ── Countries (full ISO list, names in Arabic and English from the browser, calling codes) ──
export interface CountryOption { code: string; name: string; ar: string; en: string; dial: string; aliases: string[] }
/** Business names that differ from the browser's region names (the ISO code never changes: US stays US, AS stays American Samoa). */
const COUNTRY_NAME_OVERRIDES: Record<string, { ar: string; en: string }> = {
  US: { ar: 'الولايات المتحدة الأمريكية', en: 'United States of America' },
};
/** Extra words that must find a country (lower case; Arabic without diacritics). */
const COUNTRY_ALIASES: Record<string, string[]> = {
  US: ['united states of america', 'united states', 'usa', 'u.s.a.', 'u.s.a', 'u.s.', 'us', 'america', 'الولايات المتحدة', 'الولايات المتحدة الأمريكية', 'أمريكا', 'امريكا', 'امريكيا'],
  GB: ['uk', 'u.k.', 'great britain', 'england', 'britain', 'بريطانيا', 'انجلترا'],
  AE: ['uae', 'u.a.e.', 'emirates', 'الإمارات', 'الامارات'],
  SA: ['ksa', 'saudi', 'السعودية'],
};
/** How well a country matches a search ("usa", "مصر", "966", "US"): lower = better, null = no match. */
export function countryMatch(c: CountryOption, raw: string): number | null {
  const q = raw.trim().toLowerCase();
  if (!q) return 3;
  if (c.code.toLowerCase() === q || c.aliases.includes(q)) return 0;
  const names = [c.ar.toLowerCase(), c.en.toLowerCase()];
  if (names.some((n) => n === q)) return 0;
  if (names.some((n) => n.startsWith(q)) || c.aliases.some((a) => a.startsWith(q))) return 1;
  if (names.some((n) => n.includes(q)) || c.aliases.some((a) => a.includes(q))) return 2;
  const digits = q.replace(/\D/g, '');
  if (digits && digits === q.replace(/^\+/, '') && c.dial.startsWith(digits)) return 2;
  return null;
}
/** Countries matching a search, best first (exact name / code / alias, then prefix, then contains). */
export function searchCountries(q: string, lang: CsLang = 'ar'): CountryOption[] {
  return allCountries(lang)
    .map((c, i) => ({ c, i, m: countryMatch(c, q) }))
    .filter((x) => x.m != null)
    .sort((a, b) => (a.m as number) - (b.m as number) || a.i - b.i)
    .map((x) => x.c);
}
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
    const a = COUNTRY_NAME_OVERRIDES[code]?.ar ?? ar?.of(code) ?? code;
    const e = COUNTRY_NAME_OVERRIDES[code]?.en ?? en?.of(code) ?? code;
    return { code, ar: a, en: e, name: lang === 'en' ? e : a, dial: callingCode(code), aliases: COUNTRY_ALIASES[code] ?? [] };
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
  /** Shipment Details extras (stored with the draft, not sent to DHL). */
  manufacturer_id: string; line_reference: string; show_reference: boolean;
}
/** A shipment reference; the FIRST one is DHL's customer reference (printed on the label / waybill). */
export interface ReferenceForm { type: string; value: string }
export type ChargeType = 'freight' | 'insurance' | 'other';
export interface ChargeForm { type: ChargeType; description: string; amount: string }
export type ContentKind = 'documents' | 'goods';
export interface WizardForm {
  client_id: number | null;
  client_name: string;
  content_kind: ContentKind;
  content_description: string;
  /** Shipment references — [0] is sent to DHL as customer_reference; the others are kept by SHIPPEC. */
  references: ReferenceForm[];
  declared_value: string;
  /** Shipment Details preferences — stored only; no MyDHL mapping is wired for them yet (never sent to DHL). */
  document_protection: boolean;
  insurance: boolean;
  estimated_duties: boolean;
  precalculated_duties: boolean;
  item_entry: 'describe' | 'upload';
  charges: ChargeForm[];
  currency: string;
  shipment_purpose: ShipmentPurpose | '';
  export_reason_type: string;
  customs_invoice_number: string;
  customs_invoice_date: string;
  dhl_invoice_type: 'commercial' | 'proforma' | '';
  /** Customs Invoice (MyDHL+): «إنشاء فاتورة» (DHL generates it) or «استخدام فاتورتي الخاصة». */
  customs_invoice_mode: CustomsInvoiceMode;
  /** Create Invoice: «أرغب في إضافة رقم فاتورة» (the number is optional there). */
  include_invoice_number: boolean;
  /** "Additional Invoice Information (Remarks)" — one DHL remark per line (≤ 3 × 45). */
  invoice_remarks: string;
  /** Declaration statement ids (route-aware, see declarationOptions). */
  declaration_statements: string[];
  /** Additional customs documents: DHL type code + the document's ID (metadata only). */
  customs_documents: CustomsDocument[];
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
  /** «Where should the courier pick up the shipment?» — Reception / Front / Back, or Other (then pickup_location = the details). */
  pickup_location_choice: PickupLocationChoice;
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
  unit_net_weight_kg: '', gross_mode: 'line', gross_weight_kg: '', manufacturer_id: '', line_reference: '', show_reference: false,
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
    client_id: null, client_name: '', content_kind: 'documents', content_description: '', references: [], declared_value: '', currency: 'SAR',
    document_protection: false, insurance: false, estimated_duties: false, precalculated_duties: false, item_entry: 'describe', charges: [],
    shipment_purpose: '', export_reason_type: '', customs_invoice_number: '', customs_invoice_date: '', dhl_invoice_type: '', paperless_trade: false,
    customs_invoice_mode: 'create', include_invoice_number: false, invoice_remarks: '', declaration_statements: [], customs_documents: [],
    incoterm: 'DAP', transport_payer: 'shipper', transport_payer_account: '', duties_payer: 'receiver', duties_payer_account: '',
    shipment_date: nextBusinessDay(), origin_gmt_offset: '', product_code: '', local_product_code: '', service_codes: [],
    pickup_option: 'none', pickup_earliest_time: '', pickup_latest_time: '', pickup_location_choice: '', pickup_location: '', pickup_location_type: '', pickup_instructions: '',
    pickup_other_address: false, pickup_address: emptyParty(), service_point_id: '', service_point_name: '',
    shipper: fromDefaultParty(), receiver: toDefaultParty(), packages: [emptyPackage()], items: [],
  };
}

// ── Derived facts ──
export const isInternational = (f: Pick<WizardForm, 'shipper' | 'receiver'>) =>
  !!f.shipper.country_code && !!f.receiver.country_code && f.shipper.country_code !== f.receiver.country_code;
/** Customs declaration: goods crossing a border (the Backend refuses it for a domestic shipment). */
export const needsCustoms = (f: WizardForm) => f.content_kind === 'goods' && isInternational(f);
/** A typed sender offset is needed only when the ship-from location has no resolvable time zone (geoRules). */
export const needsOriginOffset = (f: Pick<WizardForm, 'shipper'>) => !!f.shipper.country_code && !originZone(f.shipper.country_code, f.shipper.province);

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
    province: t(normalizeSubdivision(p.country_code, p.province)), country_code: t(p.country_code), type: p.type,
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
    province: t(normalizeSubdivision(p.country_code, p.province)), country_code: t(p.country_code), type: p.residential ? 'private' as const : 'business' as const,
    address_line1: t(p.address_line1), address_line2: t(p.address_line2),
    address_line3: sa ? t(p.short_address.toUpperCase()) : t(p.suburb),
  };
}
function detailsOut(p: PartyForm): PartyDetailsContent {
  return {
    business_contact: p.business_contact, residential: p.residential, country_name: t(countryName(p.country_code, 'en') === '—' ? '' : countryName(p.country_code, 'en')),
    short_address: p.country_code === 'SA' ? t(p.short_address.toUpperCase()) : null, suburb: t(p.suburb),
    // the State's display name ("Oregon"); DHL gets the code ("OR") in the party itself
    province_name: t(subdivisionName(p.country_code, normalizeSubdivision(p.country_code, p.province)) ?? p.province),
    phones: p.phones.filter((x) => x.number.trim()).map((x) => ({ type: x.type, code: t(x.code), number: t(x.number), extension: t(x.extension), sms: x.sms })),
    vat_tax_id: t(p.vat_tax_id), eori: t(p.eori), notes: t(p.notes), saved_contact_id: p.saved_contact_id,
  };
}

const blank = (...v: Array<string | null | undefined>) => v.every((x) => !String(x ?? '').trim());
const blankPackage = (p: PackageForm) => blank(p.weight_kg, p.length_cm, p.width_cm, p.height_cm);
const blankItem = (it: ItemForm) => blank(it.description, it.unit_value, it.country_of_origin, it.outbound_hs_code, it.inbound_hs_code, it.unit_net_weight_kg, it.gross_weight_kg);
/** International packages without a typed contents summary: the item descriptions (what DHL prints as the contents). */
export function derivedContents(f: Pick<WizardForm, 'items'>): string {
  return [...new Set(f.items.map((it) => it.description.trim()).filter(Boolean))].join(', ').slice(0, 255);
}

export function toContent(f: WizardForm): Partial<DraftContent> {
  const customs = needsCustoms(f);
  const sentItems = customs ? f.items.filter((it) => !blankItem(it)) : [];
  const items: ItemInput[] = sentItems.map((it) => ({
    description: it.description.trim(), quantity: it.quantity, unit: it.unit, unit_value: it.unit_value,
    country_of_origin: t(it.country_of_origin), outbound_hs_code: t(it.outbound_hs_code), inbound_hs_code: t(it.inbound_hs_code),
    unit_net_weight_kg: t(it.unit_net_weight_kg),
    ...(it.gross_mode === 'unit' ? { unit_gross_weight_kg: t(it.gross_weight_kg) } : { line_gross_weight_kg: t(it.gross_weight_kg) }),
  }));
  const schedule = f.pickup_option === 'schedule';
  const refs = f.references.filter((r) => r.value.trim());
  const amountOf = (v: string) => { const n = num(v); return n == null ? null : Math.round(n * 100) / 100; };
  const services = f.service_codes.filter((s) => s !== 'WY' && s !== 'DD');
  const createInvoice = customs && f.customs_invoice_mode === 'create';
  // DHL requires exportDeclarations[].invoice { number, date } on every customs shipment. «Create Invoice»: SHIPPEC
  // issues them on the server (CI-<reference>, the sender's date) — nothing sent from here; «Use My Own Invoice»: typed.
  const ownInvoice = customs && f.customs_invoice_mode === 'own';
  const number = ownInvoice ? t(f.customs_invoice_number) : null;
  const paperless = createInvoice && f.paperless_trade;
  return {
    client_id: f.client_id,
    customer_reference: t(refs[0]?.value),
    product_code: t(f.product_code),
    local_product_code: t(f.local_product_code),
    service_codes: paperless ? [...services, 'WY'] : services,
    customs_required: customs,
    paperless_trade: paperless,
    content_description: t(f.content_description) ?? (customs ? t(derivedContents(f)) : null),
    incoterm: customs ? t(f.incoterm) : null,
    currency: customs ? t(f.currency) : f.declared_value.trim() ? t(f.currency) : null,
    declared_value: !customs && f.declared_value.trim() ? f.declared_value : null,
    shipment_purpose: customs && f.shipment_purpose ? f.shipment_purpose : null,
    export_reason_type: customs && t(f.export_reason_type) ? f.export_reason_type : null,
    shipment_type: null,
    customs_invoice_number: number,
    customs_invoice_date: ownInvoice ? t(f.customs_invoice_date) : null,
    dhl_invoice_type: createInvoice ? effectiveInvoiceType(f) || null : null,
    // remarks are printed on the invoice DHL creates (Create Invoice only)
    invoice_remarks: createInvoice ? remarkLines(f.invoice_remarks) : [],
    declaration_statements: createInvoice ? f.declaration_statements.filter((id) => declarationOptions(f).some((o) => o.id === id && o.supported)) : [],
    customs_documents: customs
      ? f.customs_documents.filter((d) => d.type_code || d.value.trim()).map((d) => ({ type_code: d.type_code, value: d.value.trim() }))
      : [],
    shipment_date: t(f.shipment_date),
    origin_gmt_offset: needsOriginOffset(f) ? t(f.origin_gmt_offset) : null,
    transport_payer: f.transport_payer,
    transport_payer_account: f.transport_payer === 'shipper' ? null : t(f.transport_payer_account),
    duties_payer: customs ? f.duties_payer : 'receiver',
    duties_payer_account: customs && f.duties_payer === 'third_party' ? t(f.duties_payer_account) : null,
    pickup_option: f.pickup_option,
    pickup_earliest_time: schedule ? t(f.pickup_earliest_time) : null,
    pickup_latest_time: schedule ? t(f.pickup_latest_time) : null,
    pickup_location: schedule ? pickupLocationOut(f) : null,
    pickup_location_type: schedule && f.pickup_location_type ? f.pickup_location_type : null,
    pickup_instructions: schedule ? t(f.pickup_instructions) : null,
    pickup_address: schedule && f.pickup_other_address ? (partyOut(f.pickup_address) as unknown as Party) : null,
    service_point_id: f.pickup_option === 'drop_off' ? t(f.service_point_id) : null,
    service_point_name: f.pickup_option === 'drop_off' ? t(f.service_point_name) : null,
    shipper: partiesPartyOut(f.shipper) as DraftContent['shipper'],
    receiver: partiesPartyOut(f.receiver) as DraftContent['receiver'],
    party_details: { shipper: detailsOut(f.shipper), receiver: detailsOut(f.receiver) },
    details_extra: {
      references: refs.map((r) => ({ type: t(r.type), value: r.value.trim().slice(0, 35) })),
      document_protection: !customs && f.content_kind === 'documents' && f.document_protection,
      insurance: f.content_kind === 'goods' && f.insurance,
      estimated_duties: customs && f.estimated_duties,
      precalculated_duties: false,
      item_entry: f.item_entry,
      charges: customs ? f.charges.filter((c) => c.amount.trim()).map((c) => ({ type: c.type, description: t(c.description), amount: amountOf(c.amount) })) : [],
      items: sentItems.map((it) => ({ manufacturer_id: t(it.manufacturer_id), line_reference: it.show_reference ? t(it.line_reference) : null })),
      customs_invoice_mode: customs ? f.customs_invoice_mode : null,
    },
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
    city: get('city'), postal_code: get('postal_code'), province: normalizeSubdivision(country, get('province')), country_code: country,
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
    city: get('city'), postal_code: get('postal_code'), province: normalizeSubdivision(country, get('province')), country_code: country,
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
  const extra = (sh['shipment_details_extra'] ?? null) as DetailsExtraContent | null;
  const pa = sh.pickup_address ? partyIn(Object.fromEntries(Object.entries(flatParty(sh.pickup_address)).map(([k, v]) => [k, v])), '') : emptyParty(sh['shipper_country_code'] as string || 'SA');
  return {
    ...f,
    client_id: sh.client_id, client_name: clientName,
    content_kind: sh.customs_required ? 'goods' : (sh.items?.length ? 'goods' : f.content_kind),
    content_description: s(sh.content_description),
    references: extra?.references?.length
      ? extra.references.map((r) => ({ type: s(r.type) || 'CU', value: s(r.value) }))
      : sh.customer_reference ? [{ type: 'CU', value: s(sh.customer_reference) }] : [],
    document_protection: !!extra?.document_protection, insurance: !!extra?.insurance, estimated_duties: !!extra?.estimated_duties, precalculated_duties: false,
    item_entry: extra?.item_entry === 'upload' ? 'upload' : 'describe',
    charges: (extra?.charges ?? []).map((c) => ({ type: (['freight', 'insurance', 'other'].includes(String(c.type)) ? c.type : 'other') as ChargeType, description: s(c.description), amount: c.amount == null ? '' : s(c.amount) })),
    declared_value: sh.customs_required ? '' : s(sh.declared_value != null ? num(sh.declared_value) : ''), currency: s(sh.currency) || 'SAR',
    shipment_purpose: sh.shipment_purpose ?? '', export_reason_type: s(sh.export_reason_type),
    // the form holds the person's OWN invoice number / date only; a «Create Invoice» draft's are SHIPPEC-issued (read-only, from the draft)
    ...((extra?.customs_invoice_mode ?? (sh.dhl_invoice_type ? 'create' : sh.customs_invoice_number ? 'own' : 'create')) === 'own'
      ? { customs_invoice_number: s(sh.customs_invoice_number), customs_invoice_date: s(sh.customs_invoice_date) }
      : { customs_invoice_number: '', customs_invoice_date: '' }),
    dhl_invoice_type: sh.dhl_invoice_type ?? '', paperless_trade: !!sh.paperless_trade, incoterm: s(sh.incoterm) || 'DAP',
    // older drafts (no stored mode): an invoice DHL renders = Create Invoice; an invoice number without one = the shipper's own
    customs_invoice_mode: extra?.customs_invoice_mode ?? (sh.dhl_invoice_type ? 'create' : sh.customs_invoice_number ? 'own' : 'create'),
    include_invoice_number: !!sh.customs_invoice_number,
    invoice_remarks: (sh.invoice_remarks ?? []).join('\n'),
    declaration_statements: Array.isArray(sh.declaration_statements) ? sh.declaration_statements : [],
    customs_documents: (sh.customs_documents ?? []).map((d) => ({ type_code: s(d.type_code), value: s(d.value) })),
    transport_payer: sh.transport_payer ?? 'shipper', transport_payer_account: s(sh.transport_payer_account),
    duties_payer: sh.duties_payer ?? 'receiver', duties_payer_account: s(sh.duties_payer_account),
    shipment_date: s(sh.shipment_date) || f.shipment_date, origin_gmt_offset: s(sh.origin_gmt_offset),
    product_code: s(sh.product_code), local_product_code: s(sh.local_product_code), service_codes: Array.isArray(sh.service_codes) ? sh.service_codes : [],
    pickup_option: sh.pickup_option ?? 'none', pickup_earliest_time: s(sh.pickup_earliest_time), pickup_latest_time: s(sh.pickup_latest_time),
    ...pickupLocationIn(sh.pickup_location), pickup_location_type: sh.pickup_location_type ?? '', pickup_instructions: s(sh.pickup_instructions),
    pickup_other_address: !!sh.pickup_address, pickup_address: pa,
    service_point_id: s(sh.service_point_id), service_point_name: s(sh.service_point_name),
    shipper: partiesPartyIn(sh as Record<string, unknown>, 'shipper_', sh['shipper_details'] as PartyDetailsContent | null, 'mobile'),
    receiver: partiesPartyIn(sh as Record<string, unknown>, 'receiver_', sh['receiver_details'] as PartyDetailsContent | null, 'office'),
    packages: sh.packages?.length ? groupPieces(sh.packages) : [emptyPackage()],
    items: (sh.items ?? []).map((i: Record<string, any>, k: number) => ({
      manufacturer_id: s(extra?.items?.[k]?.manufacturer_id), line_reference: s(extra?.items?.[k]?.line_reference), show_reference: !!extra?.items?.[k]?.line_reference,
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
  // the customs lines are entered on «تفاصيل الشحنة» (Shipment Details, packages)
  const line = /^customs\.lineItems\.(\d+)\.([A-Za-z]+)/.exec(f);
  if (line) return { step: 'details', key: `items.${line[1]}.${CUSTOMS_TO_FORM[line[2]] ?? line[2]}` };
  if (/^customs\.lineItems$/.test(f)) return { step: 'details', key: 'items' };
  const item = /^items\.(\d+)\.?([a-z_]*)/.exec(f);
  if (item) return { step: 'details', key: item[2] ? `items.${item[1]}.${item[2]}` : 'items' };
  const pkg = /^packages\.?(\d*)/.exec(f);
  if (pkg) return { step: 'packages', key: pkg[1] ? `packages.${pkg[1]}` : 'packages' };
  const top = f.split('.')[0];
  const STEP_OF: Record<string, StepId> = {
    content_description: 'details', customer_reference: 'details', customs_required: 'details', declared_value: 'details', shipment_purpose: 'details',
    export_reason_type: 'details', shipment_type: 'details',
    items: 'details', customs_invoice_number: 'customs', customs_invoice_date: 'customs', dhl_invoice_type: 'customs', paperless_trade: 'customs',
    invoice_remarks: 'customs', declaration_statements: 'customs', customs_documents: 'customs',
    service_codes: 'customs', currency: 'details', customs: 'customs', details_extra: 'details',
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
  [/Create Invoice: choose the invoice type/i, 'إنشاء فاتورة: اختر نوع الفاتورة التي تُنشئها DHL (تجارية / مبدئية)'],
  [/Paperless Trade with your own invoice/i, 'Paperless Trade مع فاتورتك الخاصة يتطلب رفع ملف فاتورتك إلى DHL — غير متاح في SHIPPEC بعد'],
  [/Customs invoice information is incomplete: the invoice number is required/i, 'بيانات الفاتورة الجمركية غير مكتملة: رقم الفاتورة مطلوب'],
  [/Customs invoice information is incomplete: the invoice date is required/i, 'بيانات الفاتورة الجمركية غير مكتملة: تاريخ الفاتورة مطلوب'],
  [/Customs invoice information is incomplete: choose the invoice type/i, 'بيانات الفاتورة الجمركية غير مكتملة: اختر نوع الفاتورة التي تُنشئها DHL (تجارية / مبدئية)'],
  [/Customs invoice information is incomplete/i, 'بيانات الفاتورة الجمركية غير مكتملة.'],
  [/DHL requires the Incoterm on the customs declaration/i, 'تطلب DHL شرط التسليم (Incoterm) في الإقرار الجمركي'],
  [/DHL requires .* on the customs declaration/i, 'تطلب DHL بيانات إضافية في الإقرار الجمركي — راجع خطوة الجمارك ثم أعد التحقق'],
  [/DHL refused the customs declaration data/i, 'رفضت DHL بيانات الإقرار الجمركي — راجع خطوة الجمارك ثم أعد التحقق'],
  [/DHL refused this customs line item/i, 'رفضت DHL هذا البند الجمركي — راجع الوصف والكمية والقيمة والأوزان وبلد المنشأ'],
  [/DHL refused the sender \(From\) details/i, 'رفضت DHL بيانات المرسل (من) — راجع العنوان وبيانات الاتصال'],
  [/DHL refused the receiver \(To\) details/i, 'رفضت DHL بيانات المستلم (إلى) — راجع العنوان وبيانات الاتصال'],
  [/DHL refused this package/i, 'رفضت DHL هذا الطرد — راجع الوزن والأبعاد'],
  [/DHL refused part of the shipment data/i, 'رفضت DHL جزءًا من بيانات الشحنة — راجع التفاصيل ثم أعد التحقق'],
  [/Courier pickup is not currently available/i, 'استلام الشحنة بواسطة مندوب DHL غير متاح حاليًا. اختر "لا" أو التسليم في نقطة خدمة DHL.'],
  [/Paperless Trade upload is turned off/i, 'رفع Paperless Trade متوقف على هذا الخادم — ألغِ الخيار أو راجع المسؤول'],
  [/An invoice date only goes with an invoice number/i, 'تاريخ الفاتورة يُرسل مع رقم الفاتورة فقط'],
  [/Latest pickup time must be after/i, 'آخر وقت للاستلام يجب أن يكون بعد أبكر وقت'],
  [/DHL does not offer the optional service/i, 'DHL لا تعرض هذه الخدمة الاختيارية لهذه الخدمة — ألغِ اختيارها أو حدّث الخدمات والأسعار'],
  [/the optional services are not priced/i, 'حدّث أسعار DHL — الخدمات الاختيارية لم تُسعَّر للخدمة المختارة'],
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
  [/commodity\s*code|commodityCodes|\bHS\s*code|harmoni[sz]ed|tariff\s*code/i, 'DHL تطلب رمز HS لهذا البند على هذا المسار — أدخله قبل الإنشاء'],
  [/destination location is invalid/i, 'DHL لم تتعرف على عنوان المستلم — تحقق من المدينة والرمز البريدي والدولة'],
  [/origin location is invalid/i, 'DHL لم تتعرف على عنوان المرسل — تحقق من المدينة والرمز البريدي والدولة'],
  [/^7142\b|shipment data validation has failed/i, 'رفضت DHL بيانات الشحنة دون سبب محدد — راجع البيانات أو أعد المحاولة لاحقًا'],
  // DHL 7147: the description matches a DHL keyword that is too general (e.g. "UNIQUE SHOES") — a real action for the person
  [/line item description.*Match Keyword/i, 'وصف هذا البند عام جدًا لدى DHL — اكتب وصفًا أدق (نوع المنتج ومادته واستخدامه)'],
  [/description.*Match Keyword/i, 'وصف محتوى الشحنة عام جدًا لدى DHL — اكتب وصفًا أدق (نوع المنتج ومادته واستخدامه)'],
];

/** Backend / DHL message in the page language: Arabic for the common rules; English = as the Backend wrote it. */
export function translateIssue(message: string, lang: CsLang = 'ar'): string {
  if (lang === 'en') return message;
  // DHL's own refusals ("998 : …") first: their DHL code stays visible.
  const code = /^(\d{3,6})\s*:/.exec(message)?.[1];
  if (code) for (const [re, ar] of DHL_TRANSLATIONS) if (re.test(message)) return `${ar} (DHL ${code})`;
  for (const [re, ar] of TRANSLATIONS) if (re.test(message)) return ar;
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

/** Latin only (DHL); the same rule as the Backend's findNonLatinStrings, for one text. */
export const isLatin = (v: string) => !/[^\t\n\r -\u024F\u2018-\u201F\u2013\u2014]/.test(v);
export const ITEM_DESCRIPTION_MAX = 170;
/** DHL's commodity-code format as the Backend checks it (letters, digits or dots, 2–18); the inputs take digits and dots. */
export const HS_CODE_MAX = 18;
export const HS_CODE_RE = /^[A-Za-z0-9.]{2,18}$/;
/** Purposes DHL documents no export reason for: the person chooses DHL's export reason type. */
export const PURPOSES_NEEDING_REASON: ShipmentPurpose[] = ['return_for_repair', 'return_after_repair', 'claim', 'return_to_seller'];
const positive = (v: string) => { const n = num(v); return n != null && n > 0; };

/**
 * The Shipment Details gate (Next / stepper): field key → message; empty = Next allowed.
 * Documents: a contents description; a value, when typed, positive.
 * International packages: purpose (+ DHL export reason when needed), currency, at least one item
 * with an English description (≤ 170), quantity, unit, value, weight and origin. HS codes are
 * optional (only their format is checked) — DHL's validation decides when a route needs one.
 */
export function detailsGate(f: WizardForm, lang: CsLang = 'ar'): FieldErrors {
  const e: FieldErrors = {};
  const T = (ar: string, en: string) => tr(lang, ar, en);
  const customs = needsCustoms(f);
  if (!customs && !f.content_description.trim()) e.content_description = T('وصف المحتوى مطلوب.', 'A description of the contents is required.');
  if (f.content_description.trim() && !isLatin(f.content_description)) e.content_description = T('الوصف بالإنجليزية فقط (DHL تقبل الأحرف اللاتينية).', 'English only (DHL accepts Latin characters).');
  if (!customs && f.declared_value.trim() && !positive(f.declared_value)) e.declared_value = T('القيمة رقم أكبر من صفر.', 'The value must be a number greater than zero.');
  f.references.forEach((r, i) => { if (r.value.trim() && !isLatin(r.value)) e[`references.${i}`] = T('المرجع بالأحرف اللاتينية فقط.', 'Latin characters only.'); });
  if (customs) {
    if (!f.shipment_purpose) e.shipment_purpose = T('اختر غرض الشحنة.', 'Choose the purpose of the shipment.');
    else if (PURPOSES_NEEDING_REASON.includes(f.shipment_purpose as ShipmentPurpose) && !f.export_reason_type) e.export_reason_type = T('اختر سبب التصدير لدى DHL.', "Choose DHL's export reason.");
    if (!/^[A-Z]{3}$/.test(f.currency)) e.currency = T('اختر العملة.', 'Choose the currency.');
    const items = f.items.filter((it) => !blankItem(it));
    if (!items.length) e.items = T('أضف بندًا واحدًا على الأقل.', 'Add at least one item.');
    f.items.forEach((it, i) => {
      if (blankItem(it) && f.items.length > 1) return;
      const k = (x: string) => `items.${i}.${x}`;
      if (!it.description.trim()) e[k('description')] = T('وصف البند مطلوب.', 'The item description is required.');
      else if (it.description.length > ITEM_DESCRIPTION_MAX) e[k('description')] = T(`الوصف ${ITEM_DESCRIPTION_MAX} حرفًا كحد أقصى.`, `At most ${ITEM_DESCRIPTION_MAX} characters.`);
      else if (!isLatin(it.description)) e[k('description')] = T('الوصف بالإنجليزية فقط (DHL تقبل الأحرف اللاتينية).', 'English only (DHL accepts Latin characters).');
      if (!/^\d+$/.test(it.quantity.trim()) || Number(it.quantity) < 1) e[k('quantity')] = T('الكمية رقم صحيح من 1 فأكثر.', 'Quantity: a whole number of 1 or more.');
      if (!it.unit) e[k('unit')] = T('اختر الوحدة.', 'Choose the unit.');
      if (!positive(it.unit_value)) e[k('unit_value')] = T('قيمة البند رقم أكبر من صفر.', 'The item value must be greater than zero.');
      if (!positive(it.unit_net_weight_kg)) e[k('unit_net_weight_kg')] = T('وزن البند رقم أكبر من صفر.', 'The item weight must be greater than zero.');
      if (!it.country_of_origin) e[k('country_of_origin')] = T('اختر بلد الصنع.', 'Choose where the item was made.');
      // HS codes are optional; one that is typed must have DHL's basic format (Backend HS_FORMAT).
      for (const hs of ['outbound_hs_code', 'inbound_hs_code'] as const) {
        if (it[hs].trim() && !HS_CODE_RE.test(it[hs].trim())) e[k(hs)] = T('رمز HS: من 2 إلى 18 رقمًا أو نقطة.', 'HS code: 2–18 digits or dots.');
      }
    });
    f.charges.forEach((c, i) => { if (c.amount.trim() && (num(c.amount) == null || (num(c.amount) as number) < 0)) e[`charges.${i}`] = T('المبلغ رقم صفر أو أكثر.', 'The amount must be zero or more.'); });
  }
  return e;
}

// ── Payment (MyDHL+ «How will you pay?») ──
/** DHL account number contract (Backend dhlAccount): 6–12 digits. */
export const DHL_ACCOUNT_RE = /^\d{6,12}$/;
/** A DHL account number for display: its last 4 digits only. */
export const maskAccount = (v: string | null | undefined) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.length <= 4 ? '*'.repeat(s.length) : `${'*'.repeat(s.length - 4)}${s.slice(-4)}`;
};
/** The Incoterm that normally goes with the duties payer: the receiver pays → DAP; SHIPPEC / a third party pays → DDP. */
export const suggestedIncoterm = (p: DutiesPayer): string => (p === 'receiver' ? 'DAP' : 'DDP');
/** An Incoterm that does not fit the duties payer (the Backend refuses both cases): null when it fits. */
export function incotermAdvice(f: Pick<WizardForm, 'duties_payer' | 'incoterm'>): 'needs_ddp' | 'ddp_with_receiver' | null {
  if (!f.incoterm) return null;
  if (f.duties_payer !== 'receiver' && f.incoterm !== 'DDP') return 'needs_ddp';
  if (f.duties_payer === 'receiver' && f.incoterm === 'DDP') return 'ddp_with_receiver';
  return null;
}
/**
 * The Payment gate (Next / stepper): the account of the party that pays, where one applies.
 * Transportation: receiver / third party → its DHL account. Duties (customs only): third party → its account.
 * The Incoterm advice never blocks here — the server's validation decides.
 */
export function paymentGate(f: WizardForm, lang: CsLang = 'ar'): FieldErrors {
  const e: FieldErrors = {};
  const T = (ar: string, en: string) => tr(lang, ar, en);
  const acc = (v: string, key: string, what: [string, string]) => {
    if (!v.trim()) e[key] = T(`${what[0]} مطلوب.`, `${what[1]} is required.`);
    else if (!DHL_ACCOUNT_RE.test(v.trim())) e[key] = T('رقم حساب DHL من 6 إلى 12 رقمًا.', 'A DHL account number has 6–12 digits.');
  };
  if (f.transport_payer === 'receiver') acc(f.transport_payer_account, 'transport_payer_account', ['رقم حساب DHL للمستلم', 'The receiver DHL account number']);
  if (f.transport_payer === 'third_party') acc(f.transport_payer_account, 'transport_payer_account', ['رقم حساب DHL للطرف الثالث', 'The third-party DHL account number']);
  if (needsCustoms(f) && f.duties_payer === 'third_party') acc(f.duties_payer_account, 'duties_payer_account', ['رقم حساب DHL للطرف الثالث', 'The third-party DHL account number']);
  return e;
}

// ── Customs Invoice (MyDHL+ workflow) ──
/** "Additional Invoice Information (Remarks)": one DHL remark per non-empty line. */
export const remarkLines = (v: string) => v.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
export const REMARKS_MAX_LINES = 3;
export const REMARK_MAX = 45;
export const CUSTOMS_DOCUMENT_ID_MAX = 35;
/**
 * Declaration statements SHIPPEC offers (Backend DECLARATION_STATEMENTS): route-aware.
 * NAFTA / USMCA belongs to US / CA / MX routes only and is not wired (shown there as unavailable).
 */
export function declarationOptions(f: Pick<WizardForm, 'shipper' | 'receiver'>): Array<{ id: string; supported: boolean }> {
  const na = ['US', 'CA', 'MX'];
  const from = f.shipper.country_code; const to = f.receiver.country_code;
  return [
    { id: 'certificate_of_origin', supported: true },
    ...(na.includes(from) && na.includes(to) && from !== to ? [{ id: 'usmca', supported: false }] : []),
  ];
}
/** The exact statement printed on DHL's invoice (Backend declarationText — built from the item origins). */
export function declarationPreview(id: string, f: Pick<WizardForm, 'items'>): string | null {
  if (id !== 'certificate_of_origin') return null;
  const origins = [...new Set(f.items.map((i) => i.country_of_origin).filter(Boolean))];
  if (!origins.length) return null;
  return `We hereby certify that the goods described in this invoice are of ${origins.map((c) => countryName(c, 'en')).join(', ')} origin.`;
}
/** "Electronic Export Filing" (US FTR 30.37(a)) exists only for US-origin exports. */
export const needsUsExportFiling = (f: Pick<WizardForm, 'shipper'>) => f.shipper.country_code === 'US';
/** DHL customs document types offered here (codes from the MyDHL enum; the code stays visible). */
export const CUSTOMS_DOCUMENT_TYPES: Array<{ code: string; ar: string; en: string }> = [
  { code: 'COO', ar: 'شهادة المنشأ', en: 'Certificate of Origin' },
  { code: 'DEX', ar: 'بيان تصدير', en: 'Export declaration' },
  { code: 'EXL', ar: 'رخصة تصدير', en: 'Export licence' },
  { code: 'LIC', ar: 'ترخيص', en: 'Licence' },
  { code: 'ATA', ar: 'دفتر ATA', en: 'ATA Carnet' },
  { code: 'PHY', ar: 'شهادة صحة نباتية', en: 'Phytosanitary certificate' },
  { code: 'VET', ar: 'شهادة بيطرية', en: 'Veterinary certificate' },
  { code: 'HLC', ar: 'شهادة صحية', en: 'Health certificate' },
];
/** Purpose → the invoice DHL usually generates (a suggestion shown to the person — never chosen silently). */
/**
 * The «Create Invoice» number / date SHIPPEC issued for this draft (CI-<reference suffix>, the sender's date) —
 * only when the stored number really is the issued one (never the person's own number from «Use My Own Invoice»).
 * null while the server has not issued it yet (an older draft is completed at its next products / rates / validation).
 */
export function issuedInvoice(sh: { shippec_reference?: unknown; customs_invoice_number?: unknown; customs_invoice_date?: unknown } | null | undefined): { number: string; date: string | null } | null {
  if (!sh?.customs_invoice_number || typeof sh.shippec_reference !== 'string') return null;
  const expected = `CI-${sh.shippec_reference.replace(/^SHIPPEC-/, '')}`.slice(0, 35);
  return sh.customs_invoice_number === expected ? { number: expected, date: sh.customs_invoice_date ? String(sh.customs_invoice_date) : null } : null;
}

export function suggestedInvoiceType(p: ShipmentPurpose | ''): 'commercial' | 'proforma' | null {
  if (p === 'commercial') return 'commercial';
  if (p === 'gift' || p === 'personal_not_for_resale' || p === 'sample') return 'proforma';
  return null;
}
/**
 * The invoice type DHL renders for «Create Invoice»: the one the person chose, else the one the purpose
 * reliably implies (sale → Commercial; gift / sample / personal, not for resale → Proforma) — shown as
 * selected on the Customs step and changeable; other purposes need a choice.
 */
export const effectiveInvoiceType = (f: Pick<WizardForm, 'dhl_invoice_type' | 'shipment_purpose'>): 'commercial' | 'proforma' | '' =>
  f.dhl_invoice_type || suggestedInvoiceType(f.shipment_purpose) || '';
/**
 * The Customs Invoice gate (Next / stepper): field key → message; empty = Next allowed.
 * Create Invoice: the invoice type; the number only when «include an invoice number» is ticked.
 * Remarks ≤ 3 lines × 45, Latin; every customs document row complete (type + ID ≤ 35, Latin).
 */
export function customsGate(f: WizardForm, lang: CsLang = 'ar'): FieldErrors {
  const e: FieldErrors = {};
  if (!needsCustoms(f)) return e;
  const T = (ar: string, en: string) => tr(lang, ar, en);
  if (f.customs_invoice_mode === 'create' && !effectiveInvoiceType(f)) e.dhl_invoice_type = T('اختر نوع الفاتورة التي تُنشئها DHL.', 'Choose the invoice type DHL creates.');
  // «Use My Own Invoice»: DHL requires YOUR invoice number AND date — typed, never generated.
  // («Create Invoice»: SHIPPEC issues them — nothing to type.)
  if (f.customs_invoice_mode === 'own') {
    const number = f.customs_invoice_number.trim();
    if (!number) e.customs_invoice_number = T('رقم الفاتورة مطلوب (تشترطه DHL).', 'The invoice number is required (DHL requires it).');
    else if (!isLatin(number)) e.customs_invoice_number = T('رقم الفاتورة بالأحرف اللاتينية فقط.', 'Latin characters only.');
    if (!f.customs_invoice_date.trim()) e.customs_invoice_date = T('تاريخ الفاتورة مطلوب (تشترطه DHL).', 'The invoice date is required (DHL requires it).');
  }
  const lines = f.customs_invoice_mode === 'create' ? remarkLines(f.invoice_remarks) : [];
  if (lines.length > REMARKS_MAX_LINES) e.invoice_remarks = T(`${REMARKS_MAX_LINES} أسطر كحد أقصى (حد DHL).`, `At most ${REMARKS_MAX_LINES} lines (DHL limit).`);
  else if (lines.some((l) => l.length > REMARK_MAX)) e.invoice_remarks = T(`كل سطر ${REMARK_MAX} حرفًا كحد أقصى (حد DHL).`, `Each line: at most ${REMARK_MAX} characters (DHL limit).`);
  else if (lines.some((l) => !isLatin(l))) e.invoice_remarks = T('الملاحظات بالإنجليزية فقط (DHL تقبل الأحرف اللاتينية).', 'English only (DHL accepts Latin characters).');
  f.customs_documents.forEach((d, i) => {
    const v = d.value.trim();
    if (!d.type_code && !v) return;
    if (!d.type_code) e[`customs_documents.${i}`] = T('اختر نوع المستند.', 'Choose the document type.');
    else if (!v) e[`customs_documents.${i}`] = T('أدخل رقم المستند.', 'Enter the document ID.');
    else if (v.length > CUSTOMS_DOCUMENT_ID_MAX) e[`customs_documents.${i}`] = T(`رقم المستند ${CUSTOMS_DOCUMENT_ID_MAX} حرفًا كحد أقصى.`, `At most ${CUSTOMS_DOCUMENT_ID_MAX} characters.`);
    else if (!isLatin(v)) e[`customs_documents.${i}`] = T('رقم المستند بالأحرف اللاتينية فقط.', 'Latin characters only.');
  });
  return e;
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
    case 'details': {
      const g = detailsGate(f, lang);
      if (g.content_description) miss.push(T('وصف المحتوى', 'Contents description'));
      if (g.shipment_purpose) miss.push(T('غرض الشحنة', 'Purpose of shipment'));
      if (g.items || Object.keys(g).some((k) => k.startsWith('items.'))) miss.push(T('بيانات البنود', 'Item details'));
      break;
    }
    case 'customs': {
      const g = customsGate(f, lang);
      if (g.dhl_invoice_type) miss.push(T('نوع الفاتورة', 'Invoice type'));
      if (g.customs_invoice_number) miss.push(T('رقم الفاتورة', 'Invoice number'));
      if (g.customs_invoice_date) miss.push(T('تاريخ الفاتورة', 'Invoice date'));
      if (Object.keys(g).some((k) => k.startsWith('customs_documents') || k === 'invoice_remarks')) miss.push(T('بيانات الفاتورة', 'Invoice details'));
      break;
    }
    case 'payment': {
      const g = paymentGate(f, lang);
      if (g.transport_payer_account) miss.push(T('رقم حساب دافع النقل', 'Transportation payer account'));
      if (g.duties_payer_account) miss.push(T('رقم حساب دافع الرسوم', 'Duties payer account'));
      break;
    }
    case 'packages': if (!f.packages.length || f.packages.some((p) => !(num(p.weight_kg) ?? 0))) miss.push(T('وزن كل طرد', 'Weight of each package')); break;
    case 'service': if (!f.product_code) miss.push(T('خدمة DHL', 'DHL service')); break;
    case 'pickup':
      if (f.pickup_option === 'schedule' && (!f.pickup_earliest_time || !f.pickup_latest_time)) miss.push(T('وقت الاستلام', 'Pickup time'));
      if (f.pickup_option === 'schedule' && f.pickup_location_choice === 'other' && !f.pickup_location.trim()) miss.push(T('تفاصيل مكان الاستلام', 'Pickup location details'));
      if (f.pickup_option === 'drop_off' && !f.service_point_id) miss.push(T('نقطة الخدمة', 'Service point'));
      break;
    default: break;
  }
  return miss;
}

/**
 * The Service gate (Next / stepper): DHL's list must belong to the current shipment data — a stale list
 * (the shipment changed after it was fetched) is refreshed first, never used.
 */
export function serviceGate(stale: boolean, lang: CsLang = 'ar'): FieldErrors {
  return stale ? { services: tr(lang, 'تغيّرت بيانات الشحنة — اضغط «تحديث الخدمات والأسعار» قبل المتابعة.', 'The shipment data changed — press «Refresh services and prices» before continuing.') } : {};
}

// ── Pickup step (MyDHL+ «Do you want to schedule a courier pickup?») ──
export type PickupLocationChoice = '' | 'reception' | 'front' | 'back' | 'other';
/**
 * The MyDHL create-shipment `pickup.location` is free text (≤ 80, no enum in the API): Reception /
 * Front / Back are sent as those words; Other sends the details the person typed.
 */
export const PICKUP_LOCATION_VALUES: Record<Exclude<PickupLocationChoice, '' | 'other'>, string> = { reception: 'Reception', front: 'Front', back: 'Back' };
export const PICKUP_LOCATION_LABELS: Record<Exclude<PickupLocationChoice, ''>, [string, string]> = {
  reception: ['الاستقبال', 'Reception'], front: ['الواجهة / المدخل الأمامي', 'Front'], back: ['الخلف / المدخل الخلفي', 'Back'], other: ['مكان آخر', 'Other'],
};
export const PICKUP_TEXT_MAX = 80;
/** Courier pickup switched off on the server (user-facing — the gate's name is for admins only). */
export const PICKUP_UNAVAILABLE_TEXT: Record<CsLang, string> = {
  ar: 'استلام الشحنة بواسطة مندوب DHL غير متاح حاليًا. اختر "لا" أو التسليم في نقطة خدمة DHL.',
  en: 'Courier pickup is not currently available. Choose No or drop off at a DHL Service Point.',
};
function pickupLocationOut(f: Pick<WizardForm, 'pickup_location_choice' | 'pickup_location'>): string | null {
  if (f.pickup_location_choice === 'other') return f.pickup_location.trim() || null;
  if (f.pickup_location_choice) return PICKUP_LOCATION_VALUES[f.pickup_location_choice];
  return null;
}
/** A stored `pickup.location` back to the choice (an older free-text value becomes Other + its text). */
export function pickupLocationIn(v: string | null | undefined): Pick<WizardForm, 'pickup_location_choice' | 'pickup_location'> {
  const s = String(v ?? '').trim();
  if (!s) return { pickup_location_choice: '', pickup_location: '' };
  const hit = (Object.keys(PICKUP_LOCATION_VALUES) as Array<keyof typeof PICKUP_LOCATION_VALUES>).find((k) => PICKUP_LOCATION_VALUES[k].toLowerCase() === s.toLowerCase());
  return hit ? { pickup_location_choice: hit, pickup_location: '' } : { pickup_location_choice: 'other', pickup_location: s };
}
/** Pickup times every 15 minutes inside DHL's window (HH:MM, both ends included). */
export function pickupSlots(earliest: string | null | undefined, latest: string | null | undefined, step = 15): string[] {
  const toMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  if (!earliest || !latest || !/^\d{2}:\d{2}/.test(earliest) || !/^\d{2}:\d{2}/.test(latest)) return [];
  const a = toMin(earliest); const b = toMin(latest);
  const out: string[] = [];
  for (let m = Math.ceil(a / step) * step; m <= b; m += step) out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  if (out[out.length - 1] !== latest.slice(0, 5) && b >= a) out.push(latest.slice(0, 5));
  if (out[0] !== earliest.slice(0, 5)) out.unshift(earliest.slice(0, 5));
  return out;
}
/**
 * The Pickup gate (Next / stepper) for «Yes — Schedule Pickup»: both times inside DHL's window, the
 * latest after the earliest, and the details when the courier comes to «Other». No minimum window
 * length is invented (the MyDHL API states none; DHL's validation decides).
 */
export function pickupGate(f: WizardForm, cap: { pickupEarliest?: string | null; pickupLatest?: string | null } | null, lang: CsLang = 'ar', bookingOff = false): FieldErrors {
  const e: FieldErrors = {};
  const T = (ar: string, en: string) => tr(lang, ar, en);
  if (f.pickup_option === 'drop_off' && !f.service_point_id) e.service_point_id = T('اختر نقطة خدمة DHL تقبل التسليم.', 'Choose a DHL Service Point that accepts drop-off.');
  if (f.pickup_option !== 'schedule') return e;
  // a courier cannot be booked here now (older draft): the person changes the choice — never silently changed
  if (bookingOff) return { pickup_option: PICKUP_UNAVAILABLE_TEXT[lang] };
  const min = cap?.pickupEarliest?.slice(0, 5) ?? null;
  const max = cap?.pickupLatest?.slice(0, 5) ?? null;
  if (!f.pickup_earliest_time) e.pickup_earliest_time = T('اختر أبكر وقت للاستلام.', 'Choose the earliest pickup time.');
  else if (min && f.pickup_earliest_time < min) e.pickup_earliest_time = T(`DHL تستلم من ${min} على هذا المسار.`, `DHL picks up from ${min} on this route.`);
  if (!f.pickup_latest_time) e.pickup_latest_time = T('اختر آخر وقت للاستلام.', 'Choose the latest pickup time.');
  else if (max && f.pickup_latest_time > max) e.pickup_latest_time = T(`DHL تستلم حتى ${max} على هذا المسار.`, `DHL picks up until ${max} on this route.`);
  else if (f.pickup_earliest_time && f.pickup_latest_time <= f.pickup_earliest_time) e.pickup_latest_time = T('آخر وقت يجب أن يكون بعد أبكر وقت.', 'The latest time must be after the earliest time.');
  if (f.pickup_location_choice === 'other' && !f.pickup_location.trim()) e.pickup_location = T('اكتب تفاصيل مكان الاستلام.', 'Enter the pickup location details.');
  return e;
}

// ── Service step (MyDHL+ «I'm sending my shipment on» / rates / optional services) ──
/** DHL accepts a planned shipping date at most this many days ahead (Backend MAX_DAYS_AHEAD). */
export const SHIP_DATE_MAX_DAYS = 10;
const ymdPlus = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/**
 * The sender's time zone: the IANA zone of the ship-from location (geoRules — country, or US / CA / AU
 * state) with its UTC offset on `ymd` (daylight saving included). null when it cannot be resolved.
 */
export function senderTimeZone(f: Pick<WizardForm, 'shipper'>, ymd: string): { zone: string; offset: string; partial: boolean } | null {
  const z = originZone(f.shipper.country_code, f.shipper.province);
  const offset = z ? zoneOffset(z.zone, ymd) : null;
  return z && offset ? { zone: z.zone, offset, partial: z.partial } : null;
}
/** The sender's offset (±HH:MM): derived from the ship-from location, the typed one only when unresolvable; null when unknown. */
export function originOffset(f: Pick<WizardForm, 'shipper' | 'origin_gmt_offset'> & { shipment_date?: string }, now = new Date()): string | null {
  const derived = senderTimeZone(f, f.shipment_date || now.toISOString().slice(0, 10));
  if (derived) return derived.offset;
  return /^[+-]\d{2}:\d{2}$/.test(f.origin_gmt_offset.trim()) ? f.origin_gmt_offset.trim() : null;
}
/** "Today" at the sender — its own time zone, never the browser's; UTC only while the sender's time zone is unknown (as the Backend). */
export function originToday(f: Pick<WizardForm, 'shipper' | 'origin_gmt_offset'>, now = new Date()): string {
  const off = originOffset({ shipper: f.shipper, origin_gmt_offset: f.origin_gmt_offset }, now);
  if (!off) return now.toISOString().slice(0, 10);
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(off)!;
  const minutes = (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  return new Date(now.getTime() + minutes * 60_000).toISOString().slice(0, 10);
}
/** The dates the person may choose: from the sender's today up to DHL's limit (the Backend counts from the same sender date). */
export function shipDateRange(f: Pick<WizardForm, 'shipper' | 'origin_gmt_offset'>, now = new Date()): { min: string; max: string } {
  const min = originToday(f, now);
  return { min, max: ymdPlus(min, SHIP_DATE_MAX_DAYS) };
}
export interface DateCard { ymd: string; rel: 'today' | 'tomorrow' | null }
/** The next `count` dates as MyDHL+ shows them (Today, Tomorrow, then weekdays) — never past the limit. */
export function shipDateCards(f: Pick<WizardForm, 'shipper' | 'origin_gmt_offset'>, count = 7, now = new Date()): DateCard[] {
  const { min, max } = shipDateRange(f, now);
  const out: DateCard[] = [];
  for (let i = 0; i < count; i++) {
    const ymd = ymdPlus(min, i);
    if (ymd > max) break;
    out.push({ ymd, rel: i === 0 ? 'today' : i === 1 ? 'tomorrow' : null });
  }
  return out;
}
const DATE_LOCALE: Record<CsLang, string> = { ar: 'ar-u-ca-gregory-nu-latn', en: 'en-US' };
/** Month / day / weekday of a YYYY-MM-DD date (Gregorian, Latin digits) in the page language. */
export function dateParts(ymd: string, lang: CsLang = 'ar') {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(DATE_LOCALE[lang], { timeZone: 'UTC', ...o }).format(d);
  return { month: fmt({ month: 'long' }), day: String(d.getUTCDate()), weekday: fmt({ weekday: 'long' }) };
}
/** A DHL local date-time (YYYY-MM-DDTHH:MM…): its date, its time, and DHL's "end of day" (23:59). */
export function dhlDateTime(iso: string | null | undefined): { date: string; time: string | null; eod: boolean } | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const time = iso.length >= 16 ? iso.slice(11, 16) : null;
  return { date: iso.slice(0, 10), time, eod: time === '23:59' };
}

export interface ChargeRow { key: string; label: string; dhlName: string | null; code: string | null; amount: number | null; currency: string | null; category: string }
/** DHL's upper-case charge name in title case (still DHL's own description). */
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_m, a: string, b: string) => a + b.toUpperCase());
/**
 * DHL's quote as the MyDHL+ breakdown: every priced line DHL returned (its own name; the first is
 * the transportation charge), then VAT / tax when DHL charged any, then DHL's total.
 * With tax, the lines are DHL's amounts before tax (DHL's basePrice) — only when DHL stated it
 * for every line; otherwise the lines stay as DHL priced them (tax included). The total is
 * always DHL's own figure — nothing is added up here.
 */
export function chargeRows(q: Pick<RateQuote, 'breakdown' | 'amount' | 'currency' | 'taxTotal'>, lang: CsLang = 'ar') {
  const tax = q.taxTotal != null && q.taxTotal > 0 ? q.taxTotal : null;
  const net = tax != null && q.breakdown.every((b) => b.net != null);
  const rows: ChargeRow[] = q.breakdown.map((b, i) => {
    const dhlName = b.name ? titleCase(b.name) : null;
    const label = i === 0
      ? tr(lang, 'أجور النقل', 'Transportation Charges')
      : lang === 'en' ? (dhlName ?? CHARGE_LABELS_EN[b.category]) : (b.category !== 'other' ? CHARGE_LABELS[b.category] : dhlName ?? CHARGE_LABELS.other);
    return { key: `${i}-${b.serviceCode ?? ''}`, label, dhlName, code: b.serviceCode, amount: net ? b.net ?? null : b.amount, currency: b.currency ?? q.currency, category: b.category };
  });
  return { rows, tax: net ? tax : null, taxIncluded: !net ? tax : null, total: q.amount, currency: q.currency };
}

/**
 * Optional services SHIPPEC can request with a plain service code — the MyDHL+ list. Shown ONLY when
 * DHL listed the code for the chosen product (availability always comes from DHL); the texts are
 * SHIPPEC's. Services DHL lists that need more data (insurance value, dangerous goods …) are not offered.
 */
export const OPTIONAL_SERVICES: Record<string, { ar: string; en: string; descAr: string; descEn: string; group?: string }> = {
  FT: { ar: 'GoGreen Plus', en: 'GoGreen Plus', descAr: 'دعم النقل منخفض الانبعاثات باستخدام وقود الطيران المستدام.', descEn: 'Support low emission transportation services, facilitated by sustainable aviation fuel.' },
  JD: { ar: 'إشعار هاتفي', en: 'Verbal Notification', descAr: 'تؤكد DHL التسليم هاتفيًا.', descEn: 'DHL confirms the delivery by phone.' },
  LX: { ar: 'الحجز للاستلام', en: 'Hold for Collection', descAr: 'تُحفظ الشحنة في منشأة DHL في بلد الوجهة ليستلمها المستلم، وتُبلغه DHL عندما تصبح جاهزة.', descEn: 'Hold my shipment at the DHL delivery facility at the destination for consignee collection. DHL will notify the receiver when the shipment is ready to be collected.' },
  NN: { ar: 'تسليم محايد', en: 'Neutral Delivery', descAr: 'تبقى القيمة المصرّح بها للشحنة سرية ولا تُكشف للمستلم.', descEn: 'Keep the declared value of my shipment confidential. Do not reveal to the receiver.' },
  SD: { ar: 'توقيع شخص بالغ', en: 'Adult Signature', descAr: 'تحصل DHL على توقيع شخص بالغ عند التسليم في العنوان المحدد.', descEn: 'DHL will obtain a delivery signature from an adult at the stipulated delivery address.', group: 'signature' },
  SF: { ar: 'توقيع مباشر', en: 'Direct Signature', descAr: 'تحصل DHL على توقيع المستلم أو من ينوب عنه في عنوان التسليم. إن لم يوجد أحد تعيد DHL المحاولة، ولا تُحوَّل الشحنة ولا تُترك في صندوق بريد أو لدى الجار.', descEn: "DHL will obtain a signature from the receiver or a representative at the delivery address. In case no one is at the delivery address, DHL will reattempt delivery. Direct Signature service makes sure your shipments can't be re-routed, dropped in a post box or left with the neighbor.", group: 'signature' },
};
export interface OptionalServiceRow { code: string; name: string; description: string; selected: boolean; price: number | null; currency: string | null; dhlName: string | null }
/**
 * The optional services to show for a quote: those DHL listed for the product (unpriced) or that DHL
 * priced because they were requested — never a code DHL did not return. A GoGreen line DHL already
 * charges by agreement hides the GoGreen Plus choice (it is in the quote already).
 */
export function optionalServiceRows(q: Pick<RateQuote, 'optionalServices' | 'breakdown' | 'currency'> | null, selected: string[], lang: CsLang = 'ar'): OptionalServiceRow[] {
  if (!q) return [];
  const priced = new Map(q.breakdown.filter((b) => b.serviceCode).map((b) => [b.serviceCode as string, b]));
  const listed = new Map(q.optionalServices.map((s) => [s.serviceCode, s]));
  const agreementGreen = q.breakdown.some((b) => b.category === 'gogreen' && b.serviceCode !== 'FT');
  return Object.entries(OPTIONAL_SERVICES)
    .filter(([code]) => listed.has(code) || (priced.has(code) && selected.includes(code)))
    .filter(([code]) => !(code === 'FT' && agreementGreen && !selected.includes('FT')))
    .map(([code, info]) => {
      const line = selected.includes(code) ? priced.get(code) : undefined;
      return {
        code, name: tr(lang, info.ar, info.en), description: tr(lang, info.descAr, info.descEn), selected: selected.includes(code),
        price: line?.amount ?? null, currency: line?.currency ?? q.currency, dhlName: listed.get(code)?.name ?? line?.name ?? null,
      };
    });
}
/** Ticking / unticking an optional service; one signature option at a time. WY / DD stay SHIPPEC's own. */
export function toggleOptionalService(codes: string[], code: string): string[] {
  if (codes.includes(code)) return codes.filter((c) => c !== code);
  const group = OPTIONAL_SERVICES[code]?.group;
  const kept = group ? codes.filter((c) => OPTIONAL_SERVICES[c]?.group !== group) : codes;
  return [...kept, code];
}
/** GoGreen in this quote: DHL's priced GoGreen line, or GoGreen Plus offered for the product. */
export function goGreenOf(q: Pick<RateQuote, 'optionalServices' | 'breakdown'> | null): { charged: RateQuote['breakdown'][number] | null; offered: boolean } | null {
  if (!q) return null;
  const charged = q.breakdown.find((b) => b.category === 'gogreen') ?? null;
  const offered = q.optionalServices.some((s) => s.serviceCode === 'FT');
  return charged || offered ? { charged, offered } : null;
}

/** The same as routeSnapshot but without the date — the key under which per-date DHL availability is remembered. */
export const availabilityKey = (f: WizardForm) => routeSnapshot({ ...f, shipment_date: '' });

/** What DHL's products / quotes depend on — a change here makes them stale (Backend routeFingerprint is final). */
export function routeSnapshot(f: WizardForm): string {
  const side = (p: PartyForm) => [p.country_code, p.city.trim().toLowerCase(), p.postal_code.trim(), p.address_line1.trim()];
  return JSON.stringify({
    s: side(f.shipper), r: side(f.receiver), d: f.shipment_date, c: needsCustoms(f), cur: needsCustoms(f) ? f.currency : null,
    v: needsCustoms(f) ? itemTotals(f.items).value : null,
    p: f.packages.map((p) => [p.weight_kg, p.length_cm, p.width_cm, p.height_cm, p.quantity]),
    pay: [f.transport_payer, f.transport_payer_account, needsCustoms(f) ? f.duties_payer : 'receiver', f.duties_payer_account],
    wy: needsCustoms(f) && f.paperless_trade,
    vas: f.service_codes.filter((s) => s !== 'WY' && s !== 'DD').sort(),
  });
}

// ── Labels ──
export const PURPOSE_LABELS_EN: Record<ShipmentPurpose, string> = {
  gift: 'Gift', commercial: 'Commercial', personal_not_for_resale: 'Personal, Not for Resale', sample: 'Sample',
  return_for_repair: 'Return for Repair', return_after_repair: 'Return after Repair', claim: 'Claim', return_to_seller: 'Return to Seller',
};
export const purposeLabel = (p: ShipmentPurpose, lang: CsLang) => (lang === 'en' ? PURPOSE_LABELS_EN[p] : PURPOSE_LABELS[p]);
export const PURPOSE_LABELS: Record<ShipmentPurpose, string> = {
  commercial: 'تجاري (بيع)',
  gift: 'هدية',
  personal_not_for_resale: 'شخصي — ليس للبيع',
  sample: 'عيّنة',
  return_for_repair: 'إرجاع للإصلاح',
  return_after_repair: 'إرجاع بعد الإصلاح',
  claim: 'مطالبة',
  return_to_seller: 'إرجاع إلى البائع',
};
/** DHL's MyDHL+ order. */
export const PURPOSE_ORDER: ShipmentPurpose[] = ['gift', 'commercial', 'personal_not_for_resale', 'sample', 'return_for_repair', 'return_after_repair', 'claim', 'return_to_seller'];
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
/** How an item is packaged — DHL quantity unit codes (all in the Backend's DHL_QUANTITY_UNITS). */
export const UNIT_LABELS: Record<string, [string, string]> = {
  PCS: ['قطع', 'Pieces'], PRS: ['أزواج', 'Pairs'], SET: ['أطقم', 'Sets'], BOX: ['صناديق', 'Boxes'], DOZ: ['دزينة', 'Dozen'], EA: ['وحدة', 'Each'],
  NO: ['عدد', 'Number'], KG: ['كيلوغرام', 'Kilograms'], GM: ['غرام', 'Grams'], LTR: ['لتر', 'Litres'], M: ['متر', 'Metres'], ROLL: ['لفّات', 'Rolls'],
};
/** English contents descriptions for documents (free text for DHL — never a code). */
export const DOCUMENT_DESCRIPTIONS: Array<[string, string]> = [
  ['Business documents', 'مستندات تجارية'], ['Legal documents', 'مستندات قانونية'], ['Financial documents', 'مستندات مالية'], ['Contracts', 'عقود'],
  ['Correspondence', 'مراسلات'], ['Invoices', 'فواتير'], ['Shipping documents', 'مستندات شحن'], ['Tender documents', 'مستندات مناقصات'],
  ['Educational certificates', 'شهادات تعليمية'], ['Personal documents', 'مستندات شخصية'], ['Bank documents', 'مستندات بنكية'], ['Printed matter', 'مطبوعات'],
];
const CURRENCY_FALLBACK = ['SAR', 'USD', 'EUR', 'GBP', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'EGP', 'JOD', 'CNY', 'JPY', 'INR', 'TRY', 'CHF', 'CAD', 'AUD'];
const CURRENCY_FIRST = ['SAR', 'USD', 'EUR', 'GBP', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'EGP', 'CNY'];
const currencyCache: Partial<Record<CsLang, Array<{ code: string; name: string }>>> = {};
/** ISO 4217 currencies (from the browser), names in the page language, the common ones first. */
export function currencyOptions(lang: CsLang = 'ar'): Array<{ code: string; name: string }> {
  const hit = currencyCache[lang];
  if (hit) return hit;
  let codes: string[] = CURRENCY_FALLBACK;
  try {
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (sv) codes = sv('currency');
  } catch { codes = CURRENCY_FALLBACK; }
  let names: Intl.DisplayNames | null = null;
  try { names = new Intl.DisplayNames([lang], { type: 'currency' }); } catch { names = null; }
  const list = [...new Set([...CURRENCY_FIRST, ...codes])].filter((c) => /^[A-Z]{3}$/.test(c)).map((code) => ({ code, name: names?.of(code) ?? code }));
  currencyCache[lang] = list;
  return list;
}
/** kg → lb for display only (3 decimals, never fed back into the form). */
export const kgToLb = (kgValue: number) => Math.round(kgValue * 2.20462262 * 1000) / 1000;
/** Goods value + the additional charges = what the customs invoice states. */
export function invoiceTotals(f: Pick<WizardForm, 'items' | 'charges'>) {
  const goods = itemTotals(f.items).value;
  const charges = Math.round(f.charges.reduce((sum, c) => sum + (num(c.amount) ?? 0), 0) * 100) / 100;
  const units = f.items.reduce((sum, it) => sum + (Math.floor(num(it.quantity) ?? 0)), 0);
  return { goods, charges, total: Math.round((goods + charges) * 100) / 100, units };
}
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
