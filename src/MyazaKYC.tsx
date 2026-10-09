'use client';

import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collectWebDeviceMetadata } from './utils/device-metadata';
import { Loader2 } from './components/icons';
import { KYCProvider, useKYCContext } from './context/KYCContext';

// Bearer prefix a hosted mount authenticates with (mirrors kyc-core's
// HANDOFF_TOKEN_PREFIX and MyazaKYCHosted). A key starting with this IS a
// session, so such a mount must never start another.
const HANDOFF_TOKEN_PREFIX = 'hs_';
import { KYCConfigProvider, useKYCConfig, type ServerSdkConfig } from './context/KYCConfigContext';
import { KYCModal } from './components/KYCModal';
import { Button } from './components/ui/button';
import { SdkFrame } from './lib/sdk-frame';
import { buildThemeVars } from './lib/theme';
import { primeFaceMesh } from './liveness/face-mesh';
import { configureSpeech } from './liveness/speech';
import { mergeWorkflowConfig, overlayApplicantWorkflow } from './lib/workflow-merge';
import { documentCaptureNeedsCamera } from './lib/document-capture-methods';
import { safeReportError } from './lib/errors';
import { isDesktopDevice } from './lib/device';
import { confirmMobileDevice, type DeviceClassResult } from './lib/device-class';
import { useSessionProgress } from './hooks/useSessionProgress';
import { resolveBaseUrl } from './lib/resolve-url';
import { createKYCApi, KYCApiError, type WorkflowResolutionResponse, type HandoffSessionSnapshot } from './services/api';
import { KYCError } from './types/verification';
import { listIdTypeDefinitions } from './utils/id-definitions';
import { previewSelectionForSupportingDocuments } from './lib/supporting-documents-preview';
import { resetIntegritySignals } from './lib/integrity-signals';
import { persistentDeviceId } from './lib/fingerprint';
import { startSessionOnce } from './lib/start-session-once';
import {
  HandoffAttemptChangedError,
  handoffRootTemplate,
  handoffScope,
  resolveHandoffParent,
} from './lib/handoff-parent';
import type { StartSessionResponse } from './services/api';
import { classifySessionStartFailure } from './lib/session-cancelled';
import { resetStepLog } from './lib/step-log';
import { resetSilentCaptures } from './lib/silent-capture-store';
import type { MyazaKYCConfig, MyazaKYCProps, UseMyazaKYCReturn, KYCStep, AnyCountry } from './types/config';
import type { SubjectType, WorkflowBusinessConfig } from './types/business';
import { handoffCaptureNeeded } from './lib/handoff-capture';
import { resumedApplicationFrom } from './lib/resumed-application';

// Lazy-loaded so the QR/handoff code (and qrcode.react) is code-split out of the
// initial bundle — it only loads when a desktop user actually reaches the gate.
const DeviceHandoffGate = lazy(() => import('./components/DeviceHandoffGate'));

/**
 * Builder-preview step driver: when `previewStep` changes, jump the flow to
 * that step, seeding prerequisite state (an ID type of the right kind) so
 * mid-flow steps render sensibly. Renders nothing; inert unless the prop is set.
 */
