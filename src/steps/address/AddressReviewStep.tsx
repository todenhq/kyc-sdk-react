'use client';

import React, { useEffect, useState } from 'react';
import { Camera, MapPin } from '../../components/icons';
import { AddressMap } from '../../components/AddressMap';
import { MapPinMarker } from '../../components/MapPinMarker';
import { StepHeader } from '../../components/StepHeader';
import { LineSkeleton } from '../../components/LineSkeleton';
import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import { useVerificationContext } from '../../context/VerificationContext';
import { useVerificationConfig } from '../../context/VerificationConfigContext';
import { useAddressFlow } from './use-address-flow';
import { ADDRESS_LINE_PENDING, displayAddressLine } from './flow-steps';
import { missingAddressFieldsMessage, missingRequiredAddressFields } from './address-field-modes';
import { useText } from '../../i18n';
import { AddressSandboxOutcome } from './AddressSandboxOutcome';

/**
 * The commit point, as ONE composed card: a clean summary map (no POI clutter,
 * no controls) with the entrance imagery hanging over its bottom edge like a
 * photo clipped to a document, and the address underneath as the card's own
 * heading. Tapping the map jumps back to the pin step; every row has its edit
 * link. The presence story lives on the intro screen, not here.
 */
export function AddressReviewStep() {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();
  const flow = useAddressFlow();
  const { pin } = flow;

  // A refresh can land straight here with a restored pin that predates the
  // label fields — reverse-geocode it once rather than showing coordinates.
  useEffect(() => {
    if (state.address && !state.address.label) flow.relabelPin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const directions = state.address?.directions.trim() || null;
  const photoPreview = state.addressPhotoPreview;
  const photoUploaded = Boolean(state.mediaIds.addressPhoto);
  const frame = state.address?.streetView ?? null;

  // EMBEDDED mounts hold no browser key, so the thumbnail is fetched through
  // the server (which holds one) and shown from an object URL — otherwise a
  // frame captured via the framed page reviewed as nothing at all.
  const [proxyThumb, setProxyThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!frame || flow.googleKey || config.previewMode) {
      setProxyThumb(null);
      return;
    }
    let alive = true;
    let url: string | null = null;
    void config.api.addressStreetViewPreview(frame).then((blob) => {
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      setProxyThumb(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame?.panoId, frame?.heading, frame?.pitch, frame?.fov, flow.googleKey]);

  // The map as a PICTURE. A confirmation screen wants a photograph of the
  // place, not a second instrument: a live map here invites a drag that goes
  // nowhere. A browser key renders it client-side; keyless mounts fetch the
  // same image through the server. Either way it falls back to the live map,
  // so this can only improve the screen, never empty it.
  const [staticMap, setStaticMap] = useState<string | null>(null);
  // A refused image falls back to the live map. The Maps Static API is a
  // SEPARATE console enablement, so a project without it answers 403 and the
  // <img> would otherwise sit there broken.
  const [staticMapFailed, setStaticMapFailed] = useState(false);
  useEffect(() => {
    if (!pin || flow.googleKey || config.previewMode) {
      setStaticMap(null);
      return;
    }
    let alive = true;
    let url: string | null = null;
    void config.api.addressStaticMap({ lat: pin.lat, lng: pin.lng, zoom: 16 }).then((blob) => {
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob);
      setStaticMap(url);
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin?.lat, pin?.lng, flow.googleKey]);

  const staticMapSrc = staticMapFailed
    ? null
    : pin && flow.googleKey
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${pin.lat},${pin.lng}&zoom=16&size=640x360&scale=2&maptype=hybrid&format=jpg&key=${encodeURIComponent(flow.googleKey)}`
      : staticMap;

  // The framed entrance AS AN IMAGE: the browser key renders the exact framed
  // Street View client-side (the server stores its own copy at processing);
  // keyless mounts use the server-fetched copy above.
  const frameThumb =
    frame && flow.googleKey
      ? `https://maps.googleapis.com/maps/api/streetview?size=240x240&pano=${encodeURIComponent(frame.panoId)}&heading=${frame.heading}&pitch=${frame.pitch}&fov=${frame.fov}&key=${encodeURIComponent(flow.googleKey)}`
      : proxyThumb;
  const hero = photoPreview
    ? { src: photoPreview, alt: 'Entrance photo' }
    : frameThumb
      ? { src: frameThumb, alt: 'Street View entrance' }
      : null;
  const second = photoPreview && frameThumb ? { src: frameThumb, alt: 'Street View entrance' } : null;

  const edit = (step: 'address-collection' | 'address-entrance') =>
    dispatch({ type: 'SET_STEP', payload: step });

  // Beside the address, unless an entrance hangs over the band: the band's
  // pr-32 (128) put Edit flush against the 112-wide photo at right-4, and
  // widening it starves the pill on a 360px phone, so Edit moves under the
  // address instead. RN and Flutter draw the same.
  const editButton = (
    <button
      type="button"
      onClick={() => edit('address-collection')}
      className="shrink-0 text-sm text-primary underline-offset-4 hover:underline"
    >
      {t('address.review.edit')}
    </button>
  );

  // Backstop for a restored session landing straight here: required details
  // must be filled before the address can be confirmed (the pin step is the
  // primary gate).
  const missingRequired = missingRequiredAddressFields(flow.address, state.address ?? null);

  return (
    <div className="space-y-4 animate-slide-up">
      <StepHeader
        title={t(flow.isBusiness ? 'address.review.title.business' : 'address.review.title')}
        description={t('address.review.description')}
        onBack={() => flow.goBack('address-review')}
      />

      <div className="overflow-hidden rounded-2xl border border-border/60">
        {pin && (
          <div className="relative">
            {staticMapSrc ? (
              <div className="relative h-48 w-full sm:h-56">
                <img
                  src={staticMapSrc}
                  alt="Map of the pinned location"
                  onError={() => setStaticMapFailed(true)}
                  className="h-full w-full object-cover"
                />
                {/* The SDK's own pin, centred on the picture, so the flow
                    shows one pin throughout rather than a vendor marker on
                    the last screen. */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <MapPinMarker />
                </div>
              </div>
            ) : (
              <AddressMap
                value={pin}
                onChange={() => undefined}
                defaultCenter={pin}
                defaultZoom={16}
                className="h-48 rounded-none border-0 sm:h-56"
                interactive={false}
              />
            )}
            <button
              type="button"
              aria-label="Edit the pinned location"
              onClick={() => edit('address-collection')}
              className="absolute inset-0 z-10 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
            {/* The entrance hangs over the map's bottom edge — clipped to the
                address like a photo to a document, and BIG enough to read. */}
            {hero && (
              <img
                src={hero.src}
                alt={hero.alt}
                className="absolute -bottom-10 right-4 z-20 h-28 w-28 rounded-2xl border-4 border-background object-cover shadow-xl"
              />
            )}
            {second && (
              <img
                src={second.src}
                alt={second.alt}
                className="absolute -bottom-10 right-36 z-20 h-20 w-20 rounded-xl border-4 border-background object-cover shadow-lg"
              />
            )}
          </div>
        )}

        {/* The success card's header-band language, so the confirmation and
            the "check active" card read as one design. */}
        <div className="bg-primary/[0.06] px-4 pb-4 pt-4">
          <div className={cn('flex items-start justify-between gap-3', hero && 'min-h-[4.25rem] pr-32')}>
            <div className="min-w-0 space-y-1">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <MapPin className="h-3 w-3" />
                {t(flow.isBusiness ? 'address.review.badge.business' : 'address.review.badge')}
              </span>
              {/* One shared line with the pin summary + the server's composed
                  address (displayAddressLine) — typed number replaces a
                  differing picked one, a typed street leads the line. */}
              <p className="text-base font-semibold leading-snug">
                {/* Never coordinates: an unread pin shows a skeleton line
                    while its address is still coming. */}
                {!state.address ? (
                  t('address.review.noPin')
                ) : displayAddressLine(state.address) ? (
                  displayAddressLine(state.address)
                ) : flow.labelling ? (
                  <LineSkeleton label={ADDRESS_LINE_PENDING} size="base" width="70%" />
                ) : (
                  t('address.line.unavailable')
                )}
              </p>
              {directions && (
                <p className="text-xs leading-snug text-muted-foreground">“{directions}”</p>
              )}
              {hero && <div className="pt-1">{editButton}</div>}
            </div>
            {!hero && editButton}
          </div>
        </div>
      </div>

      <AddressSandboxOutcome />

      {flow.error && <p className="text-sm text-destructive">{flow.error}</p>}
      {missingRequired.length > 0 && (
        <p className="text-sm text-destructive">
          {missingAddressFieldsMessage(missingRequired, t)}{' '}
          <button type="button" className="underline underline-offset-2" onClick={() => edit('address-collection')}>
            {t('address.missingFields.add')}
          </button>
        </p>
      )}

      <Button
        onClick={() => void flow.confirm()}
        disabled={!pin || flow.confirming || missingRequired.length > 0}
        className="h-12 w-full rounded-xl text-base font-medium"
      >
        {flow.confirming ? t('address.confirming') : t('address.review.confirm')}
      </Button>

      {flow.address?.requirePin !== true && (
        <button
          type="button"
          onClick={flow.exitForward}
          className="mx-auto block w-fit text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          {t('address.skip')}
        </button>
      )}
    </div>
  );
}
