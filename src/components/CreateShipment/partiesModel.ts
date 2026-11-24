/**
 * Parties screen («الأطراف») — pure helpers (no React): saved contact ⇄ form,
 * country change, «مسح العنوان», address suggestion → fields.
 */
import type { ContactFields, LookupAddress, SavedContact } from '../../services/shippingContacts.service';
import { callingCode, countryName, emptyPhone, type PartyForm, type PhoneEntry } from './wizardModel';

export const SHORT_ADDRESS_RE = /^[A-Z]{4}\d{4}$/;
/** "kuda 2519" → "KUDA2519" (Latin letters + digits only, at most 8). */
export const normalizeShortAddress = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

/** The country changed: new calling code where the old country's own code was used (a typed number is kept as is). */
export function withCountry(p: PartyForm, code: string): PartyForm {
  const before = callingCode(p.country_code);
  const after = callingCode(code);
  const phones = p.phones.map((ph) => (!ph.code || ph.code === before ? { ...ph, code: after } : ph));
  return { ...p, country_code: code, use_na: false, phones };
}

/** «مسح العنوان»: address fields only — name, company, e-mail, phones, VAT/Tax ID, EORI and country stay. */
export function clearAddress(p: PartyForm): PartyForm {
  return {
    ...p, address_line1: '', address_line2: '', address_line3: '', short_address: '', suburb: '', city: '', province: '', postal_code: '',
    na: { building_number: '', street: '', additional_number: '', district: '', short_address: '' },
  };
}

/**
 * A selected provider address → the form. Everything stays editable.
 *   - the address-specific parts (Address 2, suburb / district, Saudi short
 *     address and National Address parts) are REPLACED — never left over from
 *     an earlier address;
 *   - City / State / Postal Code: what the provider returned; when it returned
 *     nothing for one, the current value is kept (only within the same country);
 *   - `authoritative` (a Saudi National Address — SPL or its fallback): City / State / Postal
 *     Code are always replaced, even by an empty value;
 *   - a Google address in Saudi Arabia clears the old short address (it no longer
 *     describes the address chosen).
 * The phone code follows the country (an empty one gets the country's code).
 */
export function applyAddress(p: PartyForm, a: LookupAddress, authoritative = false): PartyForm {
  const val = (v: string | null | undefined) => (v != null && String(v).trim() ? String(v).trim() : '');
  const country = a.country_code || p.country_code;
  const moved = country !== p.country_code;
  const base = moved ? withCountry(p, country) : p;
  const pick = (v: string | null | undefined, cur: string) => val(v) || (authoritative || moved ? '' : cur);
  const sa = country === 'SA';
  const short = sa ? val(a.short_address).toUpperCase() : '';
  const code = callingCode(country);
  return {
    ...base,
    address_line1: val(a.address_line1) || base.address_line1,
    address_line2: val(a.address_line2),
    short_address: sa ? short : base.short_address,
    suburb: val(a.district),
    city: pick(a.city, base.city),
    province: pick(a.province, base.province),
    postal_code: pick(a.postal_code, base.postal_code),
    na: sa
      ? { building_number: val(a.building_number), street: val(a.street), additional_number: val(a.additional_number), district: val(a.district), short_address: short }
      : { building_number: '', street: '', additional_number: '', district: '', short_address: '' },
    phones: base.phones.map((ph) => (ph.code ? ph : { ...ph, code })),
  };
}

/**
 * A City suggestion → City + State (+ the country Google answered for). The postal
 * code is left alone (a city has many); the old state is replaced — never kept
 * from an earlier city.
 */
export function applyCity(p: PartyForm, a: LookupAddress, typedCity: string): PartyForm {
  const country = a.country_code || p.country_code;
  const base = country !== p.country_code ? withCountry(p, country) : p;
  return { ...base, city: (a.city ?? '').trim() || typedCity.trim() || base.city, province: (a.province ?? '').trim() };
}

/** A saved contact → the form (every field filled, all editable; no new record is created by selecting). */
export function applyContact(p: PartyForm, c: SavedContact): PartyForm {
  const s = (v: string | null | undefined) => v ?? '';
  const phones: PhoneEntry[] = (c.phones ?? []).filter((x) => x && (x.number ?? '').trim()).map((x) => ({
    type: x.type ?? 'mobile', code: s(x.code) || callingCode(c.country_code), number: s(x.number), extension: s(x.extension), sms: !!x.sms,
  }));
  return {
    ...p,
    use_na: false,
    contact: c.name, business_contact: !!c.business_contact, company: s(c.company), country_code: c.country_code,
    address_line1: s(c.address_line1), address_line2: s(c.address_line2), address_line3: '', short_address: s(c.short_address), suburb: s(c.suburb),
    city: s(c.city), province: s(c.province), postal_code: s(c.postal_code), residential: !!c.residential, email: s(c.email),
    phones: phones.length ? phones : [emptyPhone(c.country_code, p.phones[0]?.type ?? 'mobile')],
    vat_tax_id: s(c.vat_tax_id), eori: s(c.eori), notes: s(c.notes), saved_contact_id: c.id,
    na: c.country_code === 'SA'
      ? { building_number: s(c.building_number), street: s(c.street), additional_number: s(c.additional_number), district: s(c.suburb), short_address: s(c.short_address) }
      : { building_number: '', street: '', additional_number: '', district: '', short_address: '' },
  };
}

/**
 * The Saudi National Address parts kept from the last lookup — only while the
 * address lines still say the same (a hand-edited line drops its parts).
 */
function naParts(p: PartyForm) {
  const n = (v: string) => (v.trim() ? v.trim() : null);
  const na = p.na;
  if (p.country_code !== 'SA' || !na) return { building_number: null, street: null, additional_number: null };
  const line1 = p.address_line1.trim();
  const line2 = p.address_line2.trim();
  const l1 = !!na.building_number && !!na.street && line1 === `${na.building_number} ${na.street}`;
  const l2 = !!na.additional_number && line2.startsWith(na.additional_number);
  return { building_number: l1 ? n(na.building_number) : null, street: l1 ? n(na.street) : null, additional_number: l2 ? n(na.additional_number) : null };
}

/** The reusable fields of a party for «حفظ في قاعدة البيانات» (no shipment field). */
export function contactFieldsOf(p: PartyForm): ContactFields {
  const n = (v: string) => (v.trim() ? v.trim() : null);
  const sa = p.country_code === 'SA';
  return {
    name: p.contact.trim(), business_contact: p.business_contact, company: n(p.company), country_code: p.country_code,
    country_name: p.country_code ? countryName(p.country_code, 'en') : null,
    address_line1: n(p.address_line1), address_line2: n(p.address_line2), short_address: sa ? n(p.short_address.toUpperCase()) : null,
    ...naParts(p),
    suburb: n(p.suburb), city: n(p.city), province: n(p.province), postal_code: n(p.postal_code), residential: p.residential, email: n(p.email),
    phones: p.phones.filter((x) => x.number.trim()).map((x) => ({ type: x.type, code: n(x.code), number: n(x.number), extension: n(x.extension), sms: x.sms })),
    vat_tax_id: n(p.vat_tax_id), eori: n(p.eori), notes: n(p.notes),
  };
}
