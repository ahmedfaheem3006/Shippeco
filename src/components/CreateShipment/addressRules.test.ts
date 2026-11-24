import { describe, expect, it } from 'vitest';
import { citySecondary, postalFormatIssue, postalLookupCode, postalRule, subdivisionName } from './addressRules';
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

describe('country-aware postal rules', () => {
  it('US: a complete 5-digit ZIP or ZIP+4 is looked up by its 5 digits; anything incomplete is never sent', () => {
    expect(postalLookupCode('US', '48126')).toBe('48126');
    expect(postalLookupCode('US', '48126-1234')).toBe('48126');
    expect(postalLookupCode('US', '481261234')).toBe('48126');
    expect(postalLookupCode('us', ' 48126 ')).toBe('48126');
    for (const bad of ['', '4812', '48126-', '48126-12', '481266', 'ABCDE']) expect([bad, postalLookupCode('US', bad)]).toEqual([bad, null]);
  });
  it('other countries: no lookup is pretended (even for a well-formed code); unknown countries have no rule', () => {
    for (const [cc, code] of [['SA', '32256'], ['EG', '11511'], ['GB', 'SW1A 1AA'], ['CA', 'K1A 0B1']]) {
      expect(postalRule(cc)?.lookup).toBe(false);
      expect(postalLookupCode(cc, code)).toBeNull();
      expect(postalFormatIssue(cc, code)).toBeNull();
    }
    expect(postalRule('AE')).toBeNull();
    expect(postalFormatIssue('AE', 'anything')).toBeNull();
  });
  it('format notes and typing filters', () => {
    expect(postalFormatIssue('US', '4812')?.[1]).toBe('5 digits or ZIP+4, e.g. 48126 or 48126-1234');
    expect(postalFormatIssue('US', '')).toBeNull();
    expect(postalFormatIssue('SA', '322')?.[1]).toBe('5 digits, e.g. 32256');
    expect(postalRule('US')!.sanitize!('48126-12ab34')).toBe('48126-1234');
    expect(postalRule('SA')!.sanitize!('32 256 9')).toBe('32256');
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
