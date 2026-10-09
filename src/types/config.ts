import type { ResubmitConfig } from '../lib/resubmit';
import type { ButtonHTMLAttributes } from 'react';
import type { SdkTrustAttribution } from '../services/api';
import type { WorkflowTexts } from '../i18n/types';

import type { KYCSubmission, KYCError, KYCResult } from './verification';

// ---------------------------------------------------------------------------
// Supported countries & ID types
// ---------------------------------------------------------------------------

/** The curated countries with LOCAL ID-type definitions (labels, digits/pattern
 *  validation). Kept for compile-time ergonomics — autocomplete and per-country
 *  `idTypes` narrowing. */
export type SupportedCountry = 'NG' | 'GH' | 'KE' | 'ZA' | 'CI';

/**
 * Any ISO-2 country code. Individual KYC is no longer limited to the curated
 * five — the server verifies generic document types (`passport`,
 * `drivers-license`, `national-id`) in any country via Document Intelligence,
 * and supplies the display metadata (label, capture requirements, scan sides)
 * in its idTypes payload. The `(string & {})` keeps the curated literals in
 * autocomplete while still accepting any code.
 */
export type AnyCountry = SupportedCountry | (string & {});

export type NigeriaIdType = 'bvn' | 'bvn-premium' | 'nin' | 'vnin' | 'tax-id' | 'passport' | 'drivers-license' | 'pvc';
export type GhanaIdType = 'ghana-card' | 'voters' | 'drivers-license' | 'ssnit' | 'passport';
export type KenyaIdType = 'national-id' | 'passport';
export type SouthAfricaIdType = 'national-id';
export type IvoryCoastIdType = 'cni' | 'residence-card';

export type IdType =
  | NigeriaIdType
  | GhanaIdType
  | KenyaIdType
  | SouthAfricaIdType
  | IvoryCoastIdType;

/** Any ID-type key — curated literals stay in autocomplete, but server-defined
 *  keys (Global Documents) are accepted too. */
export type AnyIdType = IdType | (string & {});

/** Maps a country code to the ID types available in that country. Unknown
 *  (non-curated) countries fall back to `string` — their ID types are defined
 *  server-side, not in the local catalogue. */
export type IdTypeForCountry<C extends AnyCountry> =
  C extends 'NG' ? NigeriaIdType :
  C extends 'GH' ? GhanaIdType :
  C extends 'KE' ? KenyaIdType :
  C extends 'ZA' ? SouthAfricaIdType :
  C extends 'CI' ? IvoryCoastIdType :
  string;

export interface IdTypeDefinition {
  key: AnyIdType;
  label: string;
  /**
   * What the user actually types when it differs from the ID's name — e.g.
   * Tax ID lookups are keyed off the person's NIN, so the input asks for a NIN.
   */
  inputLabel?: string;
  digits?: number;
  pattern?: RegExp;
  /** Whether this ID type requires the user to photograph/upload a physical document. */
  requiresDocumentCapture: boolean;
  /**
   * How many sides of the document need to be scanned.
   * Only present when requiresDocumentCapture is true.
   * 'front_only' — single scan (passports, data-page only)
   * 'front_and_back' — both sides required (cards with info split across sides)
   */
  scanSides?: 'front_only' | 'front_and_back';
}

export type IdTypesByCountry = {
  [K in SupportedCountry]: readonly IdTypeDefinition[];
};

// ---------------------------------------------------------------------------
// KYC flow steps
// ---------------------------------------------------------------------------

export type KYCStep =
  | 'consent'
  // Contact-verification OTP steps — right after consent (cheap pre-filter
  // before document/liveness spend). Present when the workflow/props enable them.
  | 'email-verification'
  | 'phone-verification'
  | 'country-select'
  | 'id-type'
  | 'id-input'
  | 'document-capture'
  // eMRTD chip read — native (mobile) SDKs only; the web SDK never puts it in
  // the step order (Web NFC can't do ISO-DEP) but renders its screen for the
  // builder preview, where it stands in for the visually-identical mobile UI.
  | 'nfc'
  | 'business-details'
  // KYB application steps — present only when the workflow configures them.
  | 'business-key-people'
  | 'business-documents'
  | 'applicant-role'
  | 'liveness'
  | 'proof-of-address'
  // Artefacts the org holds ON FILE, not the identity evidence the
  // verification is decided on. The org names each one it asks for.
  | 'supporting-documents'
  // Address Intelligence, as real steps (progress bar advances through them).
  // 'address-collection' is the PIN step and keeps the original wire name for
  // session-progress and step-log compatibility; search/entrance/review exist
  // only on individual flows (KYB keeps the single premises step).
  | 'address-search'
  | 'address-collection'
  | 'address-entrance'
  | 'address-review'
  | 'questionnaire'
  | 'submitted';

/** How flow progress is drawn — see {@link KYCConfig.progressStyle}. */
export type ProgressStyle = 'steps' | 'bar' | 'none';

// ---------------------------------------------------------------------------
// Proof of Address (utility bill / bank statement / tenancy document)
// ---------------------------------------------------------------------------

export type PoaDocumentType =
  | 'utility_bill'
  | 'bank_statement'
  | 'tenancy_agreement'
  | 'government_document'
  | 'other';

/**
 * Whether the applicant's name must appear on the proof-of-address document.
 * The SERVER judges this; the SDK only reads it to word the step honestly
 * (a rule of `off` asks for a document that shows the address, not the name).
 */
