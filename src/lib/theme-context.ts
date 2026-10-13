'use client';

import { createContext, useContext } from 'react';
import type { CSSProperties } from 'react';

/**
 * The computed appearance CSS variables (buildThemeVars output) for the
 * current SDK root. The overrides are INLINE custom properties on the modal
 * root, so portal-rendered surfaces (Select, Popover, Drawer — appended to
 * document.body) escape them; the `verification-root` class only restores the SDK's
 * DEFAULT tokens, not the workflow's brand overrides. Portal components read
 * this context and re-apply the vars as their own inline style.
 */
export const ThemeVarsContext = createContext<CSSProperties>({});

export function useThemeVars(): CSSProperties {
  return useContext(ThemeVarsContext);
}
