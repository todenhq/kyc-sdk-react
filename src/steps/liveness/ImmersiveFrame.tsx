'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  livenessCutout,
  livenessTint,
  tintPath,
  type Size,
  aboveHeight,
  windowTop as windowTopOf,
} from '../../lib/liveness-cutout';
import { ImmersiveControls } from './ImmersiveControls';
import { SurfaceBlurContext } from './surfaces';

// ---------------------------------------------------------------------------
// The full-screen liveness camera's layout (see lib/liveness-cutout).
//
// Everything is placed from the box this element is MEASURED at, and that box
// is reported up (`onSize`) so the face is judged against the window that is
// actually on screen.
//
//   preview   the camera (or the photo), filling the box
//   surround  blur, then a tint of the flow's background, over everything but
//             the window
//   cutout    what is drawn ON the window: its line and the marks inside it
//   above     the instruction, resting just above the window, and over it
//             whatever is narrow enough to stand BETWEEN the back and close
//             buttons (the gesture picture)
//   below     what starts just under it: the step count, or the retry
//   footer    what rests on the bottom edge
// ---------------------------------------------------------------------------

/** What back and close take at the top, with the gaps around them. */
const CONTROLS_BAND = 60;
/** The gap over those buttons (ImmersiveControls). */
const CONTROLS_TOP_GAP = 8;
const BLUR = 'blur(11px)';

export function ImmersiveFrame({
  preview,
  cutout,
  above,
  below,
  footer,
  footerReserve = 32,
  dimRoom = false,
  blurs = true,
  onBack,
  onSize,
}: {
  preview: React.ReactNode;
  cutout: (window: Size) => React.ReactNode;
  /** Given the height there is under the back and close buttons (`room`),
   *  and the height up to the top of those buttons (`reach`): what is wide
   *  keeps to the first, what is narrow and centred may use the second. */
  above: (room: number, reach: number) => React.ReactNode;
  below?: React.ReactNode;
  footer?: React.ReactNode;
  /** The height `footer` needs, kept clear of `below`. */
  footerReserve?: number;
  /** The room has read as dark: more of the screen goes to the background. */
  dimRoom?: boolean;
  /** Whether this phone can afford a blur over the feed. */
  blurs?: boolean;
  onBack: () => void;
  onSize?: (size: Size) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const onSizeRef = useRef(onSize);
  onSizeRef.current = onSize;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const measure = (): void => {
      const next = { width: el.clientWidth, height: el.clientHeight };
      setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
      onSizeRef.current?.(next);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const laidOut = size.width > 0 && size.height > 0;
  const window = livenessCutout(size);
  const windowTop = windowTopOf(size, window);
  const windowBottom = windowTop + window.height;
  const room = Math.max(0, windowTop - 20 - CONTROLS_BAND);
  // The block starts level with the top of the buttons, not under them: the
  // buttons sit at the sides, and the middle of that band is free.
  const reach = Math.max(0, windowTop - 20 - CONTROLS_TOP_GAP);
  const clip = laidOut ? `path(evenodd, "${tintPath(size, window)}")` : undefined;

  return (
    <SurfaceBlurContext.Provider value={blurs}>
      {/* A floor on the height for the desktop dialog, which is as tall as its
          content: everything in here is positioned, so without one the camera
          would have no height at all. A phone's dialog fills the screen and
          never reaches it. */}
      <div
        ref={rootRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-background xl:min-h-[min(680px,84vh)]"
      >
        <div className="absolute inset-0">{preview}</div>
        {laidOut && (
          <>
            {blurs && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{ backdropFilter: BLUR, WebkitBackdropFilter: BLUR, clipPath: clip }}
              />
            )}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-background transition-opacity duration-300 ease-out motion-reduce:transition-none"
              style={{ opacity: livenessTint({ dimRoom, blurs }), clipPath: clip }}
            />
            <div
              className="absolute"
              style={{
                left: (size.width - window.width) / 2,
                top: windowTop,
                width: window.width,
                height: window.height,
              }}
            >
              {cutout(window)}
            </div>
            <div
              className="absolute inset-x-6 flex flex-col justify-end overflow-hidden"
              // On a very short screen the words keep their height under the
              // buttons and run over the window's top edge instead.
              style={{
                top: CONTROLS_TOP_GAP,
                height: aboveHeight(room) + CONTROLS_BAND - CONTROLS_TOP_GAP,
              }}
            >
              {above(room, reach)}
            </div>
            {below && (
              <div
                className="absolute inset-x-6 overflow-y-auto"
                style={{
                  top: windowBottom + 24,
                  bottom: `calc(env(safe-area-inset-bottom, 0px) + ${footer ? footerReserve + 24 : 12}px)`,
                }}
              >
                {below}
              </div>
            )}
            {footer && (
              <div
                className="absolute inset-x-6 flex justify-center"
                style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
              >
                {footer}
              </div>
            )}
          </>
        )}
        <ImmersiveControls onBack={onBack} />
      </div>
    </SurfaceBlurContext.Provider>
  );
}
