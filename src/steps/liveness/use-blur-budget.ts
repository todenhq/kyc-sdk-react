'use client';

import { useEffect, useState } from 'react';
import { BlurBudget } from '../../lib/blur-budget';

/** The browser can blur what is behind an element at all. */
function supportsBackdropBlur(): boolean {
  if (typeof CSS === 'undefined' || !CSS.supports) return false;
  return (
    CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')
  );
}

/** The person asked for more contrast or less transparency: flat surfaces. */
function prefersFlatSurfaces(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return (
    window.matchMedia('(prefers-contrast: more)').matches ||
    window.matchMedia('(prefers-reduced-transparency: reduce)').matches
  );
}

/**
 * Whether the surfaces over the live camera may blur what is behind them.
 * Watches the gap between frames while `active` and gives the blur up, for the
 * rest of the mount, once the phone falls behind (lib/blur-budget).
 */
export function useBlurBudget(active: boolean): boolean {
  const [blurs, setBlurs] = useState(() => supportsBackdropBlur() && !prefersFlatSurfaces());

  useEffect(() => {
    if (!active || !blurs) return undefined;
    const budget = new BlurBudget();
    let frame = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      // A hidden tab stops frames altogether; its first frame back is not a
      // slow one, it is a paused one.
      const gap = document.hidden ? 0 : now - last;
      last = now;
      if (budget.add(gap)) {
        setBlurs(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, blurs]);

  return blurs;
}
