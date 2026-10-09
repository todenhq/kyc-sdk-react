'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KYCApi, HandoffSessionSnapshot } from '../services/api';

/**
 * Lifecycle of the desktop side of a device handoff:
 * - `creating`  — minting the session (initial / after regenerate)
 * - `waiting`   — session live, QR shown, nobody has scanned yet
 * - `opened`    — the phone fetched the bootstrap; it's working on the flow
 * - `submitted` — the phone submitted; `verificationId` is available
 * - `expired`   — the 15-min TTL elapsed without a submission
 * - `error`     — the session couldn't be created
 */
export type DeviceHandoffPhase = 'creating' | 'waiting' | 'opened' | 'submitted' | 'expired' | 'error';

export interface DeviceHandoffState {
  phase: DeviceHandoffPhase;
  /** Human-typable / copyable short code (display only). */
  code: string | null;
  /** Hosted-page URL the QR encodes (also copyable as a link). */
  url: string | null;
  sessionId: string | null;
  /** Set once the phone submits (`phase === 'submitted'`). */
  verificationId: string | null;
  error: string | null;
  errorCode?: string;
  /**
   * The mint failed in a way that may have left a phone session holding this
   * attempt. Until a retry settles it, this device must not carry on alone.
   */
  unresolved: boolean;
  /** Mint a fresh session (used after expiry). */
  regenerate: () => void;
  /**
   * Return the one-verification budget the QR took, before verifying on this
   * device instead. Resolves false when the phone already has the flow open.
   */
  release: () => Promise<boolean>;
}

const POLL_INTERVAL_MS = 2500;

/** Preserve the server's machine-readable failure without coupling the hook to an error class. */
function handoffErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * A 4xx is the server answering "no": it created nothing. Anything else (no
 * response, a 5xx) leaves open whether the phone's session exists.
 */
export function serverRefused(error: unknown): boolean {
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500;
}

/**
 * Whether a failed mint may have left a phone session holding this attempt.
 * Only a request that reached out WITH a binding can: an unbound session
 * stands alone and holds nothing of this device's, and a request that was
 * never sent created nothing.
 */
export function mintLeftOwnershipOpen(boundSent: boolean, error: unknown): boolean {
  return boundSent && !serverRefused(error);
}

/** Which attempt the phone's session belongs to. One of the three is needed. */
export interface DeviceHandoffParent {
  /** The attempt's id, when the caller already holds it (a hosted page). */
  parentSessionId?: string | null;
  /**
   * Starts (or returns) this mount's attempt and answers its id. `undefined`
   * means the attempt cannot stand behind a phone session, which is then
   * created on its own (lib/handoff-parent.ts). It throws when there is no
   * attempt at all.
   */
  ensureParentSession?: (retry?: boolean) => Promise<string | undefined>;
  /**
   * The API client authenticates AS the attempt (a hosted page's session
   * token): the server binds the phone to it without being told which.
   */
  bearerIsParent?: boolean;
}

/** Whether there is an attempt to bind a phone session to. Never mint without one. */
export function canMintDeviceHandoff(parent: DeviceHandoffParent): boolean {
  return Boolean(parent.bearerIsParent || parent.ensureParentSession || parent.parentSessionId);
}

/**
 * Drives the desktop handoff session: creates it, then polls until the phone
 * submits (or the link expires). Pure state — the caller reacts to
 * `phase === 'submitted'` to fire `onSubmit`. `snapshot` is intentionally NOT a
 * dependency (it's a fresh object each render); regenerate via `regenerate()`.
 */
