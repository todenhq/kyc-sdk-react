// Recovery from a submit refused over contact proofs — the "why does this
// always happen?" bug.
//
// Contact proof tokens are SINGLE-USE and expire ~30 minutes after the OTP is
// checked, but they ride session progress and are restored on resume. A
// resumed attempt therefore carries a proof the server will (rightly)
// validate-and-drop at submit, while the contact step still shows "verified"
// — and the error screen's Try Again resubmits the same dead token forever.
//
// The 422 is recoverable in-flow: clear the stale proofs, walk the person
// back to the contact step (their data is untouched), and once re-verified
// the step routes straight back to 'submitted', which auto-submits with the
// fresh token. No re-walking the flow, no dead end.
import { VerificationApiError } from '../services/api';
import type { VerificationStep } from '../types/config';

export type ContactChannel = 'email' | 'phone';

/** The channels a 422 `contact_verification_required` names as missing. */
export function expiredContactChannels(err: unknown): ContactChannel[] {
  if (!(err instanceof VerificationApiError) || err.code !== 'contact_verification_required') return [];
  const missing = Array.isArray(err.body?.missing) ? (err.body.missing as unknown[]) : [];
  return missing.filter((c): c is ContactChannel => c === 'email' || c === 'phone');
}

export function contactStepFor(channel: ContactChannel): VerificationStep {
  return channel === 'email' ? 'email-verification' : 'phone-verification';
}

/**
 * Where Continue goes once this channel is verified. Normally the ordinary
 * forward step; in recovery it returns to 'submitted' (which auto-submits
 * with the fresh proof) via any OTHER still-refused channel first — the
 * person never re-walks steps they already completed.
 */
export function stepAfterContactVerified(opts: {
  recovery: boolean;
  expired: ContactChannel[];
  channel: ContactChannel;
  forward: VerificationStep;
}): VerificationStep {
  if (!opts.recovery) return opts.forward;
  const remaining = opts.expired.find((c) => c !== opts.channel);
  return remaining ? contactStepFor(remaining) : 'submitted';
}
