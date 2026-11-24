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
