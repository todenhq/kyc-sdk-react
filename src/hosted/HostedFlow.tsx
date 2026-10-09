'use client';

import React from 'react';
import { KYCProvider } from '../context/KYCContext';
import { HostedLifecycle, HostedSessionSync } from './HostedSessionSync';
import { KYCConfigProvider, type ServerSdkConfig } from '../context/KYCConfigContext';
import { overlayApplicantWorkflow } from '../lib/workflow-merge';
import { documentCaptureNeedsCamera } from '../lib/document-capture-methods';
import { HostedFlowInner } from './HostedFlowInner';
import { HANDOFF_TOKEN_PREFIX } from './token';
import type { HandoffBootstrapResponse, KYCApi } from '../services/api';
import type { KYCError, KYCSubmission, KYCResult } from '../types/verification';
import type {
  AnyCountry,
  AnyIdType,
  EmailVerificationConfig,
  KYCAppearance,
  KYCConsentContent,
  KYCSuccessContent,
  PhoneVerificationConfig,
  QuestionnaireConfig,
  ProofOfAddressConfig,
  NfcConfig,
  ProgressStyle,
  VoiceGuidanceOption,
  AddressCollectionConfig,
  SupportingDocumentsConfig,
} from '../types/config';
import type { SubjectType, WorkflowBusinessConfig } from '../types/business';
import { handoffCaptureNeeded } from '../lib/handoff-capture';
// The hosted flow itself: providers seeded from the session's config snapshot,
// wrapping the same steps an embedded <MyazaKYC/> runs. Split out of
// MyazaKYCHosted.tsx, which is now just the entry point and its three terminal
// screens (loading, already-completed, unavailable).


// Hosted flow — seeds the providers from the bootstrap and runs the steps
// ---------------------------------------------------------------------------

