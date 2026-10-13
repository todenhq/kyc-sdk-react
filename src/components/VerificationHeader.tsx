'use client';

import React, { useReducer, useState } from 'react';
import { Maximize2, Minimize2, Moon, Sun, X } from './icons';

import { useBranding } from '../hooks/useBranding';
import { cn } from '../lib/utils';
import { themeRootOrDocument, useThemeRoot } from '../lib/sdk-frame-context';
import { BrandLogoChip } from './BrandLogoChip';
import { ProgressBar } from './ProgressBar';
import { StepIndicator } from './StepIndicator';

// The modal's chrome: org brand, window controls, and the flow's progress
// indicator. Extracted from VerificationModal, which owns the flow state and the step
// switch and had no business also owning three presentational widgets.

// ---------------------------------------------------------------------------
// Theme toggle
// ---------------------------------------------------------------------------

function ThemeToggle() {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  // The SDK's theme root: SdkFrame's shadow frame when isolated (so the
  // toggle never rewrites the host page's <html> class), else documentElement.
  const root = themeRootOrDocument(useThemeRoot());
  const dark = root?.classList.contains('dark') ?? false;

  const toggle = () => {
    if (!root) return;
    const next = !root.classList.contains('dark');
    root.classList.toggle('dark', next);
    try { localStorage.setItem('myaza-kyc-theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
    rerender();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Header brand — org logo + name, top-left, persistent on every step
// ---------------------------------------------------------------------------

function HeaderBrand() {
  const { logo, companyName } = useBranding();
  const [failed, setFailed] = useState(false);
  const showLogo = Boolean(logo) && !failed;

  return (
    <div className="flex min-w-0 items-center gap-2">
      {showLogo && (
        <BrandLogoChip
          src={logo!}
          alt={companyName ? `${companyName} logo` : 'Company logo'}
          onError={() => setFailed(true)}
        />
      )}
      {showLogo && companyName && (
        <span className="truncate text-sm font-semibold text-foreground">{companyName}</span>
      )}
    </div>
  );
}

export interface VerificationHeaderProps {
  /** Show the light/dark toggle. Default true (only `false` hides it). */
  showThemeToggle?: boolean;
  /** Close is suppressed (submitted step, or `disableClose`). */
  dismissBlocked: boolean;
  onClose: () => void;
  /** Flow is forced fullscreen — hides the expand/collapse control. */
  fullScreen?: boolean;
  /** Currently rendering fullscreen (forced, or user-expanded). */
  fullscreen: boolean;
  onToggleExpand: () => void;
  /** Draw a progress indicator at all (false on the config-error screen). */
  showProgress: boolean;
  /** Draw the bar instead of the step circles. */
  asBar: boolean;
  /** 0..1 through the flow. */
  stepFraction: number;
  stepCount: number;
  /** Receives the title-row node so `StepHeader` can portal into it. */
  titleSlotRef: (el: HTMLDivElement | null) => void;
}

export function VerificationHeader({
  showThemeToggle,
  dismissBlocked,
  onClose,
  fullScreen,
  fullscreen,
  onToggleExpand,
  showProgress,
  asBar,
  stepFraction,
  stepCount,
  titleSlotRef,
}: VerificationHeaderProps): React.ReactElement {
  return (
    // The flow's own surface colour plus a full-width bottom border set the
    // header apart from the body, the same treatment as the RN and Flutter
    // sheets. Both themes use the surface token, so the header and the cards
    // below it are one colour. Dark mode used a wash of the brand colour (18%
    // over the background), which read as a pale purple band above grey cards.
    <div
      className={cn(
        // pb-4 (md) is the header's own bottom breathing room, matching RN's
        // paddingBottom on the header container. It applies in BAR mode too:
        // the bar is absolutely positioned on the edge, so without this the
        // description would sit right on top of it.
        'relative shrink-0 bg-muted pb-3 sm:pb-4',
        // The bar sits ON this edge and paints its own track, so the border
        // would double it.
        !(showProgress && asBar) && 'border-b border-border',
      )}
    >
      {/* Row 1 — org brand left, controls right. Safe-area aware so the controls
          clear the status bar / notch on mobile.

          The base is 1rem rather than RN's `sm`, and deliberately so: RN adds
          the device's top inset (a notch, or ~24px of status bar), which is
          what gives its brand row room. On desktop web that inset is 0, so
          copying `sm` literally left 8px above the logo against 16px below it.
          1rem balances the row here and still adds the inset on mobile.
          Below sm every row is trimmed: on a phone the header, the map and the
          actions compete for one short column, and air is what gives. */}
      <div className="relative flex items-center justify-between gap-2 px-6 pt-[calc(env(safe-area-inset-top)+0.625rem)] sm:pt-[calc(env(safe-area-inset-top)+1rem)]">
        <HeaderBrand />

        <div className="flex shrink-0 items-center gap-1">
          {showThemeToggle !== false && <ThemeToggle />}

          {/* Mobile close button — hidden on submitted step or when close is disabled */}
          {!dismissBlocked && (
            <button
              type="button"
              onClick={onClose}
              className="flex xl:hidden h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}

          {/* Expand / collapse toggle — desktop only; hidden when the flow is
              forced fullscreen */}
          {fullScreen !== true && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="hidden xl:flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Row 2 — title, description, back arrow, country flag. Steps portal
          their StepHeader in here (see step-header-slot). `empty:hidden` keeps
          the padding from showing on steps that render no title at all. */}
      <div
        ref={titleSlotRef}
        className={cn(
          'px-6 pt-1.5 sm:pt-2 empty:hidden',
          fullscreen && 'xl:mx-auto xl:w-full xl:max-w-2xl',
        )}
      />

      {/* Row 3 — step circles. On a fullscreen desktop layout the row is
          constrained to the same column as the body, or ten circles would
          strand themselves across a 1400px header. */}
      {showProgress && !asBar ? (
        <div className={cn('mt-3 sm:mt-4', fullscreen && 'xl:mx-auto xl:w-full xl:max-w-2xl')}>
          <StepIndicator progress={stepFraction} stepCount={stepCount} />
        </div>
      ) : null}

      {/* Absolutely positioned, so it overlays the header's bottom edge instead
          of adding a row — the whole reason to prefer it. */}
      {showProgress && asBar ? (
        <ProgressBar progress={stepFraction} stepCount={stepCount} />
      ) : null}
    </div>
  );
}
