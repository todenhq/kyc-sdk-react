'use client';

import React, { useEffect, useReducer, useRef, useState } from 'react';
import { StyledQRCode } from './StyledQRCode';
import { MYAZA_QR_LOGO } from '../lib/qr-logo';
import {
  Check,
  Copy,
  Loader2,
  Monitor,
  Moon,
  RefreshCcw,
  Smartphone,
  Sun,
  X,
} from './icons';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { PoweredBy } from './PoweredBy';
import { BrandLogoChip } from './BrandLogoChip';
import { VisuallyHidden } from './VisuallyHidden';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { useBranding } from '../hooks/useBranding';
import { themeRootOrDocument, useThemeRoot } from '../lib/sdk-frame-context';
import { useDeviceHandoff } from '../hooks/useDeviceHandoff';
import { HANDOFF_TOKEN_PREFIX } from '../hosted/token';
import { hasNoWebcam } from '../lib/device';
import { buildThemeVars } from '../lib/theme';
import { applyConfiguredTheme } from '../lib/apply-theme';
import { useIsDark } from '../lib/use-is-dark';
import { useBrandFonts } from '../lib/use-brand-fonts';
import { cn } from '../lib/utils';
import { useText } from '../i18n';
import { handoffLeaveErrorMessage } from '../lib/handoff-leave-error';
import type { HandoffSessionSnapshot } from '../services/api';

interface DeviceHandoffGateProps {
  /** PII-free config snapshot sent to the server to mint the session. */
  snapshot: HandoffSessionSnapshot;
  /** Existing embedded root attempt whose immutable pins the phone inherits. */
  parentSessionId?: string | null;
  /** User chose to verify on this computer — close the gate, open the flow. */
  onContinueHere: () => void;
  /** Gate dismissed (X / backdrop / completed-on-phone "Done"). */
  onClose: () => void;
  /** Mirror the modal's controls. */
  showThemeToggle?: boolean;
  disableClose?: boolean;
  /**
   * Mobile-only workflow (`requireMobileDevice`): there is no "continue on this
   * device" escape — the phone is the ONLY way forward. Every fallback to the
   * local flow is removed, including the one that normally rescues a failed
   * session mint.
   */
  mobileOnly?: boolean;
  /** No handoff configured on a mobile-only workflow: show a plain notice, mint nothing. */
  noHandoff?: boolean;
}

// Minimal theme toggle, mirroring VerificationModal's (kept local — the modal's isn't
// exported and the gate renders outside it).
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
      {showLogo && companyName && <span className="truncate text-sm font-semibold text-foreground">{companyName}</span>}
    </div>
  );
}

