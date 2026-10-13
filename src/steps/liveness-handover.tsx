"use client";

import { useEffect, useRef } from 'react';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { configScope } from '../lib/scope';
import { describeWaiting } from '../lib/result-copy';
import { useText } from '../i18n';
import { waitsForResult } from '../lib/biometric-options';
import { biometricCopyFor } from '../lib/biometric-copy';
import { SubmittingScreen } from './SubmittedScreens';

// ─── Handing over without the review ────────────────────────────────────────
//
// On the biometric scopes the selfie review (Retake / Continue) is OFF by
// default (lib/biometric-options.ts): a re-authentication is a few-second
// check and a review screen is a stop in the middle of it. The step hands
// over the moment the selfie is captured, WITHOUT waiting for the upload: the
// upload keeps running and reports to the reducer, and the submitted step
// waits on that record (lib/selfie-upload-wait.ts). So the person sees one
// loading screen from the shutter to the verdict, not one per step. The view
// below exists for the single render between "captured" and the step change,
// and it is the same screen the submitted step shows, so nothing visibly
// changes. An upload that has already failed keeps the review, whose Retry
// Upload is the recovery. Mirrors the RN SDK's liveness/LivenessHandover.tsx.

/** Advance exactly once, the first render on which `ready` holds. */
export function useSelfieAutoAdvance(opts: { enabled: boolean; ready: boolean; onAdvance: () => void }): void {
  const advanced = useRef(false);
  const { enabled, ready, onAdvance } = opts;
  useEffect(() => {
    if (!enabled || !ready || advanced.current) return;
    advanced.current = true;
    onAdvance();
  }, [enabled, ready, onAdvance]);
}

export function LivenessHandover() {
  const config = useVerificationConfig();
  const t = useText();
  const copy = describeWaiting(
    {
      scope: configScope(config),
      waitsForResult: waitsForResult(config),
      override: biometricCopyFor(config).waiting,
    },
    t,
  );
  return <SubmittingScreen title={copy.title} description={copy.description} />;
}
