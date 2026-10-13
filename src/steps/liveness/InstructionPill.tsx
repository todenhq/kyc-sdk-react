'use client';

import React from 'react';
import { CircleCheck, TriangleAlert } from '../../components/icons';
import { cn } from '../../lib/utils';
import { Pill } from './surfaces';

// ---------------------------------------------------------------------------
// The instruction over the full-screen camera.
//
//  - It is read out. The person is looking at their own face, and somebody
//    using a screen reader cannot see the words at all, so the pill is a live
//    region and every change is announced.
//  - A warning carries a mark as well as its red, and a finished step a tick
//    as well as its green: the colour is never the only signal.
//  - The words change in place: each new line fades in where the last one was.
// ---------------------------------------------------------------------------

export type InstructionTone = 'prompt' | 'warning' | 'done';

export function InstructionPill({
  text,
  tone = 'prompt',
  leading,
}: {
  text: string;
  tone?: InstructionTone;
  /** The gesture's picture, on a phone too short to show it above the pill.
   *  Shown for a prompt only: a warning's mark takes its place. */
  leading?: React.ReactNode;
}) {
  const mark =
    tone === 'warning' ? (
      <TriangleAlert className="h-5 w-5 shrink-0 text-destructive" aria-hidden />
    ) : tone === 'done' ? (
      <CircleCheck className="h-5 w-5 shrink-0 text-[var(--verification-success)]" aria-hidden />
    ) : (
      (leading ?? null)
    );

  return (
    // The live region stays mounted while the words come and go: a region
    // that appears WITH its first words is not announced.
    <div className="flex justify-center" role="status" aria-live="polite" aria-atomic="true">
      {text.trim() ? (
        <Pill opacity={0.92}>
          {/* Keyed on the words, so each new line mounts and fades in. The
              green of a finished step does not reach 4.5:1 on a light surface,
              so the tick carries it and the words stay the text colour. */}
          <span
            key={`${tone}:${text}`}
            className="flex items-center gap-2 animate-fade-in motion-reduce:animate-none"
          >
            {mark}
            <span
              className={cn(
                'text-center text-base font-semibold',
                tone === 'warning' ? 'text-destructive' : 'text-foreground',
              )}
            >
              {text}
            </span>
          </span>
        </Pill>
      ) : null}
    </div>
  );
}
