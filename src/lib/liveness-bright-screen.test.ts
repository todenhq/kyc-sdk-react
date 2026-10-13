import { describe, expect, it } from 'vitest';
import type { VerificationStep } from '../types/config';
import {
  livenessBrightScreenOn,
  restoreDarkAfterForcedLight,
  shouldForceLightTheme,
} from './liveness-bright-screen';

const base = { enabled: true, open: true, step: 'liveness' as VerificationStep, cameraShown: true };

describe('livenessBrightScreenOn', () => {
  it('is on when absent (every workflow published before the switch)', () => {
    expect(livenessBrightScreenOn({})).toBe(true);
    expect(livenessBrightScreenOn({ livenessBrightScreen: undefined })).toBe(true);
    expect(livenessBrightScreenOn({ livenessBrightScreen: true })).toBe(true);
  });

  it('only false turns it off', () => {
    expect(livenessBrightScreenOn({ livenessBrightScreen: false })).toBe(false);
  });
});

describe('shouldForceLightTheme', () => {
  it('holds the flow light once the liveness camera screen shows', () => {
    expect(shouldForceLightTheme(base)).toBe(true);
  });

  it('waits for the camera screen (primers keep the person theme)', () => {
    expect(shouldForceLightTheme({ ...base, cameraShown: false })).toBe(false);
  });

  it('never touches any other step', () => {
    const others: VerificationStep[] = ['consent', 'id-type', 'document-capture', 'id-input', 'submitted', 'questionnaire'];
    for (const step of others) {
      expect(shouldForceLightTheme({ ...base, step })).toBe(false);
    }
  });

  it('respects the workflow switch', () => {
    expect(shouldForceLightTheme({ ...base, enabled: false })).toBe(false);
  });

  it('releases when the flow closes', () => {
    expect(shouldForceLightTheme({ ...base, open: false })).toBe(false);
  });

});

describe('restoreDarkAfterForcedLight', () => {
  it('puts back whatever the flow was on (or asked for meanwhile)', () => {
    expect(restoreDarkAfterForcedLight(true, 'dark', false)).toBe(true);
    expect(restoreDarkAfterForcedLight(false, 'light', true)).toBe(false);
    expect(restoreDarkAfterForcedLight(true, undefined, false)).toBe(true);
  });

  it("follows the device NOW on a 'system' theme", () => {
    expect(restoreDarkAfterForcedLight(true, 'system', false)).toBe(false);
    expect(restoreDarkAfterForcedLight(false, 'system', true)).toBe(true);
  });
});
