// ─── Going back from a refused submission ────────────────────────────────────
//
// Mirrors the Flutter SDK's config/submit_recovery.dart and the React Native
// SDK's lib/submit-recovery.ts. The three must change together: the same
// refusal has to land the applicant on the same step on every platform.
//
// A refused submission used to end on an error with only Close (or a Try
// Again that resubmitted the same refused thing), while its own message said
// "go back and upload them". Closing lost the application. Most refusals are
// about something the applicant can fix (a missing document, a required
// field), so the error screen offers Go back to the step that owns it, and the
// flow resubmits when they return to the end.
import { VerificationApiError } from '../services/api';
import type { VerificationStep } from '../types/config';

/** The step that owns each refusal the server names. Add-only. */
const STEP_FOR_CODE: Readonly<Record<string, VerificationStep>> = {
  missing_documents: 'business-documents',
  missing_company_info: 'business-details',
  key_people_required: 'business-key-people',
  missing_supporting_documents: 'supporting-documents',
  questionnaire_invalid: 'questionnaire',
  proof_of_address_required: 'proof-of-address',
  // 'address-collection' is the PIN step.
  address_collection_required: 'address-collection',
  missing_address_fields: 'address-collection',
};

/** A capture the server could not accept, by the key it names. */
const STEP_FOR_MEDIA_KEY: Readonly<Record<string, VerificationStep>> = {
  documentFront: 'document-capture',
  documentBack: 'document-capture',
  selfie: 'liveness',
  livenessVideo: 'liveness',
  proofOfAddress: 'proof-of-address',
  addressPhoto: 'address-entrance',
};

/** Refusals going back cannot fix: nothing the applicant entered is wrong. */
const NOT_RECOVERABLE = new Set([
  'invalid_api_key',
  'insufficient_credits',
  'feature_disabled',
  'business_not_approved',
  'rate_limited',
  // Cancelled by the organisation: nothing the applicant changes reopens it.
  'session_cancelled',
]);

const has = (map: Readonly<Record<string, VerificationStep>>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(map, key);

/**
 * Where Go back should land for a refusal, or null when going back cannot
 * help. A named step is used only when this flow contains it; anything else
 * lands on the last step before submission, so the applicant can still walk
 * back through what they entered.
 */
export function recoveryStepFor(
  serverCode: string,
  order: readonly VerificationStep[],
  opts: { mediaKey?: string | null } = {},
): VerificationStep | null {
  if (NOT_RECOVERABLE.has(serverCode)) return null;
  const mediaKey = opts.mediaKey;
  const named = has(STEP_FOR_CODE, serverCode)
    ? STEP_FOR_CODE[serverCode]
    : serverCode === 'invalid_media' && mediaKey && has(STEP_FOR_MEDIA_KEY, mediaKey)
      ? STEP_FOR_MEDIA_KEY[mediaKey]
      : undefined;
  if (named && order.includes(named)) return named;
  const end = order.indexOf('submitted');
  if (end > 0) return order[end - 1] ?? null;
  return null;
}

/**
 * The SERVER's refusal code and the capture it names, read off the raw API
 * error (never the mapped client code, which folds most refusals into
 * `unknown`). Null for anything that is not a server refusal. A 401 is read as
 * `invalid_api_key` and a 402 as `insufficient_credits` whatever the body says,
 * as the Flutter client does.
 */
export function serverRefusalOf(err: unknown): { code: string; mediaKey: string | null } | null {
  if (!(err instanceof VerificationApiError)) return null;
  const code =
    err.statusCode === 401
      ? 'invalid_api_key'
      : err.statusCode === 402
        ? 'insufficient_credits'
        : err.code ?? 'unknown';
  const mediaKey = typeof err.body?.mediaKey === 'string' ? err.body.mediaKey : null;
  return { code, mediaKey };
}
