'use client';

import { useCallback, useEffect, useState } from 'react';
import { livenessBrightScreenOn, shouldForceLightTheme } from '../lib/liveness-bright-screen';
import { useForcedLightTheme } from '../lib/forced-light-theme';
import type { VerificationStep } from '../types/config';

interface LivenessLightInput {
  livenessBrightScreen?: boolean;
  configuredTheme?: 'light' | 'dark' | 'system';
  open: boolean;
  /** The step the modal is actually rendering. */
  step: VerificationStep;
  themeRoot: HTMLElement | null;
}

/**
 * The modal's half of "bright screen during the selfie": latches the liveness
 * step's camera report for the rest of the step, decides whether the flow is
 * held light, and holds it. Returns whether it is held (the header hides its
 * theme toggle meanwhile) and the reporter the step calls through
 * LivenessCameraContext.
 */
export function useLivenessLight(input: LivenessLightInput): {
  forceLight: boolean;
  reportCameraShown: () => void;
} {
  const [cameraShown, setCameraShown] = useState(false);
  const reportCameraShown = useCallback(() => setCameraShown(true), []);

  // Released when the step ends or the flow closes. Keyed on the step VALUE,
  // not on a change, so a report made on the render that entered liveness is
  // never wiped by the same commit.
  const onLiveness = input.open && input.step === 'liveness';
  useEffect(() => {
    if (!onLiveness) setCameraShown(false);
  }, [onLiveness]);

  const forceLight = shouldForceLightTheme({
    enabled: livenessBrightScreenOn(input),
    open: input.open,
    step: input.step,
    cameraShown,
  });
  useForcedLightTheme(forceLight, input.themeRoot, input.configuredTheme);

  return { forceLight, reportCameraShown };
}
