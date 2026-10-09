import type { KYCState } from '../context/types';
import { getStepLog } from './step-log';
import { multiIdWireSlots } from './multi-id';

/**
 * The slice of flow state worth carrying between visits.
 *
 * Deliberately EXCLUDES the base64 previews (`documentFrontImage`, `selfieImage`)
 * and the video blobs. Those are display artefacts and raw bytes: they would bloat
 * the payload enormously, and the `mediaId` beside them is already the durable
 * reference the server verifies against. On resume a slot with a mediaId counts as
 * captured even though its thumbnail is gone.
 */
export interface SessionProgressPayload {
  step?: string;
  /**
   * The journey so far, not just where they are now.
   *
   * The same log that rides the submission, saved as they move so the
   * dashboard timeline fills in live rather than appearing all at once at the
   * end — which is no use at all while somebody is stuck.
   */
  stepLog?: { steps: { step: string; at: string }[]; sentAt: string } | null;
  mediaIds?: Record<string, string>;
  data?: {
    selectedCountry?: unknown;
    selectedIdType?: unknown;
    /** Multi-ID: which slot the attempt was on + the evidence already committed. */
    multiIdSlotIndex?: number;
    multiIdSlots?: unknown;
    idNumber?: string;
    userData?: unknown;
    business?: unknown;
    businessApplication?: unknown;
    /** Supporting documents already uploaded — `{ type, mediaId }` only. */
    supportingDocuments?: unknown;
    contact?: unknown;
    questionnaireAnswers?: unknown;
    address?: unknown;
  };
}

/** Build the payload from current flow state. */
export function progressFromState(state: KYCState): SessionProgressPayload {
  const mediaIds = Object.fromEntries(
    Object.entries(state.mediaIds ?? {}).filter(([, v]) => typeof v === 'string' && v),
  ) as Record<string, string>;

  return {
    step: state.currentStep,
    stepLog: getStepLog(),
    mediaIds,
    data: {
      selectedCountry: state.selectedCountry ?? undefined,
      selectedIdType: state.selectedIdType ?? undefined,
      multiIdSlotIndex: state.multiIdSlotIndex > 0 ? state.multiIdSlotIndex : undefined,
      multiIdSlots:
        state.multiIdSlots.length > 0 ? multiIdWireSlots(state.multiIdSlots) : undefined,
      idNumber: state.idNumber || undefined,
      userData: state.userData,
      business: state.business,
      businessApplication: state.businessApplication,
      // The uploads, without their preview file names: a restored attempt
      // shows the slot as uploaded, which is what the mediaId is for. Preview
      // bytes never ride progress, the same rule the selfie keeps.
      supportingDocuments:
        state.supportingDocuments.length > 0
          ? state.supportingDocuments.map((d) => ({
              type: d.type,
              mediaId: d.mediaId,
              ...(d.method ? { method: d.method } : {}),
            }))
          : undefined,
      contact: state.contact,
      questionnaireAnswers: state.questionnaireAnswers,
      address: state.address ?? undefined,
    },
  };
}

/**
 * Has the applicant actually begun, or is this just the flow as it opened?
 *
 * Nothing here needs saving until they move: an untouched payload restores to
 * the screen they are already on. Not writing it is also what lets the server
 * tell a link somebody opened and abandoned on the first screen from one they
 * worked through — the presence of stored progress IS "they started", and a
 * save-on-mount made every opened link look started.
 *
 * Judged against the flow's OPENING step: `consent` unless the workflow
 * switched that screen off (`consentStep: false`), in which case the first real
 * step (see step-order.ts). Naming consent here would make every consent-less
 * flow save on mount, and every opened link would read "In progress".
 * Everything else errs towards saving.
 */
export function isUntouchedProgress(payload: SessionProgressPayload, openingStep: string = 'consent'): boolean {
  if (payload.step && payload.step !== openingStep) return false;
  if (Object.keys(payload.mediaIds ?? {}).length > 0) return false;
  const d = payload.data;
  if (!d) return true;
  return !d.selectedCountry && !d.selectedIdType && !d.idNumber;
}

/**
 * Stable key for "has anything worth saving changed?", so idle re-renders don't
 * put the same payload back to the server over and over.
 */
export function progressFingerprint(payload: SessionProgressPayload): string {
  return JSON.stringify(payload);
}
