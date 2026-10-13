'use client';

import { createContext, useContext } from 'react';

/**
 * The two seams the style-isolation boundary (SdkFrame) provides. Both default
 * to null, which every consumer treats as "no boundary": portals fall back to
 * document.body and theming falls back to documentElement — exactly the
 * pre-isolation behaviour, which is what the hosted page (no SdkFrame) and a
 * `styleIsolation={false}` mount still run.
 */

/**
 * Where portal-rendered surfaces (Dialog, Select, dropdown menus, the flash
 * overlay) should mount. Inside an isolated mount this is a frame inside a
 * body-level shadow root — styled by the SDK's own sheet, with no transformed
 * host-app ancestor, so `fixed` positioning still spans the real viewport.
 */
export const PortalHostContext = createContext<HTMLElement | null>(null);

export function usePortalHost(): HTMLElement | null {
  return useContext(PortalHostContext);
}

/**
 * The element carrying the SDK's `.dark` class. Descendant selectors cannot
 * cross a shadow boundary, so `.dark` on the host page's documentElement can
 * never match `.dark .verification-root` inside the shadow tree — the class has to live
 * on an in-shadow ancestor instead. As a side effect, the SDK's theme toggle
 * stops mutating the integrator's <html> class list, which could previously
 * flip a class-strategy host app into dark mode.
 */
export const ThemeRootContext = createContext<HTMLElement | null>(null);

export function useThemeRoot(): HTMLElement | null {
  return useContext(ThemeRootContext);
}

/** The element theme reads/writes act on: the frame's root, else documentElement. */
export function themeRootOrDocument(root: HTMLElement | null): HTMLElement | null {
  if (root) return root;
  return typeof document === 'undefined' ? null : document.documentElement;
}
