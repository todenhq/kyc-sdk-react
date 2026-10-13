import type { CSSProperties } from 'react';
import type { VerificationAppearance } from '../types/config';
import { fontVars, radiusVars } from './theme-tokens';

/**
 * Maps the consumer's `appearance` colors to the SDK's design-token CSS
 * variables. The result is applied as an inline `style` on the modal root (and
 * the trigger button), so overrides are **scoped to the SDK** and never leak
 * into the host page's `:root`. Tailwind opacity utilities (`bg-primary/10`,
 * `border-primary/30`, …) resolve against these variables via `color-mix`, so
 * setting a single token cascades to all of its shades automatically.
 *
 * Tokens left unset fall back to the built-in light/dark values in globals.css.
 */
export function buildThemeVars(appearance?: VerificationAppearance, isDark = false): CSSProperties {
  if (!appearance) return {};

  // The dark block overrides the base colours when the flow is in dark mode.
  // Without it a branded flow was stuck on its light palette after toggling,
  // because these are INLINE custom properties and an inline style outranks the
  // `.dark .verification-root` rules that would otherwise supply dark values.
  const merged: VerificationAppearance = isDark && appearance.dark ? { ...appearance, ...appearance.dark } : appearance;
  appearance = merged;

  const vars: Record<string, string> = {};
  const set = (token: string, value?: string) => {
    if (value) vars[token] = value;
  };

  // Brand color also drives the focus ring so it matches.
  set('--primary', appearance.primaryColor);
  set('--ring', appearance.primaryColor);
  set('--primary-foreground', appearance.primaryTextColor);

  set('--accent', appearance.accentColor);
  set('--background', appearance.backgroundColor);

  // Anchored menus take the flow's surface, and they need it SET HERE, not
  // inherited. globals.css declares `--popover: var(--background)` on :root, and
  // a custom property is substituted where it is DECLARED — so that resolves
  // against the root's background and inherits down already-resolved. An
  // override further down the tree, which is what these inline vars are, cannot
  // reach back and change it. The CSS default still covers unbranded flows,
  // where the root's background is the right answer.
  set('--popover', appearance.backgroundColor);
  set('--popover-foreground', appearance.textColor);

  // "Surface" covers both the secondary (cards) and muted (subtle fills) tokens.
  set('--secondary', appearance.surfaceColor);
  set('--muted', appearance.surfaceColor);

  // Borders and input outlines share one knob (they're equal in the defaults).
  set('--border', appearance.borderColor);
  set('--input', appearance.borderColor);

  set('--foreground', appearance.textColor);

  // Shape + type. Both scale a LADDER of tokens rather than setting one value
  // (see theme-tokens.ts) — `--radius` on its own moves nothing.
  Object.assign(vars, radiusVars(appearance.borderRadius));
  Object.assign(vars, fontVars(appearance.fontFamily, appearance.headingFontFamily));

  return vars as CSSProperties;
}

/**
 * The modal backdrop colour for the ACTIVE theme (dark block overrides, same
 * merge as the vars). Returned as a value, not a CSS var: the overlay is a
 * portal sibling of the themed content, so inline vars never reach it.
 */
export function resolveOverlayColor(appearance?: VerificationAppearance, isDark = false): string | undefined {
  if (!appearance) return undefined;
  const merged = isDark && appearance.dark ? { ...appearance, ...appearance.dark } : appearance;
  return merged.overlayColor || undefined;
}
