'use client';

import React, { useEffect } from 'react';
import { StepHeader } from '../../components/StepHeader';
import { useVerificationContext } from '../../context/VerificationContext';
import { pickedAddressState } from '../address-helpers';
import { useAddressFlow } from './use-address-flow';
import { useAddressIntroGate } from './AddressIntroGate';
import { SearchScreen } from './SearchScreen';
import { useText } from '../../i18n';

/** Step 1 of the address flow: find the address as words. Every path — a
 *  picked suggestion, the current location, or "place a pin instead" — lands
 *  on the pin step. */
export function AddressSearchStep() {
  const { state, dispatch } = useVerificationContext();
  const t = useText();
  const flow = useAddressFlow();
  const gate = useAddressIntroGate('address-search', flow.steps[0]!);

  // Warm the GPS + reverse geocode from the moment the flow is reached —
  // UNDER the welcome screen too (user decision 2026-08-29): by the time
  // "Continue" is tapped the fix is usually already resolved, so the button
  // carries the address immediately and the pin lands with no hesitation.
  useEffect(() => {
    flow.startPrefetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gate) return gate;

  const toPin = () => dispatch({ type: 'SET_STEP', payload: 'address-collection' });

  return (
    <div className="space-y-5 animate-slide-up">
      <StepHeader
        title={t('address.search.title')}
        description={t('address.search.description')}
        onBack={() => flow.goBack('address-search')}
      />
      <SearchScreen
        country={flow.country}
        onResolved={(hit) => {
          // The picked address's own country IS the declaration (a pick is
          // the applicant saying "this is my address") — guarded by the same
          // guess-only/accepted-list rules as every geocode adoption.
          flow.adoptGeocodedCountry({ country: hit.country ?? null }, { explicit: true });
          dispatch({
            type: 'SET_ADDRESS',
            payload: {
              ...pickedAddressState(state.address, hit),
              ...(hit.formatted
                ? { label: hit.formatted, pickedAt: { lat: hit.lat, lng: hit.lng } }
                : {}),
              // A pick that RESOLVES a street retires the typed one — the
              // input only existed because no source knew the street, and a
              // hidden field must not keep leading the composed line.
              ...(hit.road ? { street: undefined } : {}),
              // Places picks carry the breakdown; basic-search hits fall back
              // to the label line in the sheet.
              ...(hit.road || hit.area || hit.city || hit.state || hit.postcode
                ? {
                    parts: {
                      street: hit.road ?? null,
                      area: hit.area ?? null,
                      city: hit.city ?? null,
                      state: hit.state ?? null,
                      postcode: hit.postcode ?? null,
                      country: hit.country ?? null,
                    },
                  }
                : {}),
            },
          });
          toPin();
        }}
        locationHint={flow.currentFix?.label ?? null}
        near={flow.currentFix ? { lat: flow.currentFix.lat, lng: flow.currentFix.lng } : null}
        locating={flow.locating}
        onUseMyLocation={() => void flow.applyCurrentFix(toPin)}
        onPinInstead={toPin}
      />
      {flow.error && <p className="text-sm text-destructive">{flow.error}</p>}
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
