'use client';

import React, { useEffect, useState } from 'react';
import { Check } from './components/icons';
import { createVerificationApi, type CompletedSessionSummary, type HandoffBootstrapResponse, type VerificationApi } from './services/api';
import { HostedCompleted } from './hosted/HostedCompleted';
import { HostedFlow } from './hosted/HostedFlow';
import { HostedLoadingScreen, HostedScreen } from './hosted/HostedScreen';
import { HANDOFF_TOKEN_PREFIX } from './hosted/token';
import { SdkFrame } from './lib/sdk-frame';
import type { HostedVerificationProps } from './hosted/hosted-props';
import { setFaceMeshOrigin } from './liveness/face-mesh';
import type { VerificationAppearance } from './types/config';
import {
  isSessionCancelledError,
  sessionCancelledMessage,
  summaryIsCancelled,
  SESSION_CANCELLED_MESSAGE,
} from './lib/session-cancelled';
import { VerificationError } from './types/verification';

export type { HostedVerificationProps, HostedVerificationReadyInfo } from './hosted/hosted-props';

/**
 * Hosted "continue on your phone" entry point. Rendered by the Myaza-hosted
 * verification page (`/verify/<token>`), NOT by customers directly. It bootstraps
 * the flow from the session token and runs the SAME steps as `<Verification />`,
 * authenticating every upload/verify with the session token (relative base URL,
 * so requests go through the hosting origin's API proxy).
 */
export function HostedVerification({
  token,
  serverUrl = '',
  embedded = false,
  appearance,
  onClose,
  onReady,
  onStart,
  onStepChange,
  onSubmit,
  onResult,
  onError,
  onCompleted,
}: HostedVerificationProps) {
  // Direct to the API when the page names it; '' keeps the old same-origin
  // proxy path (see HostedVerificationProps.serverUrl for why direct is right).
  const [api] = useState<VerificationApi>(() => {
    // The face mesh comes from the same server, with the public CDN behind it.
    // Set here, before the flow mounts and starts loading it.
    setFaceMeshOrigin({ serverUrl });
    return createVerificationApi(serverUrl, `${HANDOFF_TOKEN_PREFIX}${token}`);
  });
  const [phase, setPhase] = useState<'loading' | 'ready' | 'completed' | 'cancelled' | 'error'>('loading');
  const [bootstrap, setBootstrap] = useState<HandoffBootstrapResponse | null>(null);
  const [summary, setSummary] = useState<CompletedSessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Cancelled by the organisation: its own screen, never "link unavailable"
    // (which reads as expired) or a generic error, and reported to the host once.
    const reportCancelled = (message: string) => {
      setError(message);
      setPhase('cancelled');
      try {
        onError?.(new VerificationError('session_cancelled', message));
      } catch {
        /* a host's handler must never break the page */
      }
    };
    api
      .bootstrapHandoff(token)
      .then((data) => {
        if (cancelled) return;
        setBootstrap(data);
        setPhase('ready');
        onReady?.({
          sessionId: data.sessionId,
          environment: data.environment,
          subjectType: data.configSnapshot.subjectType,
          scope: data.configSnapshot.scope,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Already submitted is the person who FINISHED coming back to their own
        // link. Telling them it is unavailable reads as though their
        // application was lost, which is the opposite of what happened. Rebuild
        // the success screen instead — for a KYB applicant it is where their
        // directors' verification links live, and those outlive the session.
        if (
          err !== null &&
          typeof err === 'object' &&
          (err as { code?: string }).code === 'handoff_session_used'
        ) {
          api
            .completedSession(token)
            .then((data) => {
              if (cancelled) return;
              // Cancelled after it was submitted: the same screen and the same
              // single onError as a cancelled link refused at the bootstrap,
              // never the generic "something went wrong" verdict its `outcome`
              // (`error`, kept for older clients) would otherwise produce.
              if (summaryIsCancelled(data)) {
                reportCancelled(SESSION_CANCELLED_MESSAGE);
                return;
              }
              setSummary(data);
              setPhase('completed');
              onCompleted?.(data);
            })
            .catch(() => {
              // The summary is an enrichment, not the message. Falling back to
              // the plain confirmation still tells them the true thing.
              if (cancelled) return;
              setPhase('completed');
              onCompleted?.(null);
            });
          return;
        }
        if (isSessionCancelledError(err)) {
          reportCancelled(sessionCancelledMessage(err) ?? SESSION_CANCELLED_MESSAGE);
          return;
        }
        setError(err instanceof Error ? err.message : 'This verification link is no longer valid.');
        setPhase('error');
      });
    return () => {
      cancelled = true;
    };
    // Callbacks are read once, at bootstrap: a host re-rendering with a fresh
    // function must not re-run the bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, token]);

  const frame = (body: React.ReactNode) => <SdkFrame isolate={embedded}>{body}</SdkFrame>;
  // The screens around the flow wear the workflow's colours: the page's
  // server-read appearance before the bootstrap, the snapshot's after (the
  // same data — see HostedVerificationProps.appearance).
  const screenAppearance =
    (bootstrap?.configSnapshot as { appearance?: VerificationAppearance } | null)?.appearance ?? appearance;

  if (phase === 'loading') {
    return frame(<HostedLoadingScreen appearance={appearance} compact={embedded} />);
  }

  // Somebody returning should land on the screen they left — the real one, with
  // the org's branding, its success copy, and (for KYB) the people the review is
  // still waiting on, each with a link to copy and a live status. Embedded
  // mounts get the SAME screen as a closable modal: a submitted application's
  // key-people invite links live here, and the applicant's job is not finished
  // until those people verify.
  if (phase === 'completed' && summary) {
    const done = (
      <HostedCompleted token={token} api={api} summary={summary} embedded={embedded} onClose={onClose} />
    );
    return embedded ? frame(done) : done;
  }

  // Only when the summary could not be loaded. The confirmation is still true;
  // it is the people list that is missing.
  if (phase === 'completed') {
    return frame(
      <HostedScreen appearance={screenAppearance} compact={embedded}>
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10">
          <Check className="h-10 w-10 text-emerald-500" />
        </span>
        <h1 className="text-lg font-semibold font-heading">Verification submitted</h1>
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          This has already been sent for review. There is nothing more for you to do{embedded ? '.' : ', and you can close this tab.'}
        </p>
      </HostedScreen>,
    );
  }

  if (phase === 'cancelled') {
    return frame(
      <HostedScreen appearance={screenAppearance} compact={embedded}>
        <h1 className="text-lg font-semibold font-heading">This verification was cancelled</h1>
        <p className="max-w-xs text-center text-sm text-muted-foreground">{error ?? SESSION_CANCELLED_MESSAGE}</p>
      </HostedScreen>,
    );
  }

  if (phase === 'error' || !bootstrap) {
    return frame(
      <HostedScreen appearance={screenAppearance} compact={embedded}>
        <h1 className="text-lg font-semibold font-heading">Link unavailable</h1>
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          {error ?? 'This verification link has expired or already been used. Return to your computer to start again.'}
        </p>
      </HostedScreen>,
    );
  }

  return frame(
    <HostedFlow
      token={token}
      api={api}
      bootstrap={bootstrap}
      embedded={embedded}
      onClose={onClose}
      onStart={onStart}
      onStepChange={onStepChange}
      onSubmit={onSubmit}
      onResult={onResult}
      onError={onError}
    />,
  );
}
