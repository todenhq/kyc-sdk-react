'use client';

import { configScope } from '../lib/scope';
import { hasSupportingDocumentsStep, verifiedIdsFor } from '../lib/supporting-documents';
import React, { useEffect, useState } from 'react';
import { buildThemeVars, resolveOverlayColor } from '../lib/theme';
import { applyConfiguredTheme } from '../lib/apply-theme';
import { ThemeVarsContext } from '../lib/theme-context';
import { useIsDark } from '../lib/use-is-dark';
import { useThemeRoot } from '../lib/sdk-frame-context';
import { useBrandFonts } from '../lib/use-brand-fonts';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { VerificationHeader } from './VerificationHeader';
import { SandboxBanner } from './SandboxBanner';
import { StepHeaderSlotContext } from './step-header-slot';
import { CaptureLightContext } from './capture-light';
import { ImmersiveCaptureContext, ImmersiveCloseContext } from './immersive-capture';
import { LivenessCameraContext } from './liveness-camera';
import { useLivenessLight } from './use-liveness-light';
import { Button } from './ui/button';
import { SessionCancelledScreen, useReportCancellation } from './SessionCancelledScreen';
import { useText } from '../i18n';
import { cn } from '../lib/utils';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { hasActiveQuestionnaire } from '../lib/questionnaire';
import { hasProofOfAddressStep, hasAddressCollectionStep, poaCountryAccepted } from '../lib/post-capture';
import { hasEmailVerificationStep, hasPhoneVerificationStep } from '../lib/contact-steps';
import { isBusinessFlow } from '../lib/business';
import { multiIdPlan } from '../lib/multi-id';
import { MultiIdProgress } from './MultiIdProgress';
import { buildStepOrder, getStepPosition, resolveNarrowedStep } from '../lib/step-order';
import { keptIdType } from '../lib/resubmit';
import { hasConsentStep } from '../lib/consent-step';
import { BackAvailableContext, useOpeningStep } from './opening-step';
import { SupportingDocumentsStep } from '../steps/SupportingDocumentsStep';
import { ProofOfAddressStep } from '../steps/ProofOfAddressStep';
import { AddressCollectionStep } from '../steps/AddressCollectionStep';
import { AddressSearchStep } from '../steps/address/AddressSearchStep';
import { AddressEntranceStep } from '../steps/address/AddressEntranceStep';
import { AddressReviewStep } from '../steps/address/AddressReviewStep';
import { addressFlowOptions, addressVendorsStubbed } from '../steps/address/flow-steps';
import type { VerificationStep } from '../types/config';
import { PoweredBy } from './PoweredBy';
import { VisuallyHidden } from './VisuallyHidden';
import { VerificationErrorBoundary } from './VerificationErrorBoundary';

import { ApplicantRoleStep } from '../steps/ApplicantRoleStep';
import { BusinessDetailsStep } from '../steps/BusinessDetailsStep';
import { BusinessDocumentsStep } from '../steps/BusinessDocumentsStep';
import { BusinessKeyPeopleStep } from '../steps/BusinessKeyPeopleStep';
import { ConsentStep } from '../steps/ConsentStep';
import { ContactVerificationStep } from '../steps/ContactVerificationStep';
import { CountrySelectStep } from '../steps/CountrySelectStep';
import { IdTypeStep } from '../steps/IdTypeStep';
import { IdInputStep } from '../steps/IdInputStep';
import { DocumentCaptureStep } from '../steps/DocumentCaptureStep';
import { LivenessStep } from '../steps/LivenessStep';
import { NfcStep } from '../steps/NfcStep';
import { QuestionnaireStep } from '../steps/QuestionnaireStep';
import { PreviewCapturePlaceholder } from '../steps/PreviewCapturePlaceholder';
import { SubmittedStep } from '../steps/SubmittedStep';
import { CompletedStep } from '../steps/CompletedStep';

interface VerificationModalProps {
  open: boolean;
  onClose: () => void;
  showThemeToggle?: boolean;
  /** Hide the close button and block all user-initiated dismissal. */
  disableClose?: boolean;
  /** Force fullscreen on all devices (hides the expand toggle). */
  fullScreen?: boolean;
}

// ---------------------------------------------------------------------------
// Step ordering — buildStepOrder/getStepProgress live in lib/step-order.ts
// (KYB application steps + the individual flow paths).
// ---------------------------------------------------------------------------
// Config error screen — shown when the SDK can't load its server config because
// of a fatal auth failure (e.g. a wrong API key). Blocks the flow so the user
// gets a clear message instead of a silently broken ID-type list.
// ---------------------------------------------------------------------------

