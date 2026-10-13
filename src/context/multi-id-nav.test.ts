import { describe, expect, it } from 'vitest';
import { verificationReducer, initialVerificationState } from './VerificationContext';
import type { VerificationState } from './types';
import { multiIdWireSlots } from '../lib/multi-id';

// Walking a multi-ID run FORWARD is only half of it. Committing a slot used to
// be one-way — the evidence was cleared into the committed list with no way
// back — so an applicant who picked the wrong ID, or wanted a different
// country, was stuck. These pin the round trip.

const capturedSlot = (over: Partial<VerificationState> = {}): VerificationState => ({
  ...initialVerificationState,
  selectedCountry: 'NG',
  selectedIdType: 'nin',
  idNumber: '12345678901',
  documentFrontImage: 'data:image/jpeg;base64,FRONT',
  mediaIds: { documentFront: 'med_front', selfie: 'med_selfie' },
  ...over,
});

describe('multi-ID back navigation', () => {
  it('restores what was captured when stepping back into a committed slot', () => {
    const committed = verificationReducer(capturedSlot(), {
      type: 'COMMIT_MULTI_ID_SLOT',
      payload: { nextStep: 'id-type' },
    });
    // Committing clears the working evidence — that is what made back broken.
    expect(committed.multiIdSlots).toHaveLength(1);
    expect(committed.idNumber).toBe('');
    expect(committed.documentFrontImage).toBeNull();

    const back = verificationReducer(committed, {
      type: 'UNCOMMIT_MULTI_ID_SLOT',
      payload: { step: 'id-input' },
    });
    expect(back.multiIdSlots).toHaveLength(0);
    expect(back.multiIdSlotIndex).toBe(0);
    expect(back.currentStep).toBe('id-input');
    expect(back.selectedIdType).toBe('nin');
    expect(back.idNumber).toBe('12345678901');
    // The capture comes back too — changing an earlier ID must not mean
    // re-photographing a document that is still perfectly good.
    expect(back.documentFrontImage).toBe('data:image/jpeg;base64,FRONT');
    expect(back.mediaIds.documentFront).toBe('med_front');
    // The run-level selfie is untouched throughout.
    expect(back.mediaIds.selfie).toBe('med_selfie');
  });

  it('is a no-op with nothing committed', () => {
    const state = capturedSlot();
    expect(verificationReducer(state, { type: 'UNCOMMIT_MULTI_ID_SLOT', payload: { step: 'id-type' } })).toBe(
      state,
    );
  });

  it('CHANGING COUNTRY restarts the run — its slots hold the old country\'s IDs', () => {
    const committed = verificationReducer(capturedSlot(), {
      type: 'COMMIT_MULTI_ID_SLOT',
      payload: { nextStep: 'id-type' },
    });
    const switched = verificationReducer(committed, { type: 'SET_COUNTRY', payload: 'GH' });
    // Carrying an NG BVN into a Ghana run would offer the applicant an ID no
    // register there can verify.
    expect(switched.multiIdSlots).toEqual([]);
    expect(switched.multiIdSlotIndex).toBe(0);
    expect(switched.selectedIdType).toBeNull();
  });

  it('re-picking the SAME country keeps the run intact', () => {
    const committed = verificationReducer(capturedSlot(), {
      type: 'COMMIT_MULTI_ID_SLOT',
      payload: { nextStep: 'id-type' },
    });
    const same = verificationReducer(committed, { type: 'SET_COUNTRY', payload: 'NG' });
    expect(same.multiIdSlots).toHaveLength(1);
  });
});

describe('multiIdWireSlots', () => {
  it('strips the local previews the slots carry for the back journey', () => {
    const committed = verificationReducer(capturedSlot(), {
      type: 'COMMIT_MULTI_ID_SLOT',
      payload: { nextStep: 'id-type' },
    });
    expect(committed.multiIdSlots[0]!.documentFrontImage).toBe('data:image/jpeg;base64,FRONT');
    // A base64 capture must never reach the submission or the progress blob.
    expect(multiIdWireSlots(committed.multiIdSlots)).toEqual([
      { idType: 'nin', idNumber: '12345678901', documentFront: 'med_front' },
    ]);
  });
});
