/**
 * Ship-from location rules shared by the Parties and Service screens (pure, no React, no imports):
 *
 *   - State / province: the countries whose DHL State field is the short code
 *     (US: the required 2-letter code; CA; AU) with their full names. The code
 *     is what is stored and sent to DHL; the name is only shown («OR» → «Oregon»).
 *     A full name typed or stored earlier becomes its code by an EXACT match
 *     only (case / spacing ignored) — never a fuzzy guess.
 *   - Sender time zone: the IANA zone of the ship-from country (one zone) or of
 *     its state / province (US, CA, AU), and that zone's UTC offset ON the
 *     shipment date (daylight saving included). Mirrors the Backend's
 *     originTimeZone.ts, which stays authoritative. A typed offset is asked for
 *     only when the location cannot be resolved. Never the browser's time zone.
 */
const US: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands', AS: 'American Samoa',
  MP: 'Northern Mariana Islands', AA: 'Armed Forces Americas', AE: 'Armed Forces Europe', AP: 'Armed Forces Pacific',
};
const CA: Record<string, string> = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick', NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec', SK: 'Saskatchewan', YT: 'Yukon',
};
const AU: Record<string, string> = {
  ACT: 'Australian Capital Territory', NSW: 'New South Wales', NT: 'Northern Territory', QLD: 'Queensland', SA: 'South Australia', TAS: 'Tasmania', VIC: 'Victoria', WA: 'Western Australia',
};
const SUBDIVISIONS: Record<string, Record<string, string>> = { US, CA, AU };
const squash = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();
const BY_NAME: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(SUBDIVISIONS).map(([cc, list]) => [cc, Object.fromEntries(Object.entries(list).map(([code, name]) => [squash(name), code]))]),
);

/** The full state / province name of a short code (US «MI» → «Michigan»); null when the country has no code list or the code is unknown. */
export function subdivisionName(country: string, code: string | null | undefined): string | null {
  const list = SUBDIVISIONS[String(country ?? '').toUpperCase()];
  const c = String(code ?? '').trim().toUpperCase();
  return list && c ? list[c] ?? null : null;
}
/**
 * What DHL gets as the State: a known code (any case) → the code; the exact full name → its code
 * («Oregon» → «OR»); anything else unchanged (validation then asks for the code). Countries without a
 * code list keep the text as typed.
 */
export function normalizeSubdivision(country: string, value: string | null | undefined): string {
  const v = String(value ?? '');
  const cc = String(country ?? '').toUpperCase();
  const list = SUBDIVISIONS[cc];
  if (!list || !v.trim()) return v;
  const k = squash(v);
  if (list[k]) return k;
  return BY_NAME[cc][k] ?? v;
}

