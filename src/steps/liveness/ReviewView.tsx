'use client';

import { Check, CircleCheck, Loader2, RotateCcw, TriangleAlert } from '../../components/icons';
import { Button } from '../../components/ui/button';
import { ImmersiveFrame } from './ImmersiveFrame';
import { Panel, Pill } from './surfaces';

// ---------------------------------------------------------------------------
// The review, full screen: the photo where the camera was, in the
// same window, so it reads as the camera held still rather than as a
// different screen.
//
// Only with a photo to show. A restored session has the uploaded media id and
// no bytes, and keeps the modal's own review.
// ---------------------------------------------------------------------------

export interface ReviewViewProps {
  preview: string;
  title: string;
  /** A line over the buttons: the finished-step note, or the blurry notice. */
  note: string | null;
  noteIsWarning: boolean;
  retrying: string | null;
  uploadError: string | null;
  busy: boolean;
  /** Null when the step offers no retake (finished on an earlier visit). */
  onRetake: (() => void) | null;
  retakeLabel: string;
  onContinue: () => void;
  continueLabel: string;
  blurs: boolean;
  onBack: () => void;
}

export function ReviewView(p: ReviewViewProps) {
  // One line at a time, the most pressing first: a failed upload, then a
  // retry in progress, then the note about the photo.
  const message = p.uploadError ? (
    <p className="text-center text-sm text-destructive" role="alert">
      {p.uploadError}
    </p>
  ) : p.retrying ? (
    <p className="text-center text-xs text-foreground">{p.retrying}</p>
  ) : p.note ? (
    <p className="flex items-start gap-2 text-xs text-foreground">
      {p.noteIsWarning && <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
      <span className={p.noteIsWarning ? undefined : 'w-full text-center'}>{p.note}</span>
    </p>
  ) : null;
  return (
    <ImmersiveFrame
      onBack={p.onBack}
      blurs={p.blurs}
      // No mirror: the still was captured mirrored already.
      preview={<img src={p.preview} alt="" className="h-full w-full object-cover" />}
      cutout={(window) => (
        <div
          className="relative h-full w-full overflow-hidden border-4 border-[var(--kyc-success)]"
          style={{ borderRadius: window.width / 2, boxShadow: '0 0 22px rgba(0,0,0,0.32)' }}
        >
          {p.busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/45 animate-fade-in">
              <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden />
            </div>
          )}
        </div>
      )}
      above={() => (
        <div className="flex justify-center" role="status" aria-live="polite">
          <Pill opacity={0.92} className="gap-2 text-sm font-semibold text-foreground">
            <CircleCheck className="h-[18px] w-[18px] shrink-0 text-[var(--kyc-success)]" aria-hidden />
            <span>{p.title}</span>
          </Pill>
        </div>
      )}
      // The line about the photo sits IN the footer's panel, over the buttons,
      // not in the space under the window. That space is whatever the window
      // leaves, and in the desktop modal it was shorter than the line: the
      // note was cut off and scrolled inside a strip a few pixels tall.
      footer={
        <Panel className="space-y-3">
          {message}
          <div className="flex gap-3">
            {p.onRetake && (
              <Button variant="outline" className="flex-1 gap-2" onClick={p.onRetake} disabled={p.busy}>
                <RotateCcw className="h-4 w-4" />
                {p.retakeLabel}
              </Button>
            )}
            <Button className="flex-1 gap-2" onClick={p.onContinue} disabled={p.busy}>
              {p.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {p.continueLabel}
            </Button>
          </div>
        </Panel>
      }
    />
  );
}
