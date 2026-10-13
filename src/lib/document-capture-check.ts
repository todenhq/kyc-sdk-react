// Reading the server's capture check into what the applicant is asked to fix.
//
// After a document is uploaded, `POST /api/v1/document-capture/check` says
// whether the verification can read it: a face on the printed photo, a barcode
// that decodes. `false` means a detector looked and found nothing, which is worth
// a retake; `null` means it was not checked or could not look, which is not. A
// detector can miss, so the applicant can always continue anyway.
//
// Mirrored word for word by the React Native (`lib/documentCaptureCheck.ts`) and
// Flutter (`config/document_capture_check.dart`) SDKs. Pure; unit-tested.
// The words live in the text catalogue (`uploadDocument.check.*`), so a
// workflow can replace them; pass the flow's `t` to get its copy.

import { defaultText } from '../i18n/translate';
import type { TextFn } from '../i18n/types';

export type CaptureSide = 'front' | 'back';

export interface DocumentCaptureCheckResult {
  side: CaptureSide;
  face: boolean | null;
  barcode: boolean | null;
}

export type CaptureProblemKind = 'no_face' | 'no_barcode';

export interface CaptureProblem {
  side: CaptureSide;
  kind: CaptureProblemKind;
}

/** The English defaults; the screen reads `uploadDocument.check.title` and `common.continueAnyway`. */
export const CAPTURE_CHECK_TITLE = 'Check your photos';
export const CAPTURE_CHECK_CONTINUE_ANYWAY = 'Continue anyway';

const MESSAGE_KEYS: Record<CaptureProblemKind, string> = {
  no_face: 'uploadDocument.check.noFace',
  no_barcode: 'uploadDocument.check.noBarcode',
};

/** What to fix, front before back and the face before the barcode. */
export function captureCheckProblems(results: Array<DocumentCaptureCheckResult | null>): CaptureProblem[] {
  const problems: CaptureProblem[] = [];
  for (const side of ['front', 'back'] as const) {
    for (const result of results) {
      if (!result || result.side !== side) continue;
      if (result.face === false) problems.push({ side, kind: 'no_face' });
      if (result.barcode === false) problems.push({ side, kind: 'no_barcode' });
    }
  }
  return problems;
}

export function captureProblemMessage(kind: CaptureProblemKind, t: TextFn = defaultText): string {
  return t(MESSAGE_KEYS[kind]);
}

/** One sentence per kind of problem, in the order found. */
export function captureProblemMessages(problems: CaptureProblem[], t: TextFn = defaultText): string[] {
  return [...new Set(problems.map((p) => p.kind))].map((kind) => captureProblemMessage(kind, t));
}

/** The sides to offer a retake for, front first. */
export function captureProblemSides(problems: CaptureProblem[]): CaptureSide[] {
  return (['front', 'back'] as const).filter((side) => problems.some((p) => p.side === side));
}

/** A photo picked from the device is replaced, not retaken. */
export function captureRetakeLabel(side: CaptureSide, uploadOnly: boolean, t: TextFn = defaultText): string {
  return t(retakeLabelKey(side, uploadOnly));
}

/** The catalogue key for retaking (or replacing) one side. */
export function retakeLabelKey(side: CaptureSide, uploadOnly: boolean): string {
  if (uploadOnly) return side === 'front' ? 'uploadDocument.replaceFront' : 'uploadDocument.replaceBack';
  return side === 'front' ? 'uploadDocument.retakeFront' : 'uploadDocument.retakeBack';
}
