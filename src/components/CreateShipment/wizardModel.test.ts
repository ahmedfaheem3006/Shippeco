import { describe, expect, it } from 'vitest';
import {
  allCountries, callingCode, composePhone, emptyForm, emptyItem, emptyPackage, emptyParty, fromDefaultParty, fromShipment, groupPieces, isOriginWeekend, issuesToErrors,
  itemTotals, locateIssue, needsCustoms, nextBusinessDay, packageTotals, partiesGate, routeIssuesText, routeSnapshot, splitPhone, stepMissing, toContent, translateIssue,
  visibleSteps, type WizardForm,
} from './wizardModel';
import { applyAddress, applyContact, clearAddress, contactFieldsOf, normalizeShortAddress, withCountry } from './partiesModel';
import { canShipment } from '../../utils/dhlShipmentPermissions';

const saParty = () => ({
  ...emptyParty('SA'), use_na: false, contact: 'Sara Operations', company: 'Shippec Trading', city: 'Dammam', postal_code: '31952',
  address_line1: '3456 Prince Sultan Road', address_line2: '7788 Al Olaya', short_address: 'ROLA3456',
  phones: [{ type: 'mobile' as const, code: '966', number: '055 123 4567', extension: '', sms: true }],
});
const usParty = () => ({ ...emptyParty('US'), use_na: false, contact: 'John Smith', company: 'ACME', phone: '+13025550100', phones: [{ type: 'office' as const, code: '1', number: '302 555 0100', extension: '', sms: false }], city: 'Newark', postal_code: '19711', province: 'DE', address_line1: '742 Test Lane' });
const intlGoods = (): WizardForm => ({
  ...emptyForm(), content_kind: 'goods', shipper: usParty(), receiver: saParty(), content_description: 'Cotton T-shirts', shipment_purpose: 'gift',
  items: [{ ...emptyItem(), description: 'T-shirt', quantity: '2', unit_value: '10', country_of_origin: 'CN', outbound_hs_code: '6109.10', inbound_hs_code: '6109.10', unit_net_weight_kg: '0.2', gross_weight_kg: '0.5' }],
  packages: [{ weight_kg: '0.5', length_cm: '30', width_cm: '20', height_cm: '5', quantity: '1' }],
});

