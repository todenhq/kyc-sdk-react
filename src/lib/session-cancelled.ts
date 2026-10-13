// ─── A cancelled session ────────────────────────────────────────────────────
//
// An organisation (or Myaza support) can cancel a verification session midway,
// reversibly. While it is cancelled the server refuses to let the applicant
// reopen or restart it: `409 { error: 'session_cancelled', message }` from the
// session start, the hosted bootstrap and link mint, every request made with
// the hosted `hs_` bearer, progress saves and `/verify`; and the status read
// answers `status: 'cancelled'`.
//
// None of that is something the applicant can fix by trying again, so it must
// never reach the generic "Something went wrong / Try again" screen. These
// helpers are the one place that recognises it. Duck-typed on `code` rather
// than `instanceof VerificationApiError`, so this module stays import-free (the API
// client depends on it, not the other way round).

/** The server's error token for a refused, cancelled session. */
export const SESSION_CANCELLED_CODE = 'session_cancelled';

/** The status `GET /api/v1/status/:id` answers for a cancelled verification. */
export const CANCELLED_STATUS = 'cancelled';

/** What the screen says when the server sent no sentence of its own. Mirrors
 *  the server's own wording and the `general.sessionCancelled.description`
 *  catalogue default. */
export const SESSION_CANCELLED_MESSAGE =
  'This verification was cancelled. Contact the organisation that sent it if you think this is a mistake.';

/** Whether an error thrown by the API client is a cancelled-session refusal. */
export function isSessionCancelledError(err: unknown): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    (err as { code?: unknown }).code === SESSION_CANCELLED_CODE
  );
}

/**
 * The server's own sentence for the refusal, or null when it sent none (the
 * screen then shows the catalogue default). A message equal to the bare code
 * is the client's fallback for a body without one, not a sentence.
 */
export function sessionCancelledMessage(err: unknown): string | null {
  if (err === null || typeof err !== 'object') return null;
  const raw = (err as { message?: unknown }).message;
  if (typeof raw !== 'string') return null;
  const message = raw.trim();
  if (!message || message === SESSION_CANCELLED_CODE) return null;
  return message;
}

/**
 * Whether a completed-session summary (a returning applicant's finished link)
 * says the application was cancelled. Only the explicit flag counts: its
 * `outcome` reads `error` for a cancelled application (kept for older clients),
 * and an `error` is not a cancellation.
 */
export function summaryIsCancelled(summary: { cancelled?: unknown } | null | undefined): boolean {
  return summary?.cancelled === true;
}

/** Whether a status read says the verification was cancelled. Terminal. */
export function isCancelledStatus(status: string | null | undefined): boolean {
  return status === CANCELLED_STATUS;
}

/**
 * What a failed session start means for the flow. A start is otherwise
 * best-effort (resuming is a convenience, verifying is not conditional on it),
 * so every other failure is ignored and the flow carries on. A cancelled
 * session is the exception: carrying on would walk the applicant through
 * capture steps whose submission the server will refuse.
 */
export type SessionStartFailure = { kind: 'cancelled'; message: string | null } | { kind: 'ignore' };

export function classifySessionStartFailure(err: unknown): SessionStartFailure {
  return isSessionCancelledError(err)
    ? { kind: 'cancelled', message: sessionCancelledMessage(err) }
    : { kind: 'ignore' };
}

/**
 * Whether a failed progress save should stop the flow. Saves are best-effort
 * and a failure is normally retried on the next change; a cancelled session
 * refuses every save, so retrying could only fail again.
 */
export function progressSaveStopsFlow(err: unknown): boolean {
  return isSessionCancelledError(err);
}
