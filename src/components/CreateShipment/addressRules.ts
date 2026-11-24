/**
 * Country-aware address rules for the Parties screen (pure, no React).
 *
 *   - State / province: the countries whose DHL State field is the short code
 *     (US: the 2-letter code), with the full names for display — the code is
 *     what is sent, the name is only shown («MI» → «Michigan»);
 *   - city suggestion secondary line: the state code expanded to its name and
 *     the country written as SHIPPEC names it.
 */
import { countryName } from './wizardModel';

const US: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico', AA: 'Armed Forces Americas', AE: 'Armed Forces Europe', AP: 'Armed Forces Pacific',
};
const CA: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
};
const AU: Record<string, string> = {
  ACT: 'Australian Capital Territory', NSW: 'New South Wales', NT: 'Northern Territory', QLD: 'Queensland', SA: 'South Australia', TAS: 'Tasmania', VIC: 'Victoria', WA: 'Western Australia',
};
const SUBDIVISIONS: Record<string, Record<string, string>> = { US, CA, AU };

// ── Postal codes ──
/**
 * One country's postal-code rule: `complete` = a structurally complete code;
 * `lookup` = the SHIPPEC Backend can turn it into city + state (only US today,
 * Google Geocoding). A country without `lookup` is never asked — its postal
 * code is typed by hand. Add a country here (and to the Backend's
 * POSTAL_RULES) to extend it. Format hints never block Next.
 */
export interface PostalRule {
  complete: RegExp;
  lookup: boolean;
  /** The code sent to the lookup (US ZIP+4 → its 5 digits). */
  lookupCode?: (v: string) => string;
  /** Characters kept while typing. */
  sanitize?: (v: string) => string;
  numeric?: boolean;
  format: [string, string];
}
const digits = (n: number) => (v: string) => v.replace(/\D/g, '').slice(0, n);
export const POSTAL_RULES: Record<string, PostalRule> = {
  US: {
    complete: /^\d{5}(?:-?\d{4})?$/, lookup: true, lookupCode: (v) => v.slice(0, 5), sanitize: (v) => v.replace(/[^\d-]/g, '').slice(0, 10), numeric: true,
    format: ['5 أرقام أو ZIP+4، مثل 48126 أو 48126-1234', '5 digits or ZIP+4, e.g. 48126 or 48126-1234'],
  },
  SA: { complete: /^\d{5}$/, lookup: false, sanitize: digits(5), numeric: true, format: ['5 أرقام، مثل 32256', '5 digits, e.g. 32256'] },
  EG: { complete: /^\d{5}$/, lookup: false, sanitize: digits(5), numeric: true, format: ['5 أرقام، مثل 11511', '5 digits, e.g. 11511'] },
  DE: { complete: /^\d{5}$/, lookup: false, sanitize: digits(5), numeric: true, format: ['5 أرقام، مثل 10115', '5 digits, e.g. 10115'] },
  FR: { complete: /^\d{5}$/, lookup: false, sanitize: digits(5), numeric: true, format: ['5 أرقام، مثل 75001', '5 digits, e.g. 75001'] },
  IN: { complete: /^\d{6}$/, lookup: false, sanitize: digits(6), numeric: true, format: ['6 أرقام، مثل 110001', '6 digits, e.g. 110001'] },
  CN: { complete: /^\d{6}$/, lookup: false, sanitize: digits(6), numeric: true, format: ['6 أرقام، مثل 100000', '6 digits, e.g. 100000'] },
  AU: { complete: /^\d{4}$/, lookup: false, sanitize: digits(4), numeric: true, format: ['4 أرقام، مثل 2000', '4 digits, e.g. 2000'] },
  CA: { complete: /^[A-Z]\d[A-Z] ?\d[A-Z]\d$/, lookup: false, sanitize: (v) => v.toUpperCase().slice(0, 7), format: ['مثل K1A 0B1', 'e.g. K1A 0B1'] },
  GB: { complete: /^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/, lookup: false, sanitize: (v) => v.toUpperCase().slice(0, 8), format: ['مثل SW1A 1AA', 'e.g. SW1A 1AA'] },
};
export const postalRule = (country: string): PostalRule | null => POSTAL_RULES[String(country ?? '').toUpperCase()] ?? null;
/** The code to look up, or null (no lookup for this country, or the code is not complete yet — never sent half-typed). */
export function postalLookupCode(country: string, value: string): string | null {
  const r = postalRule(country);
  const v = String(value ?? '').trim().toUpperCase();
  if (!r?.lookup || !r.complete.test(v)) return null;
  return r.lookupCode ? r.lookupCode(v) : v;
}
/** A gentle format note for a typed code that does not match the country's format (never blocks). */
export function postalFormatIssue(country: string, value: string): [string, string] | null {
  const r = postalRule(country);
  const v = String(value ?? '').trim().toUpperCase();
  return r && v && !r.complete.test(v) ? r.format : null;
}

/** The full state / province name of a short code (US «MI» → «Michigan»); null when the country has no code list or the code is unknown. */
export function subdivisionName(country: string, code: string | null | undefined): string | null {
  const list = SUBDIVISIONS[String(country ?? '').toUpperCase()];
  const c = String(code ?? '').trim().toUpperCase();
  return list && c ? list[c] ?? null : null;
}

/**
 * Google's city secondary text («MI, USA») → «Michigan, United States of America».
 * Only the state code and the country are rewritten; everything else stays as Google sent it.
 */
export function citySecondary(secondary: string, country: string): string {
  const parts = String(secondary ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return countryName(country, 'en') === '—' ? '' : countryName(country, 'en');
  const name = countryName(country, 'en');
  const out = parts.map((x, i) => (i === parts.length - 1 && name !== '—' && name !== country ? name : subdivisionName(country, x) ?? x));
  return out.join(', ');
}
