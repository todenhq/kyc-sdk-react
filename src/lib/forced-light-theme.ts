'use client';

import { useEffect } from 'react';
import { restoreDarkAfterForcedLight } from './liveness-bright-screen';
import { themeRootOrDocument } from './sdk-frame-context';

/**
 * Holds the SDK's theme root on the LIGHT palette while `active`, then puts the
 * previous theme back.
 *
 * The theme is the `.dark` class on the theme root (SdkFrame's shadow frame
 * when isolated, else documentElement), which drives both the `.dark .verification-root`
 * tokens and Tailwind's `dark:` variants, and which `useIsDark` observes to
 * swap the org's inline palette. Removing the class is therefore the whole
 * switch: every surface, portals included, follows it, and the org's BASE
 * appearance colours come back because `buildThemeVars` is then asked for
 * light. Nothing is written to storage, so the person's own choice survives.
 *
 * While held, anything that sets `.dark` (a 'system' theme following an OS
 * change) is recorded and undone, so the step stays light and the request is
 * honoured afterwards.
 */
export function useForcedLightTheme(
  active: boolean,
  themeRoot: HTMLElement | null,
  configuredTheme: 'light' | 'dark' | 'system' | undefined,
): void {
  useEffect(() => {
    if (!active) return undefined;
    const root = themeRootOrDocument(themeRoot);
    return root ? holdLightTheme(root, configuredTheme) : undefined;
  }, [active, themeRoot, configuredTheme]);
}

/** The element surface this needs: a class list (the theme root). */
type ThemeRootLike = Pick<HTMLElement, 'classList'>;

/**
 * Take the theme root light now; the returned release puts the right theme
 * back. Split from the hook so it is testable without a renderer.
 */
export function holdLightTheme(
  root: ThemeRootLike,
  configuredTheme: 'light' | 'dark' | 'system' | undefined,
): () => void {
  let wantDark = root.classList.contains('dark');
  if (wantDark) {
    startThemeFade(root);
    root.classList.remove('dark');
  }
  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          if (!root.classList.contains('dark')) return;
          wantDark = true;
          root.classList.remove('dark');
        });
  observer?.observe(root as unknown as Node, { attributes: true, attributeFilter: ['class'] });

  return () => {
    observer?.disconnect();
    const dark = restoreDarkAfterForcedLight(wantDark, configuredTheme, systemPrefersDark());
    if (dark && !root.classList.contains('dark')) {
      startThemeFade(root);
      root.classList.add('dark');
    }
  };
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Long enough for the 300 ms colour transition in globals.css to finish. */
export const THEME_FADE_MS = 360;
const FADE_CLASS = 'verification-theme-fade';
const fadeTimers = new WeakMap<ThemeRootLike, ReturnType<typeof setTimeout>>();

/**
 * Crossfade the switch: `verification-theme-fade` turns on a short colour transition for
 * the SDK's surfaces (globals.css), only while the theme changes, so it never
 * slows an ordinary hover. The CSS sits behind `prefers-reduced-motion:
 * no-preference`, so a person who asked for less motion gets an instant switch.
 */
function startThemeFade(root: ThemeRootLike): void {
  if (typeof window === 'undefined') return;
  const previous = fadeTimers.get(root);
  if (previous) clearTimeout(previous);
  root.classList.add(FADE_CLASS);
  fadeTimers.set(
    root,
    setTimeout(() => {
      root.classList.remove(FADE_CLASS);
      fadeTimers.delete(root);
    }, THEME_FADE_MS),
  );
}