function ConfigErrorScreen({ message, onClose }: { message: string; onClose: () => void }) {
  const t = useText();
  return (
    <div className="flex flex-col items-center gap-6 py-8 animate-fade-in">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
        <svg
          className="h-10 w-10 text-destructive"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <div className="text-center space-y-1">
        <h2 className="text-xl font-semibold font-heading">{t('general.configError.title')}</h2>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>

      <Button className="w-full" onClick={onClose}>
        {t('common.close')}
      </Button>
    </div>
  );
}

function CurrentStep({
  plan,
  step,
  stepOrder,
}: {
  plan: ReturnType<typeof multiIdPlan>;
  step: VerificationStep;
  stepOrder: readonly VerificationStep[];
}) {
  const config = useVerificationConfig();

  switch (step) {
    case 'consent':
      return <ConsentStep />;
    // Distinct keys are LOAD-BEARING: both mounts are the same component type
    // at the same position, so without them React reuses the instance when the
    // flow moves email → phone. The phone step would open holding the email
    // step's challengeId, show its code panel, and verifying would file the
    // EMAIL proof as the phone token — which the server then drops, blocking
    // submission on a phone check the user appears to have passed.
    case 'email-verification':
      return <ContactVerificationStep key="contact-email" channel="email" />;
    case 'phone-verification':
      return <ContactVerificationStep key="contact-phone" channel="phone" />;
    case 'country-select':
      return <CountrySelectStep />;
    case 'id-type':
      return <IdTypeStep country={config.country} allowedIdTypes={plan ? plan.safeOptions : config.idTypes} />;
    case 'document-capture':
      // Preview mode never touches the camera — a static placeholder stands in
      // for the capture steps (the flow stays walkable via its Continue).
      return config.previewMode ? <PreviewCapturePlaceholder kind="document" /> : <DocumentCaptureStep />;
    case 'id-input':
      return <IdInputStep />;
    case 'nfc':
      // Never in the WEB flow order (browsers can't do ISO-DEP) — reached only
      // via the builder preview's previewStep, standing in for the mobile SDK's
      // visually-identical chip-read screen.
      return <NfcStep />;
    case 'business-details':
      return <BusinessDetailsStep />;
    case 'business-key-people':
      return <BusinessKeyPeopleStep />;
    case 'business-documents':
      return <BusinessDocumentsStep />;
    case 'applicant-role':
      return <ApplicantRoleStep />;
    case 'liveness':
      return config.previewMode ? <PreviewCapturePlaceholder kind="liveness" /> : <LivenessStep />;
    case 'proof-of-address':
      return <ProofOfAddressStep />;
    case 'supporting-documents':
      return <SupportingDocumentsStep />;
    case 'address-search':
      return <AddressSearchStep />;
    case 'address-collection':
      return <AddressCollectionStep />;
    case 'address-entrance':
      return <AddressEntranceStep />;
    case 'address-review':
      return <AddressReviewStep />;
    case 'questionnaire':
      return <QuestionnaireStep />;
    case 'submitted':
      // A rehydrated session is already submitted — SubmittedStep submits on
      // mount, so routing a returning applicant through it would file their
      // application a second time.
      return config.completedSummary ? <CompletedStep /> : <SubmittedStep stepOrder={stepOrder} />;
  }
}

const CAPTURE_STEPS: VerificationStep[] = ['document-capture', 'liveness'];

