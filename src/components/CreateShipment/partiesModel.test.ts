import { describe, expect, it } from 'vitest';
import type { LookupAddress } from '../../services/shippingContacts.service';
import { applyAddress, contactFieldsOf } from './partiesModel';
import { emptyParty, type PartyForm } from './wizardModel';

const addr = (over: Partial<LookupAddress> = {}): LookupAddress => ({
  address_line1: '350 5th Avenue', address_line2: null, short_address: null, building_number: '350', street: '5th Avenue', additional_number: null,
  district: 'Manhattan', city: 'New York', province: 'NY', province_name: 'New York', postal_code: '10118', country_code: 'US', ...over,
});
const SPL_KUDA: LookupAddress = {
  address_line1: '2519 Prince Mohammed Bin Fahd Road', address_line2: '7531 Al Faisaliyah Dist', short_address: 'KUDA2519', building_number: '2519',
  street: 'Prince Mohammed Bin Fahd Road', additional_number: '7531', district: 'Al Faisaliyah Dist', city: 'DAMMAM', province: 'EASTERN PROVINCE',
  province_name: 'EASTERN PROVINCE', postal_code: '32272', country_code: 'SA',
};
const filled = (country: string, over: Partial<PartyForm> = {}): PartyForm => ({
  ...emptyParty(country), address_line1: 'old 1', address_line2: 'old 2', suburb: 'old suburb', city: 'Old City', province: 'OLD', postal_code: '99999', ...over,
});

describe('applyAddress — a selected address fills every field it has, nothing stale', () => {
  it('Google (US): Address 1, Suburb, City, State code, Postal Code, Country; Address 2 / suburb from the old address are replaced', () => {
    expect(applyAddress(filled('US'), addr())).toMatchObject({
      address_line1: '350 5th Avenue', address_line2: '', suburb: 'Manhattan', city: 'New York', province: 'NY', postal_code: '10118', country_code: 'US',
    });
    expect(applyAddress(filled('US'), addr({ address_line2: 'Suite 5' })).address_line2).toBe('Suite 5');
  });

  it('Google left a field out: City / State / Postal Code stay within the same country; a different country never keeps them', () => {
    expect(applyAddress(filled('US'), addr({ postal_code: null, province: null }))).toMatchObject({ postal_code: '99999', province: 'OLD', city: 'New York' });
    const moved = applyAddress(filled('EG'), addr({ postal_code: null, country_code: 'US' }));
    expect(moved).toMatchObject({ country_code: 'US', postal_code: '', city: 'New York' });
    expect(moved.phones[0].code).toBe('1');
  });

  it('SPL National Address (authoritative): every field replaced, short address + National Address parts kept, phone code 966', () => {
    const p = applyAddress({ ...filled('SA'), short_address: 'OLDA1111', phones: [{ type: 'mobile', code: '', number: '', extension: '', sms: false }] }, SPL_KUDA, true);
    expect(p).toMatchObject({
      address_line1: '2519 Prince Mohammed Bin Fahd Road', address_line2: '7531 Al Faisaliyah Dist', short_address: 'KUDA2519', suburb: 'Al Faisaliyah Dist',
      city: 'DAMMAM', province: 'EASTERN PROVINCE', postal_code: '32272', country_code: 'SA',
      na: { building_number: '2519', street: 'Prince Mohammed Bin Fahd Road', additional_number: '7531', district: 'Al Faisaliyah Dist', short_address: 'KUDA2519' },
    });
    expect(p.phones[0].code).toBe('966');
    // an SPL answer without a postal code never keeps the old one
    expect(applyAddress(filled('SA'), { ...SPL_KUDA, postal_code: null }, true).postal_code).toBe('');
  });

  it('a Google address in Saudi Arabia drops the old short address (it no longer matches)', () => {
    const p = applyAddress(filled('SA', { short_address: 'KUDA2519' }), addr({ country_code: 'SA', province: 'Eastern Province', city: 'Khobar', postal_code: '34421' }));
    expect(p.short_address).toBe('');
    expect(p.na.short_address).toBe('');
  });
});

describe('contactFieldsOf — the Saudi National Address parts are saved only while the lines still match them', () => {
  it('kept after an SPL selection; dropped once Address 1 / Address 2 are edited by hand; never outside SA', () => {
    const p = applyAddress({ ...emptyParty('SA'), contact: 'Omar' }, SPL_KUDA, true);
    expect(contactFieldsOf(p)).toMatchObject({ building_number: '2519', street: 'Prince Mohammed Bin Fahd Road', additional_number: '7531', short_address: 'KUDA2519', suburb: 'Al Faisaliyah Dist' });
    expect(contactFieldsOf({ ...p, address_line1: '1111 Other Street', address_line2: '2222 Other Dist' })).toMatchObject({ building_number: null, street: null, additional_number: null });
    expect(contactFieldsOf(applyAddress({ ...emptyParty('US'), contact: 'X' }, addr()))).toMatchObject({ building_number: null, street: null, additional_number: null, short_address: null });
  });
});
