'use client';

import { useEffect, useState } from 'react';
import { useVerificationConfig } from '../../context/VerificationConfigContext';
import { useVerificationContext } from '../../context/VerificationContext';
import { configScope } from '../../lib/scope';
import { isBusinessFlow } from '../../lib/business';
import { defaultMapView } from '../../lib/map-tiles';
import { addressBackStep, addressNextStep } from '../../lib/address-step-nav';
import { verifiedIdsFromState } from '../../lib/supporting-documents';
import { deviceFixFields, uploadAddressPhoto } from '../address-helpers';
import { addressFlowOptions, addressFlowSteps, addressVendorsStubbed, nextAddressStep, prevAddressStep } from './flow-steps';
import { usePinActions } from './use-pin-actions';
import { geoDefaultCountry } from './country-adoption';
import type { VerificationStep } from '../../types/config';
import { useText } from '../../i18n';

// The address flow's shared brain: every address step mounts this hook and
// gets the same derived flags, the same step list, and the same actions —
// which is what keeps four separate step components telling one story.

const REVERSE_DEBOUNCE_MS = 700;

export function useAddressFlow() {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();
  const address = config.addressCollection;
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBusiness = isBusinessFlow(config);
  const pin = state.address ? { lat: state.address.lat, lng: state.address.lng } : null;
  const googleKey = config.serverConfig?.googleMapsBrowserKey ?? null;
  const mapsFrameUrl = config.serverConfig?.mapsFrameUrl ?? null;
  // KYB: the single premises step — its pin + directions ARE the capture, so
  // the flow options collapse to none of the optional steps.
  const flow = isBusiness
    ? { searchAvailable: false, photoMode: 'off' as const, streetViewOffered: false }
    : addressFlowOptions({
        photo: address?.photo,
        streetView: address?.streetView,
        serverSearch: Boolean(config.serverConfig?.addressSearch),
        previewMode: addressVendorsStubbed({
          previewMode: config.previewMode,
          environment: config.serverConfig?.environment,
        }),
        hasGoogleKey: Boolean(googleKey),
        hasStreetViewFrame: Boolean(mapsFrameUrl),
      });
  const { photoMode, streetViewOffered, searchAvailable } = flow;
  const steps = isBusiness ? (['address-collection'] as VerificationStep[]) : addressFlowSteps(flow);

  // ADDRESS SCOPE: NO seeded country, ever (user decision 2026-09-03). The
  // flow's country exists only once EVIDENCE supplies it — the IP geo
  // default below, a GPS/pin reverse-geocode, or a picked address — so until
  // then the map opens on the world view and the search runs unbiased. The
  // workflow's configured `country` is deliberately not consulted here; it
  // survives only as the wire-level fallback at submit (the verify schema
  // requires an ISO-2), for the case where no geocode ever answered.
  const isAddressScope = configScope(config) === 'address';
  const country = isBusiness
    ? (state.business.country ?? undefined)
    : isAddressScope
      ? (state.selectedCountry ?? undefined)
      : (state.selectedCountry ?? config.country);
  const view = defaultMapView(country);

  // Default the declared country to the visitor's IP-derived geoCountry (a
  // guess and only ever a default) so one link works worldwide: the search
  // biases to and the map opens on where they actually are. DELIBERATELY the
  // IP tier alone — the browser locale's region is how a browser is
  // configured, not where a person is, and on a dev box (loopback IP -> no
  // geo) an en-US locale in Calabar once declared US and the address search
  // returned California. When the IP answers nothing the country simply
  // stays unset until a GPS/pin reverse-geocode or a picked address supplies
  // it (see adoptGeocodedCountry in use-pin-actions.ts). Runs once (a set
  // selectedCountry never re-defaults); the AddressCountryControl on the PoA
  // step is where the applicant corrects it by hand. Preview mode stays
  // deterministic (no dispatch).
  // The rule (and the accepted-list gate) is country-adoption.ts, shared with
  // RN + Flutter. No comparison against config.country here: the address
  // scope has no seeded country, so an IP answer is adopted whatever the
  // workflow says.
  const geoDefault = geoDefaultCountry({
    geoCountry: config.serverConfig?.geoCountry,
    selectedCountry: state.selectedCountry,
    scope: configScope(config),
    accepted: config.proofOfAddress?.countries,
  });
  useEffect(() => {
    if (config.previewMode || !geoDefault) return;
    dispatch({ type: 'SET_COUNTRY_AUTO', payload: geoDefault as never });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoDefault]);

  // Pin mechanics (labelling, current-location fix, every way the pin can
  // move) live in use-pin-actions.ts — split per the 200-line rule.
  const pinActions = usePinActions({ config, state, dispatch, setError });

  const pickPhoto = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const mediaId = await uploadAddressPhoto(config.api, file, t);
      dispatch({ type: 'SET_MEDIA_ID', payload: { mediaType: 'addressPhoto', mediaId } });
      dispatch({ type: 'SET_ADDRESS_PHOTO_PREVIEW', payload: URL.createObjectURL(file) });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('address.photo.error.generic'));
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () =>
    dispatch({ type: 'SET_MEDIA_ID', payload: { mediaType: 'addressPhoto', mediaId: undefined } });

  /** Leave the address flow forwards (after review, or a skip). */
  const exitForward = () => {
    const next = addressNextStep(config);
    dispatch(next === 'submit' ? { type: 'SUBMIT_VERIFICATION' } : { type: 'SET_STEP', payload: next });
  };

  /** The step after `current` within the address flow, else the flow exit. */
  const goNext = (current: VerificationStep) => {
    const next = nextAddressStep(steps, current);
    if (next) dispatch({ type: 'SET_STEP', payload: next });
    else exitForward();
  };

  /** The step before `current`, else back out of the address flow entirely. */
  const goBack = (current: VerificationStep) => {
    const prev = prevAddressStep(steps, current);
    if (prev) {
      dispatch({ type: 'SET_STEP', payload: prev });
      return;
    }
    const requiresCapture = state.selectedIdType
      ? config.getIdTypeDefinition(state.selectedIdType)?.requiresDocumentCapture
      : undefined;
    dispatch({
      type: 'SET_STEP',
      payload: addressBackStep(config, requiresCapture, verifiedIdsFromState(state, config)),
    });
  };

  /** Commit: the one-shot attest fix (best-effort), then leave the flow. */
  const confirm = async () => {
    if (!state.address) return;
    setConfirming(true);
    if (address?.attestPresence && !config.previewMode) {
      dispatch({ type: 'SET_ADDRESS', payload: { ...state.address, ...(await deviceFixFields()) } });
    }
    setConfirming(false);
    exitForward();
  };

  return {
    address,
    isBusiness,
    previewMode: Boolean(config.previewMode),
    /** Preview OR non-production: the vendor surfaces are stubbed. */
    vendorsStubbed: addressVendorsStubbed({
      previewMode: config.previewMode,
      environment: config.serverConfig?.environment,
    }),
    ...pinActions,
    pin,
    view,
    country,
    photoMode,
    googleKey,
    mapsFrameUrl,
    streetViewOffered,
    steps,
    uploading,
    confirming,
    error,
    setError,
    pickPhoto,
    removePhoto,
    goNext,
    goBack,
    exitForward,
    confirm,
  };
}
