'use client';

import React from 'react';
import { PREVIEW_TILE, previewFrame, strokePath, type SignatureDrawing } from '../lib/signature';

/**
 * The signature that was just kept, drawn small: dark ink on a white tile, in
 * both themes, like the pad it came from. Fitted to the ink rather than to the
 * pad, so a small signature in one corner still fills the tile.
 */
export function SignaturePreview({ drawing, label }: { drawing: SignatureDrawing; label: string }) {
  const frame = previewFrame(drawing.strokes);
  return (
    <span
      role="img"
      aria-label={label}
      className="flex shrink-0 overflow-hidden rounded-lg border border-neutral-300 bg-white"
      style={{ width: PREVIEW_TILE.width, height: PREVIEW_TILE.height }}
    >
      {frame && (
        <svg viewBox={frame.viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          {drawing.strokes.map((stroke, i) => (
            <path
              key={i}
              d={strokePath(stroke)}
              fill="none"
              stroke="#111111"
              strokeWidth={frame.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      )}
    </span>
  );
}
