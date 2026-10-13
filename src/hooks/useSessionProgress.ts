import { useEffect, useRef } from 'react';
import type { VerificationApi } from '../services/api';
import type { VerificationState } from '../context/types';
import { progressFromState, progressFingerprint, isUntouchedProgress } from '../lib/session-progress';
import { progressSaveStopsFlow, sessionCancelledMessage } from '../lib/session-cancelled';

/** Typing shouldn't put a request on the wire per keystroke. */
const SAVE_DEBOUNCE_MS = 800;

/**
 * Persist flow progress to the session as the user advances.
 *
 * Best-effort by contract: a failed save costs some re-typing on resume, and must
 * never interrupt someone mid-verification. Nothing here surfaces an error.
 *
 * No-ops without a session (preview, hosted mounts, or a start that failed), and
 * skips writes when nothing worth saving has actually changed — otherwise idle
 * re-renders would put the same payload back repeatedly.
 *
 * The one failure that is NOT swallowed is a cancelled session: every later
 * save and the submission would be refused too, so `onCancelled` stops the flow.
 */
export function useSessionProgress(
  api: VerificationApi,
  state: VerificationState,
  onCancelled?: (message: string | null) => void,
): void {
  const lastSaved = useRef<string | null>(null);
  const sessionId = state.sessionId;

  // Derived here rather than in the effect body so the fingerprint is the effect's
  // actual dependency — the state object identity changes on every render.
  const payload = sessionId && !state.sessionCancelled ? progressFromState(state) : null;
  const fingerprint = payload ? progressFingerprint(payload) : null;

  useEffect(() => {
    if (!sessionId || !payload || !fingerprint) return;
    if (fingerprint === lastSaved.current) return;
    // Nothing has happened yet. Writing this would restore them to the screen
    // they are already on, and would make an untouched link indistinguishable
    // from one somebody worked through.
    if (isUntouchedProgress(payload, state.openingStep)) return;
    // Submitting spends the session, and a spent session refuses every write
    // (409 handoff_session_used), so a save of the `submitted` step could only
    // ever fail: a returning applicant lands on the finished screen from the
    // summary, never on restored progress. It also kept a hosted page's
    // network tab full of refusals while the verdict poll was the thing to
    // read (user report 2026-09-08).
    if (payload.step === 'submitted') return;

    const id = setTimeout(() => {
      lastSaved.current = fingerprint;
      void api.saveProgress(sessionId, payload).catch((err: unknown) => {
        if (progressSaveStopsFlow(err)) {
          onCancelled?.(sessionCancelledMessage(err));
          return;
        }
        // Allow a later change to retry: a save that failed must not be
        // remembered as the last one that succeeded.
        lastSaved.current = null;
      });
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, sessionId, fingerprint]);
}