export function VerificationModal({ open, onClose, showThemeToggle, disableClose, fullScreen }: VerificationModalProps) {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();

  // Multi-ID flows: the applicant picks each slot's ID from what the admin
  // allowed, minus what earlier slots used, minus any pick that would strand a
  // later slot (lib/multi-id mirrors the server's rule exactly).
  const plan = multiIdPlan(config, state, config.serverConfig.idTypes);
  const isTerminal = state.currentStep === 'submitted';
  // The flow can't be dismissed on the terminal step, or when the consumer
  // disables close (programmatic close() is then the only way out).
  const dismissBlocked = isTerminal || disableClose === true;
  // Capture steps light the screen by whitening the backdrop. A step may
  // override that for part of its run — flash liveness only wants it while the
  // sequence is emitting. null = no opinion, use the default.
  const [lightOverride, setLightOverride] = useState<boolean | null>(null);
  const isCaptureStep = CAPTURE_STEPS.includes(state.currentStep);
  const litForCapture = lightOverride ?? isCaptureStep;
  const isBusiness = isBusinessFlow(config);
  const selectedDef = state.selectedIdType ? config.getIdTypeDefinition(state.selectedIdType) : null;
  const hasDocCapture = selectedDef ? selectedDef.requiresDocumentCapture : true;
  const hasCountrySelect = (config.countries?.length ?? 0) > 1;
  const livenessFeatures = state.selectedIdType
    ? config.getIdTypeFeatures(config.country, state.selectedIdType)
    : null;
  // The selfie/liveness step is present only when Presence Intelligence is on
  // (`enableSelfie !== false`). With it on, the server feature flag (or the
  // legacy `enableLiveness` prop) decides whether liveness gestures run.
  const hasLiveness =
    config.enableSelfie !== false &&
    (livenessFeatures ? livenessFeatures.livenessCheck : config.enableLiveness !== false);
  const hasQuestionnaire = hasActiveQuestionnaire(config.questionnaire);
  // On full flows the accepted-country list gates the whole step (recomputed
  // as the effective country changes on multi-region flows). The address
  // scope keeps the step regardless: it hosts the declared-country picker,
  // which itself offers only the accepted list.
  const hasPoa =
    hasProofOfAddressStep(config.proofOfAddress) &&
    (configScope(config) === 'address' || poaCountryAccepted(config.proofOfAddress, config.country));
  // Resolved against the ID the person has actually picked, because that is
  // what decides whether the step has anything to ask for: a document scoped
  // to one ID is only asked of the people who used it. Recomputed as the pick
  // changes, so a flow that scopes its documents adds or drops the step as
  // they choose.
  const hasSupportingDocuments = hasSupportingDocumentsStep(
    config.supportingDocuments,
    verifiedIdsFor({
      country: state.selectedCountry ?? config.country,
      idType: state.selectedIdType,
      multiIdSlots: state.multiIdSlots,
    }),
  );
  const hasAddressCollection = hasAddressCollectionStep(config.addressCollection);
  const hasEmailVerification = hasEmailVerificationStep(config.emailVerification);
  const hasPhoneVerification = hasPhoneVerificationStep(config.phoneVerification);
  const [expanded, setExpanded] = useState(false);
  // `fullScreen` (config) forces the fullscreen layout on every device and
  // hides the expand/collapse control; otherwise the user toggles it.
  const fullscreen = fullScreen === true || expanded;
  const isDarkTheme = useIsDark();
  const themeVars = buildThemeVars(config.appearance, isDarkTheme);
  const overlayColor = resolveOverlayColor(config.appearance, isDarkTheme);
  useBrandFonts(config.appearance);
  // A fatal config-load failure (e.g. wrong API key) blocks the whole flow.
  const configError =
    config.serverConfig.status === 'error' && config.serverConfig.fatal
      ? config.serverConfig.error ?? t('general.configError.description')
      : null;
  // Cancelled by the organisation (lib/session-cancelled.ts): terminal for this
  // run, reported to onError once.
  const cancelled = configError ? null : state.sessionCancelled;
  useReportCancellation(cancelled, config.onError, t('general.sessionCancelled.description'));
  const blocked = configError !== null || cancelled !== null;

  // Apply the configured initial light/dark mode — 'system' follows (and
  // tracks) the device preference. Runs on mount (and if the prop changes);
  // the in-flow ThemeToggle can still flip it during a session. Targets the
  // SDK's theme root (SdkFrame's shadow frame when isolated), so a configured
  // theme never rewrites the host page's <html> class.
  const themeRoot = useThemeRoot();
  useEffect(
    () => applyConfiguredTheme(config.appearance?.theme, themeRoot),
    [config.appearance?.theme, themeRoot],
  );

  // Header progress. The two styles are mutually exclusive: two indicators on
  // one header would be noise, and the point of the bar is that it costs no
  // height. Neither renders over the config-error screen, which has no flow to
  // be partway through.
  const stepOptions = {
    isBusiness,
    scope: configScope(config),
    business: config.business,
    hasDocCapture,
    hasLiveness,
    hasCountrySelect,
    hasConsent: hasConsentStep(config),
    hasEmailVerification,
    hasPhoneVerification,
    hasPoa,
    hasSupportingDocuments,
    hasAddressCollection,
    addressFlow: (() => {
      if (!hasAddressCollection || isBusiness) return undefined;
      const flow = addressFlowOptions({
        photo: config.addressCollection?.photo,
        streetView: config.addressCollection?.streetView,
        serverSearch: Boolean(config.serverConfig?.addressSearch),
        previewMode: addressVendorsStubbed({
          previewMode: config.previewMode,
          environment: config.serverConfig?.environment,
        }),
        hasGoogleKey: Boolean(config.serverConfig?.googleMapsBrowserKey),
        hasStreetViewFrame: Boolean(config.serverConfig?.mapsFrameUrl),
      });
      return { search: flow.searchAvailable, entrance: flow.photoMode !== 'off' || flow.streetViewOffered };
    })(),
    hasQuestionnaire,
    // Present only on a session a reviewer sent back. Narrows the order to the
    // steps they ticked, so somebody fixing one blurry photo is not walked
    // through the whole flow again.
    resubmit: config.resubmit,
    multiId: plan ? { index: plan.index, count: plan.count } : null,
  };
  // A reviewer's send-back narrows the flow, and web advances step by step —
  // each screen decides where Continue goes — so nothing consulted that
  // narrowing: it reached the progress indicator and stopped, while the
  // applicant walked the whole flow. This is the ONE seam every dispatch lands
  // in, so mapping the current step here honours the narrowing without
  // rewriting the per-screen logic that makes the flow correct.
  // The builder preview is NOT exempt: with the consent screen switched off
  // its Consent card still asks for 'consent', and the preview must show what
  // an applicant will see, which is the first real step (user report
  // 2026-09-07: "turned off consent but it still shows on the builder preview").
  const shownStep = resolveNarrowedStep(state.currentStep, stepOptions);
  // The submit step reads it to offer Go back after a refusal.
  const stepOrder = buildStepOrder(stepOptions);
  const skipping = shownStep !== state.currentStep;
  const { backAvailable } = useOpeningStep(stepOptions, shownStep, dispatch);
  // Bright screen during the selfie: while the liveness camera is on the flow
  // is held on its light palette so the display lights the face, then the
  // previous theme comes back (lib/liveness-bright-screen.ts). Declared after
  // the configured-theme effect, so on mount the configured theme lands first
  // and is what gets restored.
  const { forceLight, reportCameraShown } = useLivenessLight({
    livenessBrightScreen: config.livenessBrightScreen,
    configuredTheme: config.appearance?.theme,
    open,
    step: shownStep,
    themeRoot,
  });
  useEffect(() => {
    if (skipping) dispatch({ type: 'SET_STEP', payload: shownStep });
  }, [skipping, shownStep, dispatch]);
  // A redo that keeps its ID skips the picker, so the ID it ran on is selected
  // for it: the steps after the picker, and the submission, read that selection.
  const keptId = keptIdType(config.resubmit);
  useEffect(() => {
    if (keptId && !state.selectedIdType) dispatch({ type: 'SELECT_ID_TYPE', payload: keptId });
  }, [keptId, state.selectedIdType, dispatch]);

  // index < 0 / total 0 means "nothing to draw" — the success screen, or a step
  // that isn't part of this flow. Mirrors the RN SDK's stepInfo.
  const { index: stepIndex, total: stepCount } = getStepPosition(shownStep, stepOptions);
  const stepFraction = stepCount > 0 ? (stepIndex + 1) / stepCount : 0;
  // The header's title row. Steps portal their StepHeader into it, so the
  // title sits in the header block exactly as it does on RN and Flutter.
  const [titleSlot, setTitleSlot] = useState<HTMLDivElement | null>(null);
  // 'none' omits progress from the header entirely: it turns showProgress off,
  // so both the step row and the bar drop out and the header keeps its bottom
  // border (the bar is what normally replaces it). VerificationHeader needs no change.
  // A live document camera takes the whole surface (see immersive-capture.ts).
  // Reset on step change so a step that unmounts mid-capture — a back gesture,
  // an error boundary — can never strand the chrome hidden.
  const [immersive, setImmersive] = useState(false);
  useEffect(() => {
    setImmersive(false);
  }, [state.currentStep]);

  const progressStyle = config.progressStyle ?? 'bar';
  const asBar = progressStyle === 'bar';
  const showProgress =
    !blocked && stepIndex >= 0 && stepCount > 0 && progressStyle !== 'none';

  return (
    // Portal-rendered surfaces (Select/Popover/Drawer) escape the modal root's
    // inline style, so they re-read the brand vars from this context.
    <ThemeVarsContext.Provider value={themeVars}>
    <StepHeaderSlotContext.Provider value={titleSlot}>
    <BackAvailableContext.Provider value={backAvailable}>
    <CaptureLightContext.Provider value={setLightOverride}>
    <ImmersiveCaptureContext.Provider value={setImmersive}>
    <ImmersiveCloseContext.Provider value={dismissBlocked ? null : onClose}>
    <LivenessCameraContext.Provider value={reportCameraShown}>
    {/* The builder preview is one pane of a larger page. A modal dialog traps
        focus and takes it on mount, which pulled the caret out of whichever
        builder field the author was typing in. Real flows keep both. */}
    <Dialog modal={!config.previewMode} open={open} onOpenChange={(isOpen) => { if (!isOpen && !dismissBlocked) onClose(); }}>
      <DialogContent
        onOpenAutoFocus={(event) => { if (config.previewMode) event.preventDefault(); }}
        fullscreen={fullscreen}
        overlayClassName={litForCapture ? 'bg-white' : undefined}
        overlayStyle={!litForCapture && overlayColor ? { backgroundColor: overlayColor } : undefined}
        // The DIALOG must not be the scroll container.
        //
        // DialogContent carries overflow-y-auto for consumers that put plain
        // content inside it. This one manages its own regions: the header is
        // fixed and the step body scrolls. Left as-is, the desktop dialog
        // (max-height with no height) gives the inner h-full nothing definite
        // to resolve against, so the dialog scrolls instead and takes the
        // header with it. Mobile is inset-0 and therefore already had a real
        // height, which is why it only ever looked wrong on desktop.
        //
        // twMerge lets these win over the base classes.
        className="verification-root flex flex-col overflow-hidden"
        style={themeVars}
        onPointerDownOutside={(e) => { if (dismissBlocked) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (dismissBlocked) e.preventDefault(); }}
      >
        <VisuallyHidden>
          <DialogTitle>Identity Verification</DialogTitle>
          <DialogDescription>Verify your identity with Toden</DialogDescription>
        </VisuallyHidden>

        {/* min-h-0 so the scrolling child can actually shrink: a flex item
            defaults to min-height:auto and would refuse to be smaller than its
            content, which silently disables the child's overflow. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[inherit]">
          {!immersive && <SandboxBanner />}
          {!immersive && <VerificationHeader
            // Hidden while the selfie holds the flow light, so it cannot be
            // switched back to dark mid-step.
            showThemeToggle={forceLight ? false : showThemeToggle}
            dismissBlocked={dismissBlocked}
            onClose={onClose}
            fullScreen={fullScreen}
            fullscreen={fullscreen}
            onToggleExpand={() => setExpanded((f) => !f)}
            showProgress={showProgress}
            asBar={asBar}
            stepFraction={stepFraction}
            stepCount={stepCount}
            titleSlotRef={setTitleSlot}
          />}

          <VerificationErrorBoundary>
            {/* flex flex-col so a step that opts in (flex-1 + min-h-0, e.g. the
                country picker) can fill this area and own its scroll; content
                steps stay content-height and this container scrolls them. */}
            <div className={cn(
              'flex min-h-0 flex-1 flex-col animate-slide-up',
              // Immersive: no padding, no scroll, no centred column — the step
              // is a full-bleed camera and owns every pixel.
              immersive
                ? 'overflow-hidden'
                : 'overflow-y-auto p-6',
              !immersive && fullscreen && 'xl:mx-auto xl:w-full xl:max-w-2xl',
            )} key={configError ? 'config-error' : cancelled ? 'session-cancelled' : state.currentStep}>
              {configError ? (
                <ConfigErrorScreen message={configError} onClose={onClose} />
              ) : cancelled ? (
                <SessionCancelledScreen message={cancelled.message} onClose={onClose} />
              ) : (
                <>
                  {/* Not over the full-screen selfie camera: it has no
                      padded body for the strip to sit in. */}
                  {plan && !(immersive && state.currentStep === 'liveness') && ['id-type', 'id-input', 'document-capture', 'liveness'].includes(state.currentStep) && (
                    <MultiIdProgress plan={plan} slots={state.multiIdSlots} />
                  )}
                  {/* A step the reviewer narrowed away is never rendered, not
                      even for the frame before the skip lands — the applicant
                      would see it flash past and reasonably wonder what they
                      missed. */}
                  {!skipping && <CurrentStep plan={plan} step={shownStep} stepOrder={stepOrder} />}
                </>
              )}
            </div>
          </VerificationErrorBoundary>

          {/* Vendor attribution. Sits OUTSIDE the scrolling body as a shrink-0
              sibling, so it stays pinned while a long step scrolls under it.
              Dropped in immersive capture, where the camera owns the surface. */}
          {!immersive && <PoweredBy />}
        </div>
      </DialogContent>
    </Dialog>
    </LivenessCameraContext.Provider>
    </ImmersiveCloseContext.Provider>
    </ImmersiveCaptureContext.Provider>
    </CaptureLightContext.Provider>
    </BackAvailableContext.Provider>
    </StepHeaderSlotContext.Provider>
    </ThemeVarsContext.Provider>
  );
}
