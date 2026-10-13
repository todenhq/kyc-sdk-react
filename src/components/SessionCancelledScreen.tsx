import { useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { useText } from '../i18n';
import { VerificationError } from '../types/verification';

// ─── The cancelled screen ───────────────────────────────────────────────────
//
// The organisation (or Myaza support) cancelled this verification session.
// Terminal by design, like the config-error screen: the server refuses to
// reopen or restart a cancelled session until an admin uncancels it, so no Try
// again is offered and the only action is Close (lib/session-cancelled.ts).
// Mirrors the RN SDK's flow/SessionCancelled.tsx and the Flutter flow widget.

/**
 * Fire `onError` with `session_cancelled` ONCE, the first time the run is
 * marked cancelled, whichever call learned it (the session start, a progress
 * save, the submission or the status poll).
 */
export function useReportCancellation(
  cancelled: { message: string | null } | null,
  onError: ((error: VerificationError) => void) | undefined,
  fallback: string,
): void {
  const reported = useRef(false);
  useEffect(() => {
    if (!cancelled || reported.current) return;
    reported.current = true;
    try {
      onError?.(new VerificationError('session_cancelled', cancelled.message ?? fallback));
    } catch {
      /* a consumer's handler must never break the flow */
    }
  }, [cancelled, onError, fallback]);
}

export function SessionCancelledScreen({ message, onClose }: { message: string | null; onClose: () => void }) {
  const t = useText();
  return (
    <div className="flex flex-col items-center gap-6 py-8 animate-fade-in" role="alert">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
        <svg
          className="h-10 w-10 text-destructive"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      </div>

      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold font-heading">{t('general.sessionCancelled.title')}</h2>
        <p className="text-sm text-muted-foreground">{message ?? t('general.sessionCancelled.description')}</p>
      </div>

      <Button className="w-full" onClick={onClose}>
        {t('common.close')}
      </Button>
    </div>
  );
}
