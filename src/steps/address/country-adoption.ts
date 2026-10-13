// ---------------------------------------------------------------------------
// Declared-country adoption.
//
// ONE table decides when evidence about where the applicant IS may change the
// country they are DECLARING: a reverse-geocoded pin or current-location fix
// (a geocode), or the address they picked from search (explicit). Mirrored by
// the RN SDK's lib/country-adoption.ts and Flutter's
// config/country_adoption.dart; the three run the shared vectors in
// sdk-flutter/test/country_adoption_vectors.json, so a drift in any one
// fails there.
//
// The rules, and why each exists:
//  - GEOCODED EVIDENCE outranks every GUESS. The address scope's default is
//    the IP country, and on a dev box that once declared US while the device
//    sat in Calabar (the search returned California), so the fix's own
//    geocode corrects a guess the moment it resolves.
//  - An EXPLICIT declaration is never overridden by a geocode; a PICKED
//    address replaces even that, since the pick is the applicant's newer and
//    more specific statement, and is then itself explicit.
//  - Outside the address scope `selectedCountry` is the ID-VERIFICATION
//    country, and SET_COUNTRY resets the ID choice (and a part-walked
//    multi-ID run), so only a guessed value is ever corrected there, picked
//    address or not. Before this rule an address picked after ID capture on
//    a full flow could wipe that capture.
//  - The org's accepted list (proofOfAddress.countries) gates every path: a
//    value the submission gate would refuse never becomes the declaration.
// ---------------------------------------------------------------------------

const ISO2 = /^[A-Z]{2}$/;

/** A trimmed, upper-cased ISO-2, or null for anything that is not one. */
export function normaliseIso2(raw: string | null | undefined): string | null {
  const code = raw?.trim().toUpperCase();
  return code && ISO2.test(code) ? code : null;
}

/** Whether the org's accepted-country list admits `code`. Null or empty
 *  accepts everyone. */
export function countryAccepted(accepted: readonly string[] | null | undefined, code: string): boolean {
  if (!accepted?.length) return true;
  return accepted.some((c) => c.trim().toUpperCase() === code);
}

export interface AdoptionInput {
  /** The country the evidence named (a geocode's `parts.country`, a pick's own). */
  country: string | null | undefined;
  selectedCountry: string | null | undefined;
  countryAutoPicked: boolean;
  /** The workflow scope; null is a full verification. */
  scope: string | null | undefined;
  accepted: readonly string[] | null | undefined;
  /** The country came from an address the applicant PICKED. */
  explicit?: boolean;
}

export interface CountryAdoption {
  /** The normalised ISO-2 to declare. */
  country: string;
  /** Declare it as a GUESS (later evidence may correct it) rather than as
   *  the applicant's own explicit statement. */
  auto: boolean;
}

/** The adoption rule. See the file header for what each guard is for. */
export function adoptionDecision(input: AdoptionInput): CountryAdoption | null {
  const code = normaliseIso2(input.country);
  if (!code) return null;
  const onAddressScope = input.scope === 'address';
  const guessed = input.countryAutoPicked || (onAddressScope && input.selectedCountry == null);
  if (!guessed && !(input.explicit && onAddressScope)) return null;
  if (code === normaliseIso2(input.selectedCountry)) return null;
  if (!countryAccepted(input.accepted, code)) return null;
  return { country: code, auto: !input.explicit };
}

/**
 * The address scope's default: the visitor's IP country, once, while nothing
 * is declared, and only when the accepted list admits it. A full flow never
 * defaults from the IP (there the country is the ID's).
 */
export function geoDefaultCountry(input: {
  geoCountry: string | null | undefined;
  selectedCountry: string | null | undefined;
  scope: string | null | undefined;
  accepted: readonly string[] | null | undefined;
}): string | null {
  if (input.scope !== 'address' || input.selectedCountry != null) return null;
  const code = normaliseIso2(input.geoCountry);
  if (!code || !countryAccepted(input.accepted, code)) return null;
  return code;
}
