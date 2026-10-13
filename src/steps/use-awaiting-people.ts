'use client';

import { useEffect, useState } from 'react';
import type { AwaitingPersonPayload, VerificationApi } from '../services/api';

// The SERVER's list of who a submitted KYB application is waiting on.
//
// Two different kinds of change, treated differently on purpose:
//
// MEMBERSHIP settles once. The registry lookup runs after submission and can add
// people the applicant never listed, so nothing renders until the server says it
// has finished (`keyPeopleSettled`) - a list shown earlier is one director short,
// and rows appearing under the reader is the failure this hook replaced.
//
// STATUS stays live. The people on the list go and verify AFTER this screen is
// first shown, and an applicant sitting on it deserves to see a row turn green
// without hunting for a reload button. Discovery is finished by then, so these
// re-reads can only flip badges, never move the list.
//
// Works for BOTH mount kinds: a hosted page reads by its session token, an
// embedded mount by its sessionId under the API key (the authed summary route).
// Before that second read existed, an embedded success screen could only show
// the submit-time invites — which cannot include the people registry discovery
// adds moments later — so mobile and hosted told different stories about one
// application.

/** How often to re-ask while the server says it is still reconciling. */
const RETRY_MS = 1500;
/**
 * How long to wait before showing whatever there is.
 *
 * Discovery is seconds. This exists for the case where it never reports
 * finishing at all - its final write is best-effort - because an applicant left
 * looking at a spinner forever is worse than one shown a list that might be
 * short. Never waiting and never rendering are both failures; this picks the
 * lesser one.
 */
const GIVE_UP_MS = 15_000;
/** How often statuses refresh once the list is settled, while anybody owes a check. */
const POLL_MS = 20_000;

/** Anything that can still change: an open check, or a failure they may retry. */
function anyoneStillOwes(people: AwaitingPersonPayload[]): boolean {
  return people.some((p) => p.status === 'pending' || p.status === 'submitted' || p.status === 'failed');
}

export interface AwaitingPeople {
  /** Null until the answer is final. The screen renders nothing before that. */
  people: AwaitingPersonPayload[] | null;
}

export function useAwaitingPeople(
  api: VerificationApi,
  ref: { token?: string; sessionId?: string | null },
  enabled: boolean,
): AwaitingPersonPayload[] | null {
  const [people, setPeople] = useState<AwaitingPersonPayload[] | null>(null);
  const { token, sessionId } = ref;

  useEffect(() => {
    if ((!token && !sessionId) || !enabled) return undefined;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let committed = false;
    const startedAt = Date.now();

    const read = async () => {
      if (cancelled) return;
      const summary = await (token
        ? api.completedSession(token)
        : api.sessionSummary(sessionId as string)
      ).catch(() => null);
      if (cancelled) return;
      const expired = Date.now() - startedAt > GIVE_UP_MS;

      // Settled, or out of patience: commit. Membership stops moving here —
      // discovery has finished — so later reads only refresh the statuses,
      // slowly, and stop once nobody owes anything.
      if (summary && (summary.keyPeopleSettled !== false || expired)) {
        committed = true;
        setPeople(summary.keyPeople);
        if (anyoneStillOwes(summary.keyPeople)) {
          timer = setTimeout(() => void read(), POLL_MS);
        }
        return;
      }
      if (committed) {
        // One failed refresh must not end the updates: the list on screen is
        // still true, only a little older. Try again at the slow cadence.
        timer = setTimeout(() => void read(), POLL_MS);
        return;
      }
      if (expired) {
        // Nothing readable at all — leave the list absent rather than empty,
        // which would claim there is nobody to verify.
        return;
      }
      timer = setTimeout(() => void read(), RETRY_MS);
    };

    // A tab left open on this screen is re-read the moment somebody comes back
    // to it, which is exactly when a stale badge would be noticed.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer) clearTimeout(timer);
      void read();
    };
    document.addEventListener('visibilitychange', onVisible);

    void read();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [api, token, sessionId, enabled]);

  return people;
}
