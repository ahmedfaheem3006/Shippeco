/** Parties final fixes (country search) + Screen 2 «تفاصيل الشحنة» model: gate, totals, references, stored extras, item upload. */
import { describe, expect, it } from 'vitest';
import {
  allCountries, callingCode, countryName, currencyOptions, detailsGate, emptyForm, emptyItem, emptyParty, fromShipment, invoiceTotals, kgToLb,
  PURPOSE_LABELS, PURPOSE_LABELS_EN, PURPOSE_ORDER, searchCountries, toContent, type WizardForm,
} from './wizardModel';
import { parseItemRows } from './itemsUpload';

const saParty = () => ({ ...emptyParty('SA'), use_na: false, contact: 'Sara', city: 'Dammam', postal_code: '31952', address_line1: '3456 Prince Sultan Road' });
const usParty = () => ({ ...emptyParty('US'), use_na: false, contact: 'John', city: 'Dearborn', postal_code: '48126', province: 'MI', address_line1: '13051 Osborne St' });
const domesticDocs = (): WizardForm => ({ ...emptyForm(), content_kind: 'documents', shipper: saParty(), receiver: { ...saParty(), city: 'Riyadh' } });
const goodItem = () => ({ ...emptyItem(), description: 'Cotton T-shirt', quantity: '2', unit_value: '10', unit_net_weight_kg: '0.5', country_of_origin: 'CN', outbound_hs_code: '6109.10', inbound_hs_code: '6109.10' });
const intlGoods = (): WizardForm => ({ ...emptyForm(), content_kind: 'goods', shipper: saParty(), receiver: usParty(), shipment_purpose: 'gift', currency: 'USD', items: [goodItem()] });

describe('United States of America', () => {
  it('is named in full (AR / EN), ISO US, +1, and found by every common alias first', () => {
    expect(countryName('US', 'en')).toBe('United States of America');
    expect(countryName('US', 'ar')).toBe('الولايات المتحدة الأمريكية');
    expect(callingCode('US')).toBe('1');
    for (const q of ['United States of America', 'United States', 'USA', 'U.S.A.', 'US', 'us', 'America', 'الولايات المتحدة', 'أمريكا', 'امريكا', 'الولايات المتحدة الأمريكية']) {
      expect([q, searchCountries(q, 'en')[0]?.code]).toEqual([q, 'US']);
      expect([q, searchCountries(q, 'ar')[0]?.code]).toEqual([q, 'US']);
    }
  })
  it('American Samoa stays its own territory (AS, +1) and is never the first «USA» result', () => {
    const as = allCountries('en').find((c) => c.code === 'AS');
    expect(as?.name).toMatch(/American Samoa/);
    expect(as?.name).not.toBe('United States of America');
    expect(searchCountries('American Samoa', 'en')[0].code).toBe('AS');
    expect(searchCountries('usa', 'en').filter((c) => c.code === 'US')).toHaveLength(1);
    expect(allCountries('en').filter((c) => c.name === 'United States of America')).toHaveLength(1);
  })
});