export type PoaNameRule = 'required' | 'optional' | 'off';

export interface ProofOfAddressConfig {
  /** Adds the Proof of Address step (after capture, before the questionnaire). */
  enabled?: boolean;
  /** Countries the org accepts addresses from — what the address scope's
   *  declared-country picker offers (absent/empty = every country). */
  countries?: string[];
  /** Accepted document kinds (absent = all). */
  documentTypes?: PoaDocumentType[];
  /** Per-country narrowing of the accepted kinds (ISO-2 key). A present entry
   *  REPLACES `documentTypes` for that country; absent = the global set. */
  countryDocuments?: Record<string, PoaDocumentType[]>;
  /** Custom label shown for the 'other' document kind (absent = "Other document"). */
  otherLabel?: string;
  /** Recency window the server checks the document date against (default 90). */
  maxAgeDays?: number;
  /** The default name rule for every country and kind (absent = required). */
  nameMatch?: PoaNameRule;
  /** Per-country, per-kind exceptions to `nameMatch` (ISO-2 → kind → rule). */
  countryNameMatch?: Record<string, Partial<Record<PoaDocumentType, PoaNameRule>>>;
}

// ---------------------------------------------------------------------------
// Address Intelligence (smart-address capture + corroboration)
// ---------------------------------------------------------------------------

/**
 * One requested supporting document. There is no catalogue: the organisation
 * names its own, so the SDK renders the title and guidance the workflow sent.
 */
export interface SupportingDocumentRequest {
  /** The organisation's own slug — the wire `type` this upload submits as. */
  key: string;
  /** The title the applicant reads. A document without one is not asked for. */
  label?: string;
  /** Guidance under the slot: which document, and what it has to show. */
  description?: string;
  /**
   * Server-side only: what the document is corroborated against once it is
   * uploaded. The SDK never evaluates a document.
   */
  checks?: Array<'id_number' | 'name'>;
  /**
   * The named values the server will read off it. The SDK reads the NAMES
   * alone, to tell the applicant what the document is being taken for; the
   * reading itself is entirely server-side.
   */
  fields?: Array<{ key: string; label?: string }>;
  required?: boolean;
  /**
   * Which verified IDs this document is asked for, as `"CC/idType"` composites
   * (e.g. `["NG/nin"]`). Absent/empty = every ID the flow offers.
   */
  idTypes?: string[];
  /**
   * Offer it on every flow, whatever ID was verified, so `idTypes` decides only
   * who MUST provide it rather than who sees the slot. Absent = the scope hides
   * it from everybody else, which is the default.
   */
  alwaysAsk?: boolean;
  /**
   * How it is provided: a file (`upload`, the default), a signature drawn on
   * screen (`draw`), or either (`draw_or_upload`).
   */
  capture?: 'upload' | 'draw' | 'draw_or_upload';
}

export interface SupportingDocumentsConfig {
  enabled?: boolean;
  types?: SupportingDocumentRequest[];
  /** Server-side only: how long the collected files are kept. */
  retentionDays?: number;
  /** Server-side only: the delivery allowlist for the per-document verdicts. */
  returnedData?: string[];
}

export interface AddressCollectionConfig {
  /** Adds the address-collection step (after Proof of Address, before the questionnaire). */
  enabled?: boolean;
  /** Block Continue without a confirmed pin (the server 422s without one too). */
  requirePin?: boolean;
  /** Whether the door-photo input is offered/required (default optional). */
  photo?: 'off' | 'optional' | 'required';
  /** Whether the directions field is offered/required (default optional). */
  directions?: 'off' | 'optional' | 'required';
  /**
   * The typed property fields — "Building or compound name" + "House or flat
   * number" (default 'optional': shown, skippable). 'required' (user decision
   * 2026-09-03) = the house/flat NUMBER must be given; the building name
   * stays optional within the pair.
   */
  propertyFields?: 'off' | 'optional' | 'required';
  /**
   * Per-field modes for the typed details-sheet fields (the KYB companyInfo
   * model). Absent field = the propertyFields group default. Server mirror:
   * kyc-core lib/workflows/address-fields.ts — keep in lockstep. For a
   * required field the applicant left untouched, the SDK submits the
   * DISPLAYED map prefill (they saw and confirmed it by continuing).
   */
  fields?: Partial<
    Record<
      | 'propertyName'
      | 'propertyNumber'
      | 'street'
      | 'unit'
      | 'neighbourhood'
      | 'city'
      | 'state'
      | 'postcode',
      'off' | 'optional' | 'required'
    >
  >;
  /**
   * Street View entrance framing (default 'optional' — ON wherever coverage
   * exists; 'off' opts out): the applicant pans a Google Street View panorama
   * to frame their entrance and the SERVER fetches the framed image —
   * provenance-honest, never mixed with the first-party photo, which stays the
   * fallback. 'required' (user decision 2026-09-03) removes the skip
   * affordance while coverage exists — a CLIENT-UX gate only, because
   * coverage is not guaranteed anywhere and no-coverage still falls back to
   * the photo. Renders on hosted pages (in-document key) and embedded mounts
   * (the framed /embed/street-view page).
   */
  streetView?: 'off' | 'optional' | 'required';
  /**
   * Take a one-shot device GPS fix when the pin is confirmed, so the server
   * can judge "captured at the claimed address" (the `attested` tier). The fix
   * is a CLAIM the server evaluates, never a verdict.
   */
  attestPresence?: boolean;
  /**
   * Presence verification (mobile SDKs report; the web SDK reads this only to
   * set expectations: the consent notice on the step and the success-screen
   * bullets saying the address will be confirmed over the coming days).
   */
  presence?: {
    enabled?: boolean;
    /**
     * The org opts into OS geofencing on the mobile SDKs. The web SDK runs no
     * background tier itself; the flag reaches it so the intro screen (also
     * the builder preview's stand-in for the mobile one) can say, once and up
     * front, that an "allow all the time" prompt is coming.
     */
    background?: boolean;
  };
}