type Zone = string | [string, 'partial'];
/** Countries with one IANA zone (or one zone for all but a minority area → partial). */
const COUNTRY_ZONES: Readonly<Record<string, Zone>> = {
  AD: 'Europe/Andorra', AE: 'Asia/Dubai', AF: 'Asia/Kabul', AG: 'America/Antigua', AI: 'America/Anguilla', AL: 'Europe/Tirane', AM: 'Asia/Yerevan', AO: 'Africa/Luanda',
  AR: 'America/Argentina/Buenos_Aires', AT: 'Europe/Vienna', AW: 'America/Aruba', AX: 'Europe/Mariehamn', AZ: 'Asia/Baku', BA: 'Europe/Sarajevo', BB: 'America/Barbados',
  BD: 'Asia/Dhaka', BE: 'Europe/Brussels', BF: 'Africa/Ouagadougou', BG: 'Europe/Sofia', BH: 'Asia/Bahrain', BI: 'Africa/Bujumbura', BJ: 'Africa/Porto-Novo',
  BL: 'America/St_Barthelemy', BM: 'Atlantic/Bermuda', BN: 'Asia/Brunei', BO: 'America/La_Paz', BQ: 'America/Kralendijk', BS: 'America/Nassau', BT: 'Asia/Thimphu',
  BW: 'Africa/Gaborone', BY: 'Europe/Minsk', BZ: 'America/Belize', CF: 'Africa/Bangui', CG: 'Africa/Brazzaville', CH: 'Europe/Zurich', CI: 'Africa/Abidjan',
  CL: ['America/Santiago', 'partial'], CM: 'Africa/Douala', CN: 'Asia/Shanghai', CO: 'America/Bogota', CR: 'America/Costa_Rica', CU: 'America/Havana', CV: 'Atlantic/Cape_Verde',
  CW: 'America/Curacao', CY: 'Asia/Nicosia', CZ: 'Europe/Prague', DE: 'Europe/Berlin', DJ: 'Africa/Djibouti', DK: 'Europe/Copenhagen', DM: 'America/Dominica',
  DO: 'America/Santo_Domingo', DZ: 'Africa/Algiers', EC: ['America/Guayaquil', 'partial'], EE: 'Europe/Tallinn', EG: 'Africa/Cairo', ER: 'Africa/Asmara',
  ES: ['Europe/Madrid', 'partial'], ET: 'Africa/Addis_Ababa', FI: 'Europe/Helsinki', FJ: 'Pacific/Fiji', FO: 'Atlantic/Faroe', FR: 'Europe/Paris', GA: 'Africa/Libreville',
  GB: 'Europe/London', GD: 'America/Grenada', GE: 'Asia/Tbilisi', GF: 'America/Cayenne', GG: 'Europe/Guernsey', GH: 'Africa/Accra', GI: 'Europe/Gibraltar',
  GM: 'Africa/Banjul', GN: 'Africa/Conakry', GP: 'America/Guadeloupe', GQ: 'Africa/Malabo', GR: 'Europe/Athens', GT: 'America/Guatemala', GU: 'Pacific/Guam',
  GW: 'Africa/Bissau', GY: 'America/Guyana', HK: 'Asia/Hong_Kong', HN: 'America/Tegucigalpa', HR: 'Europe/Zagreb', HT: 'America/Port-au-Prince', HU: 'Europe/Budapest',
  IE: 'Europe/Dublin', IL: 'Asia/Jerusalem', IM: 'Europe/Isle_of_Man', IN: 'Asia/Kolkata', IQ: 'Asia/Baghdad', IR: 'Asia/Tehran', IS: 'Atlantic/Reykjavik',
  IT: 'Europe/Rome', JE: 'Europe/Jersey', JM: 'America/Jamaica', JO: 'Asia/Amman', JP: 'Asia/Tokyo', KE: 'Africa/Nairobi', KG: 'Asia/Bishkek', KH: 'Asia/Phnom_Penh',
  KM: 'Indian/Comoro', KN: 'America/St_Kitts', KP: 'Asia/Pyongyang', KR: 'Asia/Seoul', KW: 'Asia/Kuwait', KY: 'America/Cayman', LA: 'Asia/Vientiane', LB: 'Asia/Beirut',
  LC: 'America/St_Lucia', LI: 'Europe/Vaduz', LK: 'Asia/Colombo', LR: 'Africa/Monrovia', LS: 'Africa/Maseru', LT: 'Europe/Vilnius', LU: 'Europe/Luxembourg',
  LV: 'Europe/Riga', LY: 'Africa/Tripoli', MA: 'Africa/Casablanca', MC: 'Europe/Monaco', MD: 'Europe/Chisinau', ME: 'Europe/Podgorica', MF: 'America/Marigot',
  MG: 'Indian/Antananarivo', MK: 'Europe/Skopje', ML: 'Africa/Bamako', MM: 'Asia/Yangon', MO: 'Asia/Macau', MQ: 'America/Martinique', MR: 'Africa/Nouakchott',
  MS: 'America/Montserrat', MT: 'Europe/Malta', MU: 'Indian/Mauritius', MV: 'Indian/Maldives', MW: 'Africa/Blantyre', MY: 'Asia/Kuala_Lumpur', MZ: 'Africa/Maputo',
  NA: 'Africa/Windhoek', NC: 'Pacific/Noumea', NE: 'Africa/Niamey', NG: 'Africa/Lagos', NI: 'America/Managua', NL: 'Europe/Amsterdam', NO: 'Europe/Oslo',
  NP: 'Asia/Kathmandu', NZ: ['Pacific/Auckland', 'partial'], OM: 'Asia/Muscat', PA: 'America/Panama', PE: 'America/Lima', PH: 'Asia/Manila', PK: 'Asia/Karachi',
  PL: 'Europe/Warsaw', PR: 'America/Puerto_Rico', PT: ['Europe/Lisbon', 'partial'], PY: 'America/Asuncion', QA: 'Asia/Qatar', RE: 'Indian/Reunion', RO: 'Europe/Bucharest',
  RS: 'Europe/Belgrade', RW: 'Africa/Kigali', SA: 'Asia/Riyadh', SB: 'Pacific/Guadalcanal', SC: 'Indian/Mahe', SD: 'Africa/Khartoum', SE: 'Europe/Stockholm',
  SG: 'Asia/Singapore', SI: 'Europe/Ljubljana', SK: 'Europe/Bratislava', SL: 'Africa/Freetown', SM: 'Europe/San_Marino', SN: 'Africa/Dakar', SO: 'Africa/Mogadishu',
  SR: 'America/Paramaribo', SS: 'Africa/Juba', ST: 'Africa/Sao_Tome', SV: 'America/El_Salvador', SX: 'America/Lower_Princes', SY: 'Asia/Damascus', SZ: 'Africa/Mbabane',
  TD: 'Africa/Ndjamena', TG: 'Africa/Lome', TH: 'Asia/Bangkok', TJ: 'Asia/Dushanbe', TL: 'Asia/Dili', TM: 'Asia/Ashgabat', TN: 'Africa/Tunis', TR: 'Europe/Istanbul',
  TT: 'America/Port_of_Spain', TW: 'Asia/Taipei', TZ: 'Africa/Dar_es_Salaam', UA: ['Europe/Kyiv', 'partial'], UG: 'Africa/Kampala', UY: 'America/Montevideo',
  UZ: 'Asia/Tashkent', VA: 'Europe/Vatican', VC: 'America/St_Vincent', VE: 'America/Caracas', VG: 'America/Tortola', VI: 'America/St_Thomas', VN: 'Asia/Ho_Chi_Minh',
  YE: 'Asia/Aden', ZA: 'Africa/Johannesburg', ZM: 'Africa/Lusaka', ZW: 'Africa/Harare',
};
/** Countries spanning several zones: the zone of each state / province (DHL subdivision code). */
const SUBDIVISION_ZONES: Readonly<Record<string, Readonly<Record<string, Zone>>>> = {
  US: {
    CT: 'America/New_York', DE: 'America/New_York', DC: 'America/New_York', GA: 'America/New_York', ME: 'America/New_York', MD: 'America/New_York',
    MA: 'America/New_York', NH: 'America/New_York', NJ: 'America/New_York', NY: 'America/New_York', NC: 'America/New_York', OH: 'America/New_York',
    PA: 'America/New_York', RI: 'America/New_York', SC: 'America/New_York', VT: 'America/New_York', VA: 'America/New_York', WV: 'America/New_York',
    FL: ['America/New_York', 'partial'], KY: ['America/New_York', 'partial'], MI: ['America/Detroit', 'partial'], IN: ['America/Indiana/Indianapolis', 'partial'],
    AL: 'America/Chicago', AR: 'America/Chicago', IL: 'America/Chicago', IA: 'America/Chicago', LA: 'America/Chicago', MN: 'America/Chicago', MS: 'America/Chicago',
    MO: 'America/Chicago', OK: 'America/Chicago', WI: 'America/Chicago', TN: ['America/Chicago', 'partial'], TX: ['America/Chicago', 'partial'],
    KS: ['America/Chicago', 'partial'], NE: ['America/Chicago', 'partial'], ND: ['America/Chicago', 'partial'], SD: ['America/Chicago', 'partial'],
    CO: 'America/Denver', MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver', WY: 'America/Denver', ID: ['America/Boise', 'partial'],
    AZ: ['America/Phoenix', 'partial'], CA: 'America/Los_Angeles', WA: 'America/Los_Angeles', NV: ['America/Los_Angeles', 'partial'], OR: ['America/Los_Angeles', 'partial'],
    AK: ['America/Anchorage', 'partial'], HI: 'Pacific/Honolulu', PR: 'America/Puerto_Rico', GU: 'Pacific/Guam', VI: 'America/St_Thomas', AS: 'Pacific/Pago_Pago',
    MP: 'Pacific/Saipan',
  },
  CA: {
    AB: 'America/Edmonton', BC: ['America/Vancouver', 'partial'], MB: 'America/Winnipeg', NB: 'America/Moncton', NL: ['America/St_Johns', 'partial'],
    NS: 'America/Halifax', NT: 'America/Edmonton', ON: ['America/Toronto', 'partial'], PE: 'America/Halifax', QC: ['America/Toronto', 'partial'],
    SK: 'America/Regina', YT: 'America/Whitehorse',
  },
  AU: {
    ACT: 'Australia/Sydney', NSW: ['Australia/Sydney', 'partial'], NT: 'Australia/Darwin', QLD: 'Australia/Brisbane', SA: 'Australia/Adelaide',
    TAS: 'Australia/Hobart', VIC: 'Australia/Melbourne', WA: 'Australia/Perth',
  },
};