describe('wizard model', () => {
  it('Parties → DHL: lines 1–2 as typed, the Saudi short address in line 3 (suburb elsewhere), the first phone in international form, residential = private', () => {
    const c = toContent({ ...emptyForm(), shipper: saParty(), receiver: { ...usParty(), suburb: 'Downtown', residential: true } });
    expect(c.shipper).toMatchObject({ address_line1: '3456 Prince Sultan Road', address_line2: '7788 Al Olaya', address_line3: 'ROLA3456', phone: '+966551234567', type: 'business', country_code: 'SA' });
    expect(c.receiver).toMatchObject({ address_line1: '742 Test Lane', address_line3: 'Downtown', province: 'DE', country_code: 'US', type: 'private', phone: '+13025550100' });
    // the Parties extras travel with the draft (never as DHL content)
    expect(c.party_details?.shipper).toMatchObject({ short_address: 'ROLA3456', phones: [{ type: 'mobile', code: '966', number: '055 123 4567', sms: true }] });
    expect(c.party_details?.receiver).toMatchObject({ residential: true, suburb: 'Downtown', short_address: null });
    // the pickup address keeps the National Address parts path
    const pickup = toContent({ ...emptyForm(), pickup_option: 'schedule', pickup_other_address: true,
      pickup_address: { ...emptyParty('SA'), contact: 'X', na: { building_number: '3456', street: 'Prince Sultan Road', additional_number: '7788', district: 'Al Olaya', short_address: 'ROLA3456' } } });
    expect(pickup.pickup_address).toMatchObject({ national_address: { building_number: '3456', district: 'Al Olaya' } });
  });

  it('a new shipment: «من» is SHIPPEC Operations (Dammam National Address, mobile +966 53 729 9636); «إلى» is empty with an office phone', () => {
    const f = emptyForm();
    expect(f.shipper).toMatchObject({
      contact: 'Operations Management - SHIPPEC', business_contact: true, company: 'SHIPPEC EXPRESS', country_code: 'SA', address_line1: '7540 Prince Mutaib bin Abdulaziz',
      address_line2: '3538 Al Rawdah Dist', short_address: 'EDMA7540', city: 'DAMMAM', province: 'EASTERN PROVINCE', residential: false, email: 'info@altakamullog.com',
      phones: [{ type: 'mobile', code: '966', number: '53 729 9636', extension: '', sms: false }],
    });
    expect(toContent(f).shipper).toMatchObject({ phone: '+966537299636', address_line3: 'EDMA7540' });
    expect(f.receiver).toMatchObject({ contact: '', company: '', country_code: '', business_contact: false, phones: [{ type: 'office', code: '' }] });
    expect(fromDefaultParty()).toEqual(fromDefaultParty());
  });

  it('the Parties gate: SHIPPEC customer + Name, Company, Country, Address 1, City, Code, Phone for both sides; VAT/Tax ID and EORI never block; country rules (SA, US)', () => {
    const ok: WizardForm = { ...emptyForm(), client_id: 3, receiver: { ...saParty(), contact: 'Omar', company: 'Omar' } };
    expect(partiesGate(ok)).toEqual({});
    expect(partiesGate({ ...ok, client_id: null })).toEqual({ client: 'اختر عميل SHIPPEC (صاحب الفاتورة).' });
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['contact', { contact: ' ' }, 'الاسم مطلوب.'], ['company', { company: '' }, 'اسم الشركة مطلوب.'], ['country_code', { country_code: '' }, 'البلد/الإقليم مطلوب.'],
      ['address_line1', { address_line1: '' }, 'العنوان 1 مطلوب.'], ['city', { city: '' }, 'المدينة مطلوبة.'],
      ['phone_code', { phones: [{ type: 'mobile', code: '', number: '5', extension: '', sms: false }] }, 'رمز الاتصال الدولي مطلوب.'],
      ['phone', { phones: [{ type: 'mobile', code: '966', number: ' ', extension: '', sms: false }] }, 'رقم الهاتف مطلوب.'],
    ];
    for (const [k, patch, msg] of cases) {
      for (const who of ['shipper', 'receiver'] as const) {
        expect(partiesGate({ ...ok, [who]: { ...ok[who], ...patch } })[`${who}.${k}`]).toBe(msg);
      }
    }
    expect(partiesGate({ ...ok, receiver: { ...ok.receiver, vat_tax_id: '', eori: '' } })).toEqual({});
    expect(partiesGate({ ...ok, receiver: { ...ok.receiver, address_line2: '' } })).toEqual({ 'receiver.address_line2': 'عنوان 2 مطلوب للعناوين السعودية (الرقم الإضافي والحي).' });
    expect(Object.keys(partiesGate({ ...ok, receiver: { ...usParty(), province: '', postal_code: '' } }))).toEqual(['receiver.postal_code', 'receiver.province']);
    expect(partiesGate({ ...ok, shipper: { ...ok.shipper, city: '' } }, 'en')).toEqual({ 'shipper.city': 'City is required.' });
    expect(stepMissing({ ...ok, receiver: { ...ok.receiver, contact: '' } }, 'parties', 'en')).toEqual(['To: Name']);
  });

  it('countries: every ISO country, Arabic and English names, calling codes; phones composed / split without corrupting the number', () => {
    const en = allCountries('en');
    expect(en.length).toBeGreaterThan(240);
    expect(en.find((c) => c.code === 'SA')).toMatchObject({ en: 'Saudi Arabia', dial: '966' });
    expect(en.find((c) => c.code === 'US')?.dial).toBe('1');
    expect(callingCode('EG')).toBe('20');
    expect(allCountries('ar').find((c) => c.code === 'EG')?.name).toMatch(/مصر/);
    expect(composePhone('966', '053 729 9636')).toBe('+966537299636');
    expect(composePhone('966', '+20 100 123 4567')).toBe('+201001234567');
    expect(composePhone('1', '(302) 555-0100')).toBe('+13025550100');
    expect(splitPhone('+966537299636', 'SA')).toEqual({ code: '966', number: '537299636' });
    expect(splitPhone('', 'EG')).toEqual({ code: '20', number: '' });
  });

  it('Parties helpers: country change (code follows only when it was the old default), Clear Address, provider address, saved contact ⇄ form', () => {
    const sa = saParty();
    const eg = withCountry(sa, 'EG');
    expect(eg.phones[0]).toMatchObject({ code: '20', number: '055 123 4567' }); // number untouched
    const custom = withCountry({ ...sa, phones: [{ ...sa.phones[0], code: '44' }] }, 'EG');
    expect(custom.phones[0].code).toBe('44'); // a code the user typed is kept
    const cleared = clearAddress({ ...sa, vat_tax_id: 'VAT1', eori: 'E1', email: 'a@b.c', suburb: 'x', province: 'y' });
    expect(cleared).toMatchObject({ address_line1: '', address_line2: '', short_address: '', suburb: '', city: '', province: '', postal_code: '',
      contact: 'Sara Operations', company: 'Shippec Trading', email: 'a@b.c', vat_tax_id: 'VAT1', eori: 'E1', country_code: 'SA', phones: sa.phones });
    const addr = {
      address_line1: '2519 Prince Mohammed Bin Fahd Road', address_line2: '7531 Al Faisaliyah Dist', short_address: 'KUDA2519', building_number: '2519',
      street: 'Prince Mohammed Bin Fahd Road', additional_number: '7531', district: 'Al Faisaliyah Dist', city: 'DAMMAM', province: 'EASTERN PROVINCE', postal_code: '32272', country_code: 'SA',
    };
    const filled = applyAddress({ ...sa, address_line1: '', city: '' }, addr);
    expect(filled).toMatchObject({ address_line1: '2519 Prince Mohammed Bin Fahd Road', address_line2: '7531 Al Faisaliyah Dist', short_address: 'KUDA2519', city: 'DAMMAM', province: 'EASTERN PROVINCE', postal_code: '32272' });
    // a provider without a postal code never wipes the one already typed
    expect(applyAddress({ ...sa, postal_code: '31952' }, { ...addr, postal_code: null }).postal_code).toBe('31952');
    expect(normalizeShortAddress(' kuda-2519x ')).toBe('KUDA2519');
    const fields = contactFieldsOf({ ...sa, vat_tax_id: '300', notes: 'ملاحظة' });
    expect(fields).toMatchObject({ name: 'Sara Operations', country_code: 'SA', country_name: 'Saudi Arabia', short_address: 'ROLA3456', vat_tax_id: '300', notes: 'ملاحظة',
      phones: [{ type: 'mobile', code: '966', number: '055 123 4567', extension: null, sms: true }] });
    const back = applyContact(emptyParty('', 'office'), { ...fields, id: 12, role: 'both', phone_normalized: '966551234567', created_by: 1, created_at: '', updated_at: '' });
    expect(back).toMatchObject({ contact: 'Sara Operations', company: 'Shippec Trading', country_code: 'SA', address_line1: '3456 Prince Sultan Road', short_address: 'ROLA3456',
      city: 'Dammam', postal_code: '31952', saved_contact_id: 12, vat_tax_id: '300', notes: 'ملاحظة', phones: [{ code: '966', number: '055 123 4567', sms: true }] });
  });

  it('customs only for international goods; payer / pickup / service point fields only when they apply', () => {
    expect(needsCustoms(intlGoods())).toBe(true);
    expect(needsCustoms({ ...intlGoods(), content_kind: 'documents' })).toBe(false);
    expect(needsCustoms({ ...intlGoods(), shipper: saParty() })).toBe(false);
    expect(visibleSteps(intlGoods()).map((s) => s.id)).toContain('customs');
    expect(visibleSteps({ ...intlGoods(), content_kind: 'documents' }).map((s) => s.id)).not.toContain('customs');
    const docs = toContent({ ...intlGoods(), content_kind: 'documents', duties_payer: 'shipper', pickup_option: 'none', pickup_earliest_time: '10:00', service_point_id: 'X' });
    expect(docs).toMatchObject({ customs_required: false, items: [], duties_payer: 'receiver', incoterm: null, pickup_earliest_time: null, service_point_id: null, shipment_purpose: null });
    const goods = toContent({ ...intlGoods(), paperless_trade: true, dhl_invoice_type: 'proforma', transport_payer: 'receiver', transport_payer_account: '123456789' });
    expect(goods).toMatchObject({ customs_required: true, paperless_trade: true, service_codes: ['WY'], shipment_purpose: 'gift', transport_payer_account: '123456789' });
    expect(goods.items?.[0]).toMatchObject({ description: 'T-shirt', line_gross_weight_kg: '0.5', unit_net_weight_kg: '0.2' });
  });

  it('package quantities and totals; identical stored pieces are grouped back', () => {
    expect(packageTotals([{ weight_kg: '1.5', length_cm: '', width_cm: '', height_cm: '', quantity: '2' }, { weight_kg: '0.75', length_cm: '', width_cm: '', height_cm: '', quantity: '1' }]))
      .toEqual({ pieces: 3, weight: 3.75 });
    const rows = [
      { sequence: 1, weight_kg: '1.500', length_cm: '30.00', width_cm: '20.00', height_cm: '10.00', customer_reference: null, dhl_piece_id: null },
      { sequence: 2, weight_kg: '1.500', length_cm: '30.00', width_cm: '20.00', height_cm: '10.00', customer_reference: null, dhl_piece_id: null },
      { sequence: 3, weight_kg: '0.750', length_cm: '20.00', width_cm: '15.00', height_cm: '5.00', customer_reference: null, dhl_piece_id: null },
    ];
    expect(groupPieces(rows)).toEqual([
      { weight_kg: '1.5', length_cm: '30', width_cm: '20', height_cm: '10', quantity: '2' },
      { weight_kg: '0.75', length_cm: '20', width_cm: '15', height_cm: '5', quantity: '1' },
    ]);
    expect(itemTotals(intlGoods().items)).toEqual({ value: 20, net: 0.4, gross: 0.5 });
  });

  it('a stored shipment comes back as the same form (lines as stored, short address from line 3, phone split; Parties extras restored)', () => {
    const sh: any = {
      id: 7, client_id: 3, customs_required: true, content_description: 'Cotton T-shirts', currency: 'USD', incoterm: 'DAP', shipment_purpose: 'gift',
      shipper_contact: 'John Smith', shipper_company: 'ACME', shipper_phone: '+13025550100', shipper_city: 'Newark', shipper_postal_code: '19711', shipper_province: 'DE',
      shipper_country_code: 'US', shipper_address_line1: '742 Test Lane', shipper_type: 'business',
      receiver_contact: 'Sara', receiver_country_code: 'SA', receiver_address_line1: '3456, Prince Sultan Road', receiver_address_line2: '7788, Al Olaya', receiver_address_line3: 'ROLA3456', receiver_city: 'Dammam', receiver_type: 'private',
      packages: [{ sequence: 1, weight_kg: '0.500', length_cm: '30.00', width_cm: '20.00', height_cm: '5.00' }],
      items: [{ description: 'T-shirt', quantity: 2, unit: 'PCS', unit_value: '10.000', country_of_origin: 'CN', outbound_hs_code: '6109.10', inbound_hs_code: '6109.10', unit_net_weight_kg: '0.200', line_gross_weight_kg: '0.500' }],
      transport_payer: 'shipper', duties_payer: 'receiver', pickup_option: 'none', service_codes: [], shipment_date: '2026-11-19',
    };
    const f = fromShipment(sh, 'Client X');
    expect(f).toMatchObject({ client_id: 3, client_name: 'Client X', content_kind: 'goods', shipment_purpose: 'gift', incoterm: 'DAP' });
    expect(f.receiver).toMatchObject({ use_na: false, type: 'private', residential: true, address_line1: '3456, Prince Sultan Road', address_line2: '7788, Al Olaya', short_address: 'ROLA3456', phones: [{ type: 'office', code: '966', number: '' }] });
    expect(f.shipper).toMatchObject({ use_na: false, address_line1: '742 Test Lane', province: 'DE', phones: [{ type: 'mobile', code: '1', number: '3025550100' }] });
    const withDetails = fromShipment({ ...sh, receiver_details: { business_contact: true, residential: false, short_address: 'ROLA3456', suburb: null, vat_tax_id: '3001', eori: null, notes: 'Gate 4',
      phones: [{ type: 'office', code: '966', number: '13 800 0000', extension: '12', sms: false }, { type: 'mobile', code: '966', number: '55 222 2222', extension: null, sms: true }], saved_contact_id: 9 } }, '');
    expect(withDetails.receiver).toMatchObject({ business_contact: true, residential: false, vat_tax_id: '3001', notes: 'Gate 4', saved_contact_id: 9 });
    expect(withDetails.receiver.phones).toHaveLength(2);
    expect(f.items[0]).toMatchObject({ unit_value: '10', gross_mode: 'line', gross_weight_kg: '0.5' });
  });

  it('Backend issue paths land on the right step and field; common rules are shown in Arabic', () => {
    expect(locateIssue('receiver.cityName')).toEqual({ step: 'parties', key: 'receiver.city' });
    expect(locateIssue('customerDetails.shipperDetails.postalAddress.addressLine1')).toEqual({ step: 'parties', key: 'shipper.address_line1' });
    // the customs lines are entered on Shipment Details
    expect(locateIssue('items[2].country_of_origin')).toEqual({ step: 'details', key: 'items.1.country_of_origin' });
    expect(locateIssue('customs.lineItems[1].hsCode')).toEqual({ step: 'details', key: 'items.0.outbound_hs_code' });
    // DHL requiring an HS code on this route (Backend commodityCodeField) → that item's field on «تفاصيل الشحنة»
    expect(locateIssue('items[2].outbound_hs_code')).toEqual({ step: 'details', key: 'items.1.outbound_hs_code' });
    expect(locateIssue('items[1].inbound_hs_code')).toEqual({ step: 'details', key: 'items.0.inbound_hs_code' });
    expect(translateIssue('998 : Commodity code is mandatory for this destination')).toBe('DHL تطلب رمز HS لهذا البند على هذا المسار — أدخله قبل الإنشاء (DHL 998)');
    expect(translateIssue('998 : Commodity code is mandatory for this destination', 'en')).toBe('998 : Commodity code is mandatory for this destination');
    expect(locateIssue('packages[1]')).toEqual({ step: 'packages', key: 'packages.0' });
    expect(locateIssue('incoterm')).toEqual({ step: 'payment', key: 'incoterm' });
    expect(locateIssue('pickup_latest_time')).toEqual({ step: 'pickup', key: 'pickup_latest_time' });
    expect(locateIssue('dhl')).toEqual({ step: 'service', key: 'dhl' });
    const { errors, byStep } = issuesToErrors([{ field: 'receiver.phone', message: 'Phone number is required' }, { field: 'items[1].country_of_origin', message: 'Country of manufacture is required' }]);
    // stored as the Backend wrote them; shown in the page language
    expect(translateIssue(errors['receiver.phone'])).toBe('حقل مطلوب');
    expect(translateIssue(errors['receiver.phone'], 'en')).toBe('Phone number is required');
    expect(translateIssue(errors['items.0.country_of_origin'])).toBe('حقل مطلوب');
    expect(byStep).toEqual({ parties: 1, details: 1 });
    expect(translateIssue('420505 : The destination location is invalid. Please check the data')).toBe('DHL لم تتعرف على عنوان المستلم — تحقق من المدينة والرمز البريدي والدولة (DHL 420505)');
    expect(translateIssue('999999 : Something DHL-specific')).toBe('999999 : Something DHL-specific'); // unknown → DHL's own words
    // DHL's address verdict arrives on receiver.city (Backend) → the «المرسل والمستلم» step, the city field
    expect(issuesToErrors([{ field: 'receiver.city', message: '420505 : The destination location is invalid' }]).byStep).toEqual({ parties: 1 });
  });

  it('QA 3D.1: a draft saves before packages / items are filled; missing route fields are named; origin weekends', () => {
    const c = toContent({ ...intlGoods(), packages: [...intlGoods().packages, emptyPackage()], items: [...intlGoods().items, emptyItem()] });
    expect(c.packages).toHaveLength(1);
    expect(c.items).toHaveLength(1);
    expect(toContent(emptyForm()).packages).toEqual([]);
    expect(routeIssuesText([{ field: 'origin_gmt_offset', message: 'Origin time zone is required' }, { field: 'packages[1]', message: 'Package dimensions' }]))
      .toBe('قبل سؤال DHL أكمل: المنطقة الزمنية لبلد المرسل، الطرود (الوزن والأبعاد)');
    expect(routeIssuesText([{ field: 'receiver.city', message: 'x' }], 'en')).toBe('Before asking DHL, complete: the receiver city');
    expect(isOriginWeekend('2026-11-22', 'US')).toBe(true); // Sunday
    expect(isOriginWeekend('2026-11-22', 'SA')).toBe(false);
    expect(isOriginWeekend('2026-11-20', 'SA')).toBe(true); // Friday
    expect(nextBusinessDay(new Date(), 'US', '2026-11-22')).toBe('2026-11-23');
    expect(nextBusinessDay(new Date('2026-11-19T10:00:00Z'), 'US')).toBe('2026-11-20'); // Thu → Fri in the US
  });

  it('a route change makes DHL products stale; a pickup time does not', () => {
    const f = intlGoods();
    const base = routeSnapshot(f);
    expect(routeSnapshot({ ...f, pickup_earliest_time: '11:00' })).toBe(base);
    expect(routeSnapshot({ ...f, receiver: { ...f.receiver, city: 'Riyadh' } })).not.toBe(base);
    expect(routeSnapshot({ ...f, packages: [{ ...f.packages[0], weight_kg: '0.6' }] })).not.toBe(base);
    expect(routeSnapshot({ ...f, shipment_date: '2026-12-01' })).not.toBe(base);
  });

  it('missing data per step; next business day skips the Saudi weekend', () => {
    expect(stepMissing(emptyForm(), 'parties')).toEqual(expect.arrayContaining(['العميل (للفاتورة)']));
    expect(stepMissing({ ...intlGoods(), shipment_purpose: '' }, 'details')).toContain('غرض الشحنة');
    expect(stepMissing({ ...emptyForm(), pickup_option: 'drop_off' }, 'pickup')).toContain('نقطة الخدمة');
    expect(nextBusinessDay(new Date('2026-11-19T10:00:00Z'))).toBe('2026-11-22'); // Thu → Sun
  });

  it('role map mirrors the Backend', () => {
    expect(canShipment('employee', 'create')).toBe(false);
    expect(canShipment('employee', 'confirm')).toBe(true);
    expect(canShipment('manager', 'resolve_uncertain')).toBe(true);
    expect(canShipment('viewer', 'create_draft')).toBe(false);
    expect(canShipment('accountant', 'price')).toBe(true);
    // saved contacts: employees read + add; editing anyone's contact is admin / manager
    expect(canShipment('employee', 'contacts_write')).toBe(true);
    expect(canShipment('employee', 'contacts_manage')).toBe(false);
    expect(canShipment('manager', 'contacts_manage')).toBe(true);
    expect(canShipment('accountant', 'contacts_read')).toBe(false);
    expect(canShipment('viewer', 'contacts_read')).toBe(false);
  });
});