// ---------------------------------------------------------------------------
// NFC Chip Verification (eMRTD chip read — mobile SDKs; web = preview stand-in)
// ---------------------------------------------------------------------------

export interface NfcConfig {
  /** Adds the chip-read step (native SDKs; the web SDK renders it for preview only). */
  enabled?: boolean;
  /** Which chip-capable IDs run the step, as "CC/idType" keys (absent = all). */
  idTypes?: string[];
  /**
   * Show a manual "skip" affordance so a user without an NFC-capable device
   * (or who can't complete the read) can proceed. Devices with no NFC radio
   * auto-skip regardless — this is the escape hatch on NFC-capable phones.
   */
  allowSkip?: boolean;
}

// ---------------------------------------------------------------------------
// Contact verification (email / phone OTP possession checks)
// ---------------------------------------------------------------------------

/** Which code field the SDK renders — the org picks this in the builder. */
export type OtpInputStyle = 'segmented' | 'text';

export interface EmailVerificationConfig {
  /** Adds the email OTP step (right after consent). */
  enabled?: boolean;
  /**
   * Whether a verified email is required to proceed (default true when
   * enabled). `false` shows a "skip for now" affordance and the server accepts
   * a submission without the proof.
   */
  required?: boolean;
  /** Number of digits in the code (4–8; default 6). Drives the OTP-input slots. */
  codeLength?: number;
  /** Wrong-code entries allowed per code before it's dead (1–5; default 3). */
  maxAttempts?: number;
  /** Code field style: 'segmented' boxes (default) or a plain 'text' input. */
  inputStyle?: OtpInputStyle;
}

export interface PhoneVerificationConfig {
  /** Adds the phone OTP step (right after consent / email verification). */
  enabled?: boolean;
  /** Required to proceed (default true when enabled); `false` adds a skip. */
  required?: boolean;
  /** Number of digits in the code (4–8; default 6). Drives the OTP-input slots. */
  codeLength?: number;
  /** Wrong-code entries allowed per code before it's dead (1–5; default 3). */
  maxAttempts?: number;
  /** Code field style: 'segmented' boxes (default) or a plain 'text' input. */
  inputStyle?: OtpInputStyle;
  /** Offered delivery channels (default ['sms']). */
  channels?: Array<'sms' | 'whatsapp'>;
  /** Default dial-code country for the phone input (falls back to the flow's country). */
  defaultCountry?: string;
}

// ---------------------------------------------------------------------------
// Extra-info questionnaire (compliance declarations)
// ---------------------------------------------------------------------------

export interface QuestionnaireFieldOption {
  value: string;
  label: string;
  /**
   * Marks a choice that is not an answer on its own — an "Other". Selecting it
   * reveals a required free-text input, stored as the `<key>_other` companion
   * answer (the same shape as a money field's `<key>_currency`).
   */
  requiresDetail?: boolean;
  /** Label for the detail input (default "Please specify"). */
  detailLabel?: string;
  /** Placeholder for the detail input (default `Tell us more about "<label>"`). */
  detailPlaceholder?: string;
}

export interface QuestionnaireField {
  /** Stable snake_case key — also the webhook/decisioning field name. */
  key: string;
  label: string;
  /**
   * 'money' = amount + currency. The answer stores `<key>` (number, 2dp) and
   * a `<key>_currency` companion (ISO code).
   */
  type: 'text' | 'number' | 'money' | 'select' | 'multiselect' | 'boolean' | 'date';
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: QuestionnaireFieldOption[];
  min?: number;
  max?: number;
  /** money only: allowed ISO currency codes; the first is the default. */
  currencies?: string[];
}

export interface QuestionnaireConfig {
  /** Off switch for the step. Omitted/true = shown; false = skipped even though
   *  the questions remain configured (the builder's Questionnaire toggle). */
  enabled?: boolean;
  title?: string;
  description?: string;
  fields: QuestionnaireField[];
}

export type QuestionnaireAnswerValue = string | number | boolean | string[];

// ---------------------------------------------------------------------------
// Appearance / theming
// ---------------------------------------------------------------------------

