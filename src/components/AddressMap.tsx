'use client';

import React, { useEffect } from 'react';
import { MapPinHouse } from './icons';
import { addressVendorsStubbed } from '../steps/address/flow-steps';
import { GoogleMapPicker } from './GoogleMapPicker';
import { FramedMapPicker } from './FramedMapPicker';
import { MapPinPicker } from './MapPinPicker';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { cn } from '../lib/utils';
import type { LatLng } from '../lib/map-tiles';

// Which map the address step renders, in one place (split from
// AddressCollectionStep per the 200-line rule). Strongest surface first:
//
//  0. The BUILDER PREVIEW renders a static placeholder, never a map (user
//     decision 2026-09-03, reversing 2026-08-27's real-map preview): the
//     camera steps' PreviewCapturePlaceholder rule — no vendor loads, no
//     quota spent from the builder — with the flow kept walkable by landing
//     the pin where the real map's first idle would have landed it.
//  1. HOSTED pages hold Myaza's Google key directly (the session bootstrap
//     ships it — the page already runs on the hosted origin).
//  2. EMBEDDED mounts get Google via OUR framed /embed/map page when /config
//     minted a frame URL (see lib/map-frame.ts); the frame falls back to OSM
//     on any failure.
//  3. Everything else — no key configured, or a frame that fails — is the
//     dependency-free OSM picker.

interface AddressMapProps {
  value: LatLng | null;
  onChange: (pin: LatLng) => void;
  defaultCenter: LatLng;
  defaultZoom: number;
  /** Height/size override — the pin step goes near full screen on mobile. */
  className?: string;
  /** False = read-only summary map (the review step): no zoom UI, no
   *  gestures, POI clutter hidden. */
  interactive?: boolean;
}

// Everything surface-specific (hosted key, frame URL, preview, theming) comes
// from the config context, so the step passes only the map's actual inputs.
export function AddressMap({ value, onChange, defaultCenter, defaultZoom, className, interactive = true }: AddressMapProps) {
  const config = useVerificationConfig();
  const googleKey = config.serverConfig?.googleMapsBrowserKey;
  const frameUrl = config.serverConfig?.mapsFrameUrl;
  // Preview AND sandbox render the static stand-in (user decision
  // 2026-09-03): sandbox verdicts are canned, so a live map there only spends
  // quota. DEVELOPMENT and production get the real surface.
  const preview = addressVendorsStubbed({
    previewMode: config.previewMode,
    environment: config.serverConfig?.environment,
  });
  const theme = config.appearance?.theme === 'dark' ? ('dark' as const) : ('light' as const);
  const primaryColor = config.appearance?.primaryColor;
  if (preview) {
    return (
      <MapPreviewPlaceholder
        value={value}
        onChange={onChange}
        defaultCenter={defaultCenter}
        className={className}
      />
    );
  }
  if (googleKey) {
    return (
      <GoogleMapPicker
        apiKey={googleKey}
        value={value}
        onChange={onChange}
        defaultCenter={defaultCenter}
        defaultZoom={defaultZoom}
        className={className}
        interactive={interactive}
      />
    );
  }
  if (frameUrl) {
    return (
      <FramedMapPicker
        frameUrl={frameUrl}
        value={value}
        onChange={onChange}
        defaultCenter={defaultCenter}
        defaultZoom={defaultZoom}
        theme={theme}
        primaryColor={primaryColor}
        className={className}
      />
    );
  }
  return (
    <MapPinPicker
      value={value}
      onChange={onChange}
      defaultCenter={defaultCenter}
      defaultZoom={defaultZoom}
      className={className}
      interactive={interactive}
    />
  );
}

// The builder-preview stand-in — the map surface's PreviewCapturePlaceholder.
// No tiles, no Google loader, no frame grant; the pin lands on the default
// centre once (what the real map's first idle emits) so Continue stays
// reachable and the author walks the whole flow.
function MapPreviewPlaceholder({
  value,
  onChange,
  defaultCenter,
  className,
}: {
  value: LatLng | null;
  onChange: (pin: LatLng) => void;
  defaultCenter: LatLng;
  className?: string;
}) {
  const hasPin = value != null;
  useEffect(() => {
    if (!hasPin) onChange(defaultCenter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPin]);

  return (
    <div
      className={cn(
        'flex h-64 w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/40',
        className,
      )}
      aria-hidden="true"
    >
      <MapPinHouse className="h-8 w-8 text-muted-foreground/60" />
      <p className="max-w-[16rem] px-6 text-center text-xs text-muted-foreground">
        Applicants place their pin on a live map here. The map loads only for real users.
      </p>
    </div>
  );
}
