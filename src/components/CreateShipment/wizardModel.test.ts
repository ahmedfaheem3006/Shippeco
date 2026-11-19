import { describe, expect, it } from 'vitest';
import {
  emptyForm, emptyItem, emptyPackage, emptyParty, fromShipment, groupPieces, isOriginWeekend, issuesToErrors, itemTotals, locateIssue, needsCustoms, nextBusinessDay,
  packageTotals, routeIssuesText, routeSnapshot, stepMissing, toContent, translateIssue, visibleSteps, type WizardForm,
} from './wizardModel';
import { canShipment } from '../../utils/dhlShipmentPermissions';

const saParty = () => ({
  ...emptyParty('SA'), contact: 'Sara Operations', company: 'Shippec Trading', phone: '+966551234567', city: 'Dammam', postal_code: '31952',
  na: { building_number: '3456', street: 'Prince Sultan Road', additional_number: '7788', district: 'Al Olaya', short_address: 'ROLA3456' },
});
const usParty = () => ({ ...emptyParty('US'), use_na: false, contact: 'John Smith', company: 'ACME', phone: '+13025550100', city: 'Newark', postal_code: '19711', province: 'DE', address_line1: '742 Test Lane' });
const intlGoods = (): WizardForm => ({
  ...emptyForm(), content_kind: 'goods', shipper: usParty(), receiver: saParty(), content_description: 'Cotton T-shirts', shipment_purpose: 'gift',
  items: [{ ...emptyItem(), description: 'T-shirt', quantity: '2', unit_value: '10', country_of_origin: 'CN', outbound_hs_code: '6109.10', inbound_hs_code: '6109.10', unit_net_weight_kg: '0.2', gross_weight_kg: '0.5' }],
  packages: [{ weight_kg: '0.5', length_cm: '30', width_cm: '20', height_cm: '5', quantity: '1' }],
});

describe('wizard model', () => {
  it('Saudi National Address parts are sent as national_address; other countries as lines', () => {
    const c = toContent({ ...emptyForm(), shipper: saParty(), receiver: usParty() });
    expect(c.shipper).toMatchObject({ national_address: { building_number: '3456', street: 'Prince Sultan Road', additional_number: '7788', district: 'Al Olaya', short_address: 'ROLA3456' } });
    expect((c.shipper as any).address_line1).toBeUndefined();
    expect(c.receiver).toMatchObject({ address_line1: '742 Test Lane', province: 'DE', country_code: 'US' });
    // incomplete NA parts go out as lines so the Backend names what is missing
    const partial = toContent({ ...emptyForm(), shipper: { ...saParty(), na: { ...saParty().na, district: '' } } });
    expect(partial.shipper).toMatchObject({ address_line1: '3456, Prince Sultan Road', address_line2: '7788' });
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

  it('a stored shipment comes back as the same form (National Address parsed from the lines)', () => {
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
    expect(f.receiver).toMatchObject({ use_na: true, type: 'private', na: { building_number: '3456', street: 'Prince Sultan Road', additional_number: '7788', district: 'Al Olaya', short_address: 'ROLA3456' } });
    expect(f.shipper).toMatchObject({ use_na: false, address_line1: '742 Test Lane', province: 'DE' });
    expect(f.items[0]).toMatchObject({ unit_value: '10', gross_mode: 'line', gross_weight_kg: '0.5' });
  });

  it('Backend issue paths land on the right step and field; common rules are shown in Arabic', () => {
    expect(locateIssue('receiver.cityName')).toEqual({ step: 'parties', key: 'receiver.city' });
    expect(locateIssue('customerDetails.shipperDetails.postalAddress.addressLine1')).toEqual({ step: 'parties', key: 'shipper.address_line1' });
    expect(locateIssue('items[2].country_of_origin')).toEqual({ step: 'customs', key: 'items.1.country_of_origin' });
    expect(locateIssue('customs.lineItems[1].hsCode')).toEqual({ step: 'customs', key: 'items.0.outbound_hs_code' });
    expect(locateIssue('packages[1]')).toEqual({ step: 'packages', key: 'packages.0' });
    expect(locateIssue('incoterm')).toEqual({ step: 'payment', key: 'incoterm' });
    expect(locateIssue('pickup_latest_time')).toEqual({ step: 'pickup', key: 'pickup_latest_time' });
    expect(locateIssue('dhl')).toEqual({ step: 'service', key: 'dhl' });
    const { errors, byStep } = issuesToErrors([{ field: 'receiver.phone', message: 'Phone number is required' }, { field: 'items[1].country_of_origin', message: 'Country of manufacture is required' }]);
    expect(errors['receiver.phone']).toBe('حقل مطلوب');
    expect(errors['items.0.country_of_origin']).toBe('حقل مطلوب');
    expect(byStep).toEqual({ parties: 1, customs: 1 });
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
  });
});
