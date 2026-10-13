'use client';

import { useEffect, useRef } from 'react';
import { useVerificationContext } from '../context/VerificationContext';
import { useSessionProgress } from '../hooks/useSessionProgress';
import type { HandoffBootstrapResponse, VerificationApi } from '../services/api';
import type { VerificationStep } from '../types/config';
import { resumedApplicationFrom } from '../lib/resumed-application';

/**
 * Binds a hosted flow to its session: names it, then saves progress as the
 * applicant moves.
 *
 * BOTH halves were missing. The reducer never learned the id (a hosted mount
 * holds only the token), and useSessionProgress was mounted solely in
 * <Verification/>, so hosted links — the one place someone is most likely to close
 * the tab and come back — persisted nothing at all.
 */
export function HostedSessionSync({
  sessionId,
  progress,
  bootstrap,
  api,
}: {
  sessionId: string;
  progress?: HandoffBootstrapResponse['progress'];
  /** The bootstrap's resume facts for a KYB application whose business half
   *  already committed (lib/resumed-application.ts). */
  bootstrap?: Pick<HandoffBootstrapResponse, 'applicantKeyPersonId' | 'parentVerificationId' | 'parentRequestId'>;
  api: VerificationApi;
}) {
  const { state, dispatch } = useVerificationContext();
  const restored = useRef(false);

  useEffect(() => {
    if (sessionId) dispatch({ type: 'SET_SESSION_ID', payload: sessionId });
    // Put them back where they were. Once only: re-applying after they have
    // moved on would drag them backwards. Media references are pruned
    // server-side, so a restored capture slot is one whose bytes still exist.
    if (progress && !restored.current) {
      restored.current = true;
      dispatch({ type: 'RESTORE_PROGRESS', payload: progress });
    }
    // The business half already committed: the submitting screen replays it
    // under its own request id rather than sending a second application the
    // server refuses on this spent session.
    const resumed = bootstrap ? resumedApplicationFrom(bootstrap) : null;
    if (resumed) dispatch({ type: 'SET_RESUMED_APPLICATION', payload: resumed });
  }, [sessionId, progress, bootstrap, dispatch]);

  useSessionProgress(api, state, (message) =>
    dispatch({ type: 'SET_SESSION_CANCELLED', payload: { message } }),
  );
  return null;
}

/**
 * The hosted flow's lifecycle callbacks — what `<Verification/>` fires from its
 * own component, mounted here instead because a hosted page has no trigger
 * component to fire them from. `onStart` once, when the flow mounts; `onStep`
 * for the step the flow opens on (a restored session opens mid-flow, and a
 * host that only ever hears CHANGES would never learn where it started) and
 * then for every change.
 */
export function HostedLifecycle({
  onStart,
  onStepChange,
}: {
  onStart?: () => void;
  onStepChange?: (step: VerificationStep) => void;
}) {
  const { state } = useVerificationContext();
  const started = useRef(false);
  const lastStep = useRef<VerificationStep | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    onStart?.();
  }, [onStart]);

  useEffect(() => {
    if (state.currentStep === lastStep.current) return;
    lastStep.current = state.currentStep;
    onStepChange?.(state.currentStep);
  }, [state.currentStep, onStepChange]);

  return null;
}
