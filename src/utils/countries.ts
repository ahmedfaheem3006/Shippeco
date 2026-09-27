// Country list + digit normalization with NO dependency on
// libphonenumber-js, so the parts of the landing page that only need
// country names (route pickers, summaries) don't pull the phone metadata
// into the initial bundle. Phone parsing lives in ./phone.ts, which is only
// loaded with the stages that actually have a phone field.
import type { CountryCode } from 'libphonenumber-js'

export type CountryInfo = {
  iso: CountryCode
  nameAr: string
  nameEn: string
  dialCode: string
}

// Saudi Arabia and Egypt first; the rest cover the other Gulf countries
// plus the three countries the personal-shopper service ships from
// (US/Turkey/Germany). Dial codes verified against libphonenumber-js
// metadata (getCountryCallingCode).
export const COUNTRIES: CountryInfo[] = [
  { iso: 'SA', nameAr: 'السعودية', nameEn: 'Saudi Arabia', dialCode: '+966' },
  { iso: 'EG', nameAr: 'مصر', nameEn: 'Egypt', dialCode: '+20' },
  { iso: 'AE', nameAr: 'الإمارات', nameEn: 'United Arab Emirates', dialCode: '+971' },
  { iso: 'KW', nameAr: 'الكويت', nameEn: 'Kuwait', dialCode: '+965' },
  { iso: 'QA', nameAr: 'قطر', nameEn: 'Qatar', dialCode: '+974' },
  { iso: 'BH', nameAr: 'البحرين', nameEn: 'Bahrain', dialCode: '+973' },
  { iso: 'OM', nameAr: 'عُمان', nameEn: 'Oman', dialCode: '+968' },
  { iso: 'JO', nameAr: 'الأردن', nameEn: 'Jordan', dialCode: '+962' },
  { iso: 'US', nameAr: 'الولايات المتحدة', nameEn: 'United States', dialCode: '+1' },
  { iso: 'TR', nameAr: 'تركيا', nameEn: 'Turkey', dialCode: '+90' },
  { iso: 'DE', nameAr: 'ألمانيا', nameEn: 'Germany', dialCode: '+49' },
  { iso: 'GB', nameAr: 'المملكة المتحدة', nameEn: 'United Kingdom', dialCode: '+44' },
]

export const countryNameAr = (iso: string) => COUNTRIES.find((c) => c.iso === iso)?.nameAr ?? iso

const ARABIC_INDIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  // Extended (Persian) Arabic-Indic digits — also seen from some keyboards.
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
}

/** Converts Arabic-Indic digits to plain Western digits; leaves everything
 *  else (including a leading "+") untouched. */
export function toWesternDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => ARABIC_INDIC_DIGITS[d] ?? d)
}
