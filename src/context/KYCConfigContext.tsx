'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ResubmitConfig } from '../lib/resubmit';
import type { AnyCountry, AnyIdType, EmailVerificationConfig, IdTypeDefinition, KYCAppearance, KYCConsentContent, KYCSuccessContent, PhoneVerificationConfig, QuestionnaireConfig, ProofOfAddressConfig, NfcConfig, ProgressStyle, AddressCollectionConfig,
  SupportingDocumentsConfig,
} from '../types/config';
import type { SubjectType, WorkflowBusinessConfig } from '../types/business';
import type { KYCSubmission, KYCResult } from '../types/verification';
import { createKYCApi, KYCApiError, type CompletedSessionSummary, type KYCApi, type SdkConfigIdType, type SdkConfigResponse, type SdkConfigBranding, type SdkTrustAttribution, type WorkflowConfigPayload } from '../services/api';
import { overlayApplicantWorkflow } from '../lib/workflow-merge';
import type { WorkflowTexts } from '../i18n/types';
import { withPreviewMocks } from '../services/preview-mock';
import { useKYCContext } from './KYCContext';
import { resolveBaseUrl } from '../lib/resolve-url';
import { resolveIdTypeDefinition } from '../utils/id-definitions';
import { KYCError, type KYCErrorCode } from '../types/verification';
import { safeReportError } from '../lib/errors';
import { useDeviceIntelSetup } from '../lib/use-device-intel-setup';

// ---------------------------------------------------------------------------
// Config value — the subset of MyazaKYCConfig that steps need at runtime
// ---------------------------------------------------------------------------

export interface ServerSdkConfig {
  status: 'loading' | 'ready' | 'error';
  /** All `(country, idType)` rows the org has access to (granted + enabled). */
  idTypes: SdkConfigIdType[];
  /** Server environment — derived from the API key, reported by `/config`. */
  environment?: 'DEVELOPMENT' | 'SANDBOX' | 'PRODUCTION';
  /** Org branding (logo, name, color) returned by the config endpoint. */
  branding?: SdkConfigBranding;
  /**
   * The visitor's country, guessed from their IP by the server.
   *
   * The LAST resort for a country field nothing else answers, and only ever a
   * default the applicant can change. Null on a local/private address or where
   * no geo database is deployed, so every consumer needs a fallback anyway.
   */
  geoCountry?: string | null;
  /**
   * Google Maps browser key for the address step. Only ever populated from the
   * HOSTED session bootstrap (Myaza's key, referrer-restricted to the hosted
   * origin) — /config never returns one, so an embedded mount structurally
   * cannot render Google Maps and uses the built-in OpenStreetMap picker.
   */
  googleMapsBrowserKey?: string | null;
  /**
   * The framed Google-map picker URL for EMBEDDED mounts — /config mints it
   * (with a signed grant pinned to this page's origin) when the platform has a
   * maps key. The frame runs on the HOSTED origin, which is what lets a
   * referrer-restricted key serve maps on an org's own domain.
   */
  mapsFrameUrl?: string | null;
  /** Whether the platform's forward address search is available. */
  addressSearch?: boolean;
  /** Which search backend ('autocomplete' | 'basic'). */
  addressSearchMode?: 'autocomplete' | 'basic';
  /** Loader error message, if `status === 'error'`. */
  error?: string;
  /** HTTP status of the failed config request, if `status === 'error'`. */
  statusCode?: number;
  /**
   * True when the failure is a hard, non-recoverable auth error (invalid API
   * key / forbidden) — the flow can't proceed, so the modal shows a blocking
   * error screen instead of silently falling back to the prop ID-type list.
   */
  fatal?: boolean;
}

