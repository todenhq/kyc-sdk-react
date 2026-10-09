import { SDK_VERSION } from '../utils/device-metadata';
import { uploadDeviceIdHeader } from '../lib/upload-device-id';
import { compactDrawing, type SignatureDrawing } from '../lib/signature';

export class KYCApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string,
    public body?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'KYCApiError';
  }
}

function baseHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'X-SDK-Version': SDK_VERSION,
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  // Some endpoints (e.g. upload confirm) return an empty body. Read as text
  // first so JSON.parse isn't called on "" — that would throw.
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const errObj = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
    const message = String(errObj.message ?? errObj.error ?? `Request failed with status ${res.status}`);
    const code = typeof errObj.error === 'string' ? errObj.error : undefined;
    throw new KYCApiError(message, res.status, code, errObj);
  }
  return data as T;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Media kinds the SDK can upload. Document/selfie photos plus best-effort videos. */
export type MediaUploadType =
  // Artefacts held on file — not the identity evidence the verification is
  // decided on. Images + PDF, like the other document types.
  | 'supporting_document'
  | 'document_front'
  | 'document_back'
  | 'selfie'
  | 'document_front_video'
  | 'document_back_video'
  | 'liveness_video'
  | 'proof_of_address'
  | 'business_document'
  | 'address_photo'
  // Silent capture: an unposed JPEG of the applicant from the front camera
  // (lib/silent-capture.ts). Image only.
  | 'silent_capture';

/** Response from `POST /api/kyc/upload` — the stored mediaId. */
export interface UploadResponse {
  mediaId: string;
}

/** Body of `POST /api/kyc/document-capture/check`: one uploaded document side. */
export interface DocumentCaptureCheckRequest {
  mediaId: string;
  side: 'front' | 'back';
  country: string;
  idType: string;
  workflowId?: string;
  sessionId?: string;
}

/** `true` fine, `false` looked and found nothing, `null` not checked. */
export interface DocumentCaptureCheckResponse {
  side: 'front' | 'back';
  face: boolean | null;
  barcode: boolean | null;
}

