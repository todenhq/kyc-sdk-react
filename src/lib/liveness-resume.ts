// A resumed session restores the selfie's mediaId, but neither the liveness
// recording (the web SDK uploads it at submit, from memory) nor the liveness
// claim that says how the selfie was taken. A selfie with neither behind it is
// not proof of a live person: the server records a missing recording as a
// finding and refuses a face re-authentication without a claim. So on restore
// the selfie is dropped and, when the saved step comes after liveness, the
// person is sent back to take it again.
//
// Same rule as the React Native SDK's lib/livenessResume.ts and the Flutter
// SDK's config/liveness_resume.dart. Change all three together.

import type { VerificationStep } from '../types/config';

/** Steps that, once a selfie exists, can only be reached after liveness. */
const AFTER_LIVENESS: ReadonlySet<string> = new Set<VerificationStep>([
  'supporting-documents',
  'proof-of-address',
  'address-search',
  'address-collection',
  'address-entrance',
  'address-review',
  'questionnaire',
  'submitted',
]);

export interface RestoredCapture {
  step: string | undefined;
  mediaIds: Record<string, unknown> | undefined;
}

/** PURE. The restored step and media, with the selfie left to be taken again. */
export function withoutUnrecordedSelfie(restored: RestoredCapture): RestoredCapture {
  const media = restored.mediaIds;
  if (!media?.selfie) return restored;
  const { selfie: _selfie, livenessVideo: _video, ...rest } = media;
  const step = restored.step && AFTER_LIVENESS.has(restored.step) ? 'liveness' : restored.step;
  return { step, mediaIds: rest };
}
