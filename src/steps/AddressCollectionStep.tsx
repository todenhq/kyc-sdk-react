'use client';

import React, { useEffect, useState } from 'react';
import { PencilLine } from '../components/icons';
import { cn } from '../lib/utils';
import { AddressMap } from '../components/AddressMap';
import { StepHeader } from '../components/StepHeader';
import { Button } from '../components/ui/button';
import { StickyActions } from '../components/StickyActions';
import { LineSkeleton } from '../components/LineSkeleton';
import { useVerificationContext } from '../context/VerificationContext';
import { useAddressFlow } from './address/use-address-flow';
import { useAddressIntroGate } from './address/AddressIntroGate';
import { DetailsSheet } from './address/DetailsSheet';
import { CurrentLocationRow, LocateFab } from './address/CurrentLocationRow';
import { LabelDecisionRow } from './address/LabelDecisionRow';
import { ADDRESS_LINE_PENDING, displayAddressLine, shouldAskLabelDecision } from './address/flow-steps';
import { missingAddressFieldsMessage, missingRequiredAddressFields } from './address/address-field-modes';
import { useText } from '../i18n';

/**
 * The PIN step of the address flow (wire name 'address-collection'): a big
 * map — near full screen on mobile, so there is room to actually find the
 * building — with the summary card and the details sheet over it. On KYB this
 * is the whole premises capture, so Continue commits (attest fix included);
 * on individual flows it advances to the entrance/review steps.
 */
// Once per page session: a dismissed or denied prompt must not re-fire every
// time the person passes through this step.
let autoLocateAttempted = false;

