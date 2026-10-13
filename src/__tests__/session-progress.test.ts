import { describe, it, expect } from 'vitest';
import { progressFromState, progressFingerprint } from '../lib/session-progress';
import { initialVerificationState } from '../context/VerificationContext';
import type { VerificationState } from '../context/types';

const state = (over: Partial<VerificationState> = {}): VerificationState => ({ ...initialVerificationState, ...over });

describe('progressFromState', () => {
  it('never carries the base64 previews or video blobs', () => {
    // These are display artefacts and raw bytes. The mediaId beside them is the
    // durable reference, and shipping the images would bloat every save.
    const payload = progressFromState(
      state({
        documentFrontImage: 'data:image/jpeg;base64,AAAA',
        selfieImage: 'data:image/jpeg;base64,BBBB',
        livenessVideoBlob: new Blob(['x']) as Blob,
      }),
    );
    const serialised = JSON.stringify(payload);
    expect(serialised).not.toContain('base64');
    expect(serialised).not.toContain('AAAA');
    expect(payload).not.toHaveProperty('data.selfieImage');
  });

  it('carries the media references, which is what makes a slot count as captured', () => {
    const payload = progressFromState(
      state({ mediaIds: { documentFront: 'm_front', selfie: 'm_selfie' } as VerificationState['mediaIds'] }),
    );
    expect(payload.mediaIds).toEqual({ documentFront: 'm_front', selfie: 'm_selfie' });
  });

  it('drops empty media slots rather than storing nulls', () => {
    const payload = progressFromState(
      state({ mediaIds: { documentFront: 'm_1', selfie: undefined } as unknown as VerificationState['mediaIds'] }),
    );
    expect(payload.mediaIds).toEqual({ documentFront: 'm_1' });
  });

  it('carries the typed values a user would hate to re-enter', () => {
    const payload = progressFromState(
      state({
        idNumber: '12345678901',
        questionnaireAnswers: { source_of_funds: 'salary' } as VerificationState['questionnaireAnswers'],
      }),
    );
    expect(payload.data?.idNumber).toBe('12345678901');
    expect(payload.data?.questionnaireAnswers).toEqual({ source_of_funds: 'salary' });
  });

  it('records the step so a resume lands where the user stopped', () => {
    expect(progressFromState(state({ currentStep: 'liveness' })).step).toBe('liveness');
  });
});

describe('progressFingerprint', () => {
  it('is stable for unchanged state, so idle renders do not re-save', () => {
    const a = progressFromState(state({ idNumber: '1' }));
    const b = progressFromState(state({ idNumber: '1' }));
    expect(progressFingerprint(a)).toBe(progressFingerprint(b));
  });

  it('changes when something worth saving changes', () => {
    const a = progressFromState(state({ idNumber: '1' }));
    const b = progressFromState(state({ idNumber: '2' }));
    expect(progressFingerprint(a)).not.toBe(progressFingerprint(b));
  });

  it('does not change when only a preview image changes', () => {
    // A retaken photo that has not been uploaded yet is not progress worth saving.
    const a = progressFromState(state({ documentFrontImage: 'data:one' }));
    const b = progressFromState(state({ documentFrontImage: 'data:two' }));
    expect(progressFingerprint(a)).toBe(progressFingerprint(b));
  });
});
