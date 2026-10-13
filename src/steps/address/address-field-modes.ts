import type { AddressCollectionConfig } from '../../types/config';
import type { VerificationState } from '../../context/types';
import { defaultText } from '../../i18n/translate';
import type { TextFn } from '../../i18n/types';

// Per-field modes for the typed details-sheet fields — the CLIENT MIRROR of
// the server's lib/workflows/address-fields.ts (kyc-core). Keep the
// resolution rule in lockstep: the legacy propertyFields group switch is the
// default for every typed field, propertyFields 'required' requires the
// house/flat NUMBER, and fields.<key> overrides per key.

export const ADDRESS_FIELD_KEYS = [
  'propertyName',
  'propertyNumber',
  'street',
  'unit',
  'neighbourhood',
  'city',
  'state',
  'postcode',
] as const;
export type AddressFieldKey = (typeof ADDRESS_FIELD_KEYS)[number];
export type AddressFieldMode = 'off' | 'optional' | 'required';

export const ADDRESS_FIELD_LABELS: Record<AddressFieldKey, string> = {
  propertyName: 'Building name',
  propertyNumber: 'House or flat number',
  street: 'Street name',
  unit: 'Unit',
  neighbourhood: 'Neighbourhood',
  city: 'City',
  state: 'State',
  postcode: 'Area code',
};

/** A field's name as it reads inside the "This flow needs: …" error list. */
export function addressFieldName(key: AddressFieldKey, t: TextFn = defaultText): string {
  return t(`address.fieldName.${key}`);
}

/** The "This flow needs: …" error for the fields still missing. */
export function missingAddressFieldsMessage(keys: readonly AddressFieldKey[], t: TextFn = defaultText): string {
  return t('address.missingFields', { fields: keys.map((k) => addressFieldName(k, t)).join(', ') });
}

const MODES: readonly string[] = ['off', 'optional', 'required'];
function isAddressFieldMode(value: unknown): value is AddressFieldMode {
  return typeof value === 'string' && MODES.includes(value);
}

export function addressFieldModes(
  config: AddressCollectionConfig | undefined,
): Record<AddressFieldKey, AddressFieldMode> {
  const group = config?.propertyFields ?? 'optional';
  const modes = {} as Record<AddressFieldKey, AddressFieldMode>;
  for (const key of ADDRESS_FIELD_KEYS) {
    const fallback: AddressFieldMode =
      group === 'off' ? 'off' : group === 'required' && key === 'propertyNumber' ? 'required' : 'optional';
    // An override outside the vocabulary falls back rather than being taken
    // literally: the server validates writes, the client validates reads.
    const override = config?.fields?.[key];
    modes[key] = isAddressFieldMode(override) ? override : fallback;
  }
  return modes;
}

type Address = NonNullable<VerificationState['address']>;

/** Which map-prefill part fills each field while untouched (the sheet's own
 *  `shown` rule). Property name/number and unit have no prefill — the
 *  applicant alone can know them. */
const PART_OF: Partial<Record<AddressFieldKey, 'street' | 'area' | 'city' | 'state' | 'postcode'>> = {
  street: 'street',
  neighbourhood: 'area',
  city: 'city',
  state: 'state',
  postcode: 'postcode',
};

/** The value the sheet DISPLAYS for a field: typed wins (a cleared field
 *  stays cleared), else the map's prefill. */
export function displayedAddressValue(key: AddressFieldKey, address: Address): string {
  const typed = (address[key] as string | undefined)?.trim();
  if (typed !== undefined) return typed;
  const part = PART_OF[key];
  return (part ? address.parts?.[part] : null)?.trim() ?? '';
}

/** Required fields whose DISPLAYED value is blank — what blocks Continue. */
export function missingRequiredAddressFields(
  config: AddressCollectionConfig | undefined,
  address: Address | null,
): AddressFieldKey[] {
  if (!address) return [];
  const modes = addressFieldModes(config);
  return ADDRESS_FIELD_KEYS.filter(
    (key) => modes[key] === 'required' && displayedAddressValue(key, address) === '',
  );
}

/**
 * The map-prefill values a REQUIRED field rides to the server when the
 * applicant left it untouched: they saw it filled and confirmed it by
 * continuing, so the wire must carry it — the server 422s a required field
 * that never arrives. Typed values are absent here on purpose (the normal
 * assembly already sends them), so spreading this LAST overrides nothing.
 */
export function requiredPrefillSubmission(
  config: AddressCollectionConfig | undefined,
  address: Address,
): Partial<Record<AddressFieldKey, string>> {
  const modes = addressFieldModes(config);
  const out: Partial<Record<AddressFieldKey, string>> = {};
  for (const key of ADDRESS_FIELD_KEYS) {
    if (modes[key] !== 'required') continue;
    const typed = (address[key] as string | undefined)?.trim();
    if (typed) continue;
    const displayed = displayedAddressValue(key, address);
    if (displayed) out[key] = displayed;
  }
  return out;
}