export default function DeviceHandoffGate({
  snapshot,
  parentSessionId,
  onContinueHere,
  onClose,
  showThemeToggle,
  disableClose,
  mobileOnly,
  noHandoff,
}: DeviceHandoffGateProps) {
  const config = useVerificationConfig();
  // A mobile-only workflow with handoff switched off has nothing to hand off
  // to — don't mint a session just to render a notice.
  const handoff = useDeviceHandoff(config.api, snapshot, !noHandoff, {
    parentSessionId,
    ensureParentSession: config.ensureHandoffParent,
    // A hosted page signs its requests with the attempt's own token.
    bearerIsParent: config.apiKey.startsWith(HANDOFF_TOKEN_PREFIX),
  });
  const t = useText();
  const [copied, setCopied] = useState(false);
  const [noCamera, setNoCamera] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const submittedRef = useRef(false);
  const isDarkTheme = useIsDark();
  const themeVars = buildThemeVars(config.appearance, isDarkTheme);
  useBrandFonts(config.appearance);

  // Apply the configured initial theme ('system' follows the device),
  // matching VerificationModal.
  const configuredThemeRoot = useThemeRoot();
  useEffect(
    () => applyConfiguredTheme(config.appearance?.theme, configuredThemeRoot),
    [config.appearance?.theme, configuredThemeRoot],
  );

  // Best-effort: if there's no webcam, lead harder with the QR.
  useEffect(() => {
    let active = true;
    hasNoWebcam().then((v) => { if (active) setNoCamera(v); });
    return () => { active = false; };
  }, []);

  // Fire onSubmit EXACTLY ONCE when the phone completes. The desktop never
  // enters the verification flow, so it never calls api.verify — this is the
  // only submission signal on this device.
  useEffect(() => {
    if (handoff.phase === 'submitted' && handoff.verificationId && !submittedRef.current) {
      submittedRef.current = true;
      config.onSubmit?.({
        verificationId: handoff.verificationId,
        status: 'pending',
        metadata: { ...(config.metadata ?? {}) },
        submittedAt: new Date().toISOString(),
      });
    }
  }, [handoff.phase, handoff.verificationId, config]);

  const copyLink = () => {
    if (!handoff.url) return;
    navigator.clipboard?.writeText(handoff.url).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => { /* ignore */ },
    );
  };

  const isTerminal = handoff.phase === 'submitted';
  // A mobile-only notice with handoff off mints nothing, so there is nothing
  // to wait for and nothing to give back.
  const nothingMinted = noHandoff === true;
  const minting = !nothingMinted && handoff.phase === 'creating' && !handoff.sessionId;
  // A lost answer to a bound mint is ambiguous: the server may have created
  // the phone's session though this browser never saw it. A refusal, or a
  // failure before anything was sent, left nothing behind and never traps
  // somebody on the gate (hooks/useDeviceHandoff.ts, mintLeftOwnershipOpen).
  const ownershipUnresolved = !nothingMinted && handoff.phase === 'error' && handoff.unresolved;
  const dismissBlocked = !isTerminal && (
    disableClose === true || minting || ownershipUnresolved || leaving
  );

  // Leaving the gate gives the handoff back first. Minting the QR moved the
  // flow's one-verification budget to the phone's session, so walking away
  // without returning it leaves this device holding a session that no longer
  // owns it. The refusal would not surface until the next upload, several
  // steps later, reading as a broken flow rather than as the QR's doing.
  const leave = (onLeave: () => void) => {
    if (nothingMinted) { onLeave(); return; }
    // The mint failed and left nothing to give back.
    if (handoff.phase === 'error' && !handoff.unresolved) { onLeave(); return; }
    if (leaving || handoff.phase === 'opened' || handoff.phase === 'submitted') return;
    setLeaving(true);
    setLeaveError(null);
    void handoff.release()
      .then((released) => {
        // False: there was no session this device could give back.
        if (released) onLeave();
        else setLeaveError(t('handoff.leave.unresolved'));
      })
      // The server was asked and did not confirm. Going on here would let two
      // devices both believe they may submit this verification.
      .catch((error: unknown) => setLeaveError(handoffLeaveErrorMessage(error, true, t)))
      .finally(() => setLeaving(false));
  };

  const continueHere = () => leave(onContinueHere);
  const closeGate = () => {
    if (isTerminal) onClose();
    else leave(onClose);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !dismissBlocked) closeGate(); }}>
      <DialogContent
        className="verification-root"
        style={themeVars}
        onPointerDownOutside={(e) => { if (dismissBlocked) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (dismissBlocked) e.preventDefault(); }}
      >
        <VisuallyHidden>
          <DialogTitle>Continue your verification</DialogTitle>
          <DialogDescription>Continue on your phone or this device</DialogDescription>
        </VisuallyHidden>

        <div className="flex h-full flex-col overflow-hidden rounded-[inherit]">
          <div className="relative flex min-h-12 items-center justify-between gap-2 px-3 pt-[calc(env(safe-area-inset-top)+1.25rem)]">
            <HeaderBrand />
            <div className="flex shrink-0 items-center gap-1">
              {showThemeToggle !== false && <ThemeToggle />}
              {!dismissBlocked && (
                <button
                  type="button"
                  onClick={closeGate}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 animate-slide-up">
            <GateBody
              phase={handoff.phase}
              url={handoff.url}
              code={handoff.code}
              noCamera={noCamera}
              copied={copied}
              mobileOnly={mobileOnly === true}
              noHandoff={noHandoff === true}
              onCopyLink={copyLink}
              onContinueHere={continueHere}
              onRegenerate={handoff.regenerate}
              onDone={closeGate}
              leaving={leaving}
              leaveError={leaveError}
            />
          </div>

          {/* This gate is a SEPARATE Dialog from VerificationModal, so it needs its own
              attribution — it is often the FIRST Toden surface a desktop user
              sees, and the one asking them to scan a QR with their phone. */}
          <PoweredBy />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Body — one render per phase
// ---------------------------------------------------------------------------

interface GateBodyProps {
  phase: ReturnType<typeof useDeviceHandoff>['phase'];
  url: string | null;
  code: string | null;
  noCamera: boolean;
  copied: boolean;
  /** Mobile-only workflow: no "continue on this device" anywhere. */
  mobileOnly: boolean;
  /** Mobile-only AND handoff disabled: a notice, no QR. */
  noHandoff: boolean;
  onCopyLink: () => void;
  onContinueHere: () => void;
  onRegenerate: () => void;
  onDone: () => void;
  leaving: boolean;
  leaveError: string | null;
}

function GateBody({
  phase, url, code, noCamera, copied, mobileOnly, noHandoff,
  onCopyLink, onContinueHere, onRegenerate, onDone, leaving, leaveError,
}: GateBodyProps) {
  const t = useText();
  // Mobile-only with handoff off: nothing to scan — the user must reopen the
  // flow on a phone themselves.
  if (noHandoff) {
    return (
      <div className="flex flex-col items-center gap-6 py-8 animate-fade-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <Smartphone className="h-7 w-7 text-primary" />
        </div>
        <div className="max-w-sm text-center space-y-1">
          <h2 className="text-xl font-semibold font-heading">{t('handoff.mobileOnly.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('handoff.mobileOnly.description')}</p>
        </div>
      </div>
    );
  }

  if (phase === 'submitted') {
    return (
      <div className="flex flex-col items-center gap-6 py-8 animate-fade-in">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--verification-success)]/10">
          <svg className="h-10 w-10 text-[var(--verification-success)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12l5 5L20 6" strokeDasharray="100" strokeDashoffset="100" className="animate-checkmark" />
          </svg>
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-xl font-semibold font-heading">{t('handoff.completed.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('handoff.completed.description')}</p>
        </div>
        <Button className="w-full" onClick={onDone}>{t('common.done')}</Button>
      </div>
    );
  }

  if (phase === 'expired') {
    return (
      <div className="flex flex-col items-center gap-6 py-8 animate-fade-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <RefreshCcw className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold font-heading">{t('handoff.expired.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('handoff.expired.description')}</p>
        </div>
        <div className="flex w-full flex-col gap-2">
          <Button className="w-full" onClick={onRegenerate}>{t('handoff.regenerate')}</Button>
          {!mobileOnly && (
            <Button variant="ghost" className="w-full" onClick={onContinueHere}>{t('handoff.continueHere')}</Button>
          )}
        </div>
      </div>
    );
  }

  // A failed response is ambiguous: the server may have committed the child
  // session even though the browser did not receive it. Retry the idempotent
  // mint to recover that exact child before choosing which device continues.
  if (phase === 'error') {
    return (
      <div className="flex flex-col items-center gap-6 py-8 animate-fade-in">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <RefreshCcw className="h-7 w-7 text-muted-foreground" />
        </div>
        <div className="max-w-sm text-center space-y-1">
          <h2 className="text-lg font-semibold font-heading">{t('handoff.linkFailed.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('handoff.linkFailed.description')}</p>
        </div>
        <Button className="w-full" onClick={onRegenerate}>{t('common.tryAgain')}</Button>
      </div>
    );
  }

  // creating | waiting | opened
  return (
    <div className="flex flex-col items-center gap-6 py-2 animate-fade-in">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Smartphone className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold font-heading">{t('handoff.gate.title')}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {mobileOnly
            ? t('handoff.gate.description.mobileOnly')
            : noCamera
              ? t('handoff.gate.description.noCamera')
              : t('handoff.gate.description')}
        </p>
      </div>

      {/* QR */}
      <div className="flex h-[248px] w-[248px] items-center justify-center rounded-2xl border border-border bg-white p-1.5">
        {url ? (
          <StyledQRCode value={url} size={240} logo={MYAZA_QR_LOGO} />
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Short code + copy link */}
      {code && (
        <div className="flex w-full flex-col items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('handoff.codeLabel')}</span>
          <span className="font-heading text-lg font-semibold tracking-[0.2em] text-foreground">{code}</span>
          <Button variant="outline" className="mt-1 gap-2" onClick={onCopyLink}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? t('handoff.gate.linkCopied') : t('handoff.copyLink')}
          </Button>
        </div>
      )}

      {phase === 'opened' && (
        <p className="flex items-center gap-2 text-sm text-primary">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('handoff.gate.opened')}
        </p>
      )}

      {/* Continue here — disabled once the phone has opened the link. A
          mobile-only workflow has no such escape: the phone is the only path. */}
      <div className="w-full border-t border-border pt-4">
        {mobileOnly ? (
          <p className="flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <Monitor className="h-3.5 w-3.5 shrink-0" />
            {t('handoff.gate.computerNotAllowed')}
          </p>
        ) : (
          <Button
            variant="ghost"
            className={cn('w-full gap-2', phase === 'opened' && 'pointer-events-none opacity-50')}
            onClick={onContinueHere}
            disabled={phase === 'opened' || phase === 'creating' || leaving}
          >
            {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Monitor className="h-4 w-4" />}
            {leaving ? t('handoff.leaving') : t('handoff.continueHere')}
          </Button>
        )}
        {leaveError && (
          <p role="alert" className="mt-2 text-center text-xs text-destructive">{leaveError}</p>
        )}
      </div>
    </div>
  );
}
