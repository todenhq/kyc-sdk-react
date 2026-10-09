// ---------------------------------------------------------------------------
// Face positioning check
// Returns guidance string or null if face is well positioned.
// ---------------------------------------------------------------------------

import type { NormalizedLandmark } from '../types';
import { L } from './landmarks';
import { defaultText } from '../../i18n/translate';
import type { TextFn } from '../../i18n/types';
import {
  FACE_WINDOW_MAX_DRIFT,
  FACE_WINDOW_MAX_FILL,
  FACE_WINDOW_MIN_FILL,
  type FaceWindow,
} from '../../lib/liveness-cutout';

export interface FacePosition {
  isDetected: boolean;
  isCentered: boolean;
  isCorrectDistance: boolean;
  guidance: string | null;
}

/**
 * Full screen, the camera frame fills the surface and only its middle shows
 * through the face window, so the face is judged against the WINDOW (as shares
 * of the frame: lib/liveness-cutout). `moving` is a gesture in progress: the
 * head is meant to leave the centre then, and a turned face measures narrower,
 * so only "too close" stays strict.
 */
export interface FacePositionFrame {
  window: FaceWindow;
  moving?: boolean;
}

export function checkFacePosition(
  landmarks: NormalizedLandmark[],
  t: TextFn = defaultText,
  frame?: FacePositionFrame | null,
): FacePosition {
  const noseX = landmarks[L.noseTip].x;
  const noseY = landmarks[L.noseTip].y;
  const faceWidth = Math.abs(landmarks[L.rightCheek].x - landmarks[L.leftCheek].x);

  // Cheek-to-cheek span as a fraction of the frame width. 0.2 (the old floor)
  // let a clearly-distant face through without ever prompting; 0.28 requires
  // the face to fill enough of the circle for a usable selfie + flash reflection.
  const window = frame?.window;
  const moving = frame?.moving === true;
  const MIN_FACE_WIDTH = window
    ? window.width * (moving ? FACE_WINDOW_MIN_FILL / 2 : FACE_WINDOW_MIN_FILL)
    : 0.28;
  const MAX_FACE_WIDTH = window ? window.width * FACE_WINDOW_MAX_FILL : 0.7;
  const isCentered = window
    ? moving ||
      (Math.abs(noseX - 0.5) < window.width * FACE_WINDOW_MAX_DRIFT &&
        Math.abs(noseY - (window.centreY ?? 0.5)) < window.height * FACE_WINDOW_MAX_DRIFT)
    : Math.abs(noseX - 0.5) < 0.25 && Math.abs(noseY - 0.5) < 0.25;
  const isCorrectDistance = faceWidth > MIN_FACE_WIDTH && faceWidth < MAX_FACE_WIDTH;

  let guidance: string | null = null;
  if (faceWidth <= MIN_FACE_WIDTH) {
    // Distance first: a far face reads as "off-centre" too, but "move closer"
    // is the actionable instruction.
    guidance = t('presence.position.moveCloser');
  } else if (!isCentered) {
    guidance = t('presence.position.centerFace');
  } else if (faceWidth >= MAX_FACE_WIDTH) {
    guidance = t('presence.position.moveAway');
  }

  return {
    isDetected: true,
    isCentered,
    isCorrectDistance,
    guidance,
  };
}
