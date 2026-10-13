import type { VerificationStep } from '../types/config';

// Where the supporting-documents step's Back goes.
//
// Its own file rather than post-capture.ts: the forward chain and this
// backward one would otherwise be a cycle, and the SDK has had enough of
// those.

/**
 * The step BEFORE supporting documents: the capture screen the person came
 * through — liveness, or the ID screen when the selfie is switched off.
 *
 * Proof of Address is deliberately absent. It used to be the answer, and since
 * 2026-09-22 it comes AFTER this step, so returning it here would walk the
 * applicant forwards.
 */
export function stepBeforeSupportingDocuments(
  config: {
    enableSelfie?: boolean;
    getIdTypeDefinition?: (idType: string, country?: string) => { requiresDocumentCapture?: boolean } | null;
  },
  state: { selectedIdType?: string | null },
): VerificationStep {
  if (config.enableSelfie !== false) return 'liveness';
  // No selfie: back into whichever evidence screen this ID uses — the same
  // rule the PoA step's own Back applies.
  const numberOnly =
    state.selectedIdType != null &&
    config.getIdTypeDefinition?.(state.selectedIdType)?.requiresDocumentCapture === false;
  return numberOnly ? 'id-input' : 'document-capture';
}