export function AddressCollectionStep() {
  const { state, dispatch } = useVerificationContext();
  const t = useText();
  const flow = useAddressFlow();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Declared BEFORE the intro-gate early return below: a hook after a
  // conditional return renders "more hooks than during the previous render"
  // the moment the gate dismisses (shipped in 2.14.0, fixed in 2.14.1).
  const [missingNudge, setMissingNudge] = useState(false);
  const gate = useAddressIntroGate('address-collection', flow.steps[0]!);

  // Trigger Use-my-location AUTOMATICALLY the first time the pin step opens
  // with no pin (user decision 2026-08-29): most people are verifying from
  // home, so the map should land on them rather than a city-centre default.
  // The fix is usually already resolved (the search step warms it), so this
  // applies INSTANTLY — no default view flashing first, no jump. Silent by
  // contract; the button remains for retries and denials.
  const gateShowing = Boolean(gate);
  const noPin = !state.address;
  useEffect(() => {
    // The fix warms even under the welcome screen — only the APPLY waits for
    // the gate (a pin landing behind the primer would be invisible anyway).
    flow.startPrefetch();
    if (gateShowing || flow.previewMode) return;
    // A restored pin without its line (a session saved before labels existed):
    // reverse-geocode it once rather than showing raw coordinates.
    if (state.address && !state.address.label) {
      flow.relabelPin();
    }
    if (!noPin || autoLocateAttempted) return;
    autoLocateAttempted = true;
    void flow.applyCurrentFix(undefined, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gateShowing, noPin]);

  if (gate) return gate;

  const { pin } = flow;
  const label = state.address?.label ?? null;
  const askLabel = state.address ? shouldAskLabelDecision(state.address) : false;
  const addressLine = state.address ? displayAddressLine(state.address) : '';
  const pendingLine = Boolean(state.address) && !addressLine && flow.labelling;
  const detailCount = [
    state.address?.propertyNumber,
    state.address?.street,
    state.address?.unit,
    state.address?.propertyName,
    state.address?.directions,
    state.address?.neighbourhood,
    state.address?.city,
    state.address?.state,
    state.address?.postcode,
  ].filter((v) => v?.trim()).length;
  const lastInFlow = flow.isBusiness;

  // Workflow-required details hold Continue until they are filled — and open
  // the sheet on the missing fields rather than pointing at a closed drawer.
  const missingRequired = missingRequiredAddressFields(flow.address, state.address ?? null);

  const handleContinue = () => {
    if (missingRequired.length > 0) {
      setMissingNudge(true);
      setSheetOpen(true);
      return;
    }
    if (lastInFlow) void flow.confirm();
    else flow.goNext('address-collection');
  };

  return (
    <div className="relative space-y-4 animate-slide-up">
      <StepHeader
        title={t(flow.isBusiness ? 'address.pin.title.business' : 'address.pin.title')}
        description={t('address.pin.description')}
        onBack={() => flow.goBack('address-collection')}
      />

      <div className="relative">
        <AddressMap
          value={pin}
          onChange={(next) => flow.setPin(next)}
          defaultCenter={flow.view.center}
          defaultZoom={flow.view.zoom}
          className="h-[40vh] min-h-[240px] max-h-[360px] sm:h-[420px] sm:max-h-none"
        />
        {pin && <LocateFab locating={flow.locating} onClick={() => void flow.locateToPin()} />}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3">
        <div className="min-w-0">
          {/* Three states, and none is a coordinate pair: no pin, a pin whose
              address is still being read (a skeleton line at the text's own
              height, so nothing moves when the words land), and a pin with no
              address at all. */}
          <p className="flex items-center truncate text-sm font-semibold">
            {pendingLine ? (
              <LineSkeleton label={ADDRESS_LINE_PENDING} />
            ) : (
              <span
                key={addressLine}
                className={cn('truncate animate-fade-in', !addressLine && 'font-medium text-muted-foreground')}
              >
                {!state.address ? t('address.pin.noPin') : addressLine || t('address.line.unavailable')}
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {detailCount > 0
              ? t(detailCount === 1 ? 'address.pin.detailsAdded.one' : 'address.pin.detailsAdded.other', { count: detailCount })
              : t('address.pin.detailsHint')}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => setSheetOpen(true)}
          disabled={!pin}
          className="h-9 shrink-0 rounded-lg px-3 text-sm"
        >
          <PencilLine className="mr-1.5 h-3.5 w-3.5" /> {t('address.pin.editDetails')}
        </Button>
      </div>

      {askLabel && label && (
        <LabelDecisionRow label={label} onKeep={flow.keepPickedLabel} onAdopt={flow.adoptPinAddress} />
      )}
      {!pin && (
        <CurrentLocationRow
          hint={flow.currentFix?.label ?? null}
          locating={flow.locating}
          onClick={() => void flow.applyCurrentFix()}
        />
      )}

      {flow.error && <p className="text-sm text-destructive">{flow.error}</p>}
      {missingNudge && missingRequired.length > 0 && (
        <p className="text-sm text-destructive">{missingAddressFieldsMessage(missingRequired, t)}</p>
      )}

      <StickyActions className="space-y-3">
        <Button
          onClick={handleContinue}
          disabled={!pin || flow.confirming}
          className="h-12 w-full rounded-xl text-base font-medium"
        >
          {flow.confirming ? t('address.confirming') : t('common.continue')}
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
      </StickyActions>

      <DetailsSheet
        open={sheetOpen}
        isBusiness={flow.isBusiness}
        parts={state.address?.parts ?? null}
        country={flow.country ?? null}
        directionsRequired={flow.address?.directions === 'required'}
        addressConfig={flow.address}
        values={{
          propertyNumber: state.address?.propertyNumber ?? '',
          street: state.address?.street,
          unit: state.address?.unit,
          propertyName: state.address?.propertyName ?? '',
          directions: state.address?.directions ?? '',
          neighbourhood: state.address?.neighbourhood,
          city: state.address?.city,
          state: state.address?.state,
          postcode: state.address?.postcode,
        }}
        disabled={!pin}
        onChange={(patch) =>
          state.address && dispatch({ type: 'SET_ADDRESS', payload: { ...state.address, ...patch } })
        }
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
