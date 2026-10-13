'use client';

import { createContext, useContext, useEffect, type Dispatch } from 'react';
import type { VerificationStep } from '../types/config';
import type { VerificationAction } from '../context/types';
import { buildStepOrder, type StepOrderOptions } from '../lib/step-order';

// ─── The flow's opening step ────────────────────────────────────────────────
//
// 'consent', unless the workflow switched that screen off (`consentStep:
// false`), in which case the first real step. VerificationModal is the one place that
// builds the order, so it publishes the answer here: the reducer carries it
// for the progress saver (a consent-less flow must not be written as
// "started" on mount), and the step header reads it to hide Back on the
// opening step, whose own Back target would otherwise be a consent screen
// this flow does not contain.

/** Whether the step header may show its Back arrow. Default true, so a header
 *  rendered outside the modal (the standalone re-auth component) keeps it. */
export const BackAvailableContext = createContext<boolean>(true);

export function useBackAvailable(): boolean {
  return useContext(BackAvailableContext);
}

export function useOpeningStep(
  stepOptions: StepOrderOptions,
  current: VerificationStep,
  dispatch: Dispatch<VerificationAction>,
): { openingStep: VerificationStep; backAvailable: boolean } {
  const openingStep = buildStepOrder(stepOptions)[0] ?? 'consent';
  useEffect(() => {
    dispatch({ type: 'SET_OPENING_STEP', payload: openingStep });
  }, [openingStep, dispatch]);
  // A multi-ID run returns to the ID picker for its next check, where Back
  // means "redo the previous one": that must not be hidden just because the
  // picker is also where a consent-less flow opens.
  const backAvailable = current !== openingStep || (stepOptions.multiId?.index ?? 0) > 0;
  return { openingStep, backAvailable };
}
