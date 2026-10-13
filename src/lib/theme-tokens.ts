/**
 * Shape + type tokens for the SDK theme. Split from `theme.ts` because both
 * carry non-obvious rules that need explaining next to the code.
 */

/**
 * Tailwind v4's built-in radius ladder, in px, as pinned by `.verification-root` in
 * globals.css. `xl` (12px) is the BASE — it is what buttons, inputs and cards
 * use, so it is the rung a consumer is really choosing when they say "our
 * corners are 4px".
 *
 * `full` is deliberately absent: it renders avatars, badges, the camera oval
 * and the liveness ring. Scaling it would turn circles into squircles, which is
 * a bug, not a brand choice.
 */
const RADIUS_LADDER_PX = {
  sm: 2,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  '3xl': 24,
} as const;

const BASE_RADIUS_PX = RADIUS_LADDER_PX.xl;

/** Beyond this, "rounded" becomes "pill" and layouts start to look broken. */
const MAX_RADIUS_PX = 32;

/**
 * Scale the whole radius ladder from one consumer-facing number.
 *
 * Emits `--verification-radius-*`, NOT `--radius-*`, and that is the whole reason this
 * works. globals.css carries a host-isolation block that overrides every
 * `rounded-*` utility inside `.verification-root` with a literal — deliberately outside
 * any `@layer` and at higher specificity, so a host app's `@theme inline` cannot
 * reach in. That block also beat US: setting `--radius-*` changed nothing on
 * screen because the utility never read it.
 *
 * Those rules now read `var(--verification-radius-<rung>, <literal>)`. The private
 * namespace is required, not cosmetic — `--radius-*` is exactly what a host's
 * `@theme` defines, so reading that would reopen the bleed the block exists to
 * close. Only this function sets `--verification-radius-*`.
 *
 * Proportional rather than absolute, so the visual RELATIONSHIP between a card
 * (2xl) and an input (xl) survives: at 0 everything squares off together; at 24
 * everything softens together.
 */
export function radiusVars(borderRadius?: number): Record<string, string> {
  if (borderRadius == null || !Number.isFinite(borderRadius)) return {};

  const base = Math.min(Math.max(borderRadius, 0), MAX_RADIUS_PX);
  const ratio = base / BASE_RADIUS_PX;

  // `--radius` is kept in step for anything reading the bare token directly.
  const vars: Record<string, string> = { '--radius': `${base}px` };
  for (const [rung, px] of Object.entries(RADIUS_LADDER_PX)) {
    // Round to 0.5px: sub-pixel radii render inconsistently across browsers and
    // buy nothing visually.
    vars[`--verification-radius-${rung}`] = `${Math.round(px * ratio * 2) / 2}px`;
  }
  return vars;
}

/**
 * A font-family value is written into a CSS custom property, so it must not be
 * able to carry anything but a font list. React sets custom properties through
 * `CSSStyleDeclaration.setProperty`, which already refuses to parse a value that
 * closes the declaration — but this config can arrive from a published workflow
 * (server-stored, dashboard-authored), so it is validated here too rather than
 * relying on one layer.
 *
 * Allows what a font stack legitimately needs — letters, digits, spaces,
 * hyphens, underscores, dots, commas and quotes — and nothing else. A value
 * containing anything else is DROPPED entirely rather than sanitised into
 * something the author didn't write.
 */
const SAFE_FONT_FAMILY = /^[\w\s'",.-]{1,120}$/;

export function sanitizeFontFamily(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || !SAFE_FONT_FAMILY.test(trimmed)) return undefined;
  return trimmed;
}

/**
 * Font tokens.
 *
 * APPLYING the family and LOADING it are deliberately separate concerns:
 *
 *   • this function applies ANY safe family, so an integrator can name a font
 *     they already self-host and we simply use it;
 *   • `ensureGoogleFont` loads ONLY families in the curated catalogue, because
 *     an org picking "Poppins" from the dashboard has no way to load it itself
 *     and a family we apply-but-never-fetch would silently do nothing.
 *
 * So an unrecognised family is honoured, not fetched — which is exactly right
 * for a self-hosted brand font, and harmlessly falls back to `system-ui` if the
 * page turns out not to have it.
 *
 * `headingFontFamily` falls back to `fontFamily`, so the common case — one brand
 * font everywhere — is a single field.
 */
export function fontVars(fontFamily?: string, headingFontFamily?: string): Record<string, string> {
  const body = sanitizeFontFamily(fontFamily);
  const heading = sanitizeFontFamily(headingFontFamily) ?? body;

  const vars: Record<string, string> = {};
  if (body) {
    // Always keep a fallback chain: a brand font that fails to load must land on
    // system-ui, never on the browser's serif default.
    vars['--font-sans'] = `${body}, system-ui, sans-serif`;
    vars['--font-body'] = `${body}, system-ui, sans-serif`;
    // Body text at 16px and up is the org's body font too. Without this it
    // would stay on the SDK's own Bricolage Grotesque beside their font.
    vars['--font-copy'] = `${body}, system-ui, sans-serif`;
  }
  if (heading) vars['--font-heading'] = `${heading}, system-ui, sans-serif`;
  return vars;
}