export interface KYCAppearance {
  /** Brand color — drives buttons, selected states, focus rings (`--primary`/`--ring`). */
  primaryColor?: string;
  /** Text/icon color rendered on top of `primaryColor` (e.g. button labels) (`--primary-foreground`). */
  primaryTextColor?: string;
  /** Accent color for subtle hover/active surfaces (`--accent`). */
  accentColor?: string;
  /** Modal background color (`--background`). */
  backgroundColor?: string;
  /** Elevated surface color for cards/panels (`--secondary` + `--muted`). */
  surfaceColor?: string;
  /** Border + input outline color (`--border` + `--input`). */
  borderColor?: string;
  /** The dimmed backdrop behind the modal (any CSS colour, alpha included). */
  overlayColor?: string;
  /** Primary text color (`--foreground`). */
  textColor?: string;
  companyName?: string;
  /**
   * Logo to show in the flow.
   * - An image URL renders that logo.
   * - The literal `'default'` renders the org's own logo from the server config
   *   response (falls back to the built-in shield if the org has none set).
   * - Omitted renders the built-in shield badge.
   */
  logo?: string;
  /**
   * Corner radius in px for buttons, inputs and cards — the whole radius ladder
   * scales proportionally from it, so `0` squares the SDK off and `20` softens
   * it. Clamped to 0–32. Circular elements (avatars, the camera oval, the
   * liveness ring) are never affected. Defaults to 12.
   */
  borderRadius?: number;
  /**
   * Body font-family, e.g. `"Inter"` or `"Inter, Helvetica"`.
   *
   * A Google Font name (e.g. `"Inter"`) is LOADED for you — the SDK injects the
   * stylesheet, so allow `fonts.googleapis.com` / `fonts.gstatic.com` if you run
   * a strict CSP. Any other family is applied but not fetched, which is what you
   * want for a font you already self-host. Either way it falls back through
   * `system-ui` if it can't resolve.
   */
  fontFamily?: string;
  /** Heading font-family. Falls back to {@link fontFamily} when only that is set. */
  headingFontFamily?: string;
  /**
   * Colour overrides applied only in DARK mode.
   *
   * The base colours above are the light palette. Without this block a branded
   * flow keeps its light background after the user toggles to dark — these
   * tokens are set as inline custom properties, which outrank the SDK's own
   * `.dark` rules. Only the colour keys are read; `theme`, `logo` and the
   * typography fields are ignored here.
   */
  dark?: Pick<
    KYCAppearance,
    | 'primaryColor'
    | 'primaryTextColor'
    | 'accentColor'
    | 'backgroundColor'
    | 'surfaceColor'
    | 'borderColor'
    | 'overlayColor'
    | 'textColor'
  >;
  /** Initial mode. 'system' follows the device's prefers-color-scheme (live);
   *  applied on mount; the theme toggle can flip it. */
  theme?: 'light' | 'dark' | 'system';
}

// ---------------------------------------------------------------------------
// Consent screen content
// ---------------------------------------------------------------------------

export interface KYCConsentContent {
  /**
   * Heading on the consent (welcome) screen. Supports `{firstName}` /
   * `{lastName}` tokens (from `userData`) and, for KYB flows, `{businessName}`
   * (from `userData.businessName` — the business details aren't collected until
   * after consent). Absent values resolve to an empty string. Defaults to
   * `Welcome, {firstName}` when a first name is known, otherwise
   * `Identity Verification`.
   */
  title?: string;
  /**
   * Sub-text under the heading. Supports the same `{firstName}` / `{lastName}` /
   * `{businessName}` tokens. Defaults to the built-in regulatory copy.
   */
  description?: string;
}

// ---------------------------------------------------------------------------
// Success (submitted) screen content
// ---------------------------------------------------------------------------

export interface KYCSuccessContent {
  /**
   * Heading on the success screen shown after a verification is submitted.
   * Supports `{firstName}` / `{lastName}` tokens (from `userData`) and, for KYB
   * flows, `{businessName}` (the registration name the applicant entered, or
   * `userData.businessName`). Absent values resolve to an empty string. Defaults
   * to `Verification Submitted!`.
   */
  title?: string;
  /**
   * Sub-text under the heading. Supports the same `{firstName}` / `{lastName}` /
   * `{businessName}` tokens. Defaults to the built-in "submitted for review" copy.
   */
  description?: string;
  /**
   * Where the HOSTED flow sends the user after submission. On a hosted link
   * there is no host page to close back to, so the terminal button becomes
   * "Continue" and navigates here; without it the hosted flow ends on a
   * "you can close this tab" line. Must be an http(s) URL (validated at
   * publish). Ignored on embedded SDK mounts — they keep Done → `onClose`.
   */
  redirectUrl?: string;
  /**
   * Label for the redirect button (default `Continue`). Only applies when
   * {@link redirectUrl} is set — with no redirect there is no button to label.
   * Keep it short: it renders as a button, so a long label wraps on a phone.
   */
  redirectLabel?: string;
}

// ---------------------------------------------------------------------------
// Voice guidance (spoken liveness instructions)
// ---------------------------------------------------------------------------

/**
 * Configuration for the spoken liveness instructions ("nod your head",
 * "blink", …). This is text-to-speech **output** played to the user for
 * accessibility — it never records audio, so no microphone permission is
 * involved.
 *
 * Structured as an object (rather than a bare boolean) so a `language` can be
 * added later without a breaking change — Myaza operates across NG/GH/KE/ZA/CI,
 * and French guidance for CI is a likely future need.
 */
export interface VoiceGuidanceConfig {
  /** Whether spoken guidance plays. Default `true` (on for accessibility). */
  enabled?: boolean;
  /**
   * BCP-47 language tag for the spoken voice (e.g. `'en-US'`, `'fr-FR'`).
   * Defaults to `'en-US'`. Currently selects the TTS voice only; the spoken
   * text still mirrors the on-screen English instruction (localized strings
   * are a planned follow-up).
   */
  language?: string;
}

