'use client';

// ===========================================================================
// Capture & encoding settings — compression strategy
// ===========================================================================
//
// We capture BOTH a video and a still image for each step. The video proves
// the capture happened live; the still image carries the quality burden for
// the server's facial comparison (selfie) and OCR (document). So we compress
// each artifact by how much quality it actually needs:
//
//   • VIDEO (liveness + document)  — AGGRESSIVE.
//       Low resolution + low frame rate + a hard ~500 kbps bitrate cap. A few
//       seconds of footage stays well under the 2 MB target. The video only
//       needs to be good enough for a human/heuristic liveness review.
//
//   • SELFIE still image           — MODERATE.
//       Captured at 640×480 (plenty for face matching) and JPEG quality 0.8.
//
//   • DOCUMENT still image         — CONSERVATIVE (OCR-critical).
//       The camera runs at a HIGHER resolution than the liveness camera so the
//       still stays sharp, JPEG quality 0.9, and it is never downscaled below
//       1080 px wide — the server OCR has to read small text (ID numbers,
//       dates). The document VIDEO is still capped aggressively (bitrate +
//       frame rate), so a higher camera resolution does not blow up its size.
//
// Tune the knobs below to trade size against quality without hunting through
// the capture components.
// ===========================================================================

// --- Liveness / selfie camera (video is recorded from this stream) ---------
export const CAPTURE_WIDTH = 640;
export const CAPTURE_HEIGHT = 480;

// --- Document camera (higher res so the OCR still stays readable) ----------
export const DOCUMENT_CAPTURE_WIDTH = 1920;
export const DOCUMENT_CAPTURE_HEIGHT = 1080;

// --- Frame rate (applies to every recorded stream) -------------------------
export const CAPTURE_FRAMERATE = 15;
export const CAPTURE_FRAMERATE_MAX = 20;

// --- Video bitrate cap (the main lever for video file size) ----------------
export const LIVENESS_VIDEO_BITRATE = 500_000; // 500 kbps
export const DOCUMENT_VIDEO_BITRATE = 500_000; // 500 kbps

// --- Still-image JPEG quality ----------------------------------------------
export const SELFIE_IMAGE_QUALITY = 0.8; // moderate
export const DOCUMENT_IMAGE_QUALITY = 0.9; // conservative — keep text sharp

/** Document stills are never scaled narrower than this (OCR-critical). */
export const DOCUMENT_MIN_WIDTH = 1080;
/** Upper bound for document stills — large enough to keep small text legible. */
export const DOCUMENT_MAX_DIMENSION = 2000;

// ---------------------------------------------------------------------------
// Shared getUserMedia video constraints
// ---------------------------------------------------------------------------

export interface VideoCaptureConstraints {
  width: number;
  height: number;
}

/**
 * Build the `video` constraints for getUserMedia. All values are `ideal` so the
 * browser falls back gracefully when a device can't hit them exactly. The frame
 * rate is capped to keep recorded video small.
 */
export function buildVideoConstraints(
  facingMode: 'user' | 'environment',
  { width, height }: VideoCaptureConstraints = { width: CAPTURE_WIDTH, height: CAPTURE_HEIGHT },
): MediaTrackConstraints {
  return {
    facingMode: { ideal: facingMode },
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: CAPTURE_FRAMERATE, max: CAPTURE_FRAMERATE_MAX },
  };
}

/**
 * Whether a live stream is coming from a user-facing (selfie) camera, so the
 * preview can be mirrored. Without mirroring a front camera the preview moves
 * the opposite way to the user, which makes anything they are trying to line up
 * awkward to aim.
 *
 * Mirrors unless there is POSITIVE evidence the camera faces away. The earlier
 * rule was the inverse — `facingMode !== 'environment'` — which mirrored on
 * `undefined` too, and `facingMode` is simply absent on several browsers, so a
 * rear camera that failed to report it got mirrored.
 *
 * The two evidence sources are deliberately different in kind: `facingMode` is
 * well supported on mobile, where a rear camera actually exists; a desktop
 * webcam usually reports nothing at all and is user-facing, so "no answer"
 * means front. The label check covers the remaining case — a mobile browser
 * that omits `facingMode` on a camera whose name says which way it points.
 */
export function isFrontFacingStream(stream: MediaStream | null): boolean {
  const track = stream?.getVideoTracks()[0];
  if (!track) return false;

  const facingMode = track.getSettings?.().facingMode;
  if (facingMode === 'user') return true;
  if (facingMode === 'environment') return false;

  return !/\b(back|rear|environment)\b/i.test(track.label ?? '');
}

// ---------------------------------------------------------------------------
// MediaRecorder helpers
// ---------------------------------------------------------------------------

/**
 * Pick the best supported WebM codec: VP9 (better compression) → VP8 → plain
 * WebM. Returns `null` when the browser supports no usable container, so callers
 * can skip recording rather than throw.
 */
export function pickVideoMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  // WebM first (smaller, and what most browsers record); MP4 for Safari, which
  // records only MP4 before 18.4 — without it no liveness recording was made on
  // those iPhones at all. The server accepts both.
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

/**
 * Create a bitrate-capped MediaRecorder for a stream. Returns the recorder plus
 * the codec-stripped base mimeType (e.g. `video/webm`) to use when assembling
 * the final Blob and uploading. Returns `null` when recording is unsupported.
 */
export function createVideoRecorder(
  stream: MediaStream,
  bitrate: number,
): { recorder: MediaRecorder; mimeType: string } | null {
  const mimeType = pickVideoMimeType();
  if (!mimeType) return null;
  try {
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });
    // Strip codec params (e.g. ";codecs=vp9") — the upload endpoint rejects them.
    return { recorder, mimeType: mimeType.split(';')[0] };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dev-only size logging
// ---------------------------------------------------------------------------

// Minimal ambient declaration — this SDK is browser-only and doesn't depend on
// @types/node, but consumer bundlers (Next.js, webpack, Vite) inline
// `process.env.NODE_ENV`, so we read it directly behind a `typeof` guard.
declare const process: { env?: { NODE_ENV?: string } } | undefined;

function isDevMode(): boolean {
  try {
    return typeof process !== 'undefined' && process?.env?.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

/** Log a captured artifact's size to the console in development only. */
export function logCaptureSize(label: string, data: Blob | string): void {
  if (!isDevMode()) return;
  let bytes: number;
  if (typeof data === 'string') {
    const raw = data.includes(',') ? data.split(',')[1] : data;
    bytes = Math.ceil((raw.length * 3) / 4);
  } else {
    bytes = data.size;
  }
  // eslint-disable-next-line no-console
  console.log(`[Verification] ${label}: ${(bytes / 1024).toFixed(1)} KB`);
}
