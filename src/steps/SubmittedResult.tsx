"use client";

import { useEffect, useState } from 'react';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { useVerificationContext } from '../context/VerificationContext';
import { isCancelledStatus } from '../lib/session-cancelled';
import { awaitVerificationOutcome, type VerificationOutcome } from '../lib/result-wait';
import { describeOutcome, describeWaiting } from '../lib/result-copy';
import { biometricCopyFor } from '../lib/biometric-copy';
import { configScope } from '../lib/scope';
import { useText } from '../i18n';
import { SubmittingScreen, SubmitSuccessScreen, type SubmitSuccessAction, type TerminalTone } from './SubmittedScreens';

// ─── The result screen (a flow that waits for its verdict) ──────────────────
//
// A biometric re-authentication delivered in the flow ('both', the default, or
// 'app') is answered NOW or it is useless. This screen is mounted from the
// submitted step's FIRST render and shows one loading screen through the
// selfie upload, the submission (`verificationId` is null until it lands) and
// the status poll, then the verdict, firing `onResult` once. The wait has a
// budget: past it the screen says so and the webhook remains the record,
// exactly as on every other flow. `action` is the terminal affordance the
// submitted step resolved (Done, the hosted redirect, the close-this-tab note)
// or nothing when the `doneButton` option hid it. Mirrors the RN SDK's
// screens/SubmittedResult.tsx.

const TONE: Record<'success' | 'error' | 'info', TerminalTone> = {
  success: 'success',
  error: 'declined',
  info: 'neutral',
};

export function SubmittedResult({
  verificationId,
  retryInfo,
  action,
}: {
  verificationId: string | null;
  retryInfo: { attempt: number; total: number } | null;
  action?: SubmitSuccessAction;
}) {
  const config = useVerificationConfig();
  const { dispatch } = useVerificationContext();
  const t = useText();
  const [outcome, setOutcome] = useState<VerificationOutcome | null>(null);

  useEffect(() => {
    if (!verificationId) return undefined;
    let alive = true;
    const api = config.api;
    void awaitVerificationOutcome({
      fetchStatus: () => api.status(verificationId).catch(() => null),
    }).then((settled) => {
      if (!alive) return;
      // Cancelled while the person waited: the modal swaps to the cancelled
      // screen. Never the status reason, which is the checks' own finding.
      if (settled.kind === 'settled' && isCancelledStatus(settled.status)) {
        dispatch({ type: 'SET_SESSION_CANCELLED', payload: { message: null } });
        return;
      }
      setOutcome(settled);
      if (settled.kind === 'settled') {
        config.onResult?.({
          verificationId,
          status: settled.status,
          reason: settled.reason,
          reasonCode: settled.reasonCode,
        });
      }
    });
    return () => {
      alive = false;
    };
    // The wait is tied to the verification, not to the callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verificationId]);

  // The org's own words for these screens, tokens filled (null = the defaults).
  const words = biometricCopyFor(config);
  if (!outcome) {
    const copy = describeWaiting({ scope: configScope(config), waitsForResult: true, retry: retryInfo, override: words.waiting }, t);
    return <SubmittingScreen title={copy.title} description={copy.description} retrying={retryInfo != null} />;
  }

  const copy = describeOutcome(outcome, words, t);
  return <SubmitSuccessScreen title={copy.title} description={copy.description} tone={TONE[copy.tone]} action={action} />;
}
