/**
 * The Google Fonts an org can pick for the flow.
 *
 * CURATED, and the list is doing two jobs. The obvious one is UX — a picker
 * beats a free-text box nobody can spell "Plus Jakarta Sans" into. The load-
 * bearing one is SECURITY: the loader builds a fonts.googleapis.com URL from
 * this value, and this value can arrive from a server-stored, dashboard-authored
 * workflow. Interpolating an arbitrary string into a URL we then inject as a
 * stylesheet is an injection vector; interpolating a member of a fixed list is
 * not. **Never load a family that isn't in this array.**
 *
 * Keep in sync with the dashboard's copy in
 * `components/workflows/google-fonts.ts` — two repos, no shared package (same
 * arrangement as the fields catalog).
 */

export interface GoogleFontDef {
  /** Exact Google Fonts family name — also the CSS family and the URL param. */
  family: string;
  group: 'Sans' | 'Serif' | 'Display';
}

/**
 * Weights requested per family. The SDK uses 400/500/600/700 (body, medium,
 * semibold headings, bold). Asking for exactly what we render keeps the payload
 * small — a full variable-weight axis is several times the size for weights no
 * screen uses.
 */
export const FONT_WEIGHTS = '400;500;600;700';

export const GOOGLE_FONTS: readonly GoogleFontDef[] = [
  // The SDK's own defaults, listed so an org can state them explicitly rather
  // than discovering that "unset" happens to mean these.
  { family: 'Bricolage Grotesque', group: 'Sans' },
  // The earlier defaults, kept because published workflows name them.
  { family: 'Karla', group: 'Sans' },
  { family: 'Space Grotesk', group: 'Sans' },

  { family: 'Inter', group: 'Sans' },
  { family: 'Roboto', group: 'Sans' },
  { family: 'Open Sans', group: 'Sans' },
  { family: 'Lato', group: 'Sans' },
  { family: 'Montserrat', group: 'Sans' },
  { family: 'Poppins', group: 'Sans' },
  { family: 'Work Sans', group: 'Sans' },
  { family: 'DM Sans', group: 'Sans' },
  { family: 'Nunito Sans', group: 'Sans' },
  { family: 'Manrope', group: 'Sans' },
  { family: 'Plus Jakarta Sans', group: 'Sans' },
  { family: 'Figtree', group: 'Sans' },
  { family: 'Outfit', group: 'Sans' },
  { family: 'Rubik', group: 'Sans' },
  { family: 'Source Sans 3', group: 'Sans' },
  { family: 'IBM Plex Sans', group: 'Sans' },

  { family: 'Raleway', group: 'Sans' },
  { family: 'Mulish', group: 'Sans' },
  { family: 'Barlow', group: 'Sans' },
  { family: 'Public Sans', group: 'Sans' },
  { family: 'Urbanist', group: 'Sans' },
  { family: 'Sora', group: 'Sans' },
  { family: 'Epilogue', group: 'Sans' },
  { family: 'Archivo', group: 'Sans' },
  { family: 'Cabin', group: 'Sans' },
  { family: 'Heebo', group: 'Sans' },
  { family: 'Assistant', group: 'Sans' },
  { family: 'Overpass', group: 'Sans' },
  { family: 'Noto Sans', group: 'Sans' },
  { family: 'PT Sans', group: 'Sans' },
  { family: 'Titillium Web', group: 'Sans' },
  { family: 'Quicksand', group: 'Sans' },
  { family: 'Josefin Sans', group: 'Sans' },
  { family: 'Red Hat Display', group: 'Sans' },
  { family: 'Onest', group: 'Sans' },
  { family: 'Geist', group: 'Sans' },
  { family: 'Instrument Sans', group: 'Sans' },
  { family: 'Schibsted Grotesk', group: 'Sans' },

  { family: 'Lora', group: 'Serif' },
  { family: 'Merriweather', group: 'Serif' },
  { family: 'Source Serif 4', group: 'Serif' },
  { family: 'Libre Baskerville', group: 'Serif' },
  { family: 'EB Garamond', group: 'Serif' },
  { family: 'Cormorant Garamond', group: 'Serif' },
  { family: 'Bitter', group: 'Serif' },
  { family: 'Roboto Slab', group: 'Serif' },
  { family: 'Noto Serif', group: 'Serif' },
  { family: 'PT Serif', group: 'Serif' },
  { family: 'Zilla Slab', group: 'Serif' },
  { family: 'Instrument Serif', group: 'Serif' },

  { family: 'Playfair Display', group: 'Display' },
  { family: 'DM Serif Display', group: 'Display' },
  { family: 'Bebas Neue', group: 'Display' },
  { family: 'Oswald', group: 'Display' },
  { family: 'Anton', group: 'Display' },
  { family: 'Fraunces', group: 'Display' },

  // NO Mono group, deliberately. JetBrains Mono, Space Mono and friends are
  // developer fonts: every glyph is ~35% wider than a proportional face at the
  // same size, which overflows buttons and labels across three SDKs, and a
  // verification flow set in monospace reads as a terminal rather than a
  // regulated product. Offering them was a trap — one was picked and it clipped
  // the native UI immediately.

];

const FAMILIES = new Set(GOOGLE_FONTS.map((f) => f.family));

export function isGoogleFont(family?: string): boolean {
  return !!family && FAMILIES.has(family.trim());
}

/** Marks the tags we own, so we never touch or duplicate the host page's own. */
const TAG_ATTR = 'data-myaza-font';

function appendOnce(el: HTMLLinkElement, key: string): void {
  if (document.head.querySelector(`link[${TAG_ATTR}="${CSS.escape(key)}"]`)) return;
  el.setAttribute(TAG_ATTR, key);
  document.head.appendChild(el);
}

/**
 * Load a picked Google font into the page, once.
 *
 * The SDK does not load its OWN fonts (it names Bricolage Grotesque for headings
 * and Geist for body, and falls
 * back to system-ui if the host hasn't loaded them). This is the deliberate
 * exception: a font chosen from a picker is one the host page almost certainly
 * does NOT have, so applying the family without fetching it would make every
 * selection silently do nothing — the worst kind of feature, one that looks
 * configured and isn't.
 *
 * `display=swap` is not optional here: text paints immediately in the fallback
 * and swaps when the font lands, so a slow font never leaves a verification
 * screen blank. The flow stays fully usable if the request fails outright.
 *
 * CSP: this needs `style-src https://fonts.googleapis.com` and
 * `font-src https://fonts.gstatic.com`. Orgs that can't allow those should leave
 * the font unset — the SDK then uses whatever the page already has.
 */
export function ensureGoogleFont(family?: string): void {
  if (typeof document === 'undefined') return; // SSR
  if (!isGoogleFont(family)) return; // never build a URL from an unlisted value

  const name = family!.trim();

  // Warm the font CDN before the stylesheet resolves — saves a round trip on
  // the connection the @font-face rules will immediately need.
  const preconnect = document.createElement('link');
  preconnect.rel = 'preconnect';
  preconnect.href = 'https://fonts.gstatic.com';
  preconnect.crossOrigin = 'anonymous';
  appendOnce(preconnect, 'preconnect');

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}` +
    `:wght@${FONT_WEIGHTS}&display=swap`;
  appendOnce(link, name);
}