/**
 * `voiceGuidance` prop value. Accepts a bare boolean for ergonomics
 * (`voiceGuidance={false}`) or the full {@link VoiceGuidanceConfig} object.
 */
export type VoiceGuidanceOption = boolean | VoiceGuidanceConfig;

// ---------------------------------------------------------------------------
// Client-side SDK config  (<MyazaKYC /> props & useMyazaKYC options)
// ---------------------------------------------------------------------------

export interface MyazaKYCConfig<C extends AnyCountry = AnyCountry> {
  /**
   * Bearer token sent as the Authorization header. The key prefix is the single
   * source of truth for the environment — the SDK derives it (and the base URL)
   * automatically: `pk_dev_…` → development, `pk_test_…` → sandbox,
   * `pk_live_…` → production. An unrecognized prefix throws.
   */
  apiKey: string;

  /**
   * Dev-only base-URL override. Only applied for **development** keys
   * (`pk_dev_…`); defaults to `http://localhost:3001`. Ignored for sandbox /
   * production keys.
   */
  devUrl?: string;

  /**
   * Run the SDK from a **published Workflow** built in the Myaza
   * dashboard (`wf_…`). The SDK fetches the workflow’s configuration from the
   * server and uses it as the source of truth: **workflow config wins over any
   * overlapping props** (country, idTypes, step toggles, appearance, copy).
   * Runtime data — `userId`, `userData`, `metadata`, callbacks — always comes
   * from your code. With a `workflowId`, `country` becomes optional.
   *
   * An unknown/unpublished flow surfaces as a blocking `invalid_workflow` error
   * (via {@link onError} and the modal), never a silently different flow.
   */
  workflowId?: string;

  /**
   * Two-letter (ISO-2) country code. Required unless {@link workflowId} is set
   * (the flow carries the country) or {@link subjectType} is `'business'` (the
   * business block carries its own registry country). When both are present the
   * flow's country wins. ANY ISO country works — non-curated countries render
   * their ID types from the server's metadata (Global Documents); the org's
   * grants are enforced server-side.
   */
  country?: C;

  /**
   * What the flow verifies: an individual (KYC — the default) or a business
   * (KYB registry lookup). Normally supplied by a resolved workflow, not
   * hand-written: **live business submissions require a published KYB
   * workflow** (the server rejects them otherwise). Setting it as a prop is
   * supported for the dashboard builder's live preview (`previewMode`), where
   * submissions are mocked.
   */
  subjectType?: import('./business').SubjectType;

  /**
   * Workflow SCOPE — what this flow verifies about the subject (absent = the
   * full verification): 'address' (the smart-address capture is the whole
   * flow), 'biometric-authentication' / 'biometric-enrollment' (a liveness
   * selfie against / into the biometric template), 'questionnaire'
   * (declarations only) or 'contact' (email/phone possession checks only).
   * Normally rides a resolved workflow config; the server requires a
   * published workflow of the matching scope for the submission.
   */
  scope?: import('../lib/scope').WorkflowScope;

  /**
   * Business (KYB) subject configuration — the registry country, offered
   * products, and whether the registered business name is required. Like
   * {@link subjectType}, this normally rides a resolved workflow config.
   */
  business?: import('./business').WorkflowBusinessConfig;

  /**
   * Multi-region configuration. When more than one country is listed the flow
   * opens with a country-select step; the picked country's `idTypes` override
   * the root {@link idTypes} list. `country` acts as the default/primary.
   * Typically supplied by a dashboard-built Workflow rather than hand-written.
   */
  countries?: Array<{
    country: AnyCountry;
    idTypes?: AnyIdType[];
    /** Multi-ID: which of this country's IDs each verification may offer. */
    multiIdSlots?: Array<{ idTypes?: string[] }>;
  }>;

  /** Subset of ID types to offer. Only types valid for the given country are accepted. */
  idTypes?: IdTypeForCountry<C>[];

  /**
   * Multi-ID verification: the applicant verifies `count` IDs in one run, with
   * one selfie shared across all of them and ONE submission the server judges
   * by the pass policy (`minPassed` of `count`). This is the POLICY; WHICH IDs
   * each verification offers is per country (`countries[].multiIdSlots`), so
   * multi-region flows work — the applicant picks their country first, then
   * walks that country's slots. Normally supplied by a workflow.
   */
  multiId?: { count: number; minPassed: number };

  /**
   * The org's own reference for the person being verified (e.g. your internal
   * user id). It is **not** matched during verification — it becomes
   * `Entity.externalUserId` at the KYC seam, so repeat checks of the same user
   * collapse onto one entity and you can correlate results back to your record.
   * Optional; when omitted the server falls back to the provider record id.
   */
  userId?: string;

  /** Pre-populated user data. Fields provided here won't be collected again. */
  userData?: {
    firstName?: string;
    lastName?: string;
    dateOfBirth?: string;
    /**
     * The name of the business being verified (KYB flows). Only used to fill the
     * `{businessName}` token in consent/success copy when known upfront — it is
     * NOT collected from the user (the registry lookup is the source of truth).
     */
    businessName?: string;
    /**
     * The applicant's email, when you already hold it. Not asked for in the flow:
     * it is submitted so your organisation can have the applicant emailed about a
     * decision, for example once their verification is approved.
     */
    email?: string;
  };