export function HostedFlow({
  token,
  api,
  bootstrap,
  embedded = false,
  onClose,
  onStart,
  onStepChange,
  onSubmit,
  onResult,
  onError,
}: {
  token: string;
  api: KYCApi;
  bootstrap: HandoffBootstrapResponse;
  /** Mounted inside a host application (see MyazaKYCHosted.embedded). */
  embedded?: boolean;
  onClose?: () => void;
  onStart?: () => void;
  onStepChange?: (step: import('../types/config').KYCStep) => void;
  onSubmit?: (submission: KYCSubmission) => void;
  onResult?: (result: KYCResult) => void;
  onError?: (error: KYCError) => void;
}) {
  const snap = bootstrap.configSnapshot;
  const isBusiness = snap.subjectType === 'business' && !!snap.business;
  // KYB: overlay the mapped applicant workflow's capture template (resolved by
  // the bootstrap) over the snapshot — same treatment as WorkflowGate's embed
  // path. No-op when nothing was mapped.
  const leg = overlayApplicantWorkflow(
    bootstrap.applicantWorkflow,
    snap as unknown as Record<string, unknown>,
  ) as typeof snap & { applicantWorkflowId?: string };
  // Offer "continue on your phone" only when the flow has a capture/upload step
  // a phone camera actually helps with (mirrors <MyazaKYC/>). Individual flows:
  // liveness or document capture. KYB flows: the applicant's in-flow KYC or
  // company-document uploads (photograph on a phone) — a bare registry lookup
  // (all typed) gains nothing. The workflow/hosted-link can also switch handoff
  // off (`deviceHandoff: false`); default on.
  const captureNeeded = handoffCaptureNeeded({
    ...snap,
    subjectType: isBusiness ? 'business' : snap.subjectType,
  });
  const cameraNeeded = snap.deviceHandoff !== false && captureNeeded;
  const serverConfigOverride: ServerSdkConfig = {
    status: 'ready',
    idTypes: bootstrap.idTypes,
    environment: bootstrap.environment,
    branding: bootstrap.branding,
    geoCountry: bootstrap.geoCountry,
    googleMapsBrowserKey: bootstrap.googleMapsBrowserKey,
    addressSearch: bootstrap.addressSearch,
    addressSearchMode: bootstrap.addressSearchMode,
  };

  return (
    <KYCProvider>
      {/* A hosted flow is ALREADY in a session — the token names it — but the
          reducer does not know that, and progress saving keys off the id. Without
          this seed every hosted applicant's work was dropped, and a refresh sent
          them back to the first step. */}
      <HostedSessionSync sessionId={bootstrap.sessionId} progress={bootstrap.progress} bootstrap={bootstrap} api={api} />
      <HostedLifecycle onStart={onStart} onStepChange={onStepChange} />
      <KYCConfigProvider
        apiKey={`${HANDOFF_TOKEN_PREFIX}${token}`}
        apiOverride={api}
        serverConfigOverride={serverConfigOverride}
        hostedMode={!embedded}
        onClose={onClose}
        onSubmit={onSubmit}
        onResult={onResult}
        onError={onError}
        hostedToken={token}
        subjectType={snap.subjectType as SubjectType | undefined}
        scope={snap.scope as import('../lib/scope').WorkflowScope | undefined}
        business={snap.business as WorkflowBusinessConfig | undefined}
        applicantWorkflowId={leg.applicantWorkflowId}
        // Business snapshots carry no top-level country — the registry country
        // stands in so the context never sees undefined. (`leg` = the snapshot
        // with the applicant workflow's capture keys overlaid, when mapped.)
        country={(leg.country ?? snap.business?.country) as AnyCountry}
        countries={leg.countries as Array<{ country: AnyCountry; idTypes?: AnyIdType[] }> | undefined}
        idTypes={leg.idTypes as AnyIdType[] | undefined}
        // Deliberately from `snap`, not `leg`: multi-ID is KYC-only and the
        // applicant-leg overlay never carries it (one person, one check).
        multiId={snap.multiId}
        // A session a reviewer sent back walks only the ticked steps.
        resubmit={snap.resubmit ?? undefined}
        metadata={snap.metadata}
        userId={snap.userId}
        enableSelfie={leg.enableSelfie}
        enableDocumentCapture={leg.enableDocumentCapture}
        allowDocumentUpload={leg.allowDocumentUpload}
        allowDocumentScan={leg.allowDocumentScan}
        enableLiveness={leg.enableLiveness}
        livenessMode={leg.livenessMode as 'gestures' | 'flash' | 'both' | 'passive' | undefined}
        flashSequenceLength={leg.flashSequenceLength as number | undefined}
        livenessBrightScreen={leg.livenessBrightScreen as boolean | undefined}
        selfieReview={leg.selfieReview as boolean | undefined}
        deviceIntelligence={snap.deviceIntelligence}
        deviceHandoff={snap.deviceHandoff}
        // The consent screen switch: off, the hosted flow opens on its first
        // real step (user report 2026-09-07: a re-authentication link with
        // consent off still opened on consent, because this list lacked it).
        consentStep={snap.consentStep}
        silentCapture={snap.silentCapture}
        biometric={snap.biometric}
        progressStyle={snap.progressStyle as ProgressStyle | undefined}
        requireMobileDevice={snap.requireMobileDevice}
        appearance={snap.appearance as KYCAppearance | undefined}
        consent={snap.consent as KYCConsentContent | undefined}
        success={snap.success as KYCSuccessContent | undefined}
        texts={snap.texts}
        emailVerification={snap.emailVerification as EmailVerificationConfig | undefined}
        phoneVerification={snap.phoneVerification as PhoneVerificationConfig | undefined}
        questionnaire={snap.questionnaire as QuestionnaireConfig | undefined}
        proofOfAddress={snap.proofOfAddress as ProofOfAddressConfig | undefined}
        supportingDocuments={snap.supportingDocuments as SupportingDocumentsConfig | undefined}
        addressCollection={snap.addressCollection as AddressCollectionConfig | undefined}
        nfc={leg.nfc as NfcConfig | undefined}
        userData={snap.userData}
        businessPrefill={snap.businessPrefill}
        assetsBasePath={snap.assetsBasePath}
      >
        <HostedFlowInner
          snapshot={snap}
          cameraNeeded={cameraNeeded}
          mobileOnly={snap.requireMobileDevice === true}
          handoffDisabled={snap.deviceHandoff === false}
          voiceGuidance={snap.voiceGuidance as VoiceGuidanceOption | undefined}
          // Business flows have no liveness step — never load the face model —
          // unless the workflow runs the applicant's own capture leg in-flow.
          enableLiveness={
            isBusiness && snap.business?.applicant?.verification !== true
              ? false
              : leg.enableLiveness
          }
          showThemeToggle={snap.showThemeToggle}
          fullScreen={snap.fullScreen}
          embedded={embedded}
          onClose={onClose}
        />
      </KYCConfigProvider>
    </KYCProvider>
  );
}

