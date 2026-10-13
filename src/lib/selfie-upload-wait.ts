// ─── Waiting for the selfie upload from a later step ────────────────────────
//
// With the selfie review hidden (the biometric scopes' default), the liveness
// step hands over the moment the selfie is captured rather than when the
// upload lands, so the person sees ONE loading screen from the shutter to the
// verdict instead of three. The upload keeps running in the background and
// reports to the reducer (`VerificationState.selfieUpload`, written by LivenessStep's
// uploadSelfie); the submitted step waits on that record before it submits.
// Pure and injectable, like the result wait: the screen owns nothing but the
// rendering. Mirrors the mobile SDKs' twin; keep the three in lockstep.

export type SelfieUploadStatus = 'idle' | 'uploading' | 'done' | 'failed';

export interface SelfieUploadState {
  status: SelfieUploadStatus;
  /** The failure message, set only on `failed`. */
  message: string | null;
}

export const IDLE_SELFIE_UPLOAD: SelfieUploadState = { status: 'idle', message: null };

export type SelfieUploadWait = { ok: true } | { ok: false; message: string };

export interface SelfieUploadSnapshot {
  selfieUpload: SelfieUploadState;
  /** `mediaIds.selfie`: the durable proof the selfie is on the server. */
  selfieMediaId: string | undefined;
}

export const SELFIE_UPLOAD_WAIT_MS = 90 * 1000;

export const SELFIE_UPLOAD_TIMED_OUT = 'Your selfie could not be sent. Check your connection and try again.';

/**
 * Whether the upload has settled, and how. A restored session carries the
 * media id with the status still `idle` (nothing uploaded this visit), which
 * counts as settled; an `idle` record with no media id is an upload that has
 * not started yet, so the caller keeps waiting.
 */
export function selfieUploadSettled(snapshot: SelfieUploadSnapshot): SelfieUploadWait | null {
  const { status, message } = snapshot.selfieUpload;
  if (status === 'failed') return { ok: false, message: message ?? SELFIE_UPLOAD_TIMED_OUT };
  if (status === 'done' || (status === 'idle' && !!snapshot.selfieMediaId)) return { ok: true };
  return null;
}

/**
 * Whether this flow has a selfie upload to wait for at all. A flow with no
 * liveness step (address, questionnaire, contact, a business application
 * without the applicant's own check) never uploads one, so its record stays
 * `idle` with no media id for good: waiting on it would run the whole
 * deadline and then report a selfie nobody was asked for. An upload that has
 * already started counts whatever the step order says now. MIRRORED across
 * the web, React Native and Flutter SDKs.
 */
export function selfieUploadExpected(snapshot: SelfieUploadSnapshot, hasLivenessStep: boolean): boolean {
  return hasLivenessStep || snapshot.selfieUpload.status !== 'idle';
}

export interface AwaitSelfieUploadDeps {
  read: () => SelfieUploadSnapshot;
  /** Fires the listener on every store change; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void;
  timeoutMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/** Resolve once the upload has settled, or with a failure at the deadline. */
export function awaitSelfieUpload(deps: AwaitSelfieUploadDeps): Promise<SelfieUploadWait> {
  const settled = selfieUploadSettled(deps.read());
  if (settled) return Promise.resolve(settled);
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: SelfieUploadWait) => {
      if (done) return;
      done = true;
      unsubscribe();
      clearTimer(timer);
      resolve(result);
    };
    const unsubscribe = deps.subscribe(() => {
      const next = selfieUploadSettled(deps.read());
      if (next) finish(next);
    });
    const timer = setTimer(() => finish({ ok: false, message: SELFIE_UPLOAD_TIMED_OUT }), deps.timeoutMs ?? SELFIE_UPLOAD_WAIT_MS);
    // The store may have moved between the first read and the subscription.
    const again = selfieUploadSettled(deps.read());
    if (again) finish(again);
  });
}