export interface KYCConfigValue {
  /** Dev-only base-URL override; only applied for development (`pk_dev_`) keys. */
  devUrl?: string;
  apiKey: string;
  /** Memoized API client, built from the resolved base URL + apiKey. */
  api: KYCApi;
  /**
   * The published flow ("flow_…") this mount was configured by, if any.
   * Attribution only — sent with the verify submission so the resulting
   * verification (and its webhooks) carry the flow.
   */
  workflowId?: string;
  /**
   * KYB only: the mapped applicant workflow's id (business.applicant.workflowId).
   * Stamped on the applicant's own submission so the server applies that
   * workflow's gates, pricing and decision graph to it.
   */
  applicantWorkflowId?: string;
  /**
   * EFFECTIVE country for the session: the user's country-select choice (multi-
   * region flows) or the configured default. Steps read this — they never need
   * to know about the selection mechanics.
   */
  country: AnyCountry;
  /**
   * Multi-region configuration (>1 entry adds the country-select step). The
   * effective `country`/`idTypes` above already reflect the picked entry.
   */
  countries?: Array<{
    country: AnyCountry;
    idTypes?: AnyIdType[];
    /** Multi-ID: which of this country's IDs each verification may offer. */
    multiIdSlots?: Array<{ idTypes?: string[] }>;
  }>;
  /**
   * Multi-ID POLICY: the applicant verifies `count` IDs in one run, one selfie,
   * one submission judged by `minPassed`. The per-verification ID allowlists
   * are per country, on `countries[].multiIdSlots`.
   */
  multiId?: { count: number; minPassed: number };
  /**
   * What this session verifies. 'business' switches to the KYB flow (consent →
   * business-details → questionnaire → submitted). Only ever set by a resolved
   * workflow config / hosted session snapshot — never by consumer props.
   */
  subjectType?: SubjectType;
  /** Workflow scope — what this flow verifies (absent = full verification).
   *  Only ever set by a resolved workflow config / hosted session snapshot. */
  scope?: import('../lib/scope').WorkflowScope;
  /** Business (KYB) configuration — present when `subjectType === 'business'`. */
  business?: WorkflowBusinessConfig;
  /** Subset of ID types to offer. Only types valid for `country` will appear. */
  idTypes?: AnyIdType[];
  metadata?: Record<string, string>;
  /** The org's user reference → Entity.externalUserId at the seam (not matched). */
  userId?: string;
  /** Pre-populated user data from the consuming app */
  userData?: { firstName?: string; lastName?: string; dateOfBirth?: string; businessName?: string; email?: string };
  /** Company details known upfront (KYB). Seeds the details step; editable. */
  businessPrefill?: { country?: string; registrationNumber?: string; registrationName?: string };
  enableSelfie?: boolean;
  enableDocumentCapture?: boolean;
  /** Allow picking a document photo from the device instead of the camera. Default true. */
  allowDocumentUpload?: boolean;
  /** Allow scanning the document live with the camera. Default true; stays on when upload is also off. */
  allowDocumentScan?: boolean;
  enableLiveness?: boolean;
  /** Presence Intelligence method: gestures (default) | flash | both. */
  livenessMode?: 'gestures' | 'flash' | 'both' | 'passive';
  /** Flash-liveness sequence length (colours) for flash/both. 2–5, default 4. */
  flashSequenceLength?: number;
  /** Light theme while the liveness camera is on. On unless `false`. */
  livenessBrightScreen?: boolean;
  /** Show the captured selfie, with Retake and Continue, before moving on.
   *  Off unless `true`; the liveness capture otherwise hands straight over. */
  selfieReview?: boolean;
  /** Device Intelligence (device + IP analysis). On by default; false skips it (and its charge). */
  deviceIntelligence?: boolean;
  /**
   * Show the "continue on another device" handoff option.
   * Desktop: shown as a pre-flow gate. Mobile: shown as a subtle link on the consent step.
   * Default true.
   */
  deviceHandoff?: boolean;
  /**
   * Whether the flow opens on the consent screen (default true). `false` is
   * the workflow's `consentStep: false`: the host has already asked, so the
   * flow opens on its first real step. See lib/consent-step.ts.
   */
  consentStep?: boolean;
  /**
   * Silent capture of unposed photos during document capture (default on;
   * `false` switches it off). See lib/silent-capture.ts.
   */
  silentCapture?: boolean;
  /** The biometric scopes' flow options (review / delivery / Done). See lib/biometric-options.ts. */
  biometric?: import('../lib/biometric-options').BiometricFlowConfig;
  /**
   * How header progress is drawn: 'steps' (default, numbered circles), 'bar'
   * (a thin bar on the header's bottom edge), or 'none' (no progress element).
   * See KYCConfig.progressStyle.
   */
  progressStyle?: ProgressStyle;
  /**
   * Mobile-only workflow: the flow runs only on a hardware-confirmed handheld.
   * Enforced before the flow opens (see lib/device-class.ts) and re-checked
   * server-side at submit. Default false.
   */
  requireMobileDevice?: boolean;
  /**
   * Base path (or absolute URL) where gesture GIFs are served from.
   * Defaults to `'/kyc-assets'`. Copy `node_modules/@myazahq/kyc-sdk-react/gifs/`
   * to that path, or set an absolute CDN URL to serve them remotely.
   */
  assetsBasePath?: string;
  /** Branding: company name, logo, primary color, theme. */
  appearance?: KYCAppearance;
  /** Consent (welcome) screen copy overrides. */
  consent?: KYCConsentContent;
  /** Success (submitted) screen copy overrides. */
  success?: KYCSuccessContent;
  /** Custom copy by language then key (see i18n/). */
  texts?: WorkflowTexts;
  /** The language texts are shown in. Default `en`. */
  language?: string;
  /** Email OTP possession check (right after consent). */
  emailVerification?: EmailVerificationConfig;
  /** Phone OTP possession check (right after consent / email verification). */
  phoneVerification?: PhoneVerificationConfig;
  /** Extra-info questionnaire shown before submission (compliance declarations). */
  questionnaire?: QuestionnaireConfig;
  /**
   * A reviewer sent this attempt back to redo specific steps.
   *
   * Arrives on ONE session's config snapshot, never on a published workflow, so
   * it is only ever present when somebody clicked "Send back". Absent means the
   * ordinary full flow.
   */
  resubmit?: ResubmitConfig;
  /** Proof of Address document collection (after capture). */
  proofOfAddress?: ProofOfAddressConfig;
  /** Supporting documents held on file (see types/config.ts). */
  supportingDocuments?: SupportingDocumentsConfig;
  /** Address Intelligence: smart-address capture (after Proof of Address). */
  addressCollection?: AddressCollectionConfig;
  /** NFC chip verification (native SDKs; web renders it for preview only). */
  nfc?: NfcConfig;
  onSubmit?: (submission: KYCSubmission) => void;
  /** Fires once with the verdict on a flow that waits for it in-app (see types/config.ts). */
  onResult?: (result: KYCResult) => void;
  onClose?: () => void;
  /** Fires for technical errors — including a fatal config-load auth failure. Receives a typed {@link KYCError}. */
  onError?: (error: KYCError) => void;
  /** Preview/mock mode: writes (uploads, verify) are stubbed in the browser. */
  previewMode?: boolean;
  /** Presentation only; the footer ignores this outside write-free preview mode. */
  previewTrustAttribution?: SdkTrustAttribution;
  /**
   * Hosted-page mode (set only by MyazaKYCHosted): the flow IS the whole page,
   * so there is no host surface to close back to. The success screen swaps the
   * Done → onClose button for the `success.redirectUrl` navigation, or a
   * "you can close this tab" line when no redirect is configured.
   */
  hostedMode?: boolean;
  /**
   * Starts (or returns) this mount's attempt, for binding a phone handoff to
   * it. Supplied by MyazaKYC; absent on a hosted page, whose session token is
   * the attempt (lib/handoff-parent.ts).
   */
  ensureHandoffParent?: (retry?: boolean) => Promise<string | undefined>;
  /**
   * The hosted session's own token (hosted mounts only).
   *
   * The success screen re-reads the server's settled view of the key people
   * with it, so the list shown at submit converges on the one a refresh would
   * show instead of contradicting it.
   */
  hostedToken?: string;
  /**
   * Set only when this mount is REHYDRATING a session that was already
   * submitted: the applicant has come back to their link. Its presence is what
   * routes the terminal step to CompletedStep instead of SubmittedStep, so no
   * flow runs and nothing is submitted a second time.
   */
  completedSummary?: CompletedSessionSummary;
  /**
   * Server-driven config (fetched on mount): which IDs the org may use and
   * which SDK features are enabled per ID. Steps should consult this — it
   * overrides the props above.
   */
  serverConfig: ServerSdkConfig;
  /**
   * Helper: returns the per-ID feature flags from the server config, or null
   * when the ID isn't granted (or config hasn't loaded yet).
   */
  getIdTypeFeatures: (
    country: string,
    idType: string,
  ) => SdkConfigIdType['features'] | null;
  /**
   * Resolver for `(country, idType)` display/flow definitions. Prefers the
   * curated LOCAL entry (labels + digits/pattern validation for the five
   * curated countries); otherwise synthesizes one from the server row's
   * `label`/`requiresDocumentCapture`/`scanSides` (Global Documents — any ISO
   * country). `country` defaults to the session's effective country. Steps
   * consult this — never `ID_TYPES` directly.
   */
  getIdTypeDefinition: (idType: string, country?: string) => IdTypeDefinition | null;
}

