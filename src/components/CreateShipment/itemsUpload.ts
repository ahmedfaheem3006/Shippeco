/** «رفع تفاصيل البنود»: CSV / Excel rows → customs item cards (validated row by row; nothing is sent to DHL). */
import { allCountries, emptyItem, isLatin, ITEM_DESCRIPTION_MAX, ITEM_UNITS, type ItemForm } from './wizardModel';
import type { CsLang } from './csLang';

const num = (v: string) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
export const UPLOAD_COLUMNS = ['description', 'quantity', 'unit', 'unit_value', 'net_weight_kg', 'gross_weight_kg', 'country_of_origin', 'hs_code_export', 'hs_code_import', 'manufacturer_id', 'line_reference'] as const;
export type UploadRow = Partial<Record<(typeof UPLOAD_COLUMNS)[number], unknown>>;
/** One sheet / CSV row → an item, or the reasons it cannot be one (row numbers as in the file, header = 1). */
export function parseItemRows(rows: UploadRow[], lang: CsLang): { items: ItemForm[]; errors: string[] } {
  const T = (ar: string, en: string) => (lang === 'en' ? en : ar);
  const known = new Set(allCountries('en').map((c) => c.code));
  const items: ItemForm[] = [];
  const errors: string[] = [];
  rows.forEach((raw, k) => {
    const r = Object.fromEntries(Object.entries(raw).map(([key, v]) => [key.trim().toLowerCase(), String(v ?? '').trim()])) as Record<string, string>;
    if (!Object.values(r).some(Boolean)) return;
    const row = k + 2;
    const bad: string[] = [];
    const unit = (r.unit || 'PCS').toUpperCase();
    const country = (r.country_of_origin || '').toUpperCase();
    if (!r.description) bad.push(T('الوصف مطلوب', 'description is required'));
    else if (r.description.length > ITEM_DESCRIPTION_MAX || !isLatin(r.description)) bad.push(T(`الوصف بالإنجليزية و${ITEM_DESCRIPTION_MAX} حرفًا كحد أقصى`, `description: English, at most ${ITEM_DESCRIPTION_MAX} characters`));
    if (!/^\d+$/.test(r.quantity || '') || Number(r.quantity) < 1) bad.push(T('الكمية رقم صحيح ≥ 1', 'quantity: whole number ≥ 1'));
    if (!ITEM_UNITS.includes(unit)) bad.push(T(`الوحدة غير مدعومة (${unit})`, `unsupported unit (${unit})`));
    if (!((num(r.unit_value || '') ?? 0) > 0)) bad.push(T('القيمة أكبر من صفر', 'unit_value > 0'));
    if (!((num(r.net_weight_kg || '') ?? 0) > 0)) bad.push(T('الوزن أكبر من صفر', 'net_weight_kg > 0'));
    if (r.gross_weight_kg && !((num(r.gross_weight_kg) ?? 0) > (num(r.net_weight_kg || '') ?? 0))) bad.push(T('الوزن الإجمالي أكبر من الصافي', 'gross_weight_kg > net_weight_kg'));
    if (!known.has(country)) bad.push(T('بلد الصنع رمز ISO من حرفين', 'country_of_origin: 2-letter ISO code'));
    if (!r.hs_code_export) bad.push(T('رمز HS للتصدير مطلوب', 'hs_code_export is required'));
    if (!r.hs_code_import) bad.push(T('رمز HS للاستيراد مطلوب', 'hs_code_import is required'));
    if (bad.length) { errors.push(T(`السطر ${row}: ${bad.join('، ')}`, `Row ${row}: ${bad.join(', ')}`)); return; }
    items.push({
      ...emptyItem(), description: r.description, quantity: r.quantity, unit, unit_value: r.unit_value, unit_net_weight_kg: r.net_weight_kg, gross_weight_kg: r.gross_weight_kg || '',
      gross_mode: 'line', country_of_origin: country, outbound_hs_code: r.hs_code_export, inbound_hs_code: r.hs_code_import,
      manufacturer_id: r.manufacturer_id || '', line_reference: r.line_reference || '', show_reference: !!r.line_reference,
    });
  });
  if (!items.length && !errors.length) errors.push(T('الملف لا يحتوي بنودًا.', 'The file holds no items.'));
  return { items, errors };
}

