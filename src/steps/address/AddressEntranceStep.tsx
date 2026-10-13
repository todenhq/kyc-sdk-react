'use client';

import React, { useEffect, useState } from 'react';
import { StepHeader } from '../../components/StepHeader';
import { Button } from '../../components/ui/button';
import { StickyActions } from '../../components/StickyActions';
import { AddressPhotoUpload } from '../../components/AddressPhotoUpload';
import { useVerificationContext } from '../../context/VerificationContext';
import { useAddressFlow } from './use-address-flow';
import { StreetViewFramer } from './StreetViewFramer';
import { FramedStreetView } from './FramedStreetView';
import { streetViewFrameUrlOf } from '../../lib/map-frame';
import { Landmark } from '../../components/icons';
import { useText } from '../../i18n';

/**
 * The entrance step: Street View FIRST — it opens automatically wherever
 * Google has photographed the street, because framing beats fumbling for a
 * camera — and the applicant's own photo is the fallback (no coverage, or
 * they skip). Capturing a frame advances straight to review. Hosted pages
 * hold the browser key and render the panorama in-document; embedded mounts
 * ride the framed /embed/street-view page (same chrome, same capture).
 */
export function AddressEntranceStep() {
  const { state, dispatch } = useVerificationContext();
  const t = useText();
  const flow = useAddressFlow();
  const svFrameUrl = !flow.googleKey && flow.mapsFrameUrl ? streetViewFrameUrlOf(flow.mapsFrameUrl) : null;
  const svRequired = flow.address?.streetView === 'required';
  // The builder preview AND sandbox keep the step real users get, on a
  // static stand-in (the camera steps' placeholder rule): no Google loads
  // from either. The photo path below stays real — uploads work on sandbox,
  // and the server cans the verdicts regardless. DEVELOPMENT gets the real
  // framer, per the dev-is-real rule.
  const preview = flow.vendorsStubbed;
  const streetView =
    flow.streetViewOffered &&
    Boolean(flow.pin) &&
    (preview || Boolean(flow.googleKey) || Boolean(svFrameUrl));
  const [mode, setMode] = useState<'framing' | 'photo'>(() => (streetView ? 'framing' : 'photo'));
  const [skipped, setSkipped] = useState(false);
  const photoUploaded = Boolean(state.mediaIds.addressPhoto);

  // Nothing to capture here (no coverage AND the photo input is off): move on
  // rather than showing an empty screen.
  const emptyFallback = mode === 'photo' && flow.photoMode === 'off';
  useEffect(() => {
    if (emptyFallback) flow.goNext('address-entrance');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emptyFallback]);
  if (emptyFallback) return null;

  const canContinue = !flow.uploading && (flow.photoMode !== 'required' || photoUploaded);

  return (
    <div className="space-y-4 animate-slide-up">
      <StepHeader
        title={t('address.entrance.title')}
        description={t(
          mode === 'framing' ? 'address.entrance.description.framing' : 'address.entrance.description.photo',
        )}
        onBack={() => flow.goBack('address-entrance')}
      />

      {mode === 'framing' && streetView && flow.pin ? (
        preview ? (
          <div className="space-y-3">
            <div className="flex h-[40vh] min-h-[240px] max-h-[360px] w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/40 sm:h-[420px] sm:max-h-none">
              <Landmark className="h-8 w-8 text-muted-foreground/60" />
              <p className="max-w-[18rem] px-6 text-center text-xs text-muted-foreground">
                Applicants pan real street imagery to frame their entrance here. It loads only
                for real users.
              </p>
            </div>
            <StickyActions>
              <div className="flex gap-2">
                {!svRequired && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSkipped(true);
                      setMode('photo');
                    }}
                    className="h-11 flex-1 rounded-xl"
                  >
                    {t('common.skip')}
                  </Button>
                )}
                <Button onClick={() => flow.goNext('address-entrance')} className="h-11 flex-1 rounded-xl">
                  {t('address.entrance.useView')}
                </Button>
              </div>
            </StickyActions>
          </div>
        ) : flow.googleKey ? (
          <StreetViewFramer
            apiKey={flow.googleKey}
            pin={flow.pin}
            onCaptured={(frame) => {
              if (state.address) {
                dispatch({ type: 'SET_ADDRESS', payload: { ...state.address, streetView: frame } });
              }
              flow.goNext('address-entrance');
            }}
            onSkip={() => {
              setSkipped(true);
              setMode('photo');
            }}
            hideSkip={svRequired}
            onUnavailable={() => setMode('photo')}
          />
        ) : (
          <FramedStreetView
            frameUrl={svFrameUrl!}
            pin={flow.pin}
            onCaptured={(frame) => {
              if (state.address) {
                dispatch({ type: 'SET_ADDRESS', payload: { ...state.address, streetView: frame } });
              }
              flow.goNext('address-entrance');
            }}
            onSkip={() => {
              setSkipped(true);
              setMode('photo');
            }}
            hideSkip={svRequired}
            onUnavailable={() => setMode('photo')}
          />
        )
      ) : (
        <>
          {skipped && (
            <p className="text-sm text-muted-foreground">{t('address.entrance.skipped')}</p>
          )}
          <AddressPhotoUpload
            required={flow.photoMode === 'required'}
            uploaded={photoUploaded}
            uploading={flow.uploading}
            onPick={(file) => void flow.pickPhoto(file)}
            onRemove={flow.removePhoto}
          />

          {flow.error && <p className="text-sm text-destructive">{flow.error}</p>}

          <Button
            onClick={() => flow.goNext('address-entrance')}
            disabled={!canContinue}
            className="h-12 w-full rounded-xl text-base font-medium"
          >
            {photoUploaded || flow.photoMode === 'required'
              ? t('common.continue')
              : t('address.entrance.continueWithoutPhoto')}
          </Button>
        </>
      )}
    </div>
  );
}