export function useDeviceHandoff(
  api: KYCApi,
  snapshot: HandoffSessionSnapshot,
  enabled: boolean,
  parent: DeviceHandoffParent = {},
): DeviceHandoffState {
  const { parentSessionId, ensureParentSession, bearerIsParent } = parent;
  const [phase, setPhase] = useState<DeviceHandoffPhase>('creating');
  const [code, setCode] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>();
  const [unresolved, setUnresolved] = useState(false);
  const [nonce, setNonce] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // The in-flight mint, keyed by what a mint is FOR. Two effect invocations for
  // the same key share one request and therefore one session.
  //
  // `cancelled` below reads like it prevents a duplicate and does not: it only
  // drops the state update, while the request has already reached the server and
  // the row already exists. Under StrictMode that minted two sessions per visit,
  // the first immediately orphaned. Dev-only today, because `api` is memoised —
  // but nothing here guaranteed that, and a mint with no guard is one unstable
  // dependency away from a session per render.
  //
  // Sharing the PROMISE rather than skipping the second run is what keeps this
  // correct: the first invocation's handler is cancelled, so if the second were
  // skipped no handler would ever apply the result and the QR would hang on
  // "creating" forever.
  const mintRef = useRef<{
    scope: object; nonce: number; boundSent: boolean;
    promise: ReturnType<typeof api.createHandoffSession>;
  } | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  // The parent this mint binds to. A mount that can start its own attempt
  // supplies `ensureParentSession`; a hosted page already holds one.
  const fallbackParent = ensureParentSession ? undefined : parentSessionId;
  const parentScope = useMemo(() => {
    let active = 0;
    return { api, ensureParentSession, parentSessionId: fallbackParent,
      acquire() { active++; return () => { active--; }; }, isActive: () => active > 0 };
  },
    [api, ensureParentSession, fallbackParent]);
  const mintEnabled = enabled && canMintDeviceHandoff({ parentSessionId, ensureParentSession, bearerIsParent });
  // Read by `release`, which must not be re-created as these change: the gate
  // captures it in a click handler.
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const releasingRef = useRef(false);

  // A release in flight owns the session: a fresh mint must wait for it.
  const regenerate = useCallback(() => { if (!releasingRef.current) setNonce((n) => n + 1); }, []);

  /**
   * Hand the flow's one-verification budget back before running it here.
   *
   * Minting the QR moved that budget to the phone's session, so a desktop that
   * walks away from the gate is holding a session that no longer owns it. The
   * refusal does not arrive until the next upload, several steps later, where
   * it reads as a broken flow rather than as a consequence of the QR.
   *
   * Resolves TRUE once the server has taken the phone's session back. FALSE
   * means it could not be asked: no session yet, the mint failed, a release is
   * already in flight, or the phone has the flow open. It THROWS when the
   * server was asked and did not confirm. A lost response does not prove the
   * phone's session is gone, so the caller must not carry on as if it were:
   * two devices would both believe they may submit this verification.
   */
  const release = useCallback(async (): Promise<boolean> => {
    const id = sessionIdRef.current;
    const mint = mintRef.current;
    if (!id || releasingRef.current || ['creating', 'error', 'opened', 'submitted'].includes(phaseRef.current)) return false;
    releasingRef.current = true;
    try {
      await api.cancelHandoffSession(id);
      // The session changed under the request (a fresh mint): not ours to clear.
      if (sessionIdRef.current !== id || mintRef.current !== mint) return false;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      sessionIdRef.current = null;
      mintRef.current = null;
      setSessionId(null);
      setCode(null);
      setUrl(null);
      return true;
    } finally {
      releasingRef.current = false;
    }
  }, [api]);

  useEffect(() => {
    if (!mintEnabled) return;
    const releaseScope = parentScope.acquire();

    let cancelled = false;
    const stopPoll = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    // State reflects this committed effect, never an abandoned render.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      sessionIdRef.current = null;
      setPhase('creating'); setSessionId(null); setCode(null); setUrl(null);
      setError(null); setErrorCode(undefined); setUnresolved(false); setVerificationId(null);
    });

    if (mintRef.current?.scope !== parentScope || mintRef.current?.nonce !== nonce) {
      const entry: NonNullable<typeof mintRef.current> = {
        scope: parentScope, nonce, boundSent: false,
        promise: undefined as never,
      };
      entry.promise = (async () => {
          const snapshot = snapshotRef.current;
          // A retry (nonce > 0) may start the attempt again if it failed.
          const bound = ensureParentSession
            ? await ensureParentSession(nonce > 0)
            : parentScope.parentSessionId ?? undefined;
          // The mount moved on (another key or user) while the attempt was
          // being started: this mint no longer belongs to what is on screen.
          if (!parentScope.isActive()) throw new Error('The verification attempt changed. Please try again.');
          // From here the server may hold a phone session tied to this attempt.
          entry.boundSent = Boolean(bound) || bearerIsParent === true;
          return api.createHandoffSession(snapshot, bound || undefined);
      })();
      mintRef.current = entry;
    }

    const minting = mintRef.current;
    minting.promise
      .then((res) => {
        if (cancelled) return;
        sessionIdRef.current = res.sessionId;
        setSessionId(res.sessionId);
        setCode(res.code);
        setUrl(res.url);
        setPhase('waiting');

        pollRef.current = setInterval(async () => {
          try {
            const s = await api.getHandoffSession(res.sessionId);
            // A released session is no longer this hook's to report on.
            if (cancelled || sessionIdRef.current !== res.sessionId) return;
            if (s.status === 'submitted') {
              setVerificationId(s.verificationId ?? null);
              setPhase('submitted');
              stopPoll();
            } else if (s.status === 'expired') {
              setPhase('expired');
              stopPoll();
            } else if (s.status === 'opened') {
              setPhase('opened');
            }
          } catch {
            /* transient poll failure — keep polling */
          }
        }, POLL_INTERVAL_MS);
      })
      .catch((err: unknown) => {
        // Drop the failed attempt so a retry actually retries rather than
        // re-reading the same rejection.
        if (mintRef.current?.scope === parentScope && mintRef.current?.nonce === nonce) mintRef.current = null;
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not start device handoff.');
        setErrorCode(handoffErrorCode(err));
        setUnresolved(mintLeftOwnershipOpen(minting.boundSent, err));
        setPhase('error');
      });

    return () => {
      cancelled = true;
      releaseScope();
      stopPoll();
    };
  }, [api, mintEnabled, nonce, ensureParentSession, bearerIsParent, parentScope]);

  return { phase, code, url, sessionId, verificationId, error, errorCode, unresolved, regenerate, release };
}
