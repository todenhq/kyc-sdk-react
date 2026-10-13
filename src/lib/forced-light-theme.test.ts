import { describe, expect, it } from 'vitest';
import { holdLightTheme } from './forced-light-theme';

// Node has no DOM here, so the theme root is a minimal class list. (With no
// MutationObserver and no window, the observer and the crossfade are skipped,
// and a 'system' theme reads the device as light.)
function fakeRoot(classes: string[] = []) {
  const set = new Set(classes);
  return {
    classList: {
      contains: (c: string) => set.has(c),
      add: (c: string) => void set.add(c),
      remove: (c: string) => void set.delete(c),
    } as unknown as DOMTokenList,
    has: (c: string) => set.has(c),
  };
}

describe('holdLightTheme', () => {
  it('takes a dark flow light, then restores dark on release', () => {
    const root = fakeRoot(['dark']);
    const release = holdLightTheme(root, 'dark');
    expect(root.has('dark')).toBe(false);
    release();
    expect(root.has('dark')).toBe(true);
  });

  it('leaves a light flow light before and after', () => {
    const root = fakeRoot();
    const release = holdLightTheme(root, 'light');
    expect(root.has('dark')).toBe(false);
    release();
    expect(root.has('dark')).toBe(false);
  });

  it("a 'system' flow follows the device on release, not its state on entry", () => {
    const root = fakeRoot(['dark']);
    const release = holdLightTheme(root, 'system');
    release();
    expect(root.has('dark')).toBe(false);
  });

  it('touches no other class on the root', () => {
    const root = fakeRoot(['dark', 'verification-frame']);
    const release = holdLightTheme(root, undefined);
    expect(root.has('verification-frame')).toBe(true);
    release();
    expect(root.has('verification-frame')).toBe(true);
  });
});
