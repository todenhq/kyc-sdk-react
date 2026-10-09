import { describe, it, expect } from 'vitest';
import { lockConstraints } from './camera-lock';

describe('holding the camera steady', () => {
  it('locks what the camera can lock', () => {
    const caps = { exposureMode: ['continuous', 'manual'] as const, whiteBalanceMode: ['continuous', 'manual'] as const };
    expect(lockConstraints({ exposureMode: [...caps.exposureMode], whiteBalanceMode: [...caps.whiteBalanceMode] }, true)).toEqual({
      exposureMode: 'manual',
      whiteBalanceMode: 'manual',
    });
  });

  it('hands both back afterwards', () => {
    expect(lockConstraints({ exposureMode: ['continuous', 'manual'], whiteBalanceMode: ['continuous', 'manual'] }, false)).toEqual({
      exposureMode: 'continuous',
      whiteBalanceMode: 'continuous',
    });
  });

  it('leaves alone what it could not release again', () => {
    expect(lockConstraints({ exposureMode: ['manual'], whiteBalanceMode: ['continuous', 'manual'] }, true)).toEqual({
      whiteBalanceMode: 'manual',
    });
  });

  it('pins the values the camera is on now, so going manual does not jump', () => {
    const caps = { exposureMode: ['continuous', 'manual'] as ('continuous' | 'manual')[], whiteBalanceMode: ['continuous', 'manual'] as ('continuous' | 'manual')[], exposureTime: { min: 1, max: 1000 }, colorTemperature: { min: 2800, max: 7500 } };
    expect(lockConstraints(caps, true, { exposureTime: 156, colorTemperature: 4600 })).toEqual({
      exposureMode: 'manual',
      exposureTime: 156,
      whiteBalanceMode: 'manual',
      colorTemperature: 4600,
    });
    expect(lockConstraints(caps, false, { exposureTime: 156, colorTemperature: 4600 })).toEqual({
      exposureMode: 'continuous',
      whiteBalanceMode: 'continuous',
    });
  });

  it('asks for nothing from a camera that offers nothing (Safari)', () => {
    expect(lockConstraints({}, true)).toEqual({});
  });
});
