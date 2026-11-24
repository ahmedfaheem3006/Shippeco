import { describe, expect, it } from 'vitest';
import { citySecondary, subdivisionName } from './addressRules';
import { applyCity } from './partiesModel';
import { emptyParty } from './wizardModel';

describe('state / province names (the code is sent, the name is shown)', () => {
  it('US / CA / AU codes → names; unknown code or another country → null', () => {
    expect(subdivisionName('US', 'MI')).toBe('Michigan');
    expect(subdivisionName('us', ' ny ')).toBe('New York');
    expect(subdivisionName('CA', 'QC')).toBe('Quebec');
    expect(subdivisionName('AU', 'NSW')).toBe('New South Wales');
    expect(subdivisionName('US', 'Michigan')).toBeNull();
    expect(subdivisionName('EG', 'C')).toBeNull();
    expect(subdivisionName('US', '')).toBeNull();
  });

  it('city secondary line: the state code expanded, the country as SHIPPEC names it; other text untouched', () => {
    expect(citySecondary('MI, USA', 'US')).toBe('Michigan, United States of America');
    expect(citySecondary('Cairo Governorate, Egypt', 'EG')).toBe('Cairo Governorate, Egypt');
    expect(citySecondary('ON, Canada', 'CA')).toBe('Ontario, Canada');
    expect(citySecondary('', 'US')).toBe('United States of America');
  });
});

describe('applyCity — City + State from a city suggestion', () => {
  const addr = (over: Record<string, unknown> = {}) => ({
    address_line1: null, address_line2: null, short_address: null, building_number: null, street: null, additional_number: null,
    district: null, city: 'Dearborn', province: 'MI', postal_code: null, country_code: 'US', ...over,
  });
  it('fills City + State, keeps the postal code and the address lines, replaces an older state', () => {
    const p = { ...emptyParty('US'), address_line1: '13051 Osborne St', postal_code: '48126', province: 'CA', city: 'Dear' };
    expect(applyCity(p, addr(), 'Dearborn')).toMatchObject({ city: 'Dearborn', province: 'MI', postal_code: '48126', address_line1: '13051 Osborne St', country_code: 'US' });
  });
  it('no state from Google → the State is emptied (never stale); no city → the suggestion text', () => {
    const p = { ...emptyParty('SG'), province: 'Old' };
    expect(applyCity(p, addr({ city: null, province: null, country_code: 'SG' }), 'Singapore')).toMatchObject({ city: 'Singapore', province: '' });
  });
});
