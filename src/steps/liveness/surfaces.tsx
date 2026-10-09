'use client';

import React, { createContext, useContext } from 'react';
import { Lock } from '../../components/icons';
import { cn } from '../../lib/utils';
import { useText } from '../../i18n';

// ---------------------------------------------------------------------------
// Surfaces for content over the camera.
//
// The room behind the camera can be any colour, so words never sit on it
// directly: each carries its own surface. Frosted where the phone can afford
// it, opaque where it cannot (use-blur-budget.ts).
// ---------------------------------------------------------------------------

/** Whether surfaces under this point may blur what is behind them. */
export const SurfaceBlurContext = createContext(true);

function useSurfaceStyle(opacity: number): React.CSSProperties {
  const blurs = useContext(SurfaceBlurContext);
  if (!blurs) return { backgroundColor: 'var(--background)' };
  const filter = 'blur(16px)';
  return {
    // The opacity is on the colour, never the element: an element's own
    // opacity would fade the words with the surface.
    backgroundColor: `color-mix(in srgb, var(--background) ${Math.round(opacity * 100)}%, transparent)`,
    backdropFilter: filter,
    WebkitBackdropFilter: filter,
  };
}

/** A pill for a line of text. One line fills the ends fully round; a wrapped
 *  second line keeps soft corners instead of being squeezed into a capsule. */
export function Pill({
  children,
  opacity = 0.78,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { opacity?: number }) {
  return (
    <div
      {...rest}
      className={cn(
        'inline-flex max-w-full items-center rounded-3xl border border-border px-[18px] py-2.5',
        className,
      )}
      style={useSurfaceStyle(opacity)}
    >
      {children}
    </div>
  );
}

/** A rounded surface for a block of content. */
export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-full rounded-2xl border border-border p-4', className)} style={useSurfaceStyle(0.88)}>
      {children}
    </div>
  );
}

/**
 * The line on the bottom edge: what happens to the picture being taken.
 *
 * Shown while the person is settling in. Once a gesture is asked for it fades
 * out: the front camera is at the top of the phone, and words at the bottom
 * pull the eyes, and then the head, down.
 */
export function Reassurance({ visible = true }: { visible?: boolean }) {
  const t = useText();
  return (
    <div
      aria-hidden={!visible}
      className={cn(
        'transition-opacity duration-200 ease-out motion-reduce:transition-none',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <Pill className="gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{t('presence.camera.secure')}</span>
      </Pill>
    </div>
  );
}

/** How far through the gestures the person is, under the window: what the row
 *  of dots says in the modal, in words. */
export function StepCount({ step, total }: { step: number; total: number }) {
  const t = useText();
  return (
    <div className="flex justify-center">
      <Pill className="text-xs font-semibold tabular-nums text-foreground">
        {t('presence.camera.stepCount', { step, total })}
      </Pill>
    </div>
  );
}

/**
 * The plate the gesture animation sits on over the camera: a solid white disc
 * with a ring and a shadow, so the cartoon reads against any room. `compact`
 * is the one inside the instruction's pill on a short phone.
 */
export function GesturePlate({ children, compact = false }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <div
      className={cn(
        'shrink-0 overflow-hidden rounded-full border-primary bg-white',
        compact ? 'border-[1.5px] p-0.5' : 'border-2 p-1 shadow-[0_4px_16px_rgba(0,0,0,0.25)]',
      )}
    >
      {children}
    </div>
  );
}
