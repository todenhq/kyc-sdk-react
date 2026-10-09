import type { SupportingDocumentsConfig } from '../types/config';

// Which supporting documents this flow asks for, given the ID the person
// actually verified with.
//
// MIRROR of the server's `requestedSupportingDocuments`
// (kyc-core src/lib/workflows/supporting-documents-config.ts). The server
// VALIDATES what the client produced, so a client that resolved differently
// just builds submissions the server refuses — keep the two in lockstep.
//
// There is no catalogue to mirror: a document is whatever the ORG named it, so
// the SDK renders the title and guidance the workflow sent rather than
// captioning a key it recognises.

export interface RequestedSupportingDocument {
  key: string;
  label: string;
  /** Guidance under the slot, when the author wrote some. */
  description: string | null;
  required: boolean;
  /**
   * The named values the server will read off this document, in the author's
   * own words. Shown to the applicant so an upload says what it is being taken
   * for rather than being a bare slot.
   *
   * DISPLAY ONLY, and deliberately not a mirror of the server's field
   * resolution: it drops blanks and repeats and stops there. The server
   * decides what is actually read, and an extra name on a chip costs an
   * applicant nothing.
   */
  reads: string[];
  /** How it is provided: uploaded, signed on screen, or either. */
  capture: 'upload' | 'draw' | 'draw_or_upload';
}

/** The names on one document's fields: what the applicant is told we read. */
function documentReads(fields: Array<{ label?: string }> | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const field of fields ?? []) {
    const label = field.label?.trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
  }
  return out;
}

/** `${country}/${idType}` — the composite a document's `idTypes` is written in. */
export function idComposite(country: string, idType: string): string {
  return `${country.trim().toUpperCase()}/${idType.trim()}`;
}

/**
 * The documents to ask for. `verifiedIds` are `"CC/idType"` composites: one for
 * an ordinary submission, one per committed slot on a multi-ID run.
 *
 * An empty result means the step does not render — which is the point of the
 * per-document scoping. A document that exists only because the person used a
 * particular ID must not be put in front of somebody who used another.
 */
export function resolveSupportingDocuments(
  config: SupportingDocumentsConfig | undefined | null,
  verifiedIds: string[],
): RequestedSupportingDocument[] {
  if (!config?.enabled) return [];
  const wanted = new Set(verifiedIds.map((id) => id.toUpperCase()));
  const seen = new Set<string>();
  const out: RequestedSupportingDocument[] = [];
  for (const entry of config.types ?? []) {
    const label = entry.label?.trim();
    // A nameless slot reaches nobody: the applicant cannot be asked for a
    // document the screen cannot name. Publish refuses one, so this only ever
    // bites the builder preview mid-edit.
    if (!label) continue;
    const scoped = entry.idTypes && entry.idTypes.length > 0;
    // Unset = every ID, the platform's standing idiom.
    const inScope =
      !scoped || entry.idTypes!.some((id) => wanted.has(id.trim().toUpperCase()));
    // `alwaysAsk` keeps the slot on screen for everybody, so the scope decides
    // only who must fill it: an out-of-scope applicant may hand the document
    // over and is never blocked for not having one.
    if (!inScope && entry.alwaysAsk !== true) continue;
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push({
      key: entry.key,
      label,
      description: entry.description?.trim() || null,
      required: entry.required === true && inScope,
      reads: documentReads(entry.fields),
      // An unknown mode from a newer workflow degrades to the upload slot.
      capture: entry.capture === 'draw' || entry.capture === 'draw_or_upload' ? entry.capture : 'upload',
    });
  }
  return out;
}

/** The composites this attempt has committed — one per ID, multi-ID included. */
export function verifiedIdsFor(input: {
  country: string | null | undefined;
  idType: string | null | undefined;
  multiIdSlots?: Array<{ idType: string }>;
}): string[] {
  const country = input.country;
  if (!country) return [];
  const slots = input.multiIdSlots ?? [];
  const ids = slots.length > 0 ? slots.map((s) => s.idType) : input.idType ? [input.idType] : [];
  return [...new Set(ids.map((id) => idComposite(country, id)))];
}

/**
 * Whether the flow may ask for a supporting document AT ALL.
 *
 * The CONSENT screen's question, deliberately not the step order's.
 * `hasSupportingDocumentsStep` resolves against the VERIFIED IDS, and consent
 * runs before an ID is picked — so every SCOPED document answers "nothing to
 * ask for" there, and a slip scoped to one ID (the commonest case there is)
 * would go undisclosed.
 *
 * Consent is a DISCLOSURE of what MAY be collected: an applicant seeing a
 * bullet for paperwork they are never asked for is the cheap error, and being
 * asked for undisclosed paperwork is the real one.
 *
 * Still not a raw field check — a disabled step and a nameless entry each
 * promise nothing, the same two gates the resolver applies.
 */
export function mayAskSupportingDocuments(
  config: SupportingDocumentsConfig | undefined | null,
): boolean {
  if (!config?.enabled) return false;
  return (config.types ?? []).some((entry) => (entry.label ?? '').trim().length > 0);
}

/** Whether the step has anything to ask for on this attempt. */
export function hasSupportingDocumentsStep(
  config: SupportingDocumentsConfig | undefined | null,
  verifiedIds: string[],
): boolean {
  return resolveSupportingDocuments(config, verifiedIds).length > 0;
}

/**
 * The verified-ID composites for the attempt in flight, read the same way by
 * every step that resolves the chain. One reader, so two screens can never
 * disagree about whether the step exists.
 */
export function verifiedIdsFromState(
  state: {
    selectedCountry?: string | null;
    selectedIdType?: string | null;
    multiIdSlots?: Array<{ idType: string }>;
  },
  config: { country?: string | null },
): string[] {
  return verifiedIdsFor({
    country: state.selectedCountry ?? config.country,
    idType: state.selectedIdType,
    multiIdSlots: state.multiIdSlots,
  });
}
