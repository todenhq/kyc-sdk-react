import { useState } from 'react';
import { PRODUCT_NAME, PRODUCT_URL, brandMarkColor, brandMarkIsLight } from '../lib/brand';
import { useOptionalVerificationConfig } from '../context/VerificationConfigContext';
import { TODEN_ACCENT, TODEN_ACCENT_ON_DARK, TodenWordmark } from './TodenWordmark';
import { useIsDark } from '../lib/use-is-dark';
import { effectiveTrustAttribution } from '../lib/trust-attribution';
import type { SdkTrustAttribution } from '../services/api';
import { useText } from '../i18n';
import { resolveTrustAttribution } from './trust-attribution-resolve';

export { resolveTrustAttribution };

/**
 * Vendor attribution, pinned to the bottom of the modal on every step.
 *
 * Two modes, chosen per workflow and resolved SERVER-side
 * (`branding.trustAttribution`): the Toden logo (the default, and what an older
 * server that sends nothing resolves to), or the organisation's own logo with
 * no Toden mark or link at all. A custom logo that fails to load falls back to
 * the organisation's name, never to Toden.
 *
 * Attribution, deliberately, not "Secured by". At the moment this is on screen
 * the user is handing over a passport and a live selfie to a company they have
 * never heard of, on behalf of one they have. What they need is PROVENANCE —
 * a name to hold responsible — not a promise. "Secured by" is an unfalsifiable
 * claim made at the exact moment we are collecting rather than protecting, it
 * is the sort of reassurance a phishing overlay writes, and it is a security
 * assertion a regulator can hold us to. Attribution is the more credible move
 * precisely because it claims nothing (Stripe, Plaid and Persona all landed
 * here for the same reason).
 *
 * The mark is the Toden logo as the console draws it: the split-shield T beside
 * the "toden" lettering, one piece with nothing after it.
 *
 * The link is the part that carries real weight: a user asked for their ID by an
 * unfamiliar third party should be one tap from finding out who we are — that is
 * verifiable trust rather than asserted trust. In a locked in-app webview
 * `target=_blank` may do nothing, and the mark still stands on its own.
 *
 * Shown on the camera steps too. A trust mark that vanishes on the screens where
 * biometrics are captured would disappear exactly where it matters most.
 */
export function PoweredBy() {
  // Optional on purpose: the biometric re-auth modal renders this footer with
  // no VerificationConfigProvider above it, and attribution must not require one.
  const config = useOptionalVerificationConfig();
  const isDark = useIsDark();

  // The background the mark will ACTUALLY sit on — which is not simply
  // `appearance.backgroundColor`. Two things that got this wrong:
  //
  //  1. the dark palette lives in `appearance.dark`, so on a dark flow the base
  //     value is the LIGHT background; resolving against it picked the ink tone
  //     and the mark disappeared into the dark surface;
  //  2. `appearance.theme` is only the INITIAL theme — the user can toggle — so
  //     the live class is the authority, not the config.
  //
  // Not read from CSS because contrast cannot be computed in a stylesheet, and
  // this has to hold for an arbitrary org background, not just light vs dark.
  const appearance = config?.appearance;
  const background = isDark
    ? (appearance?.dark?.backgroundColor ?? appearance?.backgroundColor ?? '#080A12')
    : (appearance?.backgroundColor ?? '#FFFFFF');
  // ONE colour for the label and the logo's ink. Split colours made it read as
  // two things sitting next to each other rather than one line.
  const markColor = brandMarkColor(background);

  // Compact on a phone: the footer sat 28px below the lockup on a surface
  // where every row costs the map or the button above it. The bottom keeps
  // clear of the home indicator through the safe-area inset, which is zero in
  // a browser tab (Safari already stops above its own bar) and real in a
  // standalone or in-app WebView, so neither case pads twice.
  return (
    <div className="shrink-0 px-6 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pt-4 sm:pb-6">
      <TrustAttributionMark
        attribution={effectiveTrustAttribution(
          config?.serverConfig?.branding?.trustAttribution,
          config?.previewTrustAttribution,
          config?.previewMode,
        )}
        markColor={markColor}
        dark={isDark}
      />
    </div>
  );
}

export function TrustAttributionMark({
  attribution,
  markColor,
  dark,
}: {
  attribution?: SdkTrustAttribution;
  markColor: string;
  /** The flow is on its dark theme: use the dark-theme logo when there is one. */
  dark?: boolean;
}) {
  const t = useText();
  const resolved = resolveTrustAttribution(attribution, dark);
  const customLogo = resolved.mode === 'custom' ? resolved.logo : undefined;
  // Keyed on the URL, so a new logo gets a fresh attempt.
  const [failedLogo, setFailedLogo] = useState<string | null>(null);

  // The ROW is not the link — only the mark is. As a block-level flex child
  // the anchor used to span the footer's full width, so the empty space either
  // side of the logo opened the product site too. A link's hit area should be the
  // thing it points at, and the label is not a destination.
  return (
    <div className="flex min-h-8 items-center justify-center gap-2.5">
      {/* Small and muted on purpose. The label is the connective tissue,
            not the message — the BRAND is what should carry the weight, so the
            label stays quiet and the lockup beside it is what the eye lands on.
            Matching their sizes made the sentence loud and the mark ordinary. */}
      <span className="text-xs leading-none opacity-90" style={{ color: markColor }}>
        {/* Shared by both modes; matches the dashboard's Workflow Settings wording. */}
        {t('general.attribution.label')}
      </span>

      {resolved.mode === 'custom' ? (
        // The org's logo sits on the surface as uploaded: no plate or filter.
        <span className="flex min-h-8 max-w-40 items-center justify-center">
          {customLogo && customLogo !== failedLogo ? (
            <img
              src={customLogo}
              alt={resolved.companyName ? `${resolved.companyName} logo` : 'Organisation logo'}
              className="h-6 w-auto max-w-36 object-contain"
              onError={() => setFailedLogo(customLogo)}
            />
          ) : resolved.companyName ? (
            <span className="truncate text-sm font-semibold" style={{ color: markColor }}>
              {resolved.companyName}
            </span>
          ) : null}
        </span>
      ) : (
        // The logo is the link, and nothing beyond it is.
        <a
          href={PRODUCT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center rounded-sm opacity-90 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2"
          aria-label={PRODUCT_NAME}
          style={{ color: markColor }}
        >
          {/* The ink inherits this text colour, so one render serves both
              themes. The shield's purple half steps lighter when the ink is
              the light tone, as the console's own dark logo does. */}
          <TodenWordmark
            height={20}
            accent={brandMarkIsLight(markColor) ? TODEN_ACCENT_ON_DARK : TODEN_ACCENT}
          />
        </a>
      )}
    </div>
  );
}
