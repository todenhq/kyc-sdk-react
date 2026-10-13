import type { VerificationStep } from '../../types/config';

// The address flow as REAL steps (user decision 2026-08-29 — the progress bar
// advances through them and back/forward is ordinary step navigation, not a
// machine hidden inside one step): find it (search) → confirm it (pin, with
// the details sheet) → show it (entrance: Street View first, photo fallback)
// → commit it (review + attest fix). KYB keeps the single premises step —
// its pin + directions ARE the capture, and the flow already has its own
// section rhythm.
//
// 'address-collection' is the PIN step and keeps the original wire name, so
// session progress saved by older builds restores cleanly and the server's
// step-log titles stay meaningful.

export interface AddressFlowOptions {
  /** A search backend is available AND we are not in builder preview. */
  searchAvailable: boolean;
  /** The entrance-photo mode ('off' hides that capture). */
  photoMode: 'off' | 'optional' | 'required';
  /** Street View framing is offered (workflow on + browser key in-document). */
  streetViewOffered: boolean;
}

/** The individual flow's address steps, in order. */
export function addressFlowSteps(o: AddressFlowOptions): VerificationStep[] {
  const steps: VerificationStep[] = [];
  if (o.searchAvailable) steps.push('address-search');
  steps.push('address-collection');
  if (o.photoMode !== 'off' || o.streetViewOffered) steps.push('address-entrance');
  steps.push('address-review');
  return steps;
}

export function nextAddressStep(steps: VerificationStep[], current: VerificationStep): VerificationStep | null {
  const i = steps.indexOf(current);
  return i >= 0 && i + 1 < steps.length ? steps[i + 1]! : null;
}

export function prevAddressStep(steps: VerificationStep[], current: VerificationStep): VerificationStep | null {
  const i = steps.indexOf(current);
  return i > 0 ? steps[i - 1]! : null;
}

/**
 * Whether the address flow's VENDOR surfaces are stubbed: the builder preview
 * and SANDBOX keys (user decision 2026-09-03 — sandbox mirrors the preview
 * treatment: placeholder map, canned labels, no search or Street View loads;
 * its server verdicts are canned anyway, so a live map on test traffic was
 * theatre that spent real geocoder quota). DEVELOPMENT deliberately keeps the
 * REAL surfaces — the platform's dev-is-real rule everywhere else (the real
 * pipeline on staging creds, the real face engine) applies to the maps too.
 * An unknown environment (config still loading) counts as live, so a real
 * applicant never flashes a placeholder.
 */
export function addressVendorsStubbed(facts: {
  previewMode?: boolean;
  environment?: string | null;
}): boolean {
  return facts.previewMode === true || facts.environment === 'SANDBOX';
}

/** The canned pin label every stubbed surface shows — obviously a sample,
 *  never a real place (the default map centre reverse-geocodes to somewhere
 *  real, which read as data; that shipped). */
export const SAMPLE_ADDRESS_LINE = '12 Sample Street, Sample City';

/** Derive the flow options from raw config facts — ONE place, used by the
 *  step hook AND the modal's step-order options so they can never disagree. */
export function addressFlowOptions(facts: {
  photo?: 'off' | 'optional' | 'required';
  streetView?: 'off' | 'optional' | 'required';
  serverSearch: boolean;
  previewMode: boolean;
  hasGoogleKey: boolean;
  /** An embedded mount holding a maps frame URL — the framed
   *  /embed/street-view page carries the panorama for it. */
  hasStreetViewFrame: boolean;
}): AddressFlowOptions {
  const photoMode = facts.photo ?? 'optional';
  return {
    searchAvailable: facts.serverSearch && !facts.previewMode,
    photoMode,
    // ON by default (2026-08-29): offered unless the workflow opted out, and
    // wherever a Google surface exists — the key in-document (hosted pages)
    // or the framed street-view page (embedded mounts, 2026-09-03). The
    // builder preview KEEPS the step (it must show the flow real users get)
    // but renders a static placeholder instead of loading any vendor — see
    // AddressEntranceStep's preview branch.
    streetViewOffered:
      facts.streetView !== 'off' && (facts.hasGoogleKey || facts.hasStreetViewFrame),
  };
}