export interface OriginZone { zone: string; partial: boolean }
/** The sender's IANA zone from its country (+ state / province where needed); null = cannot be resolved here. */
export function originZone(countryCode: string | null | undefined, province: string | null | undefined): OriginZone | null {
  const cc = String(countryCode ?? '').toUpperCase();
  const pick = (z: Zone | undefined): OriginZone | null => (z ? (Array.isArray(z) ? { zone: z[0], partial: true } : { zone: z, partial: false }) : null);
  const bySub = SUBDIVISION_ZONES[cc];
  if (bySub) {
    const code = normalizeSubdivision(cc, province);
    return pick(code ? bySub[squash(String(code))] : undefined);
  }
  return pick(COUNTRY_ZONES[cc]);
}

/** "±HH:MM" offset of an IANA zone at noon (UTC) of a YYYY-MM-DD date; null when the runtime does not know it. */
export function zoneOffset(zone: string, ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(new Date(`${ymd}T12:00:00Z`)).find((p) => p.type === 'timeZoneName')?.value ?? '';
    if (name === 'GMT') return '+00:00';
    const m = /^GMT([+-])(\d{2}):(\d{2})$/.exec(name);
    return m ? `${m[1]}${m[2]}:${m[3]}` : null;
  } catch {
    return null;
  }
}
