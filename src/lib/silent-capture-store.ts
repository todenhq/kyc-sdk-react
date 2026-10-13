// ─── Silent capture: the per-session record ─────────────────────────────────
//
// Frames taken this session, kept OUTSIDE the reducer on purpose, like the
// capture-integrity signals and the step log: a retake, a step revisit or a
// RETRY keeps frames already taken (they are evidence of who was there), and
// the cap has to be decided synchronously at the moment a frame is grabbed.
// Reset where a new session starts (the modal-open handlers in Verification).
//
// Uploads run in the background and fail silently; only frames whose upload
// succeeded are submitted (see buildSilentCaptureSubmission).

import {
  buildSilentCaptureSubmission,
  canTakeSilentFrame,
  type SilentCaptureMoment,
  type SilentCaptureSubmission,
  type SilentFrame,
} from './silent-capture';

let frames: SilentFrame[] = [];
let pending: Promise<void>[] = [];
/** Bumped on reset, so an upload from an earlier session can never land in this one. */
let generation = 0;

/**
 * Take a slot for a new frame, or null at the limit. The frame counts
 * against the limit from this moment, whether or not its upload succeeds.
 */
export function reserveSilentFrame(moment: SilentCaptureMoment, now: Date = new Date()): SilentFrame | null {
  if (!canTakeSilentFrame(frames)) return null;
  const frame: SilentFrame = { moment, capturedAt: now.toISOString() };
  frames = [...frames, frame];
  return frame;
}

/**
 * Upload a reserved frame in the background. Never throws and never reports:
 * a lost frame costs a photo, never the verification.
 */
export function uploadSilentFrame(frame: SilentFrame, upload: () => Promise<string>): void {
  const own = generation;
  const task = upload()
    .then((mediaId) => {
      if (own !== generation || !mediaId) return;
      frames = frames.map((f) => (f === frame ? { ...f, mediaId } : f));
    })
    .catch(() => undefined);
  pending = [...pending, task];
}

/**
 * Wait (briefly) for uploads still in flight, so a frame taken moments before
 * the person pressed submit is not lost. Never waits longer than `timeoutMs`.
 */
export async function settleSilentUploads(timeoutMs = 3000): Promise<void> {
  if (pending.length === 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled(pending),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timer !== undefined) clearTimeout(timer);
}

/** The submission for this session's uploaded frames. */
export function silentCaptureSubmission(): SilentCaptureSubmission {
  return buildSilentCaptureSubmission(frames);
}

/** The frames taken so far (read-only view, for tests and diagnostics). */
export function silentFrames(): readonly SilentFrame[] {
  return frames;
}

export function resetSilentCaptures(): void {
  frames = [];
  pending = [];
  generation += 1;
}
