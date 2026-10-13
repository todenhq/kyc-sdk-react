'use client';

import React from 'react';

/**
 * The circular org-logo chip — white disc, light INSIDE border and soft
 * shadow: the same treatment as the Flutter and RN SDKs' brand chips (black
 * 5% border, black 6% blur-4 y-1 shadow). A BORDER, not a Tailwind ring — a
 * ring paints OUTSIDE the element, where 5% black vanishes against a dark
 * page; the border paints on the white disc's edge, visible on any theme.
 *
 * ONE component shared by every brand header (VerificationModal, DeviceHandoffGate) so
 * the chip can never drift apart between surfaces again.
 */
export function BrandLogoChip({
  src,
  alt,
  onError,
}: {
  src: string;
  alt: string;
  onError?: () => void;
}) {
  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/5 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <img src={src} alt={alt} className="h-full w-full object-cover" onError={onError} />
    </div>
  );
}
