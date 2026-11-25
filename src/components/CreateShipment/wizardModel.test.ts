import { describe, expect, it } from 'vitest';
import {
  allCountries, callingCode, composePhone, customsGate, declarationOptions, declarationPreview, emptyForm, emptyItem, emptyPackage, emptyParty, fromDefaultParty,
  fromShipment, groupPieces, incotermAdvice, isOriginWeekend, issuesToErrors, maskAccount, needsUsExportFiling, paymentGate, suggestedIncoterm, suggestedInvoiceType,
  itemTotals, locateIssue, needsCustoms, nextBusinessDay, packageTotals, partiesGate, routeIssuesText, routeSnapshot, splitPhone, stepMissing, toContent, translateIssue,
  visibleSteps, type WizardForm,
  chargeRows, dateParts, dhlDateTime, goGreenOf, optionalServiceRows, originToday, shipDateCards, shipDateRange, toggleOptionalService,
  needsOriginOffset, originOffset, senderTimeZone,
  pickupGate, pickupLocationIn, pickupSlots,
} from './wizardModel';
import { applyAddress, applyCity, applyContact, clearAddress, contactFieldsOf, normalizeShortAddress, withCountry } from './partiesModel';
import { normalizeSubdivision } from './geoRules';
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

  it('Customs Invoice → DHL draft: Create Invoice (optional number, type, remarks, statements, documents, Paperless) vs Use My Own Invoice', () => {
    const base = { ...intlGoods(), shipper: saParty(), receiver: usParty(), dhl_invoice_type: 'proforma' as const, customs_invoice_number: 'INV-9', customs_invoice_date: '2026-11-20' };
    // Create Invoice without «include an invoice number»: no number / date sent even if one was typed before
    const noNumber = toContent({ ...base, customs_invoice_mode: 'create', include_invoice_number: false });
    expect(noNumber).toMatchObject({ customs_invoice_number: null, customs_invoice_date: null, dhl_invoice_type: 'proforma', details_extra: { customs_invoice_mode: 'create' } });
    const withNumber = toContent({ ...base, customs_invoice_mode: 'create', include_invoice_number: true, invoice_remarks: 'Goods for exhibition\n\n Return in 30 days ',
      declaration_statements: ['certificate_of_origin', 'usmca'], customs_documents: [{ type_code: 'COO', value: ' COO-1 ' }, { type_code: '', value: '' }], paperless_trade: true });
    expect(withNumber).toMatchObject({
      customs_invoice_number: 'INV-9', customs_invoice_date: '2026-11-20', invoice_remarks: ['Goods for exhibition', 'Return in 30 days'],
      declaration_statements: ['certificate_of_origin'], // USMCA is not offered on SA → US (and never sent)
      customs_documents: [{ type_code: 'COO', value: 'COO-1' }], paperless_trade: true, service_codes: ['WY'],
    });
    // Use My Own Invoice: my number, no DHL invoice, no Paperless, no statements / remarks (they print on DHL's invoice)
    const own = toContent({ ...base, customs_invoice_mode: 'own', include_invoice_number: false, paperless_trade: true, invoice_remarks: 'x', declaration_statements: ['certificate_of_origin'] });
    expect(own).toMatchObject({ customs_invoice_number: 'INV-9', dhl_invoice_type: null, paperless_trade: false, service_codes: [], invoice_remarks: [], declaration_statements: [], details_extra: { customs_invoice_mode: 'own' } });
    // documents shipment: nothing of the customs invoice is sent
    expect(toContent({ ...base, content_kind: 'documents', customs_documents: [{ type_code: 'COO', value: '1' }] })).toMatchObject({ customs_documents: [], invoice_remarks: [], customs_invoice_number: null, details_extra: { customs_invoice_mode: null } });
  });

  it('Customs Invoice gate, route-aware declarations, US-only Electronic Export Filing, invoice type suggested from the purpose', () => {
    const f = { ...intlGoods(), customs_invoice_mode: 'create' as const };
    expect(customsGate(f, 'en')).toEqual({ dhl_invoice_type: 'Choose the invoice type DHL creates.' });
    expect(customsGate({ ...f, dhl_invoice_type: 'commercial' })).toEqual({});
    expect(customsGate({ ...f, dhl_invoice_type: 'commercial', include_invoice_number: true })).toHaveProperty('customs_invoice_number');
    expect(customsGate({ ...f, dhl_invoice_type: 'commercial', invoice_remarks: 'a\nb\nc\nd' })).toHaveProperty('invoice_remarks');
    expect(customsGate({ ...f, dhl_invoice_type: 'commercial', invoice_remarks: 'x'.repeat(46) })).toHaveProperty('invoice_remarks');
    expect(customsGate({ ...f, dhl_invoice_type: 'commercial', invoice_remarks: 'ملاحظة' })).toHaveProperty('invoice_remarks');
    expect(customsGate({ ...f, dhl_invoice_type: 'commercial', customs_documents: [{ type_code: 'COO', value: '' }] })).toHaveProperty(['customs_documents.0']);
    expect(customsGate({ ...f, dhl_invoice_type: 'commercial', customs_documents: [{ type_code: '', value: '' }] })).toEqual({}); // an empty row is ignored
    // own invoice: no invoice type, the number is optional, hidden remarks never block
    expect(customsGate({ ...f, customs_invoice_mode: 'own', invoice_remarks: 'a\nb\nc\nd' })).toEqual({});
    expect(customsGate({ ...f, content_kind: 'documents' })).toEqual({});
    // declarations: Certificate of Origin everywhere; USMCA only US / CA / MX (unsupported); never for a Saudi origin
    expect(declarationOptions({ shipper: saParty(), receiver: usParty() })).toEqual([{ id: 'certificate_of_origin', supported: true }]);
    expect(declarationOptions({ shipper: usParty(), receiver: { ...usParty(), country_code: 'CA' } })).toEqual([{ id: 'certificate_of_origin', supported: true }, { id: 'usmca', supported: false }]);
    expect(declarationPreview('certificate_of_origin', intlGoods())).toBe('We hereby certify that the goods described in this invoice are of China origin.');
    expect(needsUsExportFiling({ shipper: saParty() })).toBe(false);
    expect(needsUsExportFiling({ shipper: usParty() })).toBe(true);
    expect([suggestedInvoiceType('commercial'), suggestedInvoiceType('gift'), suggestedInvoiceType('claim')]).toEqual(['commercial', 'proforma', null]);
    expect(stepMissing(f, 'customs', 'en')).toEqual(['Invoice type']);
  });

  it('a stored draft brings its Customs Invoice back (mode, number checkbox, remarks, statements, documents); older drafts get a sensible mode', () => {
    const sh: any = {
      id: 8, customs_required: true, shipper_country_code: 'SA', receiver_country_code: 'US', packages: [], items: [], service_codes: [],
      customs_invoice_number: 'INV-9', customs_invoice_date: '2026-11-20', dhl_invoice_type: 'commercial', invoice_remarks: ['Line A', 'Line B'],
      declaration_statements: ['certificate_of_origin'], customs_documents: [{ type_code: 'COO', value: 'COO-1' }], shipment_details_extra: { customs_invoice_mode: 'create' },
    };
    const f = fromShipment(sh);
    expect(f).toMatchObject({ customs_invoice_mode: 'create', include_invoice_number: true, invoice_remarks: 'Line A\nLine B', declaration_statements: ['certificate_of_origin'], customs_documents: [{ type_code: 'COO', value: 'COO-1' }] });
    expect(toContent(f)).toMatchObject({ invoice_remarks: ['Line A', 'Line B'], customs_invoice_number: 'INV-9', customs_documents: [{ type_code: 'COO', value: 'COO-1' }] });
    expect(fromShipment({ ...sh, shipment_details_extra: null, dhl_invoice_type: null }).customs_invoice_mode).toBe('own');
    expect(fromShipment({ ...sh, shipment_details_extra: null }).customs_invoice_mode).toBe('create');
    expect(fromShipment({ ...sh, shipment_details_extra: null, dhl_invoice_type: null, customs_invoice_number: null }).customs_invoice_mode).toBe('create');
    expect(locateIssue('customs_documents')).toEqual({ step: 'customs', key: 'customs_documents' });
    expect(locateIssue('invoice_remarks')).toEqual({ step: 'customs', key: 'invoice_remarks' });
  });

  it('Payment (MyDHL+): transport and duties payers are separate; accounts only where they apply; DAP / DDP suggested and incompatible pairs flagged; accounts masked for display', () => {
    const f = { ...intlGoods(), shipper: saParty(), receiver: usParty() };
    // SHIPPEC pays transport: no account asked or sent; receiver / third party: their 6–12 digit account
    expect(paymentGate(f)).toEqual({});
    expect(toContent({ ...f, transport_payer: 'shipper', transport_payer_account: '123456789' }).transport_payer_account).toBeNull();
    expect(paymentGate({ ...f, transport_payer: 'receiver' }, 'en')).toEqual({ transport_payer_account: 'The receiver DHL account number is required.' });
    expect(paymentGate({ ...f, transport_payer: 'third_party', transport_payer_account: '12345' }, 'en')).toEqual({ transport_payer_account: 'A DHL account number has 6–12 digits.' });
    expect(paymentGate({ ...f, transport_payer: 'receiver', transport_payer_account: '123456789' })).toEqual({});
    expect(toContent({ ...f, transport_payer: 'receiver', transport_payer_account: '123456789' })).toMatchObject({ transport_payer: 'receiver', transport_payer_account: '123456789' });
    // duties: receiver → no account; SHIPPEC → no account typed (its own); third party → its account (separate field)
    expect(toContent({ ...f, duties_payer: 'receiver', duties_payer_account: '555555555' }).duties_payer_account).toBeNull();
    expect(toContent({ ...f, duties_payer: 'shipper', duties_payer_account: '555555555' })).toMatchObject({ duties_payer: 'shipper', duties_payer_account: null });
    expect(paymentGate({ ...f, duties_payer: 'third_party' })).toHaveProperty('duties_payer_account');
    expect(toContent({ ...f, duties_payer: 'third_party', duties_payer_account: '555555555', transport_payer: 'receiver', transport_payer_account: '123456789' }))
      .toMatchObject({ duties_payer_account: '555555555', transport_payer_account: '123456789' });
    // documents: duties never apply (the duties account never blocks)
    expect(paymentGate({ ...f, content_kind: 'documents', duties_payer: 'third_party' })).toEqual({});
    expect(toContent({ ...f, content_kind: 'documents', duties_payer: 'third_party', duties_payer_account: '555555555' })).toMatchObject({ duties_payer: 'receiver', duties_payer_account: null });
    // DAP / DDP
    expect([suggestedIncoterm('receiver'), suggestedIncoterm('shipper'), suggestedIncoterm('third_party')]).toEqual(['DAP', 'DDP', 'DDP']);
    expect(incotermAdvice({ duties_payer: 'shipper', incoterm: 'DAP' })).toBe('needs_ddp');
    expect(incotermAdvice({ duties_payer: 'third_party', incoterm: 'DDP' })).toBeNull();
    expect(incotermAdvice({ duties_payer: 'receiver', incoterm: 'DDP' })).toBe('ddp_with_receiver');
    expect(incotermAdvice({ duties_payer: 'receiver', incoterm: 'EXW' })).toBeNull();
    expect([maskAccount('460112611'), maskAccount(''), maskAccount('1234')]).toEqual(['*****2611', '', '****']);
    expect(stepMissing({ ...f, transport_payer: 'third_party' }, 'payment', 'en')).toEqual(['Transportation payer account']);
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

  it('Service: shipment dates at the sender (its time zone), Today / Tomorrow, never past and never beyond DHL\'s 10 days', () => {
    const f = { ...emptyForm(), shipper: saParty() };
    // 2026-11-24 22:30 UTC = 2026-11-25 01:30 in Riyadh
    const late = new Date('2026-11-24T22:30:00Z');
    expect(originToday(f, late)).toBe('2026-11-25');
    expect(shipDateRange(f, late)).toEqual({ min: '2026-11-25', max: '2026-12-05' }); // counted from the sender's today (as the Backend)
    const cards = shipDateCards(f, 7, late);
    expect(cards.map((c) => c.ymd)).toEqual(['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01']);
    expect(cards.slice(0, 3).map((c) => c.rel)).toEqual(['today', 'tomorrow', null]);
    expect(shipDateCards(f, 20, late).at(-1)?.ymd).toBe('2026-12-05');
    // a sender in Delaware: its zone (New York) from the state — no typed offset needed
    const de = { ...emptyForm(), shipper: usParty(), origin_gmt_offset: '' };
    expect(originToday(de, new Date('2026-11-25T03:00:00Z'))).toBe('2026-11-24');
    expect(dateParts('2026-11-25', 'en')).toEqual({ month: 'November', day: '25', weekday: 'Wednesday' });
    expect(dateParts('2026-12-08', 'ar')).toMatchObject({ day: '8', month: 'ديسمبر', weekday: 'الثلاثاء' });
    expect(dhlDateTime('2026-12-08T23:59:00')).toEqual({ date: '2026-12-08', time: '23:59', eod: true });
    expect(dhlDateTime('2026-11-30T12:00:00')).toEqual({ date: '2026-11-30', time: '12:00', eod: false });
    expect(dhlDateTime(null)).toBeNull();
  });

  it('Sender time zone from the ship-from location: Saudi Arabia → Asia/Riyadh UTC+03:00 (a stray typed −08:00 is ignored and never sent); a US state → its zone with DST; only an unresolvable location asks for an offset', () => {
    const sa = { ...emptyForm(), shipper: saParty(), receiver: usParty(), origin_gmt_offset: '-08:00', shipment_date: '2026-11-25' };
    expect(senderTimeZone(sa, '2026-11-25')).toEqual({ zone: 'Asia/Riyadh', offset: '+03:00', partial: false });
    expect(senderTimeZone(sa, '2026-07-01')?.offset).toBe('+03:00');
    expect(needsOriginOffset(sa)).toBe(false);
    expect(originOffset(sa)).toBe('+03:00');
    expect(toContent(sa).origin_gmt_offset).toBeNull();
    // the browser's time zone never matters: the same instant gives the Riyadh date (01:30 on the 25th)
    expect(originToday(sa, new Date('2026-11-24T22:30:00Z'))).toBe('2026-11-25');
    const or = { ...emptyForm(), shipper: { ...usParty(), province: 'OR', city: 'Corvallis', postal_code: '97330' }, receiver: saParty(), shipment_date: '2026-11-25' };
    expect(senderTimeZone(or, '2026-11-25')).toEqual({ zone: 'America/Los_Angeles', offset: '-08:00', partial: true });
    expect(senderTimeZone(or, '2026-07-01')?.offset).toBe('-07:00');
    expect(needsOriginOffset(or)).toBe(false);
    // changing the sender recalculates it
    expect(senderTimeZone({ shipper: { ...or.shipper, province: 'MI' } }, '2026-11-25')?.zone).toBe('America/Detroit');
    expect(senderTimeZone({ shipper: saParty() }, '2026-11-25')?.zone).toBe('Asia/Riyadh');
    // unresolvable: a multi-zone country / a US address without a state
    const br = { ...emptyForm(), shipper: { ...usParty(), country_code: 'BR', province: '' }, origin_gmt_offset: '-03:00' };
    expect([needsOriginOffset(br), originOffset(br), toContent(br).origin_gmt_offset]).toEqual([true, '-03:00', '-03:00']);
    expect(needsOriginOffset({ shipper: { ...usParty(), province: '' } })).toBe(true);
  });

  it('US state: «Oregon» is stored and sent as «OR» (name kept for display); a code stays; Michigan from a lookup or contact → «MI»; an older draft with «Oregon» loads as «OR»', () => {
    const f = { ...emptyForm(), shipper: saParty(), receiver: { ...usParty(), province: 'Oregon', city: 'Corvallis', postal_code: '97330' } };
    const c = toContent(f);
    expect(c.receiver.province).toBe('OR');
    expect(c.party_details?.receiver?.province_name).toBe('Oregon');
    expect(JSON.stringify(c.receiver)).not.toMatch(/Oregon/);
    expect(toContent({ ...f, receiver: { ...f.receiver, province: 'or' } }).receiver.province).toBe('OR');
    expect(toContent({ ...f, receiver: { ...f.receiver, province: 'Oregn' } }).receiver.province).toBe('Oregn'); // no fuzzy guess — validation asks for the code
    expect(normalizeSubdivision('US', 'Michigan')).toBe('MI');
    expect(normalizeSubdivision('CA', 'Ontario')).toBe('ON');
    expect(normalizeSubdivision('SA', 'Eastern Province')).toBe('Eastern Province');
    // Google / postal lookup / city suggestion / saved contact
    expect(applyAddress(f.receiver, { country_code: 'US', city: 'Corvallis', province: 'OR', province_name: 'Oregon', postal_code: '97330', address_line1: '2464 NW Garryanna St' } as never).province).toBe('OR');
    expect(applyCity(f.receiver, { country_code: 'US', city: 'Dearborn', province: 'Michigan' } as never, 'Dearborn').province).toBe('MI');
    const legacy = fromShipment({ ...({} as never), receiver_country_code: 'US', receiver_province: 'Oregon', receiver_city: 'Corvallis' } as never, '');
    expect(legacy.receiver.province).toBe('OR');
  });

  it('Service: DHL\'s breakdown as MyDHL+ shows it — DHL\'s names, lines before tax + VAT only when DHL stated them, DHL\'s own total (never summed here)', () => {
    const line = (name: string, code: string | null, amount: number, tax: number, net: number | null, category: string) => ({ name, serviceCode: code, typeCode: null, amount, currency: 'SAR', category: category as never, tax, net, isCustomerAgreement: null });
    // DHL TEST 2026-11-18, domestic N: 57.56 (net 50.05) + 0.69 (0.60) + 17.48 (15.20), VAT 9.88, total 75.73
    const q = { amount: 75.73, currency: 'SAR', taxTotal: 9.88, breakdown: [line('EXPRESS DOMESTIC', null, 57.56, 7.51, 50.05, 'transportation'), line('DEMAND SURCHARGE', 'NX', 0.69, 0.09, 0.6, 'demand_surcharge'), line('FUEL SURCHARGE', 'FF', 17.48, 2.28, 15.2, 'fuel_surcharge')] };
    const en = chargeRows(q, 'en');
    expect(en.rows.map((r) => [r.label, r.amount])).toEqual([['Transportation Charges', 50.05], ['Demand Surcharge', 0.6], ['Fuel Surcharge', 15.2]]);
    expect([en.tax, en.taxIncluded, en.total]).toEqual([9.88, null, 75.73]);
    expect(chargeRows(q, 'ar').rows.map((r) => r.label)).toEqual(['أجور النقل', 'رسوم الطلب', 'رسوم الوقود']);
    // DHL without basePrice on a line → DHL's priced lines (tax included) and the tax as "of which"
    const noNet = { ...q, breakdown: [q.breakdown[0], { ...q.breakdown[1], net: null }, q.breakdown[2]] };
    expect(chargeRows(noNet, 'en').rows.map((r) => r.amount)).toEqual([57.56, 0.69, 17.48]);
    expect(chargeRows(noNet, 'en')).toMatchObject({ tax: null, taxIncluded: 9.88, total: 75.73 });
    // no tax (international): DHL's lines; an unknown DHL charge keeps DHL's name
    const intl = { amount: 952.8, currency: 'SAR', taxTotal: 0, breakdown: [line('EXPRESS WORLDWIDE', null, 550.42, 0, 550.42, 'transportation'), line('GOGREEN PLUS - BASIC', 'FE', 52, 0, 52, 'gogreen'), line('REMOTE AREA DELIVERY', 'OO', 40, 0, 40, 'other')] };
    expect(chargeRows(intl, 'en').rows.map((r) => r.label)).toEqual(['Transportation Charges', 'Gogreen Plus - Basic', 'Remote Area Delivery']);
    expect(chargeRows(intl, 'ar').rows.map((r) => r.label)).toEqual(['أجور النقل', 'GoGreen', 'Remote Area Delivery']);
    expect(chargeRows(intl, 'en')).toMatchObject({ tax: null, taxIncluded: null, total: 952.8 });
  });

  it('Service: optional services only where DHL listed them for the product; DHL\'s charge once requested; one signature option; GoGreen from DHL only', () => {
    const quote = {
      currency: 'SAR',
      breakdown: [{ name: 'EXPRESS 12:00', serviceCode: null, typeCode: null, amount: 126.48, currency: 'SAR', category: 'transportation' as const, tax: 0, isCustomerAgreement: null }],
      optionalServices: ['SF', 'SD', 'NN', 'JD', 'LX', 'FT', 'II', 'HE', 'CT'].map((serviceCode) => ({ serviceCode, name: serviceCode, serviceTypeCode: 'XCH', isCustomerAgreement: false })),
    };
    // insurance (needs a value), dangerous goods and technical codes are DHL-listed but not offered here
    expect(optionalServiceRows(quote, [], 'en').map((r) => r.code)).toEqual(['FT', 'JD', 'LX', 'NN', 'SD', 'SF']);
    expect(optionalServiceRows({ ...quote, optionalServices: [{ serviceCode: 'NN', name: 'NEUTRAL DELIVERY', serviceTypeCode: 'XCH', isCustomerAgreement: false }] }, [], 'ar'))
      .toEqual([expect.objectContaining({ code: 'NN', name: 'تسليم محايد', selected: false, price: null })]);
    expect(optionalServiceRows(null, ['SF'])).toEqual([]);
    expect(optionalServiceRows({ ...quote, optionalServices: [] }, [])).toEqual([]);
    // requested → DHL prices it (and no longer lists it as unpriced)
    const priced = { ...quote, optionalServices: quote.optionalServices.filter((s) => s.serviceCode !== 'SF'), breakdown: [...quote.breakdown, { name: 'DIRECT SIGNATURE', serviceCode: 'SF', typeCode: 'XCH', amount: 25, currency: 'SAR', category: 'other' as const, tax: 0, isCustomerAgreement: false }] };
    expect(optionalServiceRows(priced, ['SF'], 'en').find((r) => r.code === 'SF')).toMatchObject({ selected: true, price: 25, currency: 'SAR', name: 'Direct Signature' });
    // a GoGreen charge DHL already applies by agreement: no second GoGreen choice
    const agreement = { ...quote, breakdown: [...quote.breakdown, { name: 'GOGREEN PLUS - CARBON REDUCED', serviceCode: 'FD', typeCode: 'SCH', amount: 3.12, currency: 'SAR', category: 'gogreen' as const, tax: 0, isCustomerAgreement: true }] };
    expect(optionalServiceRows(agreement, []).map((r) => r.code)).not.toContain('FT');
    expect(goGreenOf(agreement)).toMatchObject({ charged: { amount: 3.12 }, offered: true });
    expect(goGreenOf({ ...quote, optionalServices: [] })).toBeNull();
    // one signature option at a time; others stay
    expect(toggleOptionalService(['NN', 'SF'], 'SD')).toEqual(['NN', 'SD']);
    expect(toggleOptionalService(['NN', 'SD'], 'SD')).toEqual(['NN']);
    expect(toggleOptionalService(['WY'], 'JD')).toEqual(['WY', 'JD']);
  });

  it('Service: an optional service or the street line makes DHL\'s quote stale (Backend routeFingerprint)', () => {
    const f = { ...emptyForm(), shipper: saParty(), receiver: saParty() };
    const base = routeSnapshot(f);
    expect(routeSnapshot({ ...f, service_codes: ['SF'] })).not.toBe(base);
    expect(routeSnapshot({ ...f, receiver: { ...f.receiver, address_line1: '1 Other Road' } })).not.toBe(base);
    expect(routeSnapshot({ ...f, service_codes: ['WY'] })).toBe(base); // Paperless follows its own flag
  });

  it('Pickup: Reception / Front / Back / Other → DHL pickup.location (free text); a stored value comes back as its choice; only with «Yes — Schedule Pickup»', () => {
    const base = { ...emptyForm(), shipper: saParty(), receiver: saParty(), pickup_option: 'schedule' as const, pickup_earliest_time: '09:00', pickup_latest_time: '18:30' };
    expect(toContent({ ...base, pickup_location_choice: 'reception' }).pickup_location).toBe('Reception');
    expect(toContent({ ...base, pickup_location_choice: 'front' }).pickup_location).toBe('Front');
    expect(toContent({ ...base, pickup_location_choice: 'back', pickup_location: 'left over' }).pickup_location).toBe('Back');
    expect(toContent({ ...base, pickup_location_choice: 'other', pickup_location: '  Security gate 2 ' }).pickup_location).toBe('Security gate 2');
    expect(toContent({ ...base, pickup_location_choice: '' }).pickup_location).toBeNull();
    expect(toContent({ ...base, pickup_option: 'none', pickup_location_choice: 'reception', pickup_instructions: 'x' })).toMatchObject({ pickup_location: null, pickup_instructions: null, pickup_earliest_time: null, pickup_address: null });
    expect(toContent({ ...base, pickup_option: 'drop_off', pickup_location_choice: 'front' }).pickup_location).toBeNull();
    expect(pickupLocationIn('Reception')).toEqual({ pickup_location_choice: 'reception', pickup_location: '' });
    expect(pickupLocationIn('back')).toEqual({ pickup_location_choice: 'back', pickup_location: '' });
    expect(pickupLocationIn('Warehouse loading area')).toEqual({ pickup_location_choice: 'other', pickup_location: 'Warehouse loading area' });
    expect(pickupLocationIn(null)).toEqual({ pickup_location_choice: '', pickup_location: '' });
    // the alternate pickup address is its own object: the shipment's From never changes with it
    const alt = toContent({ ...base, pickup_other_address: true, pickup_address: { ...saParty(), city: 'Riyadh', address_line1: '1 Warehouse Road' } });
    expect(alt.pickup_address).toMatchObject({ city: 'Riyadh', address_line1: '1 Warehouse Road' });
    expect(alt.shipper).toMatchObject({ city: 'Dammam', address_line1: '3456 Prince Sultan Road' });
    expect(toContent({ ...base, pickup_other_address: false, pickup_address: { ...saParty(), city: 'Riyadh' } }).pickup_address).toBeNull();
  });

  it('Pickup: times inside DHL\'s window every 15 minutes; the gate checks the window, the order and Other\'s details (no invented minimum length)', () => {
    expect(pickupSlots('09:00:00', '10:00:00')).toEqual(['09:00', '09:15', '09:30', '09:45', '10:00']);
    expect(pickupSlots('09:10', '09:40')).toEqual(['09:10', '09:15', '09:30', '09:40']);
    expect(pickupSlots(null, '18:30')).toEqual([]);
    const cap = { pickupEarliest: '09:00:00', pickupLatest: '18:30:00' };
    const f = { ...emptyForm(), shipper: saParty(), pickup_option: 'schedule' as const, pickup_earliest_time: '09:00', pickup_latest_time: '18:30', pickup_location_choice: 'reception' as const };
    expect(pickupGate(f, cap, 'en')).toEqual({});
    expect(pickupGate({ ...f, pickup_earliest_time: '10:00', pickup_latest_time: '10:15' }, cap, 'en')).toEqual({}); // DHL decides any minimum
    expect(pickupGate({ ...f, pickup_earliest_time: '08:30' }, cap, 'en')).toEqual({ pickup_earliest_time: 'DHL picks up from 09:00 on this route.' });
    expect(pickupGate({ ...f, pickup_latest_time: '19:00' }, cap, 'en')).toEqual({ pickup_latest_time: 'DHL picks up until 18:30 on this route.' });
    expect(pickupGate({ ...f, pickup_earliest_time: '12:00', pickup_latest_time: '11:00' }, cap, 'en')).toEqual({ pickup_latest_time: 'The latest time must be after the earliest time.' });
    expect(pickupGate({ ...f, pickup_location_choice: 'other', pickup_location: ' ' }, cap, 'ar')).toEqual({ pickup_location: 'اكتب تفاصيل مكان الاستلام.' });
    expect(pickupGate({ ...f, pickup_location_choice: 'other', pickup_location: 'Gate 2' }, cap)).toEqual({});
    expect(pickupGate({ ...f, pickup_option: 'none', pickup_earliest_time: '' }, cap)).toEqual({});
    expect(pickupGate({ ...f, pickup_option: 'drop_off' }, cap, 'en')).toEqual({ service_point_id: 'Choose a DHL Service Point that accepts drop-off.' });
    expect(stepMissing({ ...f, pickup_location_choice: 'other' }, 'pickup', 'en')).toEqual(['Pickup location details']);
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