  /**
   * What is already known about the COMPANY (KYB flows).
   *
   * The business counterpart to `userData`: it seeds the details step so an
   * applicant minted a link for a named company does not retype what the org
   * already holds. PREFILL, never assertion, so every value stays editable and
   * the registry lookup remains the source of truth.
   */
  businessPrefill?: {
    /** The register the company is on, so the applicant does not pick it. */
    country?: string;
    registrationNumber?: string;
    registrationName?: string;
  };

  /** Enable the live-selfie capture step */
  enableSelfie?: boolean;

  /** Enable the document-photo capture step */
  enableDocumentCapture?: boolean;

  /**
   * Allow picking a document photo from the device (gallery / file picker /
   * drag-and-drop) as an alternative to the live camera capture. Default `true`.
   * When `false`, all "upload a photo instead" affordances are hidden and the
   * user must capture with the camera.
   */
  allowDocumentUpload?: boolean;

  /**
   * Allow scanning the document live with the camera (viewfinder with
   * auto-capture). Default `true`. When `false`, document capture is upload
   * only: the step never opens the camera and the user uploads a photo of each
   * side instead. At least one of `allowDocumentScan` and `allowDocumentUpload`
   * must stay on; if both are `false`, the camera stays on.
   */
  allowDocumentScan?: boolean;

  /** Enable liveness detection during selfie capture (default: true) */
  enableLiveness?: boolean;

  /**
   * Spoken liveness instructions (accessibility). `true`/omitted = on,
   * `false` = off, or a {@link VoiceGuidanceConfig} for finer control
   * (e.g. `{ enabled: true, language: 'fr-FR' }`). TTS output only — no
   * microphone is used. Default: on.
   */
  voiceGuidance?: VoiceGuidanceOption;

  /**
   * How Presence Intelligence verifies liveness when the selfie step runs:
   * `'gestures'` (default) — randomized gesture challenges; `'flash'` — the
   * screen emits a random color sequence and the face's reflection is verified
   * (fast, hold-still, defeats replays/injection); `'both'` — gestures then
   * flash (strongest). Usually configured in the workflow builder.
   */
  livenessMode?: 'gestures' | 'flash' | 'both' | 'passive';
  /** Flash-liveness sequence length (colours) for `flash`/`both`. 2–5, default 4. */
  flashSequenceLength?: number;
  /**
   * Bright screen during the selfie: while the liveness camera is on, the flow
   * switches to its LIGHT palette so the display lights the person's face, then
   * restores the previous theme when the step ends. On by default; only `false`
   * turns it off. Usually configured in the workflow builder.
   */
  livenessBrightScreen?: boolean;
  /** Show the captured selfie, with Retake and Continue, before moving on.
   *  Off unless `true`; the liveness capture otherwise hands straight over. */
  selfieReview?: boolean;

  /**
   * Device Intelligence — device + IP fraud analysis (multi-accounting,
   * emulator, datacenter-IP, velocity). On by default and billed per
   * verification; `false` disables the analysis, its charge, and the SDK's
   * fingerprint collection. Normally set by the workflow builder.
   */
  deviceIntelligence?: boolean;

  /** Show a light/dark mode toggle button inside the modal header. Default `true`. */
  showThemeToggle?: boolean;

  /**
   * How progress through the flow is drawn in the header.
   *
   *   • `'steps'` — numbered circles, one per step, connected. Shows
   *     WHICH step you are on and how many there are, and collapses to a window
   *     when they no longer fit.
   *   • `'bar'` (default) — a single thin bar pinned to the bottom edge of the header.
   *     Quieter, and unaffected by step count, so it suits long flows and hosts
   *     who would rather the chrome said less.
   *   • `'none'` — no progress in the header at all. For hosts whose own
   *     surface already communicates progress, or short flows where a step
   *     count is more noise than reassurance. The brand row and controls stay;
   *     only the progress element is dropped.
   *
   * `'steps'` and `'bar'` convey the same fraction; the choice is how much room
   * it takes. `'none'` opts out of conveying it here.
   * Usually configured in the workflow builder.
   */
  progressStyle?: ProgressStyle;

  /**
   * Force the flow to render full screen on EVERY device. Desktop drops the
   * centered modal for the fullscreen layout and the expand/collapse button
   * is hidden (mobile is always fullscreen). Default `false`.
   */
  fullScreen?: boolean;

  /**
   * Offer "continue on your phone" device handoff. On **desktop**, before the
   * flow starts, the SDK shows a screen with a QR code + copyable link/code so
   * the user can finish on their phone (useful when the desktop has no webcam),
   * plus a "Continue on this device" CTA. When the phone submits, the desktop
   * auto-advances and fires {@link onSubmit}. Mobile devices skip the screen and
   * start the flow directly. Default `true`; set `false` to disable entirely.
   */
  deviceHandoff?: boolean;

  /**
   * Show the consent (welcome) screen as the flow's first step. Default
   * `true`. Set `false` when your own app has already collected the person's
   * consent, so the flow opens straight on its first real step (the contact
   * codes, the country picker, the ID list, the business form, or a scoped
   * flow's own check). Normally set by a workflow. Switching the screen off
   * does not change what you attest to the verification provider: consent
   * remains your organisation's statement.
   */
  consentStep?: boolean;

