import { useEffect } from 'react';
import type { VerificationAppearance } from '../types/config';
import { ensureGoogleFont } from './google-fonts';

/**
 * Loads the org's picked Google fonts, once per family.
 *
 * An effect rather than a call inside `buildThemeVars`, which is a pure function
 * used during render — appending to `document.head` there would be a side effect
 * in render, misbehaving under StrictMode's double-invoke and SSR.
 *
 * Deliberately NOT cleaned up on unmount: the stylesheet is shared, cheap, and
 * cached, and removing it would unstyle a second SDK instance still on screen.
 */
export function useBrandFonts(appearance?: VerificationAppearance): void {
  const body = appearance?.fontFamily;
  const heading = appearance?.headingFontFamily;

  useEffect(() => {
    ensureGoogleFont(body);
    ensureGoogleFont(heading);
  }, [body, heading]);
}
