import { describe, it, expect } from 'vitest';
import { applyResubmitSteps, isResubmission, keepsIdEvidence, keptIdType, resubmitNote } from './resubmit';
import type { VerificationStep } from '../types/config';

const FULL: VerificationStep[] = [
  'consent',
  'email-verification',
  'id-type',
  'document-capture',
  'liveness',
  'proof-of-address',
  'questionnaire',
  'submitted',
];

describe('applyResubmitSteps', () => {
  it('keeps what was asked for, the frame, and enough to submit', () => {
    // `id-type` rides along because a resubmission is a NEW verification on a
    // FRESH session: nothing carries over from the attempt being redone, so the
    // applicant must still say which ID this is or POST /verify has no idType.
    expect(applyResubmitSteps(FULL, { steps: ['document-capture'] })).toEqual([
      'consent',
      'id-type',
      'document-capture',
      'submitted',
    ]);
  });

  it('treats the evidence steps as a family, since the ID type is not chosen yet', () => {
    // THE REPORTED BUG. A reviewer sent back a NIN verification asking for
    // `id-input`, but before an ID type is picked the flow is shaped for
    // `document-capture` — so the plan matched nothing, fell through to the
    // safety net, and ran every step. Whichever evidence step this flow has is
    // the one that was meant.
    expect(applyResubmitSteps(FULL, { steps: ['id-input'] })).toEqual([
      'consent',
      'id-type',
      'document-capture',
      'submitted',
    ]);
    // …and once NIN is chosen the flow reshapes, still narrowed to the ID.
    const numberOnly: VerificationStep[] = ['consent', 'id-type', 'id-input', 'liveness', 'submitted'];
    expect(applyResubmitSteps(numberOnly, { steps: ['id-input'] })).toEqual([
      'consent',
      'id-type',
      'id-input',
      'submitted',
    ]);
  });

  it('walks them in FLOW order, not the order they were ticked', () => {
    // The reviewer ticked liveness first. Sending somebody through liveness
    // before their document because of a checkbox order would be nonsense.
    expect(applyResubmitSteps(FULL, { steps: ['liveness', 'id-type'] })).toEqual([
      'consent',
      'id-type',
      'document-capture',
      'liveness',
      'submitted',
    ]);
  });

  it('runs the whole flow when nothing was narrowed', () => {
    expect(applyResubmitSteps(FULL, { steps: [] })).toEqual(FULL);
    expect(applyResubmitSteps(FULL, null)).toEqual(FULL);
    expect(applyResubmitSteps(FULL, undefined)).toEqual(FULL);
  });

  // A server that learns a step name before this SDK does must not strand the
  // applicant on a two-screen flow that collects nothing.
  it('runs the whole flow when the asked steps are all unknown', () => {
    expect(applyResubmitSteps(FULL, { steps: ['telepathy-check'] })).toEqual(FULL);
  });

  it('ignores an asked step this particular flow does not have', () => {
    // PoA is off in this workflow; asking for it should not add it. The ID
    // still comes along — see the first case for why.
    const noPoa = FULL.filter((s) => s !== 'proof-of-address');
    expect(applyResubmitSteps(noPoa, { steps: ['proof-of-address', 'liveness'] })).toEqual([
      'consent',
      'id-type',
      'document-capture',
      'liveness',
      'submitted',
    ]);
  });

  it('keeps a KYB redo submittable through business-details, not the ID picker', () => {
    const kyb: VerificationStep[] = [
      'consent',
      'business-details',
      'business-documents',
      'business-key-people',
      'questionnaire',
      'submitted',
    ];
    expect(applyResubmitSteps(kyb, { steps: ['business-documents'] })).toEqual([
      'consent',
      'business-details',
      'business-documents',
      'submitted',
    ]);
  });

  it('skips the ID steps when the server keeps the ID and the reviewer asked for the selfie', () => {
    // THE REPORTED BUG: "Selfie and liveness" was ticked and the link opened on
    // the ID type picker. The server now keeps the ID and fills its evidence in.
    expect(applyResubmitSteps(FULL, { steps: ['liveness'], idType: 'pvc' })).toEqual([
      'consent',
      'liveness',
      'submitted',
    ]);
  });

  it('keeps the evidence but not the picker when the document was asked for', () => {
    expect(applyResubmitSteps(FULL, { steps: ['document-capture', 'liveness'], idType: 'pvc' })).toEqual([
      'consent',
      'document-capture',
      'liveness',
      'submitted',
    ]);
  });

  it('shows the picker again when the reviewer ticked the ID type', () => {
    expect(applyResubmitSteps(FULL, { steps: ['id-type', 'liveness'], idType: 'pvc' })).toEqual([
      'consent',
      'id-type',
      'document-capture',
      'liveness',
      'submitted',
    ]);
  });

  it('never drops the frame', () => {
    const out = applyResubmitSteps(FULL, { steps: ['liveness'] });
    expect(out[0]).toBe('consent');
    expect(out[out.length - 1]).toBe('submitted');
  });
});

describe('keptIdType and keepsIdEvidence', () => {
  it('keeps the ID only when the server named one and the ID type was not ticked', () => {
    expect(keptIdType({ steps: ['liveness'], idType: 'bvn' })).toBe('bvn');
    expect(keptIdType({ steps: ['id-type'], idType: 'bvn' })).toBeNull();
    expect(keptIdType({ steps: ['liveness'] })).toBeNull();
    expect(keptIdType({ steps: [], idType: 'bvn' })).toBeNull();
    expect(keptIdType(null)).toBeNull();
  });

  it('keeps the evidence only when no evidence step was asked for', () => {
    expect(keepsIdEvidence({ steps: ['liveness'], idType: 'bvn' })).toBe(true);
    expect(keepsIdEvidence({ steps: ['id-input'], idType: 'bvn' })).toBe(false);
    expect(keepsIdEvidence({ steps: ['liveness'] })).toBe(false);
  });
});

describe('isResubmission', () => {
  it('is true only for a targeted redo', () => {
    expect(isResubmission({ steps: ['liveness'] })).toBe(true);
    expect(isResubmission({ steps: [] })).toBe(false);
    expect(isResubmission(null)).toBe(false);
  });
});

describe('resubmitNote', () => {
  it('returns the reviewer note on a targeted redo', () => {
    expect(resubmitNote({ steps: ['liveness'], message: 'Too dark, please retake.' }))
      .toBe('Too dark, please retake.');
  });

  it('is null when there is nothing worth showing', () => {
    // A blank note must not render an empty banner, and a full re-run is not a
    // targeted redo — there is no "few things" to name.
    expect(resubmitNote({ steps: ['liveness'], message: '   ' })).toBeNull();
    expect(resubmitNote({ steps: ['liveness'] })).toBeNull();
    expect(resubmitNote({ steps: [], message: 'ignored' })).toBeNull();
    expect(resubmitNote(null)).toBeNull();
  });
});
