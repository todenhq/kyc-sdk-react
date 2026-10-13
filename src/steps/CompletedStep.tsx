'use client';

import React from 'react';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { KeyPeopleAwaitList, type AwaitRow } from './KeyPeopleAwaitList';
import { SubmitSuccessScreen } from './SubmittedScreens';
import { successAction, successDescription, successTitle } from './success-copy';
import { cancelledCopy, decidedCopy } from './completed-copy';
import { summaryIsCancelled } from '../lib/session-cancelled';
import { biometricCopyFor } from '../lib/biometric-copy';
import { configScope } from '../lib/scope';
import { useText } from '../i18n';
import { PresenceExpectations } from './presence-expectations';
import { showsPresencePromise } from '../lib/presence-promise';
import type { AwaitingPersonPayload } from '../services/api';

// The success screen as an applicant sees it when they come BACK to their link.
//
// It is the same screen SubmittedStep renders, not a look-alike: same copy, same
// people list, same terminal affordance. What differs is where the rows come
// from. Nothing the applicant typed survives the tab closing, so the server
// rebuilds them — which is also what makes the statuses live, since the people
// named here go and verify long after the screen was first shown.
//
// It never submits anything. That is the whole reason it is a separate
// component from SubmittedStep, which submits on mount.

/** Ownership as the list renders it: a whole number where that is honest. */
function formatPct(pct: number | null): string | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  return Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, '');
}

export function toAwaitRows(people: AwaitingPersonPayload[]): AwaitRow[] {
  return people.map((p) => ({
    name: p.name,
    role: p.role,
    pct: formatPct(p.ownershipPct),
    country: p.country,
    status: p.status,
    ...(p.inviteUrl ? { inviteUrl: p.inviteUrl } : {}),
    isApplicant: p.isApplicant,
    isCorporate: p.isCorporate ?? false,
  }));
}

export function CompletedStep() {
  const config = useVerificationConfig();
  const t = useText();
  const summary = config.completedSummary;

  const isBusiness = summary?.subjectType === 'business';
  const tokens = {
    firstName: config.userData?.firstName,
    lastName: config.userData?.lastName,
    // The register's name for the company, which is what it was verified as.
    businessName: summary?.businessName ?? config.userData?.businessName,
  };
  const rows = summary ? toAwaitRows(summary.keyPeople) : [];

  // WHAT HAPPENED, not merely that it was sent, worded for what was verified
  // (completed-copy.ts). The server's own reason rides along: it is user-safe
  // prose by contract, and `business_not_found` telling somebody to check the
  // registration number is the most useful thing this screen can say.
  //
  // Absent on an older server, which only ever reported the submission, so the
  // default keeps that behaviour rather than inventing a verdict.
  const outcome = summary?.outcome ?? 'submitted';
  // Cancelled first: its `outcome` reads `error` (kept for older clients), and
  // the screen must say what happened, not "something went wrong". Reached on a
  // refresh that finds the application cancelled while this screen was open;
  // a FIRST load of a cancelled summary never gets here (HostedVerification).
  const decided = summaryIsCancelled(summary) ? cancelledCopy(t) : decidedCopy(outcome, {
    isBusiness,
    scope: configScope(config),
    reason: summary?.reason ?? null,
    words: biometricCopyFor(config),
  }, t);

  return (
    <SubmitSuccessScreen
      tone={decided?.tone ?? 'success'}
      title={decided ? decided.title : successTitle(config.success, tokens, t)}
      description={
        decided ? decided.description : successDescription(config.success, tokens, isBusiness, configScope(config), t)
      }
      extra={
        <>
          {/* The presence card, exactly as the live success screen shows it —
              a reloaded finished link must not lose the one instruction that
              still applies (keep location on). Only on a success-ish outcome
              and only when the submission really carried a pin. */}
          {(!decided || decided.tone === 'success') &&
            showsPresencePromise(config) &&
            summary?.addressCollected === true && <PresenceExpectations />}
          {rows.length > 0 && <KeyPeopleAwaitList rows={rows} />}
        </>
      }
      action={successAction({
        success: config.success,
        hostedMode: config.hostedMode === true,
        tokens,
        onClose: () => config.onClose?.(),
      }, t)}
    />
  );
}
