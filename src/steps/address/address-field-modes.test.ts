import { describe, expect, it } from 'vitest';
import { describeInMonorepo, sharedVectors } from '../../__tests__/monorepo';
import {
  addressFieldModes,
  displayedAddressValue,
  missingRequiredAddressFields,
  requiredPrefillSubmission,
  type AddressFieldKey,
} from './address-field-modes';
import type { AddressCollectionConfig } from '../../types/config';
import type { VerificationState } from '../../context/types';

// LOCKSTEP with the server's lib/workflows/address-fields.ts (kyc-core) —
// the resolution rule must agree or the SDK gates what the server accepts.
// The RN and Flutter mirrors replay the SAME vector file below, so a rule
// changed in one mirror fails in all three.

type Address = NonNullable<VerificationState['address']>;
const address = (over: Partial<Address> = {}): Address =>
  ({
    lat: 4.94,
    lng: 8.33,
    propertyName: '',
    propertyNumber: '',
    directions: '',
    parts: { street: 'Bassey Street', area: 'Idim Ita', city: 'Calabar', state: 'Cross River', postcode: '540281', country: 'NG' },
    ...over,
  }) as Address;

describe('addressFieldModes (server-mirror)', () => {
  it('propertyFields required requires the NUMBER only', () => {
    const modes = addressFieldModes({ propertyFields: 'required' });
    expect(modes.propertyNumber).toBe('required');
    expect(modes.propertyName).toBe('optional');
  });
  it('fields overrides beat the group default', () => {
    const modes = addressFieldModes({ propertyFields: 'off', fields: { city: 'required' } });
    expect(modes.city).toBe('required');
    expect(modes.street).toBe('off');
  });
});

describe('displayed values and the required gate', () => {
  it('a required field showing its map prefill is NOT missing', () => {
    expect(displayedAddressValue('city', address())).toBe('Calabar');
    expect(missingRequiredAddressFields({ fields: { city: 'required' } }, address())).toEqual([]);
  });
  it('a required field with no typed value and no prefill blocks', () => {
    expect(
      missingRequiredAddressFields({ propertyFields: 'required' }, address()),
    ).toEqual(['propertyNumber']);
  });
  it('a deliberately CLEARED prefill counts as missing', () => {
    expect(
      missingRequiredAddressFields({ fields: { city: 'required' } }, address({ city: '' })),
    ).toEqual(['city']);
  });
});

describe('requiredPrefillSubmission', () => {
  it('carries the displayed prefill for required untouched fields only', () => {
    const out = requiredPrefillSubmission(
      { fields: { city: 'required', state: 'required', street: 'optional' } },
      address({ state: 'Cross River State' }), // typed state — not included
    );
    expect(out).toEqual({ city: 'Calabar' });
  });
});

// ─── The shared vectors (sdk-flutter/test/address_field_modes_vectors.json)
interface Vector {
  name: string;
  config: AddressCollectionConfig | null;
  typed: Record<string, string>;
  expectModes: Record<string, string>;
  expectMissing: string[];
  expectPrefill: Record<string, string>;
}
const shared = sharedVectors<{ address: Record<string, unknown>; vectors: Vector[] }>(
  'sdk-flutter/test/address_field_modes_vectors.json',
  { address: {}, vectors: [] },
);

describeInMonorepo('shared vectors (web mirror)', () => {
  for (const v of shared.vectors) {
    it(v.name, () => {
      const addr = { ...shared.address, ...v.typed } as unknown as Address;
      const modes = addressFieldModes(v.config ?? undefined);
      for (const [key, mode] of Object.entries(v.expectModes)) {
        expect(modes[key as AddressFieldKey]).toBe(mode);
      }
      expect(missingRequiredAddressFields(v.config ?? undefined, addr)).toEqual(v.expectMissing);
      expect(requiredPrefillSubmission(v.config ?? undefined, addr)).toEqual(v.expectPrefill);
    });
  }
});
