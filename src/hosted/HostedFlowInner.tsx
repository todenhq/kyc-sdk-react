'use client';

import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useVerificationContext } from '../context/VerificationContext';
import { VerificationModal } from '../components/VerificationModal';
import { isDesktopDevice } from '../lib/device';
import { confirmMobileDevice } from '../lib/device-class';
import { primeFaceMesh } from '../liveness/face-mesh';
import { configureSpeech } from '../liveness/speech';
import type { HandoffSessionSnapshot } from '../services/api';
import type { VoiceGuidanceOption } from '../types/config';

// Lazy-loaded so the QR/handoff code (+ qrcode.react) stays out of the initial
// hosted bundle: it only loads when a DESKTOP visitor reaches the gate.
const DeviceHandoffGate = lazy(() => import('../components/DeviceHandoffGate'));

export function HostedFlowInner({
  snapshot,
  cameraNeeded,
  mobileOnly,
  handoffDisabled,
  voiceGuidance,
  enableLiveness,
  showThemeToggle,
  fullScreen,
  embedded,
  onClose,
}: {
  snapshot: HandoffSessionSnapshot;
  cameraNeeded: boolean;
  /** Mobile-only workflow — the flow may not run on this device unless it's a confirmed handheld. */
  mobileOnly: boolean;
  handoffDisabled: boolean;
  voiceGuidance?: VoiceGuidanceOption;
  enableLiveness?: boolean;
  showThemeToggle?: boolean;
  fullScreen?: boolean;
  /** Mounted inside a host application: the modal is closable, and closing
   *  hands control back to the host (see HostedVerification.embedded). */
  embedded?: boolean;
  onClose?: () => void;
}) {
  const { state, dispatch } = useVerificationContext();
  // A DESKTOP hosted-link visitor is offered the "continue on your phone" gate
  // first (the gate mints a CHILD handoff session for the phone and polls it).
  // A phone visitor — the common hosted case — or a no-camera flow goes straight
  // into the modal.
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    // Mobile-only workflow: the flow opens only on a hardware-confirmed
    // handheld (GPU + motion, not viewport — see lib/device-class.ts). Anything
    // else lands on the gate, which offers the phone QR and no way through.
    if (mobileOnly) {
      void confirmMobileDevice().then(({ deviceClass }) => {
        if (deviceClass === 'mobile') dispatch({ type: 'OPEN_MODAL' });
        else setGateOpen(true);
      });
    } else if (cameraNeeded && isDesktopDevice()) {
      setGateOpen(true);
    } else {
      dispatch({ type: 'OPEN_MODAL' });
    }
    if (enableLiveness !== false) primeFaceMesh();
    configureSpeech(voiceGuidance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Verify on this computer instead: leave the gate, run the flow here. Never
  // reachable on a mobile-only workflow — the gate hides every path to it.
  const continueHere = () => {
    if (mobileOnly) return;
    setGateOpen(false);
    dispatch({ type: 'OPEN_MODAL' });
  };

  // On the phone there is nothing to "close" back to — the flow is the whole
  // page — so close is disabled. The terminal Submitted step ends the journey;
  // the desktop is notified via its session poll.
  return (
    <>
      {gateOpen && (
        <Suspense fallback={null}>
          <DeviceHandoffGate
            snapshot={snapshot}
            onContinueHere={continueHere}
            // No parent surface to return to on the hosted page — dismissing the
            // gate simply falls through to verifying on this device (a
            // mobile-only flow makes both a no-op and keeps the gate up).
            onClose={continueHere}
            showThemeToggle={showThemeToggle}
            mobileOnly={mobileOnly}
            noHandoff={mobileOnly && handoffDisabled}
            // Nothing to dismiss to on a mobile-only hosted link — hide the X
            // rather than leave a button that does nothing.
            disableClose={mobileOnly}
          />
        </Suspense>
      )}
      <VerificationModal
        open={state.isOpen}
        onClose={embedded ? () => onClose?.() : () => undefined}
        showThemeToggle={showThemeToggle}
        disableClose={!embedded}
        fullScreen={fullScreen}
      />
    </>
  );
}
