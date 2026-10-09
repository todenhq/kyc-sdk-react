import { describe, expect, it } from 'vitest';
import { biometricFlowOptions, showsDoneButton, showsSelfieReview, waitsForResult } from './biometric-options';

// Mirrors the server's biometric-options.test.ts and the RN SDK's; the
// defaults are a contract the four keep together.
describe('biometricFlowOptions', () => {
  it('re-authentication hides the review, waits for the verdict (delivered to the app and the webhook) and shows Done by default', () => {
    expect(biometricFlowOptions({ scope: 'biometric-authentication' })).toEqual({
      selfieReview: false,
      resultDelivery: 'both',
      doneButton: true,
    });
    expect(showsSelfieReview({ scope: 'biometric-authentication' })).toBe(false);
    expect(waitsForResult({ scope: 'biometric-authentication' })).toBe(true);
    expect(showsDoneButton({ scope: 'biometric-authentication' })).toBe(true);
  });

  it('honours an explicit review, a webhook delivery and a hidden Done button', () => {
    const config = {
      scope: 'biometric-authentication',
      biometric: { selfieReview: true, resultDelivery: 'webhook' as const, doneButton: false },
    };
    expect(biometricFlowOptions(config)).toEqual({ selfieReview: true, resultDelivery: 'webhook', doneButton: false });
    expect(showsSelfieReview(config)).toBe(true);
    expect(waitsForResult(config)).toBe(false);
    expect(showsDoneButton(config)).toBe(false);
  });

  it("an app-only delivery waits exactly as the default does; the difference is the server's webhook", () => {
    expect(waitsForResult({ scope: 'biometric-authentication', biometric: { resultDelivery: 'app' } })).toBe(true);
    expect(waitsForResult({ scope: 'biometric-authentication', biometric: { resultDelivery: 'both' } })).toBe(true);
  });

  it('enrolment hides the review too, never waits, and can hide Done', () => {
    expect(biometricFlowOptions({ scope: 'biometric-enrollment' })).toEqual({
      selfieReview: false,
      resultDelivery: null,
      doneButton: true,
    });
    expect(waitsForResult({ scope: 'biometric-enrollment', biometric: { resultDelivery: 'app' } })).toBe(false);
    expect(showsDoneButton({ scope: 'biometric-enrollment', biometric: { doneButton: false } })).toBe(false);
  });

  it('a full verification reviews only when its workflow says so', () => {
    // Off by default, and the biometric block does not speak for it.
    expect(showsSelfieReview({})).toBe(false);
    expect(showsSelfieReview({ biometric: { selfieReview: true } })).toBe(false);
    expect(showsSelfieReview({ selfieReview: true })).toBe(true);
    expect(showsSelfieReview({ selfieReview: false })).toBe(false);
  });

  it('a biometric scope takes its own switch first, then the workflow one', () => {
    const scope = 'biometric-authentication';
    expect(showsSelfieReview({ scope, selfieReview: true })).toBe(true);
    expect(showsSelfieReview({ scope, selfieReview: true, biometric: { selfieReview: false } })).toBe(false);
  });

  it('a full verification never waits and always shows Done, whatever the block says', () => {
    expect(biometricFlowOptions({})).toBeNull();
    expect(waitsForResult({ scope: 'address', biometric: { resultDelivery: 'both' } })).toBe(false);
    expect(showsDoneButton({ scope: 'contact', biometric: { doneButton: false } })).toBe(true);
  });
});
