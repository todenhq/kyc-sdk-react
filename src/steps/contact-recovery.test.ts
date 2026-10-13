import { describe, expect, it } from 'vitest';
import { VerificationApiError } from '../services/api';
import { contactStepFor, expiredContactChannels, stepAfterContactVerified } from './contact-recovery';

describe('expiredContactChannels', () => {
  it('reads the missing channels off a contact_verification_required 422', () => {
    const err = new VerificationApiError('required', 422, 'contact_verification_required', {
      error: 'contact_verification_required',
      missing: ['email'],
    });
    expect(expiredContactChannels(err)).toEqual(['email']);
  });

  it('keeps both channels and drops anything unrecognised', () => {
    const err = new VerificationApiError('required', 422, 'contact_verification_required', {
      missing: ['phone', 'email', 'fax'],
    });
    expect(expiredContactChannels(err)).toEqual(['phone', 'email']);
  });

  it('returns nothing for other errors', () => {
    expect(expiredContactChannels(new VerificationApiError('nope', 422, 'questionnaire_invalid', {}))).toEqual([]);
    expect(expiredContactChannels(new Error('network'))).toEqual([]);
    expect(expiredContactChannels(undefined)).toEqual([]);
  });

  it('tolerates a missing or malformed missing[] on the body', () => {
    expect(expiredContactChannels(new VerificationApiError('x', 422, 'contact_verification_required'))).toEqual([]);
    expect(
      expiredContactChannels(
        new VerificationApiError('x', 422, 'contact_verification_required', { missing: 'email' }),
      ),
    ).toEqual([]);
  });
});

describe('stepAfterContactVerified', () => {
  it('takes the ordinary forward step outside recovery', () => {
    expect(
      stepAfterContactVerified({ recovery: false, expired: [], channel: 'email', forward: 'country-select' }),
    ).toBe('country-select');
  });

  it('returns straight to submitted in recovery', () => {
    expect(
      stepAfterContactVerified({ recovery: true, expired: ['email'], channel: 'email', forward: 'country-select' }),
    ).toBe('submitted');
  });

  it('visits the other still-refused channel before resubmitting', () => {
    expect(
      stepAfterContactVerified({
        recovery: true,
        expired: ['email', 'phone'],
        channel: 'email',
        forward: 'country-select',
      }),
    ).toBe('phone-verification');
  });

  it('ignores its own channel still being flagged (stale closure at auto-advance)', () => {
    expect(
      stepAfterContactVerified({ recovery: true, expired: ['phone'], channel: 'phone', forward: 'id-type' }),
    ).toBe('submitted');
  });
});

describe('contactStepFor', () => {
  it('maps channels to their steps', () => {
    expect(contactStepFor('email')).toBe('email-verification');
    expect(contactStepFor('phone')).toBe('phone-verification');
  });
});
