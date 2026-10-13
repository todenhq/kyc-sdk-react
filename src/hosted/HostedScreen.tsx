'use client';

import React, { useLayoutEffect } from 'react';
import { Loader2 } from '../components/icons';
import { buildThemeVars } from '../lib/theme';
import { applyConfiguredTheme } from '../lib/apply-theme';
import { useThemeRoot } from '../lib/sdk-frame-context';
import { cn } from '../lib/utils';
import { useText } from '../i18n';
import type { VerificationAppearance } from '../types/config';

/**
 * The centred screen the hosted entry shows AROUND the flow — loading, link
 * unavailable, already submitted — full-page on the hosted page, a compact
 * block when embedded in a host panel.
 *
 * Themed from the workflow's APPEARANCE when the caller has it. The hosted
 * pages read it on the server (`/session/by-token/:token/appearance`, or the
 * link's twin) before the bootstrap, so these screens paint in the org's
 * colours from the first frame. Until 2026-09-05 they wore the SDK default,
 * Myaza purple on white, until the bootstrap answered, then repainted: a brand
 * flash on every hosted open, and the org's applicants saw Myaza's brand
 * before their own.
 *
 * A dark workflow is dark on the first frame too: the dark palette rides as
 * inline vars (`buildThemeVars` merges the `dark` block) and the `dark` class
 * wraps the screen, neither of which needs an effect, so a server render is
 * already right. The configured theme is then applied to the real theme root
 * on mount, which is what resolves 'system' and what the flow's modal does
 * next. Nothing here reads the appearance's logo: the org's name and mark
 * belong to the flow's header, once there is a flow.
 */
export function HostedScreen({
  appearance,
  compact,
  children,
}: {
  appearance?: VerificationAppearance;
  /** An embedded mount sits inside a host panel, where a min-h-screen block
   *  would blow the layout open. */
  compact?: boolean;
  children: React.ReactNode;
}) {
  const themeRoot = useThemeRoot();
  const theme = appearance?.theme;
  const dark = theme === 'dark';
  useLayoutEffect(() => applyConfiguredTheme(theme, themeRoot), [theme, themeRoot]);
  const screen = (
    <div
      className={cn(
        'verification-root flex flex-col items-center justify-center gap-4 bg-background text-foreground',
        compact ? 'rounded-2xl px-6 py-12' : 'min-h-screen p-6',
      )}
      style={buildThemeVars(appearance, dark)}
    >
      {children}
    </div>
  );
  return dark ? <div className="dark">{screen}</div> : screen;
}

/**
 * The hosted loading screen, exported so the hosting page can render the SAME
 * screen before the SDK has a session to mount (the workflow-link page mints
 * one first): one loading screen, in the workflow's colours, from the first
 * server-rendered frame to the flow's first step.
 */
export function HostedLoadingScreen({
  appearance,
  compact,
  message,
}: {
  appearance?: VerificationAppearance;
  compact?: boolean;
  message?: string;
}) {
  const t = useText();
  return (
    <HostedScreen appearance={appearance} compact={compact}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">{message ?? t('general.hosted.loading')}</p>
    </HostedScreen>
  );
}