function PreviewStepDriver({ step }: { step: KYCStep | null | undefined }) {
  const { state, dispatch } = useKYCContext();
  const config = useKYCConfig(); // effective country/idTypes (post country-select)
  const stateRef = useRef({ state, config });
  stateRef.current = { state, config };

  useEffect(() => {
    if (!step) return;
    const { state, config: cfg } = stateRef.current;
    const selectedIdType = state.selectedIdType;
    // Local curated defs ∪ server-synthesized ones, so previews work for any
    // ISO country the server grants (Global Documents). Lazy: most steps need
    // no ID at all.
    const offeredIds = () => {
      const all = listIdTypeDefinitions(cfg.country, cfg.serverConfig.idTypes);
      return cfg.idTypes?.length ? all.filter((t) => cfg.idTypes!.includes(t.key)) : all;
    };

    if (step === 'supporting-documents') {
      // A document scoped to one ID is resolved against the ID the applicant
      // verified with, and on a multi-region flow against the COUNTRY they
      // picked too. In the preview nobody has picked either, so seed the frame
      // that shows the author's own documents, or the step renders empty and
      // reads as broken.
      const pick = previewSelectionForSupportingDocuments({
        config: cfg.supportingDocuments,
        country: cfg.country,
        isOffered: (country, idType) => {
          const entries = cfg.countries;
          const entry = entries?.find((c) => c.country === country);
          if (entries && entries.length > 0 && !entry) return false;
          if (!entries?.length && country !== cfg.country) return false;
          const allowed = entry?.idTypes?.length ? entry.idTypes : undefined;
          if (allowed) return allowed.includes(idType as never);
          return listIdTypeDefinitions(country as never, cfg.serverConfig.idTypes).some(
            (t) => t.key === idType,
          );
        },
        selected: { country: state.selectedCountry, idType: selectedIdType },
      });
      if (pick) {
        // The country first: the ID list is per country, so selecting an ID
        // the old country does not offer would be dropped.
        if (pick.country !== cfg.country) dispatch({ type: 'SET_COUNTRY', payload: pick.country as never });
        dispatch({ type: 'SELECT_ID_TYPE', payload: pick.idType as never });
      }
    } else if (
      step === 'document-capture' ||
      step === 'id-input' ||
      step === 'liveness' ||
      step === 'nfc'
    ) {
      const offered = offeredIds();
      const current = offered.find((t) => t.key === selectedIdType);
      const needsDocument = step === 'document-capture' || step === 'nfc';
      const fits =
        current && (step === 'liveness' || current.requiresDocumentCapture === needsDocument);
      if (!fits) {
        const pick =
          step === 'liveness'
            ? offered[0]
            : step === 'nfc'
              ? // Chip reads live on eMRTDs — seed the passport when offered so
                // the preview shows the realistic pairing.
                offered.find((t) => t.key === 'passport') ??
                offered.find((t) => t.requiresDocumentCapture)
              : offered.find((t) => t.requiresDocumentCapture === needsDocument);
        if (pick) dispatch({ type: 'SELECT_ID_TYPE', payload: pick.key });
      }
    }
    dispatch({ type: 'SET_STEP', payload: step });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return null;
}

// ---------------------------------------------------------------------------
// Inner component (has access to KYCContext)
// ---------------------------------------------------------------------------

type KYCInnerProps = MyazaKYCProps<AnyCountry> & {
  /**
   * Pre-resolved server config, provided by WorkflowGate (flow mode) so the
   * provider skips the /config fetch — the flow resolution already carried
   * idTypes + branding (or the blocking error state).
   */
  serverConfigOverride?: ServerSdkConfig;
  /**
   * KYB only: the mapped applicant workflow's id (business.applicant.workflowId,
   * resolved server-side). Set by WorkflowGate/hosted after overlaying its
   * capture template; stamped on the applicant's own submission. Internal —
   * never a consumer prop.
   */
  applicantWorkflowId?: string;
};

function KYCInner({
  devUrl,
  apiKey,
  workflowId,
  applicantWorkflowId,
  subjectType,
  scope,
  business,
  country,
  countries,
  idTypes,
  multiId,
  resubmit,
  metadata,
  userId,
  userData,
  businessPrefill,
  assetsBasePath,
  enableSelfie,
  enableDocumentCapture,
  allowDocumentUpload,
  allowDocumentScan,
  enableLiveness,
  livenessMode,
  flashSequenceLength,
  livenessBrightScreen,
  selfieReview,
  deviceIntelligence,
  voiceGuidance,
  showThemeToggle,
  fullScreen,
  disableClose,
  deviceHandoff,
  consentStep,
  silentCapture,
  biometric,
  progressStyle,
  requireMobileDevice,
  defaultOpen,
  previewMode,
  previewTrustAttribution,
  previewStep,
  serverConfigOverride,
  onStart,
  onStepChange,
  onSubmit,
  onResult,
  onClose,
  onError,
  appearance,
  consent,
  success,
  texts,
  language,
  emailVerification,
  phoneVerification,
  questionnaire,
  proofOfAddress,
  supportingDocuments,
  addressCollection,
  nfc,
  ...triggerProps
}: KYCInnerProps) {
  const { state, dispatch } = useKYCContext();
  const prevStepRef = useRef<KYCStep>(state.currentStep);

  // Device-handoff gate (continue-on-phone). Shown before the flow on desktop
  // when enabled; the gate owns its own session + polling and never touches the
  // KYC reducer (so SubmittedStep's auto-submit can't fire on the desktop).
  const [gateOpen, setGateOpen] = useState(false);

  // Snapshot the desktop sends to mint a handoff session — the phone renders
  // the same flow from it. `userId` rides along (an opaque reference, like
  // metadata) so a phone-completed verification still links to the org's user.
  // userData is included so greeting tokens work on the phone (the token URL is
  // already the secret, same risk level as a magic link).
  const handoffSnapshot = useMemo<HandoffSessionSnapshot>(() => ({
    country,
    ...(workflowId ? { workflowId } : {}),
    ...(idTypes ? { idTypes } : {}),
    ...(countries ? { countries } : {}),
    ...(multiId ? { multiId } : {}),
    ...(enableSelfie !== undefined ? { enableSelfie } : {}),
    ...(enableDocumentCapture !== undefined ? { enableDocumentCapture } : {}),
    ...(allowDocumentUpload !== undefined ? { allowDocumentUpload } : {}),
    ...(allowDocumentScan !== undefined ? { allowDocumentScan } : {}),
    ...(enableLiveness !== undefined ? { enableLiveness } : {}),
    ...(livenessMode !== undefined ? { livenessMode } : {}),
    ...(flashSequenceLength !== undefined ? { flashSequenceLength } : {}),
    ...(livenessBrightScreen !== undefined ? { livenessBrightScreen } : {}),
    ...(selfieReview !== undefined ? { selfieReview } : {}),
    ...(deviceIntelligence !== undefined ? { deviceIntelligence } : {}),
    ...(deviceHandoff !== undefined ? { deviceHandoff } : {}),
    ...(consentStep !== undefined ? { consentStep } : {}),
    ...(silentCapture !== undefined ? { silentCapture } : {}),
    ...(biometric ? { biometric } : {}),
    ...(requireMobileDevice !== undefined ? { requireMobileDevice } : {}),
    ...(voiceGuidance !== undefined ? { voiceGuidance } : {}),
    ...(showThemeToggle !== undefined ? { showThemeToggle } : {}),
    ...(progressStyle !== undefined ? { progressStyle } : {}),
    ...(fullScreen !== undefined ? { fullScreen } : {}),
    ...(disableClose !== undefined ? { disableClose } : {}),
    ...(appearance ? { appearance: appearance as Record<string, unknown> } : {}),
    ...(consent ? { consent: consent as Record<string, unknown> } : {}),
    ...(success ? { success: success as Record<string, unknown> } : {}),
    ...(texts ? { texts } : {}),
    ...(questionnaire ? { questionnaire: questionnaire as { fields: unknown[] } } : {}),
    ...(emailVerification ? { emailVerification } : {}),
    ...(phoneVerification ? { phoneVerification } : {}),
    ...(proofOfAddress ? { proofOfAddress } : {}),
    ...(supportingDocuments ? { supportingDocuments } : {}),
    ...(addressCollection ? { addressCollection } : {}),
    ...(nfc ? { nfc } : {}),
    ...(metadata ? { metadata } : {}),
    ...(userId ? { userId } : {}),
    ...(userData ? { userData } : {}),
    ...(businessPrefill ? { businessPrefill } : {}),
    ...(assetsBasePath ? { assetsBasePath } : {}),
  }), [country, workflowId, idTypes, countries, multiId, enableSelfie, enableDocumentCapture, allowDocumentUpload, allowDocumentScan, enableLiveness, livenessMode, flashSequenceLength, livenessBrightScreen, selfieReview, deviceIntelligence, deviceHandoff, consentStep, silentCapture, biometric, requireMobileDevice, voiceGuidance, showThemeToggle, progressStyle, fullScreen, disableClose, appearance, consent, success, texts, emailVerification, phoneVerification, questionnaire, proofOfAddress, supportingDocuments, addressCollection, nfc, metadata, userId, userData, businessPrefill, assetsBasePath]);

  // Pre-load MediaPipe Face Mesh model as soon as the SDK mounts and apply the
  // voice-guidance config (enabled + language) for the spoken liveness prompts.
  // Preview mode renders camera placeholders, so the ~4MB model is never needed.
  useEffect(() => {
    // Business (KYB) flows have no camera/liveness step — never load the model
    // — UNLESS the workflow verifies the applicant in-flow (the individual
    // capture leg runs after the application steps).
    const businessNeedsCapture =
      subjectType === 'business' && business?.applicant?.verification === true;
    if (enableLiveness !== false && !previewMode && (subjectType !== 'business' || businessNeedsCapture)) {
      // From the server this mount talks to, with the public CDN behind it.
      // An invalid key resolves no server (the flow reports that itself).
      let serverUrl: string | undefined;
      try {
        serverUrl = resolveBaseUrl(apiKey, devUrl);
      } catch {
        serverUrl = undefined;
      }
      primeFaceMesh({ serverUrl, assetsBasePath });
    }
    configureSpeech(voiceGuidance);
  }, [voiceGuidance]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire onStepChange when the step changes
  useEffect(() => {
    if (state.currentStep !== prevStepRef.current) {
      prevStepRef.current = state.currentStep;
      onStepChange?.(state.currentStep);
    }
  }, [state.currentStep, onStepChange]);

  // (Step journey recording lives in KYCProvider — the seam every mount
  // variant shares, hosted pages included.)

  // Fire onError when a technical error is set. `state.error` is a typed
  // KYCError (still an Error), so consumers can narrow on `error.code`.
  useEffect(() => {
    if (state.error) {
      safeReportError(onError, state.error);
    }
  }, [state.error, onError]);

  // Seed any pre-filled userData into the reducer. Shared by both entry paths.
  const seedUserData = useCallback(() => {
    if (userData) {
      dispatch({ type: 'SET_USER_DATA', payload: {
        ...(userData.firstName ? { firstName: userData.firstName } : {}),
        ...(userData.lastName ? { lastName: userData.lastName } : {}),
        ...(userData.dateOfBirth ? { dateOfBirth: userData.dateOfBirth } : {}),
      }});
    }
  }, [dispatch, userData]);

  // Offer handoff only on desktop, when enabled, and when the flow has a
  // capture/upload step a phone camera helps with. Individual flows: liveness or
  // document capture (skips pure number-only-no-liveness flows). KYB flows: the
  // applicant's in-flow KYC or company-document uploads — a bare registry lookup
  // (all typed) has nothing to hand off to a phone for.
  const cameraNeeded = handoffCaptureNeeded({
    scope,
    subjectType,
    enableLiveness,
    enableDocumentCapture,
    allowDocumentScan,
    allowDocumentUpload,
    addressCollection,
    business,
  });

  // Mobile-only workflows: kick off the hardware confirmation as soon as the
  // SDK mounts. The motion probe listens for up to ~1s, so doing it here keeps
  // the trigger click instant; handleOpen just awaits the same promise.
  const deviceCheckRef = useRef<Promise<DeviceClassResult> | null>(null);
  const confirmDevice = useCallback(() => {
    deviceCheckRef.current = deviceCheckRef.current ?? confirmMobileDevice();
    return deviceCheckRef.current;
  }, []);
  useEffect(() => {
    if (requireMobileDevice === true && !previewMode) void confirmDevice();
  }, [requireMobileDevice, previewMode, confirmDevice]);

  // One client for the session calls, built from the same inputs the config
  // provider uses — this component renders that provider, so it sits above it.
  const sessionApiRef = useRef(createKYCApi(resolveBaseUrl(apiKey, devUrl), apiKey));

  // Start (or resume) the server-side session for this attempt.
  //
  // Deliberately on OPEN rather than on mount: a page that merely renders the
  // trigger would otherwise mint a session for every visitor who never engages.
  //
  // Skipped in two cases. Preview never touches the server. A hosted mount
  // already IS a session — it authenticates with an `hs_` bearer rather than an
  // API key — so starting another would orphan the one it is running in.
  //
  // Best-effort by contract: sessions are for resuming and visibility, and a
  // failure here must never stop someone verifying.
  // Persist progress as the user advances (no-ops without a session).
  useSessionProgress(sessionApiRef.current, state, (message) =>
    dispatch({ type: 'SET_SESSION_CANCELLED', payload: { message } }),
  );

  // One attempt per scope (key, server, workflow, user). The flow and the
  // phone handoff both wait on the SAME promise, so "continue on your phone"
  // is bound to the attempt this device started rather than racing it.
  const sessionScope = handoffScope({
    apiKey, devUrl, workflowId, externalUserId: userId ?? metadata?.userId,
  });
  const sessionScopeRef = useRef(sessionScope);
  sessionScopeRef.current = sessionScope;
  const handoffSnapshotRef = useRef(handoffSnapshot);
  handoffSnapshotRef.current = handoffSnapshot;
  const startRef = useRef<{
    scope: string; failed: boolean; promise: Promise<StartSessionResponse | null>;
  } | null>(null);

  const beginSession = useCallback((retry = false): Promise<StartSessionResponse | null> => {
    if (previewMode || apiKey.startsWith(HANDOFF_TOKEN_PREFIX)) return Promise.resolve(null);
    const current = startRef.current;
    // A failed start is only tried again when asked to (the gate's Try again).
    if (current && current.scope === sessionScope && !(retry && current.failed)) return current.promise;
    const entry: NonNullable<typeof startRef.current> = {
      scope: sessionScope, failed: false, promise: Promise.resolve(null),
    };
    entry.promise = (async () => {
      try {
        const input = {
          externalUserId: userId ?? metadata?.userId,
          workflowId,
          // Anonymous mounts resume by device: without a userId the server
          // has nothing else to find the previous attempt by, and every
          // relaunch minted a fresh session.
          deviceRef: persistentDeviceId(),
          // What this browser is, sent up front: the dashboard's in-progress
          // row shows Device and Source from the moment the SDK loads.
          device: collectWebDeviceMetadata() as unknown as Record<string, unknown>,
        };
        // A prop-configured mount records its flow on the attempt, so a phone
        // session bound to it walks the same flow. A workflow mount sends
        // none: the server takes the published workflow.
        const template = workflowId ? undefined : handoffRootTemplate(handoffSnapshotRef.current);
        // Collapsed at MODULE scope, not just per instance: StrictMode remounts
        // the component with fresh refs, so the per-instance guard above still
        // let each launch mint TWO sessions — the flow adopted one and the other
        // sat on the org's list forever as a "Not started" ghost. Both mounts now
        // share one in-flight request (and therefore one session).
        const started = await startSessionOnce(sessionScope, async () => {
          if (!template) return sessionApiRef.current.startSession(input);
          try {
            return await sessionApiRef.current.startSession({ ...input, config: template });
          } catch (err) {
            // The server could not read the flow as sent. Starting matters more
            // than recording it: the attempt starts as it always has, and the
            // phone's session is then created on its own.
            if (err instanceof KYCApiError && err.statusCode === 400) {
              return sessionApiRef.current.startSession(input);
            }
            throw err;
          }
        });
        // The mount moved to another key or user while this was out: the
        // answer belongs to an attempt nobody is looking at any more.
        if (sessionScopeRef.current !== sessionScope) return started;
        dispatch({ type: 'SET_SESSION_ID', payload: started.sessionId });
        // Resuming: put the user back where they were. Media references have been
        // pruned server-side of anything that expired, so a restored capture slot
        // is one whose bytes genuinely still exist.
        if (started.progress) dispatch({ type: 'RESTORE_PROGRESS', payload: started.progress });
        // A KYB application whose business half already committed: the
        // submitting screen replays it rather than sending a second one the
        // server refuses (lib/resumed-application.ts).
        dispatch({ type: 'SET_RESUMED_APPLICATION', payload: resumedApplicationFrom(started) });
        return started;
      } catch (err) {
        entry.failed = true;
        // Resuming is a convenience; verifying is not conditional on it. The one
        // refusal that DOES stop the flow is a cancelled session: the applicant
        // must not be walked into captures the server will refuse.
        const failure = classifySessionStartFailure(err);
        if (failure.kind === 'cancelled') {
          dispatch({ type: 'SET_SESSION_CANCELLED', payload: { message: failure.message } });
        }
        return null;
      }
    })();
    startRef.current = entry;
    return entry.promise;
  }, [apiKey, dispatch, metadata, previewMode, sessionScope, userId, workflowId]);

  /**
   * The attempt a phone session is bound to (lib/handoff-parent.ts). Starts it
   * if the flow has not yet; `retry` starts it again after a failure.
   */
  const ensureHandoffParent = useCallback(async (retry = false): Promise<string | undefined> => {
    // Preview mints nothing real, and a session token is its own attempt.
    if (previewMode || apiKey.startsWith(HANDOFF_TOKEN_PREFIX)) return undefined;
    const started = await beginSession(retry);
    if (sessionScopeRef.current !== sessionScope) throw new HandoffAttemptChangedError();
    return resolveHandoffParent(started, Boolean(workflowId));
  }, [apiKey, beginSession, previewMode, sessionScope, workflowId]);

  const handleOpen = useCallback(async () => {
    resetIntegritySignals(); // fresh capture-integrity slate per session
    resetStepLog(); // fresh step journey per session
    resetSilentCaptures(); // silent-capture frames belong to one verification
    seedUserData();
    onStart?.();
    void beginSession();

    // Mobile-only workflow: the flow may start ONLY on a confirmed handheld.
    // confirmMobileDevice reads hardware (GPU renderer + motion sensor), so a
    // desktop in responsive/device-emulation mode is rejected. Preview mode is
    // exempt — the builder preview always runs on the author's desktop.
    if (requireMobileDevice === true && !previewMode) {
      const { deviceClass } = await confirmDevice();
      if (deviceClass !== 'mobile') {
        setGateOpen(true); // QR gate, or the notice when handoff is off
        return;
      }
      dispatch({ type: 'OPEN_MODAL' });
      return;
    }

    if (deviceHandoff !== false && cameraNeeded && isDesktopDevice()) {
      setGateOpen(true);
    } else {
      dispatch({ type: 'OPEN_MODAL' });
    }
  }, [dispatch, onStart, seedUserData, deviceHandoff, cameraNeeded, requireMobileDevice, previewMode, confirmDevice, beginSession]);

  // Preview/embedded surfaces: start the flow immediately, no trigger button.
  // Skips the handoff gate — an auto-opened preview never hands off.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!defaultOpen || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    resetIntegritySignals();
    resetStepLog();
    resetSilentCaptures();
    seedUserData();
    onStart?.();
    void beginSession();
    // A mobile-only workflow gates the auto-open too — otherwise `defaultOpen`
    // would be a silent bypass of the whole setting.
    if (requireMobileDevice === true && !previewMode) {
      void confirmDevice().then(({ deviceClass }) => {
        if (deviceClass === 'mobile') dispatch({ type: 'OPEN_MODAL' });
        else setGateOpen(true);
      });
      return;
    }
    dispatch({ type: 'OPEN_MODAL' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultOpen]);

  // User chose to verify on this computer: leave the gate, start the flow.
  const handleContinueHere = useCallback(() => {
    setGateOpen(false);
    dispatch({ type: 'OPEN_MODAL' });
  }, [dispatch]);

  const handleGateClose = useCallback(() => {
    setGateOpen(false);
    onClose?.();
  }, [onClose]);

  const handleClose = useCallback(() => {
    dispatch({ type: 'CLOSE_MODAL' });
    onClose?.();
  }, [dispatch, onClose]);

  return (
    <KYCConfigProvider
      devUrl={devUrl}
      apiKey={apiKey}
      workflowId={workflowId}
      ensureHandoffParent={ensureHandoffParent}
      applicantWorkflowId={applicantWorkflowId}
      serverConfigOverride={serverConfigOverride}
      subjectType={subjectType}
      scope={scope}
      business={business}
      country={country as AnyCountry}
      countries={countries}
      idTypes={idTypes}
      multiId={multiId}
      resubmit={resubmit}
      metadata={metadata}
      userId={userId}
      userData={userData}
      enableSelfie={enableSelfie}
      enableDocumentCapture={enableDocumentCapture}
      allowDocumentUpload={allowDocumentUpload}
      allowDocumentScan={allowDocumentScan}
      enableLiveness={enableLiveness}
      livenessMode={livenessMode}
      flashSequenceLength={flashSequenceLength}
      livenessBrightScreen={livenessBrightScreen}
      selfieReview={selfieReview}
      deviceIntelligence={deviceIntelligence}
      deviceHandoff={deviceHandoff}
      consentStep={consentStep}
      silentCapture={silentCapture}
      biometric={biometric}
      progressStyle={progressStyle}
      requireMobileDevice={requireMobileDevice}
      assetsBasePath={assetsBasePath}
      appearance={appearance}
      consent={consent}
      success={success}
      texts={texts}
      language={language}
      emailVerification={emailVerification}
      phoneVerification={phoneVerification}
      questionnaire={questionnaire}
      proofOfAddress={proofOfAddress}
      supportingDocuments={supportingDocuments}
      addressCollection={addressCollection}
      nfc={nfc}
      previewMode={previewMode}
      previewTrustAttribution={previewTrustAttribution}
      onSubmit={onSubmit}
      onResult={onResult}
      onClose={handleClose}
      onError={onError}
    >
      {previewStep !== undefined && <PreviewStepDriver step={previewStep} />}
      {!defaultOpen && (
        <Button
          {...triggerProps}
          onClick={() => void handleOpen()}
          style={{ ...buildThemeVars(appearance), ...triggerProps.style }}
        >
          {triggerProps.children ??
            (appearance?.companyName
              ? `Verify with ${appearance.companyName}`
              : 'Verify Identity')}
        </Button>
      )}

      {gateOpen && (
        <Suspense fallback={null}>
          <DeviceHandoffGate
            snapshot={handoffSnapshot}
            onContinueHere={handleContinueHere}
            onClose={handleGateClose}
            showThemeToggle={showThemeToggle}
            disableClose={disableClose}
            mobileOnly={requireMobileDevice === true}
            noHandoff={requireMobileDevice === true && deviceHandoff === false}
          />
        </Suspense>
      )}

      <KYCModal open={state.isOpen} onClose={handleClose} showThemeToggle={showThemeToggle} disableClose={disableClose} fullScreen={fullScreen} />
    </KYCConfigProvider>
  );
}

// ---------------------------------------------------------------------------
// Flow gate — resolves a published flow before the SDK renders
// ---------------------------------------------------------------------------

// Map a flow-resolution failure to a user-facing message + typed code. Every
// failure is blocking: running with silently different config (ignoring the
// flow) would be worse than stopping. A page reload retries.
function describeFlowError(err: unknown): { message: string; statusCode?: number; code: KYCError['code'] } {
  if (err instanceof KYCApiError) {
    if (err.statusCode === 404) {
      return {
        message: 'This verification flow does not exist, is not published, or does not belong to this API key.',
        statusCode: 404,
        code: 'invalid_workflow',
      };
    }
    if (err.statusCode === 401) {
      return { message: 'Invalid API key. Please check the API key configured in the SDK.', statusCode: 401, code: 'invalid_api_key' };
    }
    if (err.statusCode === 403) {
      return { message: err.message || 'This API key is not permitted to use this flow.', statusCode: 403, code: 'invalid_workflow' };
    }
    return { message: err.message, statusCode: err.statusCode, code: 'unknown' };
  }
  if (err instanceof TypeError) {
    return { message: 'Network error while loading the verification flow. Please check your connection and reload.', code: 'network_error' };
  }
  return { message: err instanceof Error ? err.message : 'Failed to load the verification flow.', code: 'unknown' };
}

type WorkflowGateState =
  | { phase: 'loading' }
  | { phase: 'ready'; flow: WorkflowResolutionResponse }
  | { phase: 'error'; override: ServerSdkConfig };

/**
 * Wraps KYCInner when a `workflowId` prop is set: fetches the published flow,
 * merges its config over the props (flow wins), and hands the resolution's
 * idTypes/branding to the provider as a pre-resolved server config (so /config
 * is never fetched — one round trip). Failures render the normal SDK shell
 * with a fatal server-config error, so the trigger opens the modal's blocking
 * error screen instead of a silently different flow.
 */
function WorkflowGate(props: KYCInnerProps) {
  const { apiKey, devUrl, workflowId, defaultOpen, appearance, onError } = props;
  const api = useMemo(
    () => createKYCApi(resolveBaseUrl(apiKey, devUrl), apiKey),
    [apiKey, devUrl],
  );
  const [state, setState] = useState<WorkflowGateState>({ phase: 'loading' });
  // Report the failure to onError at most once per api+workflowId (StrictMode
  // double-mounts the effect in dev).
  const reportedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState({ phase: 'loading' });
    api
      .workflow(workflowId!)
      .then((flow) => {
        if (!cancelled) setState({ phase: 'ready', flow });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const { message, statusCode, code } = describeFlowError(err);
        setState({
          phase: 'error',
          override: { status: 'error', idTypes: [], error: message, statusCode, fatal: true },
        });
        const reportKey = `${workflowId}`;
        if (reportedRef.current !== reportKey) {
          reportedRef.current = reportKey;
          safeReportError(onError, new KYCError(code, message));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api, workflowId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.phase === 'loading') {
    // Keep the trigger visible (disabled) while the flow loads so the page
    // doesn't jump; auto-open surfaces render nothing until ready.
    if (defaultOpen) return null;
    // `className` has to come along, or the placeholder is not the same button:
    // a consumer's `w-full` (or any sizing) is dropped and it collapses to its
    // content width, then snaps back to full width once the flow resolves —
    // the exact jump this branch exists to prevent.
    const { children, className, style } = props;
    return (
      <Button
        disabled
        aria-busy
        className={className}
        style={{ ...buildThemeVars(appearance), ...style }}
      >
        <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden />
        {children ?? (appearance?.companyName ? `Verify with ${appearance.companyName}` : 'Verify Identity')}
      </Button>
    );
  }

  if (state.phase === 'error') {
    // Country may be absent in flow mode; the blocking error screen renders
    // before anything country-dependent, so any placeholder is safe.
    return (
      <KYCInner
        {...props}
        country={props.country ?? 'NG'}
        serverConfigOverride={state.override}
      />
    );
  }

  // KYB: overlay the mapped applicant workflow's capture template (and record
  // its id for stamping) over the merged config — see overlayApplicantWorkflow.
  const merged = overlayApplicantWorkflow(
    state.flow.applicantWorkflow,
    mergeWorkflowConfig(state.flow.config, props as unknown as Record<string, unknown>),
  ) as unknown as KYCInnerProps;
  return (
    <KYCInner
      {...merged}
      serverConfigOverride={{
        status: 'ready',
        idTypes: state.flow.idTypes,
        environment: state.flow.environment,
        branding: state.flow.branding,
        geoCountry: state.flow.geoCountry,
        addressSearch: state.flow.addressSearch,
        addressSearchMode: state.flow.addressSearchMode,
        mapsFrameUrl: state.flow.mapsFrameUrl,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Public component  <MyazaKYC />
// ---------------------------------------------------------------------------

export function MyazaKYC<C extends AnyCountry>(props: MyazaKYCProps<C>) {
  // Fail loud at integration time (same contract as an invalid key prefix):
  // without a flow there is nothing to derive the country from. Business (KYB)
  // configs carry their registry country on the business block instead.
  const businessCountry = props.subjectType === 'business' ? props.business?.country : undefined;
  if (!props.workflowId && !props.country && !businessCountry) {
    throw new KYCError('unknown', 'MyazaKYC requires a `country` prop unless a `workflowId` is provided.');
  }
  const inner = {
    ...props,
    // Prop-configured business mounts (builder preview) have no top-level
    // country — the business block's registry country is the effective one.
    country: props.country ?? businessCountry,
  } as unknown as KYCInnerProps;
  return (
    // Shadow-DOM style isolation: the SDK carries its own stylesheet and the
    // host app's CSS cannot reach in (nor the SDK's out). `styleIsolation={
    // false}` restores the light-DOM mount, which needs the global
    // `@myazahq/kyc-sdk-react/styles.css` import — the hosted page's mode.
    <SdkFrame isolate={props.styleIsolation !== false}>
      <KYCProvider>
        {props.workflowId ? <WorkflowGate {...inner} /> : <KYCInner {...inner} />}
      </KYCProvider>
    </SdkFrame>
  );
}

// ---------------------------------------------------------------------------
// Public hook  useMyazaKYC()
// ---------------------------------------------------------------------------

export function useMyazaKYC<C extends AnyCountry>(config: MyazaKYCConfig<C>): UseMyazaKYCReturn {
  const { state, dispatch } = useKYCContext();

  const prevStepRef = useRef<KYCStep>(state.currentStep);

  // Apply the voice-guidance config (enabled + language) for spoken prompts.
  useEffect(() => {
    configureSpeech(config.voiceGuidance);
  }, [config.voiceGuidance]);

  useEffect(() => {
    if (state.currentStep !== prevStepRef.current) {
      prevStepRef.current = state.currentStep;
      config.onStepChange?.(state.currentStep);
    }
  }, [state.currentStep, config.onStepChange]);


  useEffect(() => {
    if (state.error) {
      safeReportError(config.onError, state.error);
    }
  }, [state.error, config.onError]);

  const open = useCallback(() => {
    dispatch({ type: 'OPEN_MODAL' });
    config.onStart?.();
  }, [dispatch, config.onStart]);

  const close = useCallback(() => {
    dispatch({ type: 'CLOSE_MODAL' });
    config.onClose?.();
  }, [dispatch, config.onClose]);

  return {
    open,
    close,
    isOpen: state.isOpen,
    currentStep: state.isOpen ? state.currentStep : null,
  };
}
