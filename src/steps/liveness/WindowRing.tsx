'use client';

import { useEffect, useMemo, useRef } from 'react';
import { advanceTarget, easeToward } from '../../components/CaptureRing';
import { windowOutline, type Size } from '../../lib/liveness-cutout';
import { outlineSegments, segmentFill } from '../../lib/window-segments';

// The progress line of the full-screen camera: CaptureRing's line, traced
// around the tall window instead of a circle. Empty when the test starts,
// closed at the shutter, one way only, starting and ending at twelve o'clock.
// Green from its first pixel, over a track in the frame's own colour.
//
// It is cut into equal PARTS with a small gap between them, one per stage of
// the test (positioning, each step, the capture), as the React Native and
// Flutter SDKs draw it: the person can see how many stages there are and
// which one is filling.
//
// Paced by the same two functions as CaptureRing and driven the same way: the
// hook's progress is read from a ref every frame and one attribute per part is written.

const STROKE = 4;

export function WindowRing({
  window,
  progressRef,
  track,
  segments = 1,
}: {
  window: Size;
  progressRef: { current: number };
  /** The line's bed: the brand tint while all is well, red on a warning. */
  track: string;
  /** Equal parts with a small gap between them. One is an unbroken line. */
  segments?: number;
}) {
  const linesRef = useRef<(SVGPathElement | null)[]>([]);
  const targetRef = useRef(0);
  const shownRef = useRef(0);
  const length = useMemo(() => windowOutline(window, STROKE / 2).length, [window]);
  const parts = useMemo(() => outlineSegments(window, STROKE / 2, segments), [window, segments]);
  const cap = parts.length > 1 ? 'round' : 'butt';

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      targetRef.current = advanceTarget(targetRef.current, progressRef.current);
      shownRef.current = easeToward(shownRef.current, targetRef.current, dt);
      const done = length * shownRef.current;
      parts.forEach((part, i) => {
        const span = part.to - part.from;
        const fill = segmentFill(part, done);
        // An untouched part is pushed a stroke past its own end, so its round
        // cap does not show as a dot.
        linesRef.current[i]?.setAttribute(
          'stroke-dashoffset',
          String(fill <= 0 ? span + STROKE : span * (1 - fill)),
        );
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [progressRef, length, parts]);

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={window.width}
      height={window.height}
      viewBox={`0 0 ${window.width} ${window.height}`}
      fill="none"
      aria-hidden="true"
    >
      {parts.map((part, i) => (
        <path
          key={`t${i}`}
          d={part.d}
          stroke={track}
          strokeWidth={STROKE}
          strokeLinecap={cap}
          className="transition-[stroke] duration-300"
        />
      ))}
      {parts.map((part, i) => {
        const span = part.to - part.from;
        return (
          <path
            key={`p${i}`}
            ref={(el) => {
              linesRef.current[i] = el;
            }}
            d={part.d}
            stroke="var(--verification-success)"
            strokeWidth={STROKE}
            strokeLinecap={cap}
            strokeDasharray={`${span} ${span + STROKE * 2}`}
            strokeDashoffset={span + STROKE}
          />
        );
      })}
    </svg>
  );
}
