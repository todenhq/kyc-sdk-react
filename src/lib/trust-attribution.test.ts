import { describe, expect, it } from 'vitest';
import { effectiveTrustAttribution, myazaProviderName, needsProcessorDisclosure } from './trust-attribution';
import { DEFAULT_TEXTS } from '../i18n/catalogue';
import { CUSTOMISABLE_KEYS } from '../i18n/customisable';

describe('trust attribution authority', () => {
  const custom = { mode: 'custom', logo: 'https://example.com/logo.png', companyName: 'Acme' } as const;

  it('ignores draft attribution outside preview mode', () => {
    expect(effectiveTrustAttribution(undefined, custom, false)).toBeUndefined();
    expect(effectiveTrustAttribution({ mode: 'myaza' }, custom, undefined)).toEqual({ mode: 'myaza' });
    expect(effectiveTrustAttribution(custom, { mode: 'myaza' }, false)).toBe(custom);
  });

  it('reflects draft changes only inside the write-free preview', () => {
    expect(effectiveTrustAttribution({ mode: 'myaza' }, custom, true)).toBe(custom);
    expect(effectiveTrustAttribution(custom, { mode: 'myaza' }, true)).toEqual({ mode: 'myaza' });
    expect(effectiveTrustAttribution(custom, undefined, true)).toBe(custom);
  });
});

describe('naming Toden on the consent screen', () => {
  it('happens once the org replaces the footer logo, and never otherwise', () => {
    expect(needsProcessorDisclosure({ mode: 'custom', logo: 'https://x/logo.png' })).toBe(true);
    expect(needsProcessorDisclosure({ mode: 'myaza' })).toBe(false);
    expect(needsProcessorDisclosure(undefined)).toBe(false);
  });

  it("names the organisation, preferring the server's name over a sample preview name", () => {
    const custom = { mode: 'custom', logo: 'x', companyName: 'Acme Bank' } as const;
    expect(myazaProviderName(custom, 'Acme', 'Northwind Bank')).toBe('Acme Bank');
    expect(myazaProviderName({ mode: 'custom', logo: 'x' }, 'Acme', 'Northwind Bank')).toBe('Acme');
    expect(myazaProviderName({ mode: 'custom', logo: 'x' }, undefined, undefined)).toBe('');
  });

  it('is fixed wording in one paragraph that names Toden and its terms', () => {
    for (const key of ['welcome.legal.providedFor', 'welcome.legal.myaza', 'welcome.legal.myaza.business']) {
      expect(CUSTOMISABLE_KEYS.has(key)).toBe(false);
    }
    expect(DEFAULT_TEXTS['welcome.legal.providedFor']).toBe('Verification is processed by Toden for {org}.');
    expect(DEFAULT_TEXTS['welcome.legal.myaza']).toMatch(/Toden’s \{terms\} and \{privacy\}/);
  });
});