  /**
   * Silent capture: up to three unposed photos of the person, taken during
   * document capture only, when the document camera faces them (a laptop
   * webcam; a phone's rear camera sees only the document, so a phone browser
   * takes none). No extra permission prompt, nothing on screen, no delay. A
   * reviewer sees who was holding the ID. Default `true`; set `false` to
   * switch it off. Normally set by a workflow.
   */
  silentCapture?: boolean;

  /**
   * The biometric scopes' flow options (workflow-driven, or passed here on a
   * prop-configured mount): `selfieReview` shows the captured selfie with
   * Retake and Continue before submitting (off by default on both biometric
   * scopes); `resultDelivery` says where a re-authentication's verdict lands,
   * 'both' (the default: the SDK holds the person on one loading screen until
   * the check settles, and the org's webhook receives it too), 'app' (the
   * same wait, but the server sends no webhook for the check) or 'webhook'
   * (fire-and-forget); `doneButton` (default true) hides the final screen's
   * Done when the host app closes the flow itself from `onResult`. A flow key
   * wins per field. See lib/biometric-options.ts.
   */
  biometric?: import('../lib/biometric-options').BiometricFlowConfig;

  /**
   * Mobile-only: refuse to run the flow on a desktop/laptop. The SDK starts
   * only when it can CONFIRM a real handheld device — the check reads hardware
   * signals (GPU renderer, motion sensor, touch), never viewport width, so a
   * desktop browser in responsive/device-emulation mode is rejected too.
   *
   * Desktop visitors get the "continue on your phone" QR screen with the
   * "Continue on this device" option removed (or, when
   * {@link deviceHandoff} is `false`, a plain "use a mobile device" notice).
   * The server independently re-checks the submission and rejects a provable
   * desktop with `mobile_device_required`. Default `false`.
   */
  requireMobileDevice?: boolean;

  /**
   * Hide the close (X) button and block all user-initiated dismissal of the
   * modal — backdrop tap, Escape key, and (on mobile) swipe-down. When `true`,
   * the flow can only be closed programmatically via the `close()` returned by
   * {@link useMyazaKYC}. Default `false`. The terminal "Submitted" step is
   * already non-dismissible regardless of this flag.
   */
  disableClose?: boolean;

  /**
   * Open the verification modal immediately on mount instead of waiting for
   * the trigger button click (the button is not rendered). Used by embedded
   * preview surfaces (e.g. the dashboard flow builder); pairs naturally with
   * `deviceHandoff={false}`. Default `false`.
   */
  defaultOpen?: boolean;

  /**
   * Preview/mock mode (dashboard workflow builder). All WRITES are stubbed in
   * the browser: document photos, selfies, and liveness videos are never
   * uploaded and no verification is ever created — walking the flow is free of
   * side effects. Read-only calls (config, workflow resolution) still hit the
   * server so the preview reflects real grants + branding. Default `false`.
   */
  previewMode?: boolean;

  /**
   * The builder's DRAFT footer attribution, so the preview shows an unpublished
   * "Protected by" logo. Ignored unless `previewMode` is on: a real verification
   * always renders the attribution the server resolved from the published
   * workflow.
   */
  previewTrustAttribution?: SdkTrustAttribution;

  /**
   * Imperatively show a specific step (dashboard workflow builder: clicking a
   * step in the rail jumps the preview there). Prerequisite state (an ID type
   * of the right kind) is seeded automatically so mid-flow steps render.
   * Ignored when unset.
   */
  previewStep?: KYCStep | null;

  /** Visual customisation */
  appearance?: KYCAppearance;

  /** Override the consent (welcome) screen copy. */
  consent?: KYCConsentContent;

  /** Override the success (submitted) screen copy. */
  success?: KYCSuccessContent;

  /**
   * Custom copy for any text the SDK shows, by language then key, e.g.
   * `{ en: { 'common.continue': 'Next' } }`. Keys come from the text catalogue
   * (exported as TEXT_GROUPS). Unset texts keep the SDK default.
   */
  texts?: WorkflowTexts;

  /** The language texts are shown in (BCP-47, e.g. `en`, `fr`). Default `en`. */
  language?: string;

  /**
   * Extra-info questionnaire shown after capture, right before submission —
   * compliance declarations like income, source of funds, expected volume.
   * Usually configured in the dashboard workflow builder (rides `workflowId`);
   * answers are validated server-side against the published definition and
   * delivered in `data.questionnaire` on verification webhooks.
   */
  questionnaire?: QuestionnaireConfig;

  /**
   * A reviewer sent this attempt back to redo specific steps.
   *
   * Never set by a consumer and never part of a published workflow — it is
   * stamped onto ONE session's config snapshot when somebody clicks "Send back",
   * so it arrives through the hosted bootstrap like any other session config.
   * Absent means the ordinary full flow.
   */
  resubmit?: ResubmitConfig;

  /**
   * Email Verification: an in-flow OTP possession check right after consent.
   * The user enters their email, receives a code, and types it in; the
   * verified contact + signals (disposable domain, free provider) are
   * delivered in `data.emailVerification` on verification webhooks and are
   * branchable in workflow decisioning (`email.*`). Usually configured in the
   * workflow builder (rides `workflowId`).
   */
  emailVerification?: EmailVerificationConfig;

  /**
   * Phone Verification: an in-flow OTP possession check (SMS/WhatsApp) right
   * after consent. Delivered in `data.phoneVerification` on webhooks and
   * branchable in decisioning (`phone.*`). Usually configured in the workflow
   * builder (rides `workflowId`).
   */
  phoneVerification?: PhoneVerificationConfig;

