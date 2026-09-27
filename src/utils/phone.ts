// Shared phone-number handling for every phone input on the public landing
// page (the short "contact me" form, and the sender/receiver blocks of the
// waybill form) — one real implementation instead of three copies, built
// on libphonenumber-js's metadata instead of a hand-rolled regex per
// country (see quoteRequest.validator.ts on the Backend for the mirrored
// server-side check).
//
// Only imported by code that is itself lazily loaded (the phone-bearing
// journey stages), so the metadata never weighs on the initial page load.
import { getExampleNumber, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'
import examples from 'libphonenumber-js/examples.mobile.json'
import { toWesternDigits } from './countries'

export { COUNTRIES, toWesternDigits, type CountryInfo } from './countries'

/** A short, country-specific example of the national number, e.g.
 *  "50 123 4567" for Saudi Arabia — used only as an input placeholder. */
export function nationalPlaceholder(iso: CountryCode): string {
  const example = getExampleNumber(iso, examples as any)
  return example ? example.formatNational().replace(/^0/, '') : ''
}

export type ParsedPhoneResult = {
  /** True once the number is a real, dialable number for its country. */
  isValid: boolean
  /** E.164 form ("+9665...") when valid, otherwise undefined. */
  e164?: string
  /** Country the number resolved to — differs from the selected country
   *  when the visitor pasted a full international number for another one. */
  country?: CountryCode
  /** The national significant number (no dial code, no trunk 0). */
  national?: string
}

/** Parses whatever the visitor typed in the national-number sub-field.
 *  If they pasted/typed a full international number (leading "+" or "00"),
 *  it's parsed on its own so the correct country is detected instead of
 *  doubling the currently-selected dial code. Otherwise it's parsed against
 *  `selectedCountry`. */
export function parseNationalInput(raw: string, selectedCountry: CountryCode): ParsedPhoneResult {
  const cleaned = toWesternDigits(raw).trim()
  const looksInternational = cleaned.startsWith('+') || cleaned.startsWith('00')
  const normalized = looksInternational ? cleaned.replace(/^00/, '+') : cleaned

  const parsed = looksInternational
    ? parsePhoneNumberFromString(normalized)
    : parsePhoneNumberFromString(normalized, selectedCountry)

  if (!parsed) return { isValid: false }
  return {
    isValid: parsed.isValid(),
    e164: parsed.isValid() ? parsed.number : undefined,
    country: parsed.country,
    national: parsed.nationalNumber,
  }
}