/** Great-circle metres between two points (small-distance haversine). */
export function metersBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * How far a pin may move from the spot a label was PICKED for before the
 * label stops credibly naming it. The pick names the property; the nudge
 * refines where its roof is — same scale as the server's at-address
 * tolerance. Beyond this, keeping the picked name would be a lie and the
 * line re-derives from the new spot.
 */
export const KEEP_PICKED_LABEL_RADIUS_M = 250;

/** Below this, a pin move is roof-refinement — keep the picked label
 *  silently; asking would be noise. */
export const LABEL_PROMPT_MIN_MOVE_M = 25;

/**
 * Whether the pin screen should ASK "keep the selected address?" — the
 * applicant decides the label's fate, never a silent discard (user decision
 * 2026-08-30). Ask once past the refinement threshold; a prior "keep" stands
 * until the pin crosses the credibility radius, where setPin resets it so
 * the question returns exactly once.
 */
export function shouldAskLabelDecision(address: {
  lat: number;
  lng: number;
  label?: string;
  pickedAt?: { lat: number; lng: number };
  labelKept?: boolean;
}): boolean {
  if (!address.pickedAt || !address.label || address.labelKept) return false;
  return metersBetween(address.pickedAt, address) > LABEL_PROMPT_MIN_MOVE_M;
}

/**
 * The address line the flow SHOWS (pin summary + review heading) — the client
 * mirror of the server's composed-line rules, so what the applicant confirms
 * is what the org later reads. Typed number REPLACES a differing picked
 * number (living at 8 when only 11 was listed is not "8, 11 Bassey Street");
 * a typed street the label does not carry leads the line.
 */
export function displayAddressLine(address: {
  lat: number;
  lng: number;
  label?: string | null;
  propertyNumber?: string | null;
  street?: string | null;
  unit?: string | null;
  neighbourhood?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
}): string {
  const number = address.propertyNumber?.trim() || null;
  const typed = address.street?.trim() || null;
  const label = address.label?.trim() || null;
  const unit = address.unit?.trim() || null;
  // Edit-details corrections ride the tail through a part-wise dedupe,
  // mirroring the server's composed line: identical values vanish, a
  // correction appends beside the map's own answer.
  const withClaims = (parts: string[]): string => {
    const out = unit ? [unit, ...parts] : [...parts];
    const seen = (v: string) => out.some((p) => p.toLowerCase() === v.toLowerCase());
    for (const claim of [address.neighbourhood, address.city, address.state, address.postcode]) {
      const t = claim?.trim();
      if (t && !seen(t)) out.push(t);
    }
    return out.join(', ');
  };
  if (!label) {
    if (typed) return withClaims([number ? `${number} ${typed}` : typed]);
    const claimed = withClaims([]);
    if (claimed) return claimed;
    // NEVER coordinates. A moved pin has no line until the reverse geocode
    // answers, and "4.93240, 8.32540" is not an address: it read as one, for
    // the second or so before the real line arrived. Empty means "nothing
    // human-readable yet", and the caller shows that it is still coming.
    return '';
  }
  const segs = label.split(', ').map((t) => t.trim()).filter(Boolean);
  if (typed && !label.toLowerCase().includes(typed.toLowerCase())) {
    return withClaims([number ? `${number} ${typed}` : typed, ...segs]);
  }
  if (number) {
    const first = segs[0] ?? '';
    const firstTokens = first.toLowerCase().split(/\s+/);
    const leading = firstTokens[0] ?? '';
    if (/^\d+[a-z]?$/i.test(leading) && leading !== number.toLowerCase()) {
      segs[0] = [number, ...first.split(/\s+/).slice(1)].join(' ');
    } else if (!firstTokens.includes(number.toLowerCase())) {
      return withClaims([number, ...segs]);
    }
  }
  return withClaims(segs);
}

/** Read to assistive tech while the reverse geocode is out: the pin has a
 *  line coming, and a lat/lng pair is not it. Sighted users see a skeleton
 *  line in its place (components/LineSkeleton), never a spinner. Mirrored on
 *  the RN and Flutter SDKs. */
export const ADDRESS_LINE_PENDING = 'Finding the address…';
/** Shown when the geocode came back with nothing. Still not coordinates. */
export const ADDRESS_LINE_UNAVAILABLE = 'No address found for this spot';
