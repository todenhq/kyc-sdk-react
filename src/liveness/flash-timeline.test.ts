import { describe, it, expect } from 'vitest';
import { flashOnsets } from './flash-timeline';

describe('flash colour times', () => {
  it('are measured from the start of the recording', () => {
    expect(flashOnsets([5450.4, 6550.2, 7650.9], 3, 1000)).toEqual([4450, 5550, 6651]);
  });

  it('are left out when nothing was recording', () => {
    expect(flashOnsets([5450, 6550], 2, null)).toBeUndefined();
  });

  it('are left out when a colour never ran', () => {
    expect(flashOnsets([5450, 6550], 3, 1000)).toBeUndefined();
  });

  it('are left out when a colour came on before the recording began', () => {
    expect(flashOnsets([900, 2000], 2, 1000)).toBeUndefined();
  });

  it('are left out unless they rise', () => {
    expect(flashOnsets([5450, 5450], 2, 1000)).toBeUndefined();
  });
});
