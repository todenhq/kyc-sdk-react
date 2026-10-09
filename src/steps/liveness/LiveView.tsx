'use client';

import React from 'react';
import { Loader2 } from '../../components/icons';
import { Button } from '../../components/ui/button';
import { GESTURE_FULL_SIZE, gestureSize, ROOM_FOR_GESTURE, type Size } from '../../lib/liveness-cutout';
import type { LivenessChallenge } from '../../liveness/types';
import { LivenessAvatar } from '../LivenessAvatar';
import { ImmersiveFrame } from './ImmersiveFrame';
import { InstructionPill, type InstructionTone } from './InstructionPill';
import { GesturePlate, Panel, Reassurance, StepCount } from './surfaces';
import { WindowRing } from './WindowRing';

// ---------------------------------------------------------------------------
// The live liveness camera, full screen (the whole modal on a desktop): the
// feed edge to edge, a
// clear window for the face, the instruction above it and the step count
// below.
//
// The gesture's picture sits ABOVE the window with the words it illustrates.
// The front camera is at the top of the phone: eyes that go up to read stay
// near the lens, while eyes that drop to the bottom of the screen tip the head
// down, which is the wrong pose for the photo and for a nod being judged.
// ---------------------------------------------------------------------------

export interface LiveViewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Measured for the flash, which paints everywhere but the window. */
  windowRef: React.RefObject<HTMLDivElement | null>;
  progressRef: { current: number };
  phase: string;
  loading: boolean;
  text: string;
  tone: InstructionTone;
  warning: boolean;
  /** The gesture to demonstrate, or null when there is none to show. */
  gesture: LivenessChallenge | null;
  assetsBasePath?: string;
  /** The long lighting note, when the room is too dark or too bright. */
  lightingNote: string | null;
  step: number;
  total: number;
  /** Why the check stopped, with its retry, or null while it is running. */
  failure: { message: string; retryLabel: string; onRetry: () => void } | null;
  dimRoom: boolean;
  blurs: boolean;
  onBack: () => void;
  onSize: (size: Size) => void;
}

export function LiveView(p: LiveViewProps) {
  const settlingIn = p.loading || p.phase === 'loading' || p.phase === 'positioning';
  const showsCount = !p.failure && p.total > 1 && (p.phase === 'challenge' || p.phase === 'challenge_passed');
  const ringOn = !p.loading && p.phase !== 'loading' && p.phase !== 'failed';
  const track = p.loading
    ? 'var(--border)'
    : p.warning || p.phase === 'failed'
      ? 'var(--destructive)'
      : 'color-mix(in srgb, var(--primary) 35%, transparent)';

  const gesture = (size: number, compact: boolean): React.ReactNode =>
    p.gesture ? (
      <GesturePlate compact={compact}>
        <LivenessAvatar gesture={p.gesture} visible size={size} assetsBasePath={p.assetsBasePath} />
      </GesturePlate>
    ) : null;

  return (
    <ImmersiveFrame
      onBack={p.onBack}
      onSize={p.onSize}
      dimRoom={p.dimRoom}
      blurs={p.blurs}
      preview={
        <video
          ref={p.videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover transform-[scaleX(-1)]"
        />
      }
      cutout={(window) => (
        <div
          ref={p.windowRef}
          className="relative h-full w-full"
          style={{
            borderRadius: window.width / 2,
            // Outside the window only: a shadow that fell inside would dim the face.
            boxShadow: '0 0 22px rgba(0,0,0,0.32)',
          }}
        >
          <div className="absolute inset-0 overflow-hidden" style={{ borderRadius: window.width / 2 }}>
            {(p.loading || p.phase === 'loading') && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 animate-fade-in">
                <div className="relative flex items-center justify-center">
                  <div className="absolute h-16 w-16 rounded-full border-2 border-primary/40 animate-pulse-ring" />
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                </div>
              </div>
            )}
            {p.phase === 'challenge_passed' && (
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--kyc-success)]/20 animate-fade-in">
                <div className="flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[var(--kyc-success)] animate-checkmark-pop">
                  <svg className="h-9 w-9 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M5 13l4 4L19 7" style={{ strokeDasharray: 30, strokeDashoffset: 0 }} className="animate-checkmark" />
                  </svg>
                </div>
              </div>
            )}
            {/* The shutter, then one pass of light down the window. */}
            {p.phase === 'complete' && (
              <>
                <div className="pointer-events-none absolute inset-0 bg-white animate-capture-flash" />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 h-1.5 -translate-y-1/2 bg-[var(--kyc-success)] opacity-0 shadow-[0_0_12px_2px_var(--kyc-success)] animate-liveness-scan"
                />
              </>
            )}
          </div>
          {/* One part of the line per stage: positioning, each step, the capture. */}
          {ringOn && <WindowRing window={window} progressRef={p.progressRef} track={track} segments={p.total + 2} />}
        </div>
      )}
      above={(room, reach) => {
        if (p.failure) return null;
        // The picture stands on its own above the words, and it is narrow, so
        // it may rise between the back and close buttons: its size comes from
        // the room up to the TOP of those buttons (lib/liveness-cutout.ts
        // gestureSize). The long lighting note is wide, so it only shows when
        // everything fits under the buttons, and the picture gives it room.
        const showsLighting = !!p.lightingNote && room >= ROOM_FOR_GESTURE + 70;
        const size = gestureSize(showsLighting ? room - 70 : reach, GESTURE_FULL_SIZE);
        return (
          <div className="flex flex-col items-center gap-2">
            {showsLighting && (
              <div className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 animate-lighting-in">
                {p.lightingNote}
              </div>
            )}
            {gesture(size, size < 52)}
            <InstructionPill text={p.text} tone={p.tone} />
          </div>
        );
      }}
      below={
        p.failure ? (
          // Its own surface: red text straight on the camera would be lost.
          // Kept short (lib/liveness-cutout.ts WINDOW_BELOW_KEEP is the room it
          // is promised under the window): taller, and the button is cut off
          // on a desktop dialog.
          <Panel className="space-y-2 p-3">
            <p className="text-center text-sm font-medium text-destructive" role="alert">
              {p.failure.message}
            </p>
            <Button className="h-11 w-full" onClick={p.failure.onRetry}>
              {p.failure.retryLabel}
            </Button>
          </Panel>
        ) : showsCount ? (
          <StepCount step={p.step} total={p.total} />
        ) : undefined
      }
      footer={p.failure ? undefined : <Reassurance visible={settlingIn} />}
    />
  );
}
