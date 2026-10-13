// ---------------------------------------------------------------------------
// withRetry — shared retry/backoff for the SDK's network operations
//
// Wraps the SDK's network calls (media upload, verify submission) so transient
// failures — lost connection, request timeouts, 5xx — are retried with
// exponential backoff + jitter before giving up. Terminal failures (4xx auth /
// credits / forbidden) are NOT retried; they surface immediately.
//
// This mirrors the Flutter SDK's `withRetry` (services/retry.dart) so both
// platforms behave identically. After retries are exhausted the original error
// is rethrown — the caller maps it to a typed VerificationError for `onError`.
// ---------------------------------------------------------------------------

import { VerificationApiError } from '../services/api';

export interface RetryOptions {
  /** Total attempts including the first try. Default 3. */
  retries?: number;
  /** Base delay before the first retry (ms). Default 500. */
  baseDelayMs?: number;
  /** Backoff multiplier between attempts. Default 2. */
  factor?: number;
  /** Max delay cap (ms). Default 4000. */
  maxDelayMs?: number;
  /**
   * Notified before each retry with the upcoming attempt number (2-based) and
   * the total. Lets the UI show "Retrying (2/3)…".
   */
  onRetry?: (attempt: number, total: number) => void;
}

/**
 * Whether an error is transient (worth retrying). A `VerificationApiError` is transient
 * only for 5xx; 4xx are terminal. A `TypeError` from `fetch()` is a network
 * failure (offline / DNS / CORS) — transient. Anything else is treated as
 * transient (best-effort) up to the retry cap.
 */
export function isTransientError(err: unknown): boolean {
  if (err instanceof VerificationApiError) {
    return err.statusCode >= 500 || err.statusCode === 0;
  }
  // fetch() rejects with a TypeError on network failure.
  if (err instanceof TypeError) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs `fn`, retrying on transient errors with exponential backoff + jitter.
 * Rethrows the last error once attempts are exhausted (or immediately for a
 * terminal error).
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 500,
    factor = 2,
    maxDelayMs = 4000,
    onRetry,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const hasMore = attempt < retries;
      if (!hasMore || !isTransientError(err)) throw err;

      onRetry?.(attempt + 1, retries);
      const backoff = Math.min(baseDelayMs * factor ** (attempt - 1), maxDelayMs);
      // Full jitter — spread retries so a flaky network doesn't see synchronized bursts.
      const delay = Math.random() * backoff;
      await sleep(delay);
    }
  }
  throw lastError;
}
