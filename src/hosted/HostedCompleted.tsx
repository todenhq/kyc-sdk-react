'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { VerificationProvider, useVerificationContext } from '../context/VerificationContext';
import { VerificationConfigProvider, type ServerSdkConfig } from '../context/VerificationConfigContext';
import { VerificationModal } from '../components/VerificationModal';
import type { AddressCollectionConfig, AnyCountry, VerificationAppearance, VerificationSuccessContent } from '../types/config';
import type { CompletedSessionSummary, VerificationApi } from '../services/api';

// The hosted page for a session that is ALREADY submitted.
//
// It mounts the real SDK chrome — org header and logo, environment banner,
// theme toggle, the vendor footer — and parks it on the terminal step, so a
// returning applicant lands on the screen they left rather than a stripped-down
// stand-in. No flow runs: nothing here can capture, upload or submit.
//
// It matters most for KYB. The applicant's job is not finished when they
// submit; they still have to get each director to the link minted for them, and
// those links outlive the session several times over. This is where they come
// back for them, and where they find out who has already done it.

/** How often the statuses are re-read while anybody still owes a check. */
const POLL_MS = 20_000;

function stillWaiting(summary: CompletedSessionSummary): boolean {
  // A decided application has nothing left to converge on, and its invites have
  // been voided, so there is no list to keep fresh either.
  const outcome = summary.outcome ?? 'submitted';
  if (summary.cancelled === true || outcome === 'declined' || outcome === 'error') return false;
  return summary.keyPeople.some((p) => p.status === 'pending' || p.status === 'failed');
}

/**
 * Keep the reducer's own open flag in step with the modal, which is rendered
 * open unconditionally here. The STEP is seeded on the provider instead of
 * dispatched, so the terminal screen is what paints first.
 */
function MarkOpen() {
  const { dispatch } = useVerificationContext();
  useEffect(() => {
    dispatch({ type: 'OPEN_MODAL' });
  }, [dispatch]);
  return null;
}

export function HostedCompleted({
  token,
  api,
  summary: initial,
  embedded = false,
  onClose,
}: {
  token: string;
  api: VerificationApi;
  summary: CompletedSessionSummary;
  /**
   * Mounted inside a host application (the dashboard's "Continue
   * verification" after submission) rather than on the hosted page: the modal
   * becomes closable, the success action is a real Done wired to onClose, and
   * the caller wraps this in its isolation frame. The applicant's job is not
   * finished at submit — the key-people invite links live here — so the
   * embedded mount gets the same screen, not a stripped-down stand-in.
   */
  embedded?: boolean;
  onClose?: () => void;
}) {
  const [summary, setSummary] = useState(initial);
  const snap = summary.configSnapshot;

  const refresh = useCallback(() => {
    api
      .completedSession(token)
      .then(setSummary)
      // A failed refresh is not worth a message: the screen it would replace is
      // still true, only a little older.
      .catch(() => undefined);
  }, [api, token]);

  // The people named here go and verify AFTER this screen was first shown, so
  // it re-reads while any of them still owes a check, and again whenever the tab
  // comes back to the foreground (which is when somebody is actually looking).
  useEffect(() => {
    if (!stillWaiting(summary)) return;
    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, summary]);

  const serverConfigOverride: ServerSdkConfig = {
    status: 'ready',
    // Nothing is being verified here, so there is no ID list to resolve.
    idTypes: [],
    environment: summary.environment,
    ...(summary.branding ? { branding: summary.branding } : {}),
  };

  return (
    <VerificationProvider initialStep="submitted">
      <VerificationConfigProvider
        apiKey={`hs_${token}`}
        apiOverride={api}
        serverConfigOverride={serverConfigOverride}
        hostedMode={!embedded}
        onClose={onClose}
        completedSummary={summary}
        // Business snapshots carry their country on the business block.
        country={(snap.country ?? snap.business?.country) as AnyCountry}
        appearance={snap.appearance as VerificationAppearance | undefined}
        success={snap.success as VerificationSuccessContent | undefined}
        texts={snap.texts}
        userData={snap.userData}
        // The scope is what tells the returning screen WHAT was verified: without
        // it a finished face check read "This business has been verified" (user
        // report 2026-09-08). The biometric block carries the org's own words
        // for that verdict, so the screen matches the one the person left.
        scope={snap.scope as import('../lib/scope').WorkflowScope | undefined}
        biometric={snap.biometric}
        // Without this the returning screen cannot know presence is on, and
        // the "address check active" card silently vanished on reload — the
        // one instruction that still applies (keep location on).
        addressCollection={snap.addressCollection as AddressCollectionConfig | undefined}
        assetsBasePath={snap.assetsBasePath}
      >
        <MarkOpen />
        <VerificationModal
          open
          onClose={embedded ? () => onClose?.() : () => undefined}
          showThemeToggle={snap.showThemeToggle}
          disableClose={!embedded}
          fullScreen={snap.fullScreen}
        />
      </VerificationConfigProvider>
    </VerificationProvider>
  );
}
