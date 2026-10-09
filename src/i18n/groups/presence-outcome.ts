import type { TextEntry } from '../types';

/** A check that failed, the selfie review, and the upload behind it. */
export const PRESENCE_OUTCOME_ENTRIES: TextEntry[] = [
  { key: 'presence.failed.timeout', label: 'Error: time ran out', default: "Time's up. Let's try again." },
  { key: 'presence.failed.faceLost', label: 'Error: face lost', default: 'Face lost. Please try again.' },
  {
    key: 'presence.failed.loadError',
    label: 'Error: detection failed to load',
    default: 'Failed to load liveness detection. Check your connection and try again.',
    multiline: true,
  },
  {
    key: 'presence.failed.flash',
    label: 'Error: screen reflection not verified',
    default: "We couldn't verify the screen reflection. Hold still, face the screen, and try again.",
    multiline: true,
  },
  {
    key: 'presence.failed.faceSwap',
    label: 'Error: face continuity not verified',
    default: "We couldn't verify face continuity. Keep your face steady in the frame and try again.",
    multiline: true,
  },
  { key: 'presence.failed.generic', label: 'Error: something went wrong', default: 'Something went wrong.' },
  { key: 'presence.tryAgainButton', label: 'Try again button', default: 'Try Again' },
  { key: 'presence.review.title', label: 'Review: title', default: 'Selfie Captured' },
  { key: 'presence.review.description', label: 'Review: description', default: 'Review your selfie before continuing.' },
  {
    key: 'presence.review.restoredDescription',
    label: 'Review: description for a saved selfie',
    default: 'Your selfie from earlier is saved. Continue, or retake it if you prefer.',
    multiline: true,
  },
  { key: 'presence.review.doneTitle', label: 'Finished step: title', default: 'Selfie already taken' },
  {
    key: 'presence.review.doneDescription',
    label: 'Finished step: description',
    default: 'You have completed this step. There is nothing more to do here.',
    multiline: true,
  },
  { key: 'presence.review.restoredBadge', label: 'Review: saved selfie badge', default: 'Selfie already captured' },
  {
    key: 'presence.review.retrying',
    label: 'Review: upload retrying',
    default: 'Upload failed. Retrying ({attempt}/{total})…',
    placeholders: ['attempt', 'total'],
  },
  {
    key: 'presence.review.blurry',
    label: 'Review: blurry selfie notice',
    default:
      'This photo looks blurry. For the best chance of a match, retake it holding the phone steady until your face is sharp.',
    multiline: true,
  },
  { key: 'presence.review.captured', label: 'Full-screen review: selfie captured', default: 'Selfie captured' },
  { key: 'presence.review.saving', label: 'Full-screen review: saving', default: 'Saving your selfie…' },
  { key: 'presence.review.retryUpload', label: 'Review: retry upload button', default: 'Retry Upload' },
  { key: 'presence.review.compressing', label: 'Review: compressing', default: 'Compressing image...' },
  {
    key: 'presence.upload.failed',
    label: 'Error: selfie not sent',
    default: 'Your selfie could not be sent. Check your connection and try again.',
    multiline: true,
  },
];
