import { describe, expect, it } from 'vitest';
import { adoptionDecision, geoDefaultCountry } from './country-adoption';
import { describeInMonorepo, sharedVectors } from '../../__tests__/monorepo';

// ─── The shared vectors (sdk-flutter/test/country_adoption_vectors.json)
//
// One rule decides when a geocode or a picked address may change the declared
// country, on all three SDKs. The vectors are the one place it is written
// down as data; the RN and Flutter mirrors run the same file.

interface AdoptionVector {
  name: string;
  input: {
    country: string | null;
    selectedCountry: string | null;
    countryAutoPicked: boolean;
    scope: string | null;
    accepted: string[] | null;
    explicit: boolean;
  };
  expect: 'set' | 'set-auto' | null;
}
interface GeoVector {
  name: string;
  input: { geoCountry: string | null; selectedCountry: string | null; scope: string | null; accepted: string[] | null };
  expect: string | null;
}

const shared = sharedVectors<{ adoption: AdoptionVector[]; geoDefault: GeoVector[] }>(
  'sdk-flutter/test/country_adoption_vectors.json',
  { adoption: [], geoDefault: [] },
);

describeInMonorepo('adoptionDecision (shared vectors, web mirror)', () => {
  for (const v of shared.adoption) {
    it(v.name, () => {
      const decision = adoptionDecision(v.input);
      const label = decision === null ? null : decision.auto ? 'set-auto' : 'set';
      expect(label).toBe(v.expect);
      if (decision) expect(decision.country).toMatch(/^[A-Z]{2}$/);
    });
  }
});

describeInMonorepo('geoDefaultCountry (shared vectors, web mirror)', () => {
  for (const v of shared.geoDefault) {
    it(v.name, () => {
      expect(geoDefaultCountry(v.input)).toBe(v.expect);
    });
  }
});
