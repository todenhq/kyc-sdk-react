import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resumedApplicationFrom, submissionRequestId } from './resumed-application';
import { verificationReducer, initialVerificationState } from '../context/VerificationContext';

// A KYB applicant whose phone died between the business submission and their
// own verification reopened the flow and was told "Start or resume this
// business verification session before submitting" (2026-09-28): the restored
// submitting screen sent the business again under a NEW request id, and the
// server refuses a second application on a session the first one claimed.
// The fix replays the parent's own request id, which the server answers from
// the existing row.

const RESUME = {
  applicantKeyPersonId: 'kp_123',
  parentVerificationId: 'ver_abc',
  parentRequestId: 'kyb_original',
};

describe('resumedApplicationFrom', () => {
  it('reads the three facts a start/bootstrap response carries', () => {
    expect(resumedApplicationFrom(RESUME)).toEqual({
      verificationId: 'ver_abc',
      applicantKeyPersonId: 'kp_123',
      requestId: 'kyb_original',
    });
  });

  it('is null for an ordinary resume, and for any fact missing or blank', () => {
    expect(resumedApplicationFrom({})).toBeNull();
    expect(resumedApplicationFrom({ ...RESUME, parentRequestId: undefined })).toBeNull();
    expect(resumedApplicationFrom({ ...RESUME, parentVerificationId: '' })).toBeNull();
    expect(resumedApplicationFrom({ ...RESUME, applicantKeyPersonId: 42 })).toBeNull();
  });
});

describe('submissionRequestId', () => {
  const fresh = () => 'kyb_new';
  const resumed = resumedApplicationFrom(RESUME);

  it('replays the parent request id for a resumed business application', () => {
    expect(submissionRequestId(true, resumed, fresh)).toBe('kyb_original');
  });

  it('mints a new id otherwise', () => {
    expect(submissionRequestId(true, null, fresh)).toBe('kyb_new');
    // An individual flow never replays a business id.
    expect(submissionRequestId(false, resumed, () => 'kyc_new')).toBe('kyc_new');
  });
});

describe('reducer', () => {
  it('holds the resumed application beside the session id, and survives a restore', () => {
    const resumed = resumedApplicationFrom(RESUME);
    let state = verificationReducer(initialVerificationState, { type: 'SET_SESSION_ID', payload: 'sess_1' });
    state = verificationReducer(state, { type: 'RESTORE_PROGRESS', payload: { step: 'submitted' } });
    state = verificationReducer(state, { type: 'SET_RESUMED_APPLICATION', payload: resumed });
    expect(state.resumedApplication).toEqual(resumed);
    expect(state.sessionId).toBe('sess_1');
    expect(verificationReducer(state, { type: 'RESET' }).resumedApplication).toBeNull();
  });
});

// Both mounts must hand the resume facts to the reducer, and the submitting
// screen must use them. A mount that drops them brings the refusal straight back.
describe('wiring', () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url).pathname, 'utf8');

  it('the embedded mount records the resumed application from session start', () => {
    expect(read('../Verification.tsx')).toContain('resumedApplicationFrom(started)');
  });

  it('the hosted flow passes the bootstrap facts to the session sync', () => {
    expect(read('../hosted/HostedFlow.tsx')).toMatch(/<HostedSessionSync[^>]*bootstrap=\{bootstrap\}/);
    expect(read('../hosted/HostedSessionSync.tsx')).toContain('resumedApplicationFrom(bootstrap)');
  });

  it('the submitting screen chooses its request id through submissionRequestId', () => {
    expect(read('../steps/SubmittedStep.tsx')).toContain('submissionRequestId(business, state.resumedApplication');
  });
});