  /**
   * Proof of Address: collect a PoA document (utility bill, bank statement,
   * tenancy) after capture. The server reads it (Document AI), checks the name
   * against the verified subject + a recency window, and delivers the result
   * in `data.proofOfAddress` on verification webhooks — it never changes the
   * verification's own status. Usually configured in the workflow builder.
   */
  proofOfAddress?: ProofOfAddressConfig;

  /**
   * Address Intelligence: collect the user's smart address (a map pin,
   * optional door photo and directions). The server corroborates the pin
   * against the government record, the PoA document and the submission IP and
   * delivers the result in `data.addressIntel` on verification webhooks — it
   * never changes the verification's own status. Usually configured in the
   * workflow builder (rides `workflowId`).
   */
  /**
   * Supporting documents: artefacts the org must hold ON FILE, which are NOT
   * the identity evidence the verification is decided on. The person is
   * verified against the government database, and a downstream process still
   * wants a copy of the document itself on record. The org names each one.
   *
   * Each document is checked against the identity already verified and the
   * result rides `data.supportingDocuments` on verification webhooks; it never
   * changes the verification's own status. Which documents are asked for
   * depends on the ID the person verified with. Usually configured in the
   * workflow builder (rides `workflowId`).
   */
  supportingDocuments?: SupportingDocumentsConfig;

  addressCollection?: AddressCollectionConfig;

  /**
   * NFC Chip Verification: read the ID's eMRTD chip (e-passports & chip eIDs)
   * and run passive authentication server-side. Native (mobile) SDKs implement
   * the real chip read; the web SDK renders the screen only for the builder
   * preview (browsers can't do ISO-DEP). Usually configured in the workflow
   * builder (rides `workflowId`).
   */
  nfc?: NfcConfig;

  /**
   * Base path (or absolute URL) where the SDK's gesture GIF assets are served
   * from. These are used by the liveness step to animate each challenge gesture.
   *
   * - Set to an **absolute URL** (e.g. `'https://cdn.example.com/kyc-assets'`)
   *   to serve from a CDN — requires no files in your `public/` folder.
   * - Set to a **relative path** (e.g. `'/kyc-assets'`) to serve locally; copy
   *   the `gifs/` folder from `node_modules/@myazahq/kyc-sdk-react/gifs/` to
   *   that path in your public directory.
   *
   * Defaults to `'/kyc-assets'`.
   */
  assetsBasePath?: string;

  /**
   * Shadow-DOM style isolation (default `true`). The SDK renders inside its
   * own shadow roots carrying its own stylesheet, so your app's CSS cannot
   * restyle the SDK and the SDK's styles cannot leak into your app — no
   * global `styles.css` import needed. Set `false` to mount in the light DOM
   * instead (the pre-2.x behaviour), which requires importing
   * `@myazahq/kyc-sdk-react/styles.css` globally yourself.
   */
  styleIsolation?: boolean;

  /**
   * Arbitrary, free-form metadata forwarded verbatim with every verification
   * request. Nothing here is required or interpreted by the SDK/server — use
   * {@link userId} for the user reference, not a `userId` key in here.
   */
  metadata?: Record<string, string>;

  // Callbacks
  onStart?: () => void;
  onStepChange?: (step: KYCStep) => void;
  /**
   * Fires immediately after the user submits their verification.
   * The submission is always status: 'processing' — results arrive async via webhook.
   */
  onSubmit?: (submission: KYCSubmission) => void;
  /**
   * Fires once with the verdict when the flow WAITS for it in-app (a
   * biometric re-authentication on `resultDelivery: 'both'`, the default, or
   * 'app'). Never fires on a fire-and-forget flow, and never on a wait that
   * timed out: the webhook stays the record either way. Carries state and
   * reason only, never result data.
   */
  onResult?: (result: KYCResult) => void;
  onClose?: () => void;
  /**
   * Fires for technical errors only. Receives a {@link KYCError} — a real
   * `Error` that also carries a typed `code` (e.g. `camera_permission_denied`,
   * `upload_failed`, `network_error`). Verification *outcomes* never come
   * through here — they arrive via webhook / status polling.
   */
  onError?: (error: KYCError) => void;
}

// ---------------------------------------------------------------------------
// <MyazaKYC /> component props
// ---------------------------------------------------------------------------

/**
 * Props for the `<MyazaKYC />` component: the full SDK config plus standard
 * `<button>` attributes for the built-in trigger button.
 *
 * The trigger renders a real `<button>`, so you can:
 * - pass `children` to set the button label/content (defaults to
 *   `Verify with {companyName}` / `Verify Identity`),
 * - pass `className` to restyle it (merged via `tailwind-merge`, so your
 *   classes override the defaults),
 * - forward any other button attribute (`disabled`, `aria-*`, `type`, …).
 *
 * `onClick` is owned by the SDK (it opens the modal) and is therefore omitted.
 * To build your own trigger element instead, use the `useMyazaKYC()` hook and
 * wire its `open()` to whatever you render.
 */
export type MyazaKYCProps<C extends AnyCountry = AnyCountry> =
  MyazaKYCConfig<C> &
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof MyazaKYCConfig<C> | 'onClick'>;

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseMyazaKYCReturn {
  open: () => void;
  close: () => void;
  isOpen: boolean;
  currentStep: KYCStep | null;
}