describe('Shipment Details gate', () => {
  it('Documents: the description is required; a typed value must be > 0; references Latin only', () => {
    expect(detailsGate(domesticDocs())).toEqual({ content_description: 'وصف المحتوى مطلوب.' });
    expect(detailsGate(domesticDocs(), 'en')).toEqual({ content_description: 'A description of the contents is required.' });
    const ok = { ...domesticDocs(), content_description: 'Legal documents' };
    expect(detailsGate(ok)).toEqual({});
    expect(detailsGate({ ...ok, declared_value: '0' })).toHaveProperty('declared_value');
    expect(detailsGate({ ...ok, declared_value: '150' })).toEqual({});
    expect(detailsGate({ ...ok, content_description: 'مستندات' })).toHaveProperty('content_description');
    expect(detailsGate({ ...ok, references: [{ type: 'CU', value: 'مرجع' }] })).toHaveProperty(['references.0']);
  })
  it('International packages: purpose (+ DHL reason for return / claim purposes), currency and complete items', () => {
    expect(detailsGate(intlGoods())).toEqual({});
    expect(detailsGate({ ...intlGoods(), shipment_purpose: '' })).toHaveProperty('shipment_purpose');
    expect(detailsGate({ ...intlGoods(), shipment_purpose: 'claim' })).toHaveProperty('export_reason_type');
    expect(detailsGate({ ...intlGoods(), shipment_purpose: 'claim', export_reason_type: 'return' })).toEqual({});
    expect(detailsGate({ ...intlGoods(), currency: '' })).toHaveProperty('currency');
    const e = detailsGate({ ...intlGoods(), items: [emptyItem()] });
    for (const k of ['description', 'unit_value', 'unit_net_weight_kg', 'country_of_origin']) expect(e).toHaveProperty([`items.0.${k}`]);
    // HS codes are optional: blank export and import codes never block Next; a typed one keeps DHL's basic format
    for (const k of ['outbound_hs_code', 'inbound_hs_code']) expect(e).not.toHaveProperty([`items.0.${k}`]);
    expect(detailsGate({ ...intlGoods(), items: [{ ...goodItem(), outbound_hs_code: '', inbound_hs_code: '' }] })).toEqual({});
    expect(detailsGate({ ...intlGoods(), items: [{ ...goodItem(), outbound_hs_code: '6' }] }, 'en')).toEqual({ 'items.0.outbound_hs_code': 'HS code: 2–18 digits or dots.' });
    expect(detailsGate({ ...intlGoods(), items: [{ ...goodItem(), inbound_hs_code: '6109.10.0012' }] })).toEqual({});
    expect(detailsGate({ ...intlGoods(), items: [{ ...goodItem(), description: 'x'.repeat(171) }] })).toHaveProperty(['items.0.description']);
    expect(detailsGate({ ...intlGoods(), items: [{ ...goodItem(), quantity: '1.5' }] })).toHaveProperty(['items.0.quantity']);
    // a blank extra card is ignored, not an error
    expect(detailsGate({ ...intlGoods(), items: [goodItem(), emptyItem()] })).toEqual({});
    expect(detailsGate({ ...intlGoods(), charges: [{ type: 'freight', description: '', amount: '-1' }] })).toHaveProperty(['charges.0']);
  })
  it('the 8 DHL purposes are offered in order, named in AR and EN', () => {
    expect(PURPOSE_ORDER).toEqual(['gift', 'commercial', 'personal_not_for_resale', 'sample', 'return_for_repair', 'return_after_repair', 'claim', 'return_to_seller']);
    expect(PURPOSE_ORDER.map((p) => PURPOSE_LABELS_EN[p])).toEqual(['Gift', 'Commercial', 'Personal, Not for Resale', 'Sample', 'Return for Repair', 'Return after Repair', 'Claim', 'Return to Seller']);
    for (const p of PURPOSE_ORDER) expect(PURPOSE_LABELS[p]).toBeTruthy();
  })
});

describe('totals, currency, LB', () => {
  it('kg → LB, invoice = goods + charges', () => {
    expect(kgToLb(1)).toBe(2.205);
    expect(kgToLb(0.5)).toBe(1.102);
    expect(invoiceTotals({ items: [goodItem(), { ...goodItem(), quantity: '1', unit_value: '5.5' }], charges: [{ type: 'freight', description: '', amount: '25' }, { type: 'other', description: 'x', amount: '' }] }))
      .toEqual({ goods: 25.5, charges: 25, total: 50.5, units: 3 });
  })
  it('currencies are ISO 4217 codes, SAR and USD among them', () => {
    const codes = currencyOptions('en').map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['SAR', 'USD', 'EUR', 'AED']));
    expect(codes.every((c) => /^[A-Z]{3}$/.test(c))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  })
});