export interface VerifyRequest {
  country: string;
  idType: string;
  idNumber?: string;
  /** Multi-ID: the committed slots, in pick order (2-3). idType/idNumber above
   *  mirror the first slot; the run's single selfie stays on mediaIds. */
  idChecks?: Array<{
    idType: string;
    idNumber?: string;
    documentFront?: string;
    documentBack?: string;
    /** Each check's OWN document recording — the row's flat
     *  documentFrontVideo column can hold only one of them. */
    documentFrontVideo?: string;
    documentBackVideo?: string;
  }>;
  /**
   * Business (KYB) submission block. Present ⇒ this is a business verification.
   * Requires a published KYB workflow (`workflowId` or hosted link); there is
   * no capture, so `mediaIds` is omitted. `idType` carries the product key for
   * transport symmetry.
   */
  business?: {
    registrationNumber: string;
    registrationName?: string;
    product?: string;
    /**
     * Contact email for key-people verification — the server emails this
     * address the invite links when the workflow's `keyPeople.invite.channel`
     * is 'email' and a role needs full KYC. Optional; sent only when non-empty.
     */
    contactEmail?: string;
    /** Company profile (collectCompanyInfo fields) — echoed on the org's
     *  webhook and address-matched against the registry. */
    address?: string;
    email?: string;
    phone?: string;
    website?: string;
    /** Uploaded supporting documents (only honored when the workflow's
     *  `business.documents` block configures them). */
    documents?: Array<{ type: string; mediaId: string }>;
    /** Applicant-declared directors & owners (≤20; `email` drives auto-sent
     *  invites; only honored when the workflow sets `keyPeople.collect`). */
    keyPeople?: Array<{
      name: string;
      role: import('../types/business').KeyPersonRole;
      email?: string;
      /** The person's ISO-2 country — drives their verification link's country. */
      country?: string;
      ownershipPct?: number;
      /** This entry IS the applicant (picked on the applicant-role step) —
       *  the server merges it with the applicant row: one person, one KYC,
       *  one screening, no invite. */
      isApplicant?: boolean;
    }>;
    /** The applicant's declared role (+ optional name — the server backfills
     *  it from their verified KYC when absent). */
    applicant?: { role: import('../types/business').ApplicantRole; name?: string };
  };
  /**
   * Attribution: the published flow ("flow_…") that configured this SDK mount.
   * Validated server-side and silently dropped when stale — never fails a
   * submission.
   */
  workflowId?: string;
  /** The org's user reference → Entity.externalUserId at the seam (not matched). */
  userId?: string;
  /**
   * The resumable session this submission belongs to (from `session.start`).
   * NOT a credential — auth is still the API key — just the progress container
   * the finished verification links back to. Dropped server-side when it isn't
   * the caller's, on the same principle as `workflowId`.
   */
  sessionId?: string;
  /**
   * The Presence Intelligence method that ran, so prop-configured mounts bill
   * the right per-method component. A published workflow's livenessMode always
   * wins over this server-side. Absent ⇒ gestures.
   */
  livenessMode?: 'gestures' | 'flash' | 'both' | 'passive';
  flashSequenceLength?: number;
  deviceIntelligence?: boolean;
  /** What kind of proof-of-address document `mediaIds.proofOfAddress` is. */
  proofOfAddressType?: 'utility_bill' | 'bank_statement' | 'tenancy_agreement' | 'government_document' | 'other';
  /** Supporting documents held on file — `{ type, mediaId }` per upload. */
  supportingDocuments?: Array<{ type: string; mediaId: string }>;
  /**
   * Smart-address submission (Address Intelligence): the claimed pin plus the
   * optional one-shot device fix taken at confirmation (attestPresence). The
   * server drops the block when the workflow's address step is off.
   */
  address?: {
    lat: number;
    lng: number;
    accuracy?: number;
    directions?: string;
    label?: string;
    propertyName?: string;
    propertyNumber?: string;
    street?: string;
    /** The edit-details claims: unit + area/region corrections. */
    unit?: string;
    neighbourhood?: string;
    city?: string;
    state?: string;
    postcode?: string;
    streetView?: { panoId: string; heading: number; pitch: number; fov: number };
    deviceLat?: number;
    deviceLng?: number;
    deviceAccuracy?: number;
    capturedAt?: string;
  };
  userData?: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    /** The applicant's email, when the integrator passed one. */
    email?: string;
  };
  /** Extra-info questionnaire answers, validated server-side against the published definition. */
  questionnaire?: Record<string, string | number | boolean | string[]>;
  /**
   * Contact-verification proof tokens (minted by `POST /contact/check`).
   * Single-use; the server validates + claims them onto the verification —
   * an invalid/expired proof is dropped, a workflow-required missing one 422s.
   */
  contact?: { emailToken?: string; phoneToken?: string };
  /** Captured media references. Omitted for business (KYB) submissions — no capture. */
  mediaIds?: {
    documentFront?: string;
    documentBack?: string;
    selfie?: string;
    documentFrontVideo?: string;
    documentBackVideo?: string;
    livenessVideo?: string;
    proofOfAddress?: string;
    addressPhoto?: string;
    /** Silent capture frames, numbered by capture order with no gaps. */
    silentCapture1?: string;
    silentCapture2?: string;
    silentCapture3?: string;
  };
  metadata: {
    requestId: string;
    device?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

export interface VerifyResponse {
  verificationId: string;
  status: 'pending';
  /**
   * Business submissions only: the KeyPerson id minted for the applicant when
   * the workflow requires applicant verification. The SDK immediately submits
   * the applicant's own INDIVIDUAL verification with
   * `metadata.userId = applicantKeyPersonId` so the server links it back.
   */
  applicantKeyPersonId?: string | null;
  /** Business submissions only: copyable verification links for the key people
   *  the applicant listed — shown on the success screen to send on. */
  keyPeopleInvites?: Array<{ keyPersonId: string; name: string; inviteUrl: string }>;
}

/**
 * Minimal, publishable-safe status from `GET /api/kyc/status/:id`.
 *
 * Because this is reachable with the publishable (`pk_`) key the SDK carries, it
 * intentionally contains NO PII, match scores, or result data — only the
 * lifecycle state and (on non-success) the org-safe failure reason. To read the
 * full result + extracted biodata, call `GET /api/kyc/verifications/:id` from
 * your backend with a SECRET (`sk_`) key — never ship a secret key in the SDK.
 */
/**
 * The one status vocabulary, shared by `GET /api/kyc/status/:id`, the
 * secret-key result route and every verification webhook.
 *
 * `status` is what happened; `checkStatus` beside it is what the CHECKS found.
 * They differ when a person overrode the automated result: `approved` with
 * `checkStatus: 'failed'` means somebody accepted the applicant despite a
 * failed check, and the reason says what they accepted them despite.
 */
export type SessionStatus =
  | 'not_started'
  | 'in_progress'
  | 'processing'
  | 'in_review'
  | 'awaiting_resubmission'
  | 'approved'
  | 'declined'
  | 'abandoned'
  | 'expired'
  // The organisation cancelled the session; terminal until uncancelled.
  | 'cancelled'
  | 'error';

export interface VerificationStatusResponse {
  verificationId: string;
  status: SessionStatus;
  /** What the CHECKS found, unchanged by any later decision. */
  checkStatus?: 'pending' | 'verified' | 'failed' | 'not_found' | 'error';
  reason?: string | null;
  reasonCode?: string | null;
  /**
   * How the identity was (or will be) established, on pending/verified rows:
   * `'chip'` (NFC eMRTD read), `'gov_db'` (government-database lookup), or
   * `'document'` (Document Intelligence — OCR + selfie↔document-portrait
   * facial compare; the Global Documents path).
   */
  assuranceLevel?: 'chip' | 'gov_db' | 'document';
  createdAt: string;
  completedAt?: string;
}

export interface SdkConfigIdType {
  country: string;
  idType: string;
  /** Display name (e.g. "International Passport") — the source of truth for
   *  pairs the SDK has no local definition for (Global Documents). */
  label?: string;
  /** false = number-only ID (the user types the number, no document scan). */
  requiresDocumentCapture?: boolean;
  /** How many document sides to scan (document-capture IDs). */
  scanSides?: 'front_only' | 'front_and_back';
  /** Whether the document carries an NFC-readable chip (native SDKs only). */
  supportsNfc?: boolean;
  features: {
    documentVerification: boolean;
    livenessCheck: boolean;
    govDbCheck: boolean;
  };
}

/** Org branding configured server-side, returned with the SDK config. */
/**
 * The footer attribution, resolved server-side from the published workflow.
 * `custom` replaces the Myaza Trust lockup with the organisation's own logo.
 */
export type SdkTrustAttribution =
  | { mode: 'myaza' }
  | { mode: 'custom'; logo: string; logoDark?: string; companyName?: string };

export interface SdkConfigBranding {
  /** Public URL of the org's logo, if one is configured. */
  logo?: string;
  /** Org display name. */
  companyName?: string;
  /** Org brand color (hex). */
  primaryColor?: string;
  /** Server-resolved footer attribution. Missing on older servers, which means Myaza. */
  trustAttribution?: SdkTrustAttribution;
}

export interface SdkConfigResponse {
  environment: 'DEVELOPMENT' | 'SANDBOX' | 'PRODUCTION';
  idTypes: SdkConfigIdType[];
  /**
   * Org branding (logo, name, color). Surfaced so the SDK can render the org's
   * own logo when the consumer sets `appearance.logo = 'default'`.
   */
  branding?: SdkConfigBranding;
  /**
   * The visitor's country, guessed from their IP address.
   *
   * A DEFAULT for country fields nothing else answers — never evidence, and
   * null whenever the address cannot be placed (local development, a private
   * address, no geo database deployed). Anything that matters reads the
   * country the applicant confirmed.
   */
  geoCountry?: string | null;
  /** Whether the platform's forward address search is available (the address
   *  step shows its search box only when it is). */
  addressSearch?: boolean;
  /** Which search backend: 'autocomplete' (Places, as-you-type) or 'basic'
   *  (explicit-submit). Absent when addressSearch is false. */
  addressSearchMode?: 'autocomplete' | 'basic';
  /** Framed Google-map picker URL for embedded mounts (grant-carrying; absent
   *  when the platform has no maps key or the request had no Origin). */
  mapsFrameUrl?: string | null;
}

/** One Places autocomplete suggestion. */
export interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

/** A picked suggestion, resolved to coordinates + structured pieces. */
export interface ResolvedPlace {
  lat: number;
  lng: number;
  houseNumber: string | null;
  road: string | null;
  formatted: string | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  /** ISO-2 of the picked address's own country — the declaration derives
   *  from the address, never from a configured seed. */
  country?: string | null;
}

/** The pin's address broken down — what the details sheet displays as rows. */
export interface AddressParts {
  street?: string | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  /** ISO-2 of the pin's own place, from the reverse geocode. */
  country?: string | null;
}

export interface AddressReverseResult {
  line: string | null;
  road: string | null;
  parts?: AddressParts | null;
}

/** One forward-search candidate for the address step's search box. */
export interface AddressSearchHit {
  label: string;
  lat: number;
  lng: number;
  houseNumber: string | null;
  road: string | null;
}

// ---------------------------------------------------------------------------
// Verification Flows (dashboard-built SDK configuration templates)
// ---------------------------------------------------------------------------

/**
 * The serialized template config a published flow carries — the same shape a
 * handoff `configSnapshot` uses, minus the runtime fields (userId/userData/
 * metadata), which always come from the consumer's code.
 */
export interface WorkflowConfigPayload {
  /**
   * What the workflow verifies. Absent = 'individual'. Business (KYB)
   * workflows use the `business` block below instead of country/idTypes.
   */
  subjectType?: 'individual' | 'business';
  /** Workflow scope — what the flow verifies (absent = full verification).
   *  Scoped submissions carry the scope's marker idType. */
  scope?: string;
  /** Business (KYB) configuration — present when `subjectType === 'business'`. */
  business?: {
    /** ISO-2 registry country (NOT limited to the individual catalogue). */
    country: string;
    /** Offered product keys (absent = ['business']). */
    products?: string[];
    requireRegistrationName?: boolean;
    /** Key-people (director/owner) verification configuration. */
    keyPeople?: import('../types/business').WorkflowKeyPeopleConfig;
    /** Supporting-document collection configuration. */
    documents?: import('../types/business').WorkflowBusinessDocumentsConfig;
    /** Applicant (submitter) identity verification configuration. */
    applicant?: import('../types/business').WorkflowBusinessApplicantConfig;
  };
  /** Absent for business workflows — the business block carries its own country. */
  country?: string;
  /** Multi-region: per-country ID types (validation toggles are server-enforced),
   *  plus each country's multi-ID per-verification allowlists. */
  countries?: Array<{ country: string; idTypes?: string[]; multiIdSlots?: Array<{ idTypes?: string[] }> }>;
  idTypes?: string[];
  /** Multi-ID POLICY (per-country ID offerings live on `countries[]`). */
  multiId?: { count: number; minPassed: number };
  enableSelfie?: boolean;
  enableDocumentCapture?: boolean;
  allowDocumentUpload?: boolean;
  /** Live camera scan for documents. Default true; false makes capture upload only. */
  allowDocumentScan?: boolean;
  enableLiveness?: boolean;
  /** Presence Intelligence method: gestures (default) | flash | both. */
  livenessMode?: string;
  flashSequenceLength?: number;
  /** Light theme while the liveness camera is on. On unless `false`. */
  livenessBrightScreen?: boolean;
  /** Show the captured selfie, with Retake and Continue, before moving on.
   *  Off unless `true`; the liveness capture otherwise hands straight over. */
  selfieReview?: boolean;
  /** "Continue on your phone" desktop QR gate. On by default; false disables it. */
  deviceHandoff?: boolean;
  /** The consent (welcome) screen the flow opens on; false skips it. */
  consentStep?: boolean;
  /** Silent capture of unposed photos from the front camera. On unless false. */
  silentCapture?: boolean;
  /** The biometric scopes' flow options (review / delivery / Done). */
  biometric?: import('../lib/biometric-options').BiometricFlowConfig;
  /** Device + IP analysis. On by default; false skips it and its charge. */
  deviceIntelligence?: boolean;
  /** Mobile-only: the flow may not run on a desktop (hardware-confirmed). Off by default. */
  requireMobileDevice?: boolean;
  voiceGuidance?: unknown;
  showThemeToggle?: boolean;
  /** Header progress style: 'steps' (default) | 'bar'. Loose, like livenessMode. */
  progressStyle?: string;
  fullScreen?: boolean;
  disableClose?: boolean;
  appearance?: Record<string, unknown>;
  consent?: Record<string, unknown>;
  success?: Record<string, unknown>;
  /** Custom copy by language then key (see i18n/). */
  texts?: Record<string, Record<string, string>>;
  /** Contact verification step configurations (email/phone OTP). */
  emailVerification?: { enabled?: boolean; required?: boolean; codeLength?: number; maxAttempts?: number; inputStyle?: 'segmented' | 'text' };
  phoneVerification?: {
    enabled?: boolean;
    required?: boolean;
    codeLength?: number;
    maxAttempts?: number;
    inputStyle?: 'segmented' | 'text';
    channels?: Array<'sms' | 'whatsapp'>;
    defaultCountry?: string;
  };
  /** Extra-info questionnaire definition (compliance declarations). */
  questionnaire?: { title?: string; description?: string; fields: unknown[] };
  /** Proof of Address step configuration. */
  proofOfAddress?: { enabled?: boolean; documentTypes?: string[]; maxAgeDays?: number };
  /** Supporting documents held on file (per-document ID scoping). */
  supportingDocuments?: import('../types/config').SupportingDocumentsConfig;
  addressCollection?: { enabled?: boolean; requirePin?: boolean; photo?: string; directions?: string; attestPresence?: boolean };
  /** NFC chip verification configuration (native SDKs; web = preview only). */
  nfc?: { enabled?: boolean; idTypes?: string[]; allowSkip?: boolean };
  assetsBasePath?: string;
}

/** Response from `GET /api/kyc/workflows/:workflowId` — one round trip hydrates the SDK. */
/**
 * A KYB workflow's mapped APPLICANT workflow (business.applicant.workflowId),
 * resolved server-side: the individual workflow whose capture template overlays
 * the applicant's own KYC leg, and whose id is stamped on that submission.
 */
export interface ApplicantWorkflowPayload {
  id: string;
  name: string;
  version: number;
  config: WorkflowConfigPayload;
}

export interface WorkflowResolutionResponse {
  flow: { id: string; name: string; version: number };
  config: WorkflowConfigPayload;
  environment: 'DEVELOPMENT' | 'SANDBOX' | 'PRODUCTION';
  /** Org allowlist + per-ID feature flags (same shape as /config). */
  idTypes: SdkConfigIdType[];
  branding?: SdkConfigBranding;
  /** The address-capability fields /config carries — mirrored here because a
   *  workflowId mount skips /config, and without them a workflow embed lost
   *  the framed Google map, the address search box, and the geo default. */
  geoCountry?: string | null;
  addressSearch?: boolean;
  addressSearchMode?: 'autocomplete' | 'basic';
  mapsFrameUrl?: string | null;
  /** KYB only: the mapped applicant workflow, when configured and resolvable. */
  applicantWorkflow?: ApplicantWorkflowPayload | null;
}

// ---------------------------------------------------------------------------
// Device handoff (continue-on-phone)
// ---------------------------------------------------------------------------

/**
 * Snapshot of the consumer's config the desktop sends to mint a handoff
 * session. The phone re-renders the same flow from it. `userData` is included
 * so the greeting and consent tokens work on the phone — the token URL is
 * already the secret, so the risk profile is the same as a magic link.
 */
export interface HandoffSessionSnapshot {
  /** Absent for business (KYB) sessions — `business.country` carries theirs. */
  country?: string;
  /** Workflow scope — what the session's flow verifies (absent = full). */
  scope?: string;
  /** Company details the org already held when the session was minted. */
  businessPrefill?: { registrationNumber?: string; registrationName?: string };
  /** What the session verifies. Absent = 'individual'. */
  subjectType?: 'individual' | 'business';
  /** Business (KYB) configuration — present when `subjectType === 'business'`. */
  business?: {
    country: string;
    products?: string[];
    requireRegistrationName?: boolean;
    keyPeople?: import('../types/business').WorkflowKeyPeopleConfig;
    documents?: import('../types/business').WorkflowBusinessDocumentsConfig;
    applicant?: import('../types/business').WorkflowBusinessApplicantConfig;
  };
  /**
   * Attribution ride-along when the desktop SDK was configured by a published
   * flow — the server validates it and stamps it on the session (it is NOT
   * part of the rendered config).
   */
  workflowId?: string;
  /** Multi-region configuration (per-country ID types + multi-ID allowlists). */
  countries?: Array<{ country: string; idTypes?: string[]; multiIdSlots?: Array<{ idTypes?: string[] }> }>;
  idTypes?: string[];
  /** Multi-ID POLICY (per-country ID offerings live on `countries[]`). */
  multiId?: { count: number; minPassed: number };
  /** Reviewer sent this session back — walk only these steps. */
  resubmit?: { steps: string[]; message?: string | null };
  enableSelfie?: boolean;
  enableDocumentCapture?: boolean;
  allowDocumentUpload?: boolean;
  /** Live camera scan for documents. Default true; false makes capture upload only. */
  allowDocumentScan?: boolean;
  enableLiveness?: boolean;
  /** Presence Intelligence method: gestures (default) | flash | both. */
  livenessMode?: string;
  flashSequenceLength?: number;
  /** Light theme while the liveness camera is on. On unless `false`. */
  livenessBrightScreen?: boolean;
  /** Show the captured selfie, with Retake and Continue, before moving on.
   *  Off unless `true`; the liveness capture otherwise hands straight over. */
  selfieReview?: boolean;
  /** "Continue on your phone" desktop QR gate. On by default; false disables it. */
  deviceHandoff?: boolean;
  /** The consent (welcome) screen the flow opens on; false skips it. */
  consentStep?: boolean;
  /** Silent capture of unposed photos from the front camera. On unless false. */
  silentCapture?: boolean;
  /** The biometric scopes' flow options (review / delivery / Done). */
  biometric?: import('../lib/biometric-options').BiometricFlowConfig;
  /** Device + IP analysis. On by default; false skips it and its charge. */
  deviceIntelligence?: boolean;
  /** Mobile-only: the flow may not run on a desktop (hardware-confirmed). Off by default. */
  requireMobileDevice?: boolean;
  voiceGuidance?: unknown;
  showThemeToggle?: boolean;
  /** Header progress style: 'steps' (default) | 'bar'. Loose, like livenessMode. */
  progressStyle?: string;
  fullScreen?: boolean;
  disableClose?: boolean;
  appearance?: Record<string, unknown>;
  consent?: Record<string, unknown>;
  success?: Record<string, unknown>;
  /** Custom copy by language then key (see i18n/). */
  texts?: Record<string, Record<string, string>>;
  /** Contact verification step configurations (email/phone OTP). */
  emailVerification?: { enabled?: boolean; required?: boolean; codeLength?: number; maxAttempts?: number; inputStyle?: 'segmented' | 'text' };
  phoneVerification?: {
    enabled?: boolean;
    required?: boolean;
    codeLength?: number;
    maxAttempts?: number;
    inputStyle?: 'segmented' | 'text';
    channels?: Array<'sms' | 'whatsapp'>;
    defaultCountry?: string;
  };
  /** Extra-info questionnaire definition (compliance declarations). */
  questionnaire?: { title?: string; description?: string; fields: unknown[] };
  /** Proof of Address step configuration. */
  proofOfAddress?: { enabled?: boolean; documentTypes?: string[]; maxAgeDays?: number };
  /** Supporting documents held on file (per-document ID scoping). */
  supportingDocuments?: import('../types/config').SupportingDocumentsConfig;
  addressCollection?: { enabled?: boolean; requirePin?: boolean; photo?: string; directions?: string; attestPresence?: boolean };
  /** NFC chip verification configuration (native SDKs; web = preview only). */
  nfc?: { enabled?: boolean; idTypes?: string[]; allowSkip?: boolean };
  metadata?: Record<string, string>;
  /** Opaque org user reference — rides the snapshot like metadata (not PII). */
  userId?: string;
  userData?: { firstName?: string; lastName?: string; dateOfBirth?: string };
  assetsBasePath?: string;
}

/** Response from `POST /api/kyc/session`. */
/** Response from `POST /api/kyc/session/start` for embedded attempts. */
export interface StartSessionResponse {
  sessionId: string;
  expiresAt: string;
  resumed: boolean;
  /** Where the user got to, when resuming. Media references are already
   *  pruned server-side of anything that has since expired. */
  progress?: {
    step?: string;
    mediaIds?: Record<string, string>;
    data?: Record<string, unknown>;
  };
  /** A committed KYB application still waiting on its applicant leg
   *  (lib/resumed-application.ts). */
  applicantKeyPersonId?: string;
  parentVerificationId?: string;
  parentRequestId?: string;
  /**
   * The flow this attempt was started with, as the server recorded it. A phone
   * handoff is only bound to this attempt when it matches what this mount is
   * showing (lib/embedded-handoff-root.ts).
   */
  configSnapshot?: HandoffSessionSnapshot;
  /**
   * The applicant-leg workflow recorded with the attempt. `null` is an answer:
   * the attempt has none, and one published later must not be picked up.
   */
  applicantWorkflow?: ApplicantWorkflowPayload | null;
}

export interface CreateHandoffSessionResponse {
  sessionId: string;
  /** Human-typable / copyable short code (display only). */
  code: string;
  /** Full hosted-page URL the QR encodes. */
  url: string;
  expiresAt: string;
}

export type HandoffSessionStatus = 'pending' | 'opened' | 'submitted' | 'expired';

/** Response from `GET /api/kyc/session/:sessionId` (desktop poll, no PII). */
export interface HandoffSessionStatusResponse {
  status: HandoffSessionStatus;
  verificationId?: string;
  verificationStatus?: VerificationStatusResponse['status'];
}

/** Response from `GET /api/kyc/session/by-token/:token/bootstrap` (phone side). */
export interface HandoffBootstrapResponse {
  /**
   * The session's own id.
   *
   * A hosted mount holds only the opaque token, so this is the only way it can
   * learn the id — and without it progress saving is silently a no-op, which is
   * exactly what happened: every hosted link lost the applicant's work.
   */
  sessionId: string;
  /** Where the applicant got to last time, when they are coming back. */
  progress?: {
    step?: string;
    mediaIds?: Record<string, string>;
    data?: Record<string, unknown>;
  };
  environment: 'DEVELOPMENT' | 'SANDBOX' | 'PRODUCTION';
  configSnapshot: HandoffSessionSnapshot;
  branding?: SdkConfigBranding;
  /**
   * The visitor's country, guessed from their IP address.
   *
   * A DEFAULT for country fields nothing else answers — never evidence, and
   * null whenever the address cannot be placed (local development, a private
   * address, no geo database deployed). Anything that matters reads the
   * country the applicant confirmed.
   */
  geoCountry?: string | null;
  /**
   * Myaza's Google Maps browser key for the address step — HOSTED pages only
   * (the key is referrer-restricted to the hosted origin, so /config never
   * carries one; embeds render the built-in OpenStreetMap picker instead).
   */
  googleMapsBrowserKey?: string | null;
  /** Whether the platform's forward address search is available. */
  addressSearch?: boolean;
  /** Which search backend ('autocomplete' | 'basic'); absent when none. */
  addressSearchMode?: 'autocomplete' | 'basic';
  /** Org allowlist + per-ID feature flags (same shape as /config). */
  idTypes: SdkConfigIdType[];
  expiresAt: string;
  /** KYB only: the mapped applicant workflow, when configured and resolvable. */
  applicantWorkflow?: ApplicantWorkflowPayload | null;
  /**
   * KYB only, when the business half already committed and the applicant's
   * own verification has not: the applicant KeyPerson, the parent business
   * verification, and its request id (replayed; lib/resumed-application.ts).
   */
  applicantKeyPersonId?: string;
  parentVerificationId?: string;
  parentRequestId?: string;
}

/** One person a submitted KYB application is still waiting on. */
export interface AwaitingPersonPayload {
  id: string;
  name: string;
  role: string;
  ownershipPct: number | null;
  /** ISO-2, or null when the register gave free text no flag matches. */
  country: string | null;
  status: 'verified' | 'failed' | 'submitted' | 'pending' | 'not_needed';
  /** Null once their check is done, or when they never needed one. */
  inviteUrl: string | null;
  isApplicant: boolean;
  /** A company completes a KYB application, not a KYC - the list labels it so. */
  isCorporate?: boolean;
}

/**
 * A finished session, rebuilt for the applicant who comes back to their link.
 *
 * None of the in-memory state behind the live success screen survives the tab
 * closing, so the server rebuilds it — including each key person's CURRENT
 * status, which is the point: the people this screen names go and verify after
 * it was first shown.
 */
/**
 * What happened to the application, as the applicant is told it.
 *
 * Coarser than the server's own status vocabulary: `in_review` and `processing`
 * are one thing to the person waiting. `error` is kept apart from `declined`
 * because a fault on our side is not a judgement about their business.
 */
export type ApplicantOutcome = 'submitted' | 'approved' | 'declined' | 'action_needed' | 'error';

export interface CompletedSessionSummary {
  status: 'completed';
  /** Absent on an older server, which only ever reported the submission. */
  outcome?: ApplicantOutcome;
  /**
   * The organisation cancelled this application. Read BEFORE `outcome`, which
   * stays `error` for it so an older client keeps showing what it always did.
   * Absent on an older server (lib/session-cancelled.ts summaryIsCancelled).
   */
  cancelled?: boolean;
  /**
   * Whether `keyPeople` is FINAL.
   *
   * The register is reconciled against what the applicant typed after they
   * submit, so an early read is a first draft: it can be missing people they
   * never listed and have the wrong roles for those they did. A surface that
   * renders the list once waits for this rather than showing the draft and
   * correcting it underneath the reader. Absent on an older server, where the
   * value was inferred from polling instead.
   */
  keyPeopleSettled?: boolean;
  /** The submission carried an address pin — a presence check could really
   *  have started. Absent on an older server. */
  addressCollected?: boolean;
  /** User-safe prose, present on outcomes the applicant can act on. */
  reason?: string | null;
  reasonCode?: string | null;
  environment: 'DEVELOPMENT' | 'SANDBOX' | 'PRODUCTION';
  configSnapshot: HandoffSessionSnapshot;
  branding?: SdkConfigBranding;
  subjectType: 'individual' | 'business';
  businessName: string | null;
  keyPeople: AwaitingPersonPayload[];
}

// The mimeType values the server accepts (image vs. video). Must mirror the
// server's upload allowlist exactly.
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const VIDEO_MIME_TYPES = ['video/webm', 'video/mp4'] as const;

// Drop codec params from a blob's type (e.g. "video/webm;codecs=vp9" ->
// "video/webm") and fall back to a sane default per media kind when the value
// isn't one the server recognizes.
function normalizeMimeType(blobType: string, type: MediaUploadType): string {
  const base = (blobType.split(';')[0] || '').trim().toLowerCase();
  const isVideo = type.endsWith('_video');
  // Proof-of-address + business documents may be PDFs (statements, certificates).
  if ((type === 'proof_of_address' || type === 'business_document') && base === 'application/pdf') return base;
  const allowed: readonly string[] = isVideo ? VIDEO_MIME_TYPES : IMAGE_MIME_TYPES;
  if (allowed.includes(base)) return base;
  return isVideo ? 'video/webm' : 'image/jpeg';
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
};

// Wrap the blob as a named File with a clean mimeType so the multipart part
// carries a Content-Type the server recognizes (a bare Blob is sent as "blob"
// with whatever raw type it had, codec params and all).
function toUploadFile(file: Blob, type: MediaUploadType): File {
  const mimeType = normalizeMimeType(file.type, type);
  return new File([file], `${type}.${MIME_EXTENSIONS[mimeType]}`, { type: mimeType });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createKYCApi(baseUrl: string, apiKey: string) {
  const base = `${baseUrl}/api/kyc`;
  const headers = baseHeaders(apiKey);

  // JSON request to our own server (verify, status, config). Adds the
  // Authorization + X-SDK-Version headers and a JSON content type when a body
  // is present.
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    return handleResponse<T>(res);
  }

  return {
    /**
     * Start or resume this user's verification session.
     *
     * Safe to call on every open: the server returns the SAME session until it
     * is submitted or expires, keyed on the org's own user reference. Without a
     * `externalUserId` there is nothing to resume by, so each call starts fresh.
     *
     * The returned id is a progress container, not a credential — requests keep
     * authenticating with the API key.
     */
    async startSession(input: {
      externalUserId?: string;
      config?: Record<string, unknown>;
      workflowId?: string;
      /** Persistent device id — the anonymous-mount resume fallback. */
      deviceRef?: string;
      /** The same device block the submission sends, so the dashboard's
       *  in-progress row shows the device and SDK from the moment the SDK
       *  loads rather than after the applicant finishes (2026-09-08). */
      device?: Record<string, unknown>;
    }): Promise<StartSessionResponse> {
      return request('/session/start', { method: 'POST', body: JSON.stringify(input) });
    },

    /**
     * Find a business by name. FREE — no provider charge here or upstream, so
     * the applicant may look as many times as they need.
     */
    /** Registry regions for a country. Empty when it has a single register. */
    async businessRegions(country: string): Promise<{ regions: { code: string; name: string }[] }> {
      return request(`/business/regions?country=${encodeURIComponent(country)}`);
    },

    async businessSearch(params: {
      country: string;
      subdivisionCode?: string;
      query: string;
      limit?: number;
    }): Promise<{ results: { name: string; registrationNumber: string; status?: string }[]; source: string }> {
      const qs = new URLSearchParams({ country: params.country, query: params.query });
      if (params.subdivisionCode) qs.set('subdivisionCode', params.subdivisionCode);
      if (params.limit) qs.set('limit', String(params.limit));
      return request(`/business/search?${qs.toString()}`);
    },

    /**
     * The registry check for the company they picked. This is the PAID step —
     * it confirms the business exists and brings its officers back, so the key
     * people question becomes "confirm these" rather than "recall these".
     *
     * `checked: false` is a normal outcome, not an error: the organisation
     * could not be charged, so the flow carries on without prefill and the
     * check happens at submission instead.
     */
    async businessSelect(body: {
      sessionId: string;
      country: string;
      subdivisionCode?: string;
      product?: string;
      registrationNumber: string;
      registrationName?: string;
      sandboxOutcome?: string;
    }): Promise<{
      checked: boolean;
      reason?: string;
      found?: boolean;
      charged?: boolean;
      business?: {
        name: string | null;
        registrationNumber: string;
        registrationDate: string | null;
        typeOfEntity: string | null;
        companyStatus: string | null;
        address: string | null;
        email: string | null;
        phone: string | null;
        taxId: string | null;
        vatNumber: string | null;
        natureOfBusiness: string | null;
        city: string | null;
        state: string | null;
        keyPeople: Array<{
          name: string | null;
          designation: string | null;
          roles?: string[] | null;
          ownershipPct?: number | null;
          email?: string | null;
          isCorporate?: boolean | null;
          registrationNumber?: string | null;
        }>;
      } | null;
    }> {
      return request('/business/select', { method: 'POST', body: JSON.stringify(body) });
    },

    /**
     * Save where the user has got to. Best-effort by contract — losing a save
     * costs the user some re-typing on resume, and must never interrupt them now.
     */
    async saveProgress(sessionId: string, progress: unknown): Promise<void> {
      await request(`/session/${encodeURIComponent(sessionId)}/progress`, {
        method: 'PUT',
        body: JSON.stringify(progress),
      });
    },

    // Single multipart upload: the file bytes are POSTed to our server, which
    // stores them in R2 and returns the mediaId referenced later by /verify.
    async upload(file: Blob, type: MediaUploadType): Promise<string> {
      const form = new FormData();
      // Send a named File with a normalized mimeType (codec params stripped) so
      // the multipart part's Content-Type matches the server's allowlist.
      form.append('file', toUploadFile(file, type));
      form.append('type', type);

      // Don't set Content-Type — the browser adds the multipart boundary itself.
      // The per-install id rides every upload (Device Intelligence; omitted
      // when the workflow turns it off or storage holds no id).
      const res = await fetch(`${base}/upload`, {
        method: 'POST',
        headers: { ...headers, ...uploadDeviceIdHeader() },
        body: form,
      });
      const { mediaId } = await handleResponse<UploadResponse>(res);
      return mediaId;
    },

    /**
     * Save a signature drawn on screen. The server draws the image from the
     * strokes and stores it as a supporting document; returns its mediaId.
     */
    async uploadSignature(drawing: SignatureDrawing): Promise<string> {
      const res = await fetch(`${base}/upload/signature`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', ...uploadDeviceIdHeader() },
        body: JSON.stringify(compactDrawing(drawing)),
      });
      const { mediaId } = await handleResponse<UploadResponse>(res);
      return mediaId;
    },

    /**
     * Ask whether an uploaded document photo can be read (a face on the printed
     * photo, a barcode that decodes), so the applicant can retake it before
     * submitting. Resolves null on any failure and after `timeoutMs`: the check
     * is a courtesy and must never hold the flow up.
     */
    async checkDocumentCapture(
      body: DocumentCaptureCheckRequest,
      timeoutMs = 8000,
    ): Promise<DocumentCaptureCheckResponse | null> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await request<DocumentCaptureCheckResponse>('/document-capture/check', {
          method: 'POST',
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    },

    async verify(body: VerifyRequest): Promise<VerifyResponse> {
      return request<VerifyResponse>('/verify', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },

    // ── Contact verification (email/phone OTP) ──────────────────────────────

    /** Send an OTP to an email address or phone number. */
    async contactSend(body: {
      channel: 'email' | 'phone';
      destination: string;
      /** ISO-2 default country for national phone formats (the flow's country). */
      country?: string;
      /** Phone delivery channel preference (default sms). */
      via?: 'sms' | 'whatsapp';
      /** Org-configured code length (server clamps 4–8). */
      codeLength?: number;
      /** Org-configured attempt budget (server clamps 1–5). */
      maxAttempts?: number;
    }): Promise<{ challengeId: string; expiresAt: string; deliveryChannel: string }> {
      return request('/contact/send', { method: 'POST', body: JSON.stringify(body) });
    },

    /** Check the typed code — returns the single-use proof token for /verify. */
    async contactCheck(body: {
      challengeId: string;
      code: string;
      /**
       * The attempt this belongs to. A component bills when its check COMPLETES,
       * which is here — the server confirms the id is the caller's own before any
       * money moves, and falls back to charging at submit without it.
       */
      sessionId?: string;
      /** What the flow is verifying, for the price lookup. */
      country?: string;
    }): Promise<{ verified: boolean; token: string }> {
      return request('/contact/check', { method: 'POST', body: JSON.stringify(body) });
    },

    // Minimal, publishable-safe status (no PII). The full result lives behind a
    // secret-key-only endpoint and must be fetched from your backend.
    async status(verificationId: string): Promise<VerificationStatusResponse> {
      return request<VerificationStatusResponse>(`/status/${verificationId}`);
    },

    async config(): Promise<SdkConfigResponse> {
      return request<SdkConfigResponse>('/config');
    },

    /**
     * Forward address search for the address step's search box. Explicit
     * submit only — never call per keystroke (the server's map source forbids
     * autocomplete). 404 when the platform has no geocoder configured.
     */
    async addressSearch(query: string, country?: string | null): Promise<{ results: AddressSearchHit[] }> {
      const params = new URLSearchParams({ q: query });
      if (country) params.set('country', country);
      return request<{ results: AddressSearchHit[] }>(`/address/search?${params}`);
    },

    /** The street line for a pin ("11 Bassey Street"), for the summary card
     *  after Use-my-location or a drag. Display only. */
    async addressReverse(lat: number, lng: number): Promise<AddressReverseResult> {
      return request<AddressReverseResult>(
        `/address/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
      );
    },

    /**
     * The exact framed Street View image for the review thumbnail, fetched
     * through the server (which holds the key) — the embedded-mount fallback
     * for what hosted pages render client-side. Null on any failure: the
     * review page simply shows no thumbnail, never an error.
     */
    /**
     * The pinned location as a PICTURE, for the review card.
     *
     * A confirmation screen wants a photograph of the place, not a second
     * instrument: a live map there invites a drag that goes nowhere. Returned
     * as a Blob because a browser <img> cannot send an Authorization header;
     * hosted pages holding a browser key build the URL themselves instead.
     */
    async addressStaticMap(view: {
      lat: number;
      lng: number;
      zoom?: number;
      width?: number;
      height?: number;
    }): Promise<Blob | null> {
      try {
        const params = new URLSearchParams({
          lat: String(view.lat),
          lng: String(view.lng),
          zoom: String(view.zoom ?? 16),
          width: String(Math.round(view.width ?? 640)),
          height: String(Math.round(view.height ?? 360)),
        });
        const res = await fetch(`${base}/address/static-map?${params}`, { headers });
        return res.ok ? await res.blob() : null;
      } catch {
        return null;
      }
    },

    async addressStreetViewPreview(frame: {
      panoId: string;
      heading: number;
      pitch: number;
      fov: number;
    }): Promise<Blob | null> {
      try {
        const params = new URLSearchParams({
          panoId: frame.panoId,
          heading: String(frame.heading),
          pitch: String(frame.pitch),
          fov: String(frame.fov),
        });
        const res = await fetch(`${base}/address/street-view-preview?${params}`, { headers });
        return res.ok ? await res.blob() : null;
      } catch {
        return null;
      }
    },

    /** Places-backed as-you-type suggestions (debounce client-side; one
     *  session token per typing session — it is the billing unit). */
    async addressAutocomplete(
      query: string,
      session: string,
      country?: string | null,
      near?: { lat: number; lng: number } | null,
    ): Promise<{ suggestions: PlaceSuggestion[] }> {
      const params = new URLSearchParams({ q: query, session });
      if (country) params.set('country', country);
      // The device fix — a ranking bias so nearby streets come first.
      if (near) {
        params.set('lat', String(near.lat));
        params.set('lng', String(near.lng));
      }
      return request<{ suggestions: PlaceSuggestion[] }>(`/address/autocomplete?${params}`);
    },

    /** Resolve a picked suggestion to coordinates + structured pieces. */
    async addressPlace(placeId: string, session: string): Promise<{ place: ResolvedPlace }> {
      const params = new URLSearchParams({ session });
      return request<{ place: ResolvedPlace }>(`/address/place/${encodeURIComponent(placeId)}?${params}`);
    },

    /**
     * Resolve a published Workflow (dashboard-built configuration + decisioning template).
     * 404s when the flow is unknown to this key's org/environment or not
     * published.
     */
    async workflow(workflowId: string): Promise<WorkflowResolutionResponse> {
      return request<WorkflowResolutionResponse>(`/workflows/${encodeURIComponent(workflowId)}`);
    },

    // ── Device handoff (continue-on-phone) ──────────────────────────────────

    /** Desktop: mint a handoff session from a PII-free config snapshot. */
    /**
     * `parentSessionId` ties the phone's session to the attempt that minted it.
     * It describes the relationship only: the server keeps it out of the
     * stored snapshot.
     */
    async createHandoffSession(
      snapshot: HandoffSessionSnapshot,
      parentSessionId?: string,
    ): Promise<CreateHandoffSessionResponse> {
      return request<CreateHandoffSessionResponse>('/session', {
        method: 'POST',
        body: JSON.stringify(parentSessionId ? { ...snapshot, parentSessionId } : snapshot),
      });
    },

    /** Desktop: poll a handoff session's lifecycle status. */
    async getHandoffSession(sessionId: string): Promise<HandoffSessionStatusResponse> {
      return request<HandoffSessionStatusResponse>(`/session/${sessionId}`);
    },

    /**
     * Desktop: give the handoff back before verifying here instead.
     *
     * Minting the QR moves the flow's one-verification budget to the phone's
     * session. Walking away from the gate without returning it leaves this
     * device holding a session that no longer owns the budget, and the next
     * upload is refused with "this verification was continued on another
     * device" - several steps later, with nothing to connect it to the QR.
     */
    async cancelHandoffSession(sessionId: string): Promise<{ cancelled: boolean }> {
      return request<{ cancelled: boolean }>(`/session/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
    },

    /** Phone: bootstrap the hosted flow from the session token (public route). */
    async bootstrapHandoff(token: string): Promise<HandoffBootstrapResponse> {
      return request<HandoffBootstrapResponse>(`/session/by-token/${token}/bootstrap`);
    },

    /** A finished session, for the applicant returning to their own link. */
    async completedSession(token: string): Promise<CompletedSessionSummary> {
      return request<CompletedSessionSummary>(`/session/by-token/${token}/summary`);
    },

    /** The same summary for EMBEDDED mounts, which hold a sessionId and an API
     *  key but never the `hs_` token. Same body as `completedSession`, so a
     *  hosted and an embedded success screen cannot tell different stories
     *  about one application. */
    async sessionSummary(sessionId: string): Promise<CompletedSessionSummary> {
      return request<CompletedSessionSummary>(`/session/${sessionId}/summary`);
    },
  };
}

export type KYCApi = ReturnType<typeof createKYCApi>;
