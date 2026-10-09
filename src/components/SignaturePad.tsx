'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from './icons';
import {
  hasSignature,
  MAX_POINTS,
  pointCount,
  rescaleStrokes,
  type SignatureDrawing,
  type SignatureStroke,
} from '../lib/signature';

interface SignaturePadProps {
  /** Names the pad for a screen reader, e.g. "Sign here: Signature specimen". */
  label: string;
  /** Shown faintly until the first stroke. */
  hint: string;
  clearLabel: string;
  /** The button that makes the box bigger, and the one that puts it back. */
  expandLabel: string;
  shrinkLabel: string;
  disabled?: boolean;
  /** A signature to start from, when the person comes back to edit theirs. */
  initial?: SignatureDrawing | null;
  /** Called after every stroke with the drawing so far, and whether it is enough ink. */
  onChange: (drawing: SignatureDrawing, ready: boolean) => void;
}

/**
 * A box to sign in, with a finger, a stylus or a mouse.
 *
 * The pad is always white with dark ink, in both themes: it is a picture of
 * ink on paper, and the stored image is drawn the same way. Strokes are kept as
 * points in CSS pixels so a resize (a phone turning) only rescales the drawing.
 * `touch-action: none` on the canvas is what stops the page scrolling under a
 * finger that is trying to sign.
 */
export function SignaturePad({
  label,
  hint,
  clearLabel,
  expandLabel,
  shrinkLabel,
  disabled,
  initial,
  onChange,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<SignatureStroke[]>(initial ? initial.strokes.map((stroke) => [...stroke]) : []);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(strokes.current.length === 0);
  // A bigger box for a long signature or a small phone. The drawing so far is
  // kept and fitted to the new size.
  const [expanded, setExpanded] = useState(false);
  // An edited signature arrives in the size of the pad it was drawn in.
  const lastSize = useRef({ width: initial?.width ?? 0, height: initial?.height ?? 0 });

  const size = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  };

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { width, height } = size();
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = Math.max(1.5, Math.min(width, height) / 90);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111111';
    for (const stroke of strokes.current) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]!.x, stroke[0]!.y);
      // A lone point is a dot: a zero-length line with round caps.
      if (stroke.length === 1) ctx.lineTo(stroke[0]!.x, stroke[0]!.y);
      for (let i = 1; i < stroke.length; i += 1) ctx.lineTo(stroke[i]!.x, stroke[i]!.y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    // Fit a signature being edited to this pad before the first paint.
    const first = size();
    if (strokes.current.length > 0) {
      strokes.current = rescaleStrokes(strokes.current, lastSize.current, first);
      const current = { strokes: strokes.current, ...first };
      onChangeRef.current(current, hasSignature(current));
    }
    lastSize.current = first;
    paint();
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const next = size();
      const fitted = rescaleStrokes(strokes.current, lastSize.current, next);
      lastSize.current = next;
      if (fitted !== strokes.current) {
        strokes.current = fitted;
        const current = { strokes: fitted, ...next };
        onChangeRef.current(current, hasSignature(current));
      }
      paint();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [paint]);

  const emit = () => {
    const { width, height } = size();
    const current = { strokes: strokes.current, width, height };
    setEmpty(strokes.current.length === 0);
    onChange(current, hasSignature(current));
  };

  const pointOf = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    strokes.current = [...strokes.current, [pointOf(e)]];
    paint();
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || pointCount(strokes.current) >= MAX_POINTS) return;
    e.preventDefault();
    const stroke = strokes.current[strokes.current.length - 1];
    if (!stroke) return;
    const point = pointOf(e);
    const last = stroke[stroke.length - 1]!;
    // Skip sub-pixel jitter: it adds points and nothing to the line.
    if (Math.hypot(point.x - last.x, point.y - last.y) < 1) return;
    stroke.push(point);
    paint();
  };

  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    emit();
  };

  const clear = () => {
    strokes.current = [];
    paint();
    emit();
  };

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border-2 border-dashed border-border bg-white">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          className={`block w-full cursor-crosshair touch-none transition-[height] duration-200 motion-reduce:transition-none ${
            expanded ? 'h-[min(60vh,26rem)]' : 'h-40 sm:h-44'
          }`}
          style={{ touchAction: 'none' }}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
        />
        {/* In the corner of the box itself, where the eye already is: under the
            box it read as a footnote and nobody found it. Always dark on the
            white pad, whatever the flow's theme. Small to look at; the
            ::before keeps the tap area generous. */}
        <button
          type="button"
          onClick={() => setExpanded((on) => !on)}
          aria-pressed={expanded}
          className="absolute right-2 top-2 flex h-7 items-center gap-1 rounded-full border border-neutral-300 bg-white/95 px-2.5 text-[11px] font-semibold text-neutral-800 shadow-sm transition-colors before:absolute before:-inset-2 before:content-[''] hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-800"
        >
          {expanded ? (
            <Minimize2 className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Maximize2 className="h-3 w-3" aria-hidden="true" />
          )}
          {expanded ? shrinkLabel : expandLabel}
        </button>
        {/* The line a signature sits on, and the prompt until there is one. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-neutral-300" />
        {empty && (
          <p aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-2.5 text-center text-xs text-neutral-500">
            {hint}
          </p>
        )}
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={clear}
          disabled={disabled || empty}
          className="min-h-11 rounded-lg px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
        >
          {clearLabel}
        </button>
      </div>
    </div>
  );
}