describe('draft content', () => {
  it('the first reference is DHL\'s customer reference; every Shipment Details extra is stored apart (never DHL fields)', () => {
    const f: WizardForm = { ...domesticDocs(), content_description: 'Legal documents', declared_value: '150', currency: 'USD', document_protection: true,
      references: [{ type: 'CU', value: 'PO-1001' }, { type: 'CU', value: ' ' }, { type: 'CU', value: 'INTERNAL-7' }] };
    const c = toContent(f);
    expect(c).toMatchObject({ customer_reference: 'PO-1001', customs_required: false, declared_value: '150', currency: 'USD', items: [] });
    expect(c.details_extra).toEqual({ references: [{ type: 'CU', value: 'PO-1001' }, { type: 'CU', value: 'INTERNAL-7' }], document_protection: true, insurance: false,
      estimated_duties: false, precalculated_duties: false, item_entry: 'describe', charges: [], items: [], customs_invoice_mode: null });
  })
  it('packages: items to DHL; manufacturer ID, line reference, charges, insurance and duty preferences only in details_extra; round trip', () => {
    const f: WizardForm = { ...intlGoods(), insurance: true, estimated_duties: true, precalculated_duties: true, item_entry: 'upload',
      items: [{ ...goodItem(), manufacturer_id: 'MID-1', line_reference: 'L1', show_reference: true }, emptyItem()],
      charges: [{ type: 'freight', description: '', amount: '25' }, { type: 'insurance', description: 'cover', amount: '3.456' }] };
    const c = toContent(f);
    expect(c.items).toHaveLength(1);
    expect(c.items?.[0]).not.toHaveProperty('manufacturer_id');
    expect(c.content_description).toBe('Cotton T-shirt'); // derived from the items when none is typed
    expect(c.details_extra).toMatchObject({ insurance: true, estimated_duties: true, precalculated_duties: false, item_entry: 'upload',
      charges: [{ type: 'freight', description: null, amount: 25 }, { type: 'insurance', description: 'cover', amount: 3.46 }],
      items: [{ manufacturer_id: 'MID-1', line_reference: 'L1' }] });
    const back = fromShipment({ id: 1, client_id: null, customs_required: true, currency: 'USD', shipment_purpose: 'gift', customer_reference: null,
      shipper_country_code: 'SA', receiver_country_code: 'US', packages: [], items: c.items, shipment_details_extra: c.details_extra } as never);
    expect(back).toMatchObject({ content_kind: 'goods', insurance: true, estimated_duties: true, precalculated_duties: false, item_entry: 'upload',
      charges: [{ type: 'freight', description: '', amount: '25' }, { type: 'insurance', description: 'cover', amount: '3.46' }] });
  })
  it('an older draft without extras keeps its customer reference as reference 1', () => {
    const back = fromShipment({ id: 1, client_id: null, customs_required: false, customer_reference: 'OLD-9', shipper_country_code: 'SA', receiver_country_code: 'SA', packages: [], items: [] } as never);
    expect(back.references).toEqual([{ type: 'CU', value: 'OLD-9' }]);
    expect(back).toMatchObject({ document_protection: false, insurance: false, charges: [], item_entry: 'describe' });
  })
});

describe('item upload (CSV / Excel rows)', () => {
  const row = { description: 'Cotton T-shirt', quantity: '2', unit: 'pcs', unit_value: '10', net_weight_kg: '0.5', country_of_origin: 'cn', hs_code_export: '6109.10', hs_code_import: '6109.10' };
  it('valid rows become item cards (unit / country upper-cased, line reference shown)', () => {
    const r = parseItemRows([{ ...row, line_reference: 'L1', manufacturer_id: 'MID' }], 'en');
    expect(r.errors).toEqual([]);
    expect(r.items[0]).toMatchObject({ description: 'Cotton T-shirt', unit: 'PCS', country_of_origin: 'CN', line_reference: 'L1', show_reference: true, manufacturer_id: 'MID' });
  })
  it('row-level errors name the file row (header = 1); blank rows skipped; valid rows kept', () => {
    const r = parseItemRows([row, {}, { ...row, description: 'قميص', quantity: '0', unit: 'XYZ', country_of_origin: 'ZZ', hs_code_import: '6' }], 'en');
    expect(r.items).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/^Row 4: /);
    for (const m of ['description', 'quantity', 'unsupported unit (XYZ)', 'country_of_origin', 'hs_code_import: 2–18 digits or dots']) expect(r.errors[0]).toContain(m);
    // no HS codes in the file: still a valid item (the codes are optional)
    const noHs = parseItemRows([{ ...row, hs_code_export: '', hs_code_import: '' }], 'en');
    expect(noHs.errors).toEqual([]);
    expect(noHs.items[0]).toMatchObject({ outbound_hs_code: '', inbound_hs_code: '' });
    expect(parseItemRows([{ ...row, gross_weight_kg: '0.4' }], 'ar').errors[0]).toMatch(/^السطر 2: /);
    expect(parseItemRows([], 'ar').errors).toEqual(['الملف لا يحتوي بنودًا.']);
  })
});
