import { describe, expect, it } from 'vitest';
import { VerificationApiError, type VerificationStatusResponse } from '../services/api';
import { mapToVerificationError } from './errors';
import { awaitVerificationOutcome, isPendingStatus } from './result-wait';
import { describeOutcome } from './result-copy';
import { recoveryStepFor } from './submit-recovery';
import { verificationReducer, initialVerificationState } from '../context/VerificationContext';
import {
  classifySessionStartFailure,
  isCancelledStatus,
  isSessionCancelledError,
  progressSaveStopsFlow,
  sessionCancelledMessage,
  SESSION_CANCELLED_MESSAGE,
  summaryIsCancelled,
} from './session-cancelled';

// An organisation can cancel a verification session midway. The server then
// answers 409 { error: 'session_cancelled', message } from the session start,
// the hosted bootstrap, progress saves and /verify, and status 'cancelled'
// from /status/:id. Retrying can never succeed, so no path may offer Try again.

const SERVER = 'This verification was cancelled. Contact the organisation that sent it if you think this is a mistake.';
const cancelled = (message: string = SERVER) =>
  new VerificationApiError(message, 409, 'session_cancelled', { error: 'session_cancelled', message });

describe('reading the refusal', () => {
  it('recognises a session_cancelled refusal and nothing else', () => {
    expect(isSessionCancelledError(cancelled())).toBe(true);
    expect(isSessionCancelledError(new VerificationApiError('used', 409, 'handoff_session_used'))).toBe(false);
    expect(isSessionCancelledError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isSessionCancelledError(null)).toBe(false);
  });

  it('takes the server sentence, never the bare code', () => {
    expect(sessionCancelledMessage(cancelled())).toBe(SERVER);
    expect(sessionCancelledMessage(cancelled('session_cancelled'))).toBeNull();
    expect(sessionCancelledMessage(cancelled('  '))).toBeNull();
  });

  it('stops the flow on a cancelled start or save, and only then', () => {
    expect(classifySessionStartFailure(cancelled())).toEqual({ kind: 'cancelled', message: SERVER });
    expect(classifySessionStartFailure(new VerificationApiError('x', 500))).toEqual({ kind: 'ignore' });
    expect(progressSaveStopsFlow(cancelled())).toBe(true);
    expect(progressSaveStopsFlow(new VerificationApiError('x', 409, 'handoff_session_used'))).toBe(false);
  });
});

describe('the submission', () => {
  it('maps to its own error code, never a retry', () => {
    for (const context of ['verify', 'upload'] as const) {
      const e = mapToVerificationError(cancelled(), context);
      expect(e.code).toBe('session_cancelled');
      expect(e.message).toBe(SERVER);
    }
    expect(mapToVerificationError(cancelled('session_cancelled'), 'verify').message).not.toMatch(/try again/i);
  });

  it('offers no Go back', () => {
    // The submitted step returns before reading recovery, but the rule holds too.
    expect(recoveryStepFor('session_cancelled', ['consent', 'id-input', 'submitted'])).toBeNull();
  });
});

describe('the flow state', () => {
  it('keeps the first message and survives a reset', () => {
    let s = verificationReducer(initialVerificationState, { type: 'SET_SESSION_CANCELLED', payload: { message: 'first' } });
    s = verificationReducer(s, { type: 'SET_SESSION_CANCELLED', payload: { message: 'second' } });
    expect(s.sessionCancelled).toEqual({ message: 'first' });
    expect(verificationReducer(s, { type: 'RESET' }).sessionCancelled).toEqual({ message: 'first' });
  });
});

describe('the status poll', () => {
  const read = (status: VerificationStatusResponse['status'], reason?: string): VerificationStatusResponse =>
    ({ verificationId: 'ver_1', status, createdAt: '2026-10-01T00:00:00Z', reason });

  it('treats cancelled as terminal', async () => {
    expect(isPendingStatus('cancelled')).toBe(false);
    expect(isCancelledStatus('cancelled')).toBe(true);
    const queue = [read('processing'), read('cancelled', 'Selfie mismatch.')];
    let t = 0;
    const out = await awaitVerificationOutcome({
      fetchStatus: async () => queue.shift() ?? null,
      sleep: async (ms) => { t += ms; },
      now: () => t,
      waitMs: 10_000,
      pollMs: 1000,
    });
    expect(out).toMatchObject({ kind: 'settled', status: 'cancelled' });
  });

  it('words a cancelled outcome as cancelled, never with the checks reason', () => {
    const copy = describeOutcome({ kind: 'settled', status: 'cancelled', reason: 'Selfie mismatch.', reasonCode: null });
    expect(copy.title).toBe('This verification was cancelled');
    expect(copy.description).toBe(SESSION_CANCELLED_MESSAGE);
    expect(copy.description).not.toMatch(/—/);
  });
});

describe('summaryIsCancelled', () => {
  it('reads only the explicit flag', () => {
    expect(summaryIsCancelled({ cancelled: true })).toBe(true);
    expect(summaryIsCancelled({ cancelled: false })).toBe(false);
    // An older server sends no flag; an `error` outcome is not a cancellation.
    expect(summaryIsCancelled({})).toBe(false);
    expect(summaryIsCancelled(null)).toBe(false);
    expect(summaryIsCancelled(undefined)).toBe(false);
    expect(summaryIsCancelled({ cancelled: 'true' })).toBe(false);
  });
});