const KYCConfigContext = createContext<KYCConfigValue | null>(null);

// Map a config-load failure to a user-facing message. Auth failures (401/403)
// are "fatal": the API key is wrong or not permitted, so the flow can't run and
// the modal should block on a clear error rather than silently degrade. Other
// failures (network blips, 5xx) are non-fatal — the flow falls back to the prop
// ID-type list and any real problem resurfaces at the verify step.
function describeConfigError(err: unknown): { message: string; statusCode?: number; fatal: boolean; code: KYCErrorCode } {
  if (err instanceof KYCApiError) {
    if (err.statusCode === 401) {
      return {
        message: 'Invalid API key. Please check the API key configured in the SDK.',
        statusCode: 401,
        fatal: true,
        code: 'invalid_api_key',
      };
    }
    if (err.statusCode === 403) {
      return {
        message: err.message || 'This API key is not permitted to use the verification SDK.',
        statusCode: 403,
        fatal: true,
        code: 'feature_disabled',
      };
    }
    if (err.statusCode >= 500) {
      return {
        message: 'A server error occurred while loading verification settings. Please try again.',
        statusCode: err.statusCode,
        fatal: false,
        code: 'unknown',
      };
    }
    return { message: err.message, statusCode: err.statusCode, fatal: false, code: 'unknown' };
  }
  // fetch() throws a TypeError on network failure (DNS, offline, CORS).
  if (err instanceof TypeError) {
    return { message: 'Network error. Please check your connection and try again.', fatal: false, code: 'network_error' };
  }
  return { message: err instanceof Error ? err.message : 'Failed to load SDK config', fatal: false, code: 'unknown' };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

type KYCConfigProviderProps = Omit<KYCConfigValue, 'serverConfig' | 'getIdTypeFeatures' | 'getIdTypeDefinition' | 'api'> & {
  children: ReactNode;
  /**
   * Pre-built API client. Used by the hosted (continue-on-phone) entry, which
   * authenticates with a session token through a relative base URL — bypassing
   * `resolveBaseUrl` (which throws on a non-key token). When omitted the client
   * is built from the API key prefix as usual.
   */
  apiOverride?: KYCApi;
  /**
   * Pre-resolved server config. Used by the hosted entry, which already has the
   * org's idType allowlist + branding from the session bootstrap, so it should
   * NOT fetch `/config` (not in the session-token scope).
   */
  serverConfigOverride?: ServerSdkConfig;
};

export function KYCConfigProvider({ children, apiOverride, serverConfigOverride, ...config }: KYCConfigProviderProps) {
  const [serverConfig, setServerConfig] = useState<ServerSdkConfig>(
    serverConfigOverride ?? { status: 'loading', idTypes: [] },
  );

  // Resolve the base URL from the API key prefix (+ devUrl for dev keys) and
  // build a single memoized API client. Rebuilt only when the key or devUrl
  // changes. An invalid key prefix throws here (fail-loud at integration time).
  // `apiOverride` short-circuits this (hosted mode) — `resolveBaseUrl` is never
  // called, so a session token doesn't trip its key-prefix validation.
  const api = useMemo(() => {
    const client =
      apiOverride ?? createKYCApi(resolveBaseUrl(config.apiKey, config.devUrl), config.apiKey);
    // Preview mode stubs every write (uploads, verify) in the browser; reads
    // (config, workflow resolution) stay real so grants + branding are live.
    return config.previewMode ? withPreviewMocks(client) : client;
  }, [apiOverride, config.apiKey, config.devUrl, config.previewMode]);

  // Device Intelligence: the upload header + early entropy collection.
  useDeviceIntelSetup(config.deviceIntelligence, config.previewMode);

  // Guards onError so a fatal config failure is reported to the consumer at
  // most once per API client (StrictMode mounts the effect twice in dev).
  const reportedErrorRef = useRef<KYCApi | null>(null);

  // Mapped applicant workflow FALLBACK (business.applicant.workflowId): the
  // workflowId-embed and hosted paths overlay it upstream (WorkflowGate /
  // MyazaKYCHosted, from the server-resolved `applicantWorkflow`), but a
  // PROP-mounted business config — the builder preview is the everyday case —
  // has no resolution step, so the leg would silently fall back to org grants.
  // Resolve the mapped workflow here instead (reads stay real in preview mode)
  // and overlay it below. Skipped when an upstream overlay already ran.
  const mappedApplicantWorkflowId =
    config.subjectType === 'business' && !config.applicantWorkflowId
      ? config.business?.applicant?.workflowId
      : undefined;
  const [applicantOverlay, setApplicantOverlay] = useState<{
    id: string;
    config: WorkflowConfigPayload;
  } | null>(null);
  useEffect(() => {
    if (!mappedApplicantWorkflowId) return;
    let cancelled = false;
    api
      .workflow(mappedApplicantWorkflowId)
      .then((res) => {
        if (cancelled) return;
        setApplicantOverlay({ id: mappedApplicantWorkflowId, config: res.config });
      })
      // Best-effort: a dangling/unpublished mapping degrades to grants +
      // defaults, exactly like the server-side resolution fallback.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [api, mappedApplicantWorkflowId]);

  // The EFFECTIVE input config: the props with the mapped applicant workflow's
  // capture template overlaid (no-op when nothing was mapped or the overlay
  // already happened upstream). Everything below reads this, so the leg's
  // countries/idTypes/toggles and the applicantWorkflowId stamp all follow the
  // mapped workflow regardless of how the SDK was mounted.
  const effective = applicantOverlay
    ? (overlayApplicantWorkflow(
        applicantOverlay,
        config as unknown as Record<string, unknown>,
      ) as unknown as typeof config)
    : config;

  useEffect(() => {
    // Hosted mode already has the server config from the session bootstrap —
    // don't fetch /config (and don't overwrite the provided override).
    if (serverConfigOverride) return;
    let cancelled = false;
    api
      .config()
      .then((res: SdkConfigResponse) => {
        if (cancelled) return;
        setServerConfig({
          status: 'ready',
          idTypes: res.idTypes,
          environment: res.environment,
          branding: res.branding,
          geoCountry: res.geoCountry,
          mapsFrameUrl: res.mapsFrameUrl,
          addressSearch: res.addressSearch,
          addressSearchMode: res.addressSearchMode,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const { message, statusCode, fatal, code } = describeConfigError(err);
        setServerConfig({ status: 'error', idTypes: [], error: message, statusCode, fatal });
        // Surface fatal auth failures (e.g. a wrong API key) to the consumer's
        // onError handler, once, so it isn't only visible inside the modal.
        if (fatal && reportedErrorRef.current !== api) {
          reportedErrorRef.current = api;
          safeReportError(config.onError, new KYCError(code, message));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  const idTypesByKey = useMemo(() => {
    const map = new Map<string, SdkConfigIdType>();
    for (const row of serverConfig.idTypes) {
      map.set(`${row.country}/${row.idType}`, row);
    }
    return map;
  }, [serverConfig.idTypes]);

  // Multi-region: the user's country-select choice (reducer state) overrides
  // the configured default, and the picked country's idTypes win. Steps only
  // ever see the EFFECTIVE country/idTypes — no selection logic leaks out.
  const { state } = useKYCContext();
  const effectiveCountry: AnyCountry = state.selectedCountry ?? effective.country;
  const countryEntry = effective.countries?.find((c) => c.country === effectiveCountry);

  // An empty idTypes list means "offer everything granted" (same as absent) —
  // the server enforces that semantic, so a stray [] must not hide every ID.
  const nonEmpty = (ids: AnyIdType[] | undefined): AnyIdType[] | undefined =>
    ids && ids.length > 0 ? ids : undefined;

  const value = useMemo<KYCConfigValue>(
    () => ({
      ...effective,
      country: effectiveCountry,
      idTypes: nonEmpty(countryEntry?.idTypes) ?? nonEmpty(effective.idTypes),
      api,
      serverConfig,
      getIdTypeFeatures: (country, idType) =>
        idTypesByKey.get(`${country}/${idType}`)?.features ?? null,
      getIdTypeDefinition: (idType, country) =>
        resolveIdTypeDefinition(country ?? effectiveCountry, idType, serverConfig.idTypes),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      config.devUrl,
      config.apiKey,
      api,
      config.workflowId,
      config.applicantWorkflowId,
      applicantOverlay,
      config.country,
      config.countries,
      config.subjectType,
      config.business,
      effectiveCountry,
      countryEntry,
      config.idTypes,
      config.metadata,
      config.userId,
      config.userData,
      config.enableSelfie,
      config.enableDocumentCapture,
      config.allowDocumentUpload,
      config.allowDocumentScan,
      config.enableLiveness,
      config.livenessMode,
      config.flashSequenceLength,
      config.livenessBrightScreen,
      config.selfieReview,
      config.deviceIntelligence,
      config.deviceHandoff,
      config.consentStep,
      config.silentCapture,
      config.biometric,
      config.requireMobileDevice,
      config.assetsBasePath,
      config.appearance,
      config.previewMode,
      config.previewTrustAttribution,
      config.ensureHandoffParent,
      config.consent,
      config.texts,
      config.language,
      config.success,
      config.emailVerification,
      config.phoneVerification,
      config.questionnaire,
      config.proofOfAddress,
      config.supportingDocuments,
      config.addressCollection,
      config.nfc,
      config.onSubmit,
      config.onResult,
      config.onClose,
      config.onError,
      serverConfig,
      idTypesByKey,
    ],
  );

  return <KYCConfigContext.Provider value={value}>{children}</KYCConfigContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useKYCConfig(): KYCConfigValue {
  const ctx = useContext(KYCConfigContext);
  if (!ctx) {
    throw new Error('useKYCConfig must be used within a <KYCConfigProvider>');
  }
  return ctx;
}

/**
 * The tolerant read, for chrome that may render outside a provider.
 *
 * Its original caller was the standalone biometric entry point, which mounted
 * no KYCConfigProvider and rendered the same PoweredBy footer the KYC modal
 * does — where the strict hook threw and took the whole mount down with it.
 * That entry point is gone (2026-09-16), so every mount today does sit inside
 * a provider; the tolerant read stays because PoweredBy is shared chrome and a
 * footer must never be able to crash the surface hosting it. Null means "no
 * flow config here"; the caller falls back to default chrome. Everything
 * flow-driven keeps the strict hook, whose throw is the point.
 */
export function useOptionalKYCConfig(): KYCConfigValue | null {
  return useContext(KYCConfigContext);
}
