import type { KYCStep, AnyIdType, AnyCountry, QuestionnaireAnswerValue, PoaDocumentType } from '../types/config';
import type { ApiStatus, KYCError } from '../types/verification';
import type { ApplicantRole, BusinessDocumentKey, KeyPersonRole } from '../types/business';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface KYCUserData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}

export interface BusinessDetails {
  /** Chosen registry country; null until picked (single-country flows resolve at submit). */
  country: string | null;
  /** Chosen verification product; null until picked (single-product flows resolve at submit). */
  product: string | null;
  registrationNumber: string;
  registrationName: string;
  /** Optional contact email for key-people (owner) verification invites. */
  contactEmail: string;
  // Company profile (collectCompanyInfo — default on): all optional inputs.
  address: string;
  email: string;
  phone: string;
  website: string;
  /** Registry facts the applicant states; submitted as their own answer. */
  dateOfIncorporation: string;
  taxId: string;
  vatNumber: string;
  companyType: string;
  natureOfBusiness: string;
  /** Registry region (ISO 3166-2) for the countries whose register is split. */
  subdivisionCode?: string;
  /** Non-production only: the canned outcome to return instead of a lookup. */
  sandboxOutcome?: 'verified' | 'not_found';
}

/**
 * The registry check run when the applicant confirms their company.
 *
 * `skipped` is a normal outcome, not a failure: the organisation could not be
 * charged, so the flow carries on and the check happens at submission instead.
 * The applicant is never shown a dead end over an account they cannot top up.
 */
export interface BusinessCheckState {
  status: 'idle' | 'checking' | 'found' | 'not_found' | 'skipped' | 'unavailable' | 'limit_reached';
  /** What the register holds, when it answered. */
  company: {
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
  } | null;
  /** The officers on file — what makes the key-people question a confirmation. */
  keyPeople: RegistryOfficer[];
  /** Which company was checked, so a changed number re-runs it. */
  checkedNumber: string | null;
  /**
   * Which form fields the REGISTER filled, as opposed to the applicant.
   *
   * Kept so that changing which company this is can clear exactly those and
   * nothing else. Without it, switching company left the previous register's
   * address and email sitting in the form under the new company's name - and
   * because the prefill only writes into empty fields, those leftovers also
   * blocked the new register's real values from ever landing.
   */
  prefilled: (keyof BusinessDetails)[];
}

/** One officer as the register names them - the key-people prefill's input. */
export interface RegistryOfficer {
  name: string | null;
  designation: string | null;
  /** Everything else the register said about them (older servers omit these). */
  roles?: string[] | null;
  ownershipPct?: number | null;
  email?: string | null;
  isCorporate?: boolean | null;
  registrationNumber?: string | null;
}

/** One row on the business-key-people step. Inputs kept as strings for
 *  controlled fields; the submit payload builder parses/filters them. */
export interface KeyPersonEntry {
  name: string;
  /**
   * The headline role — derived from `roles` by precedence (mirrors the
   * server's role/roles pair). Kept because the one-role surfaces (await
   * list, applicant self-pick, the card's meta line) read it.
   */
  role: KeyPersonRole;
  /**
   * Every hat this person wears. One human is a director AND a 30% owner,
   * and the register files them that way; the sectioned step lets the
   * applicant say the same (quick-add grants an existing person another
   * role). Never empty; `role` is always its strongest member.
   */
  roles: KeyPersonRole[];
  /** Their own words for the position ("CFO, Board Member"). Display only. */
  title: string;
  email: string;
  /** ISO-2 country of the person (drives their verification link's country). */
  country: string;
  /** Ownership percentage as typed (optional; validated 0–100 when present). */
  ownershipPct: string;
  /**
   * This shareholder is a company, not a person.
   *
   * A company can never be a beneficial owner, so it is screened as an entity
   * and is never asked to verify an identity it does not have. Saying so here
   * is what stops the flow sending a document-and-selfie link to a limited
   * company and then waiting for it.
   */
  isCorporate: boolean;
  /** A corporate shareholder's own registration number, as typed. */
  registrationNumber: string;
  /**
   * The people who own a corporate shareholder, as the applicant knows them.
   *
   * The only route to the humans above a parent no register can be asked about:
   * a foreign holding company, an offshore vehicle. Declared and corroborated
   * by nothing, and recorded as exactly that.
   */
  owners: KeyPersonOwnerEntry[];
}

/** One declared owner of a corporate key person. */
export interface KeyPersonOwnerEntry {
  name: string;
  /** Their share OF THE COMPANY above, as typed. The server multiplies it down. */
  ownershipPct: string;
  email: string;
  country: string;
}

/** One uploaded slot on the business-documents step. */
export interface BusinessDocumentUpload {
  type: BusinessDocumentKey;
  mediaId: string;
  fileName: string;
}

/** The KYB APPLICATION extras collected beyond the registration details. */
export interface BusinessApplicationState {
  keyPeople: KeyPersonEntry[];
  documents: BusinessDocumentUpload[];
  applicantRole: ApplicantRole | null;
  applicantName: string;
  /**
   * The applicant picked THEMSELVES from the entered key people (index into
   * `keyPeople`). Null = they're someone else / nothing picked. The flagged
   * entry is merged server-side with the applicant row — one person, one KYC,
   * one screening, no duplicate invite.
   */
  applicantKeyPersonIndex: number | null;
  /**
   * The applicant attests that no natural person qualifies as a UBO (public
   * share structures, complex trusts, nominee arrangements) - the FATF
   * fallback. An attestation the server records and the org can branch on,
   * never a verdict; the registry lookup still says what it says.
   */
  uboUnidentifiable: boolean;
}

export interface MediaIds {
  documentFront?: string;
  documentBack?: string;
  selfie?: string;
  documentFrontVideo?: string;
  documentBackVideo?: string;
  livenessVideo?: string;
  proofOfAddress?: string;
  addressPhoto?: string;
}

export interface KYCState {
  currentStep: KYCStep;
  /**
   * The step this flow OPENS on: 'consent', or the first real step when the
   * workflow switched the consent screen off. Published by KYCModal from the
   * built step order (the one place that knows it), read by the progress
   * saver so a consent-less flow is not written as "started" on mount.
   */
  openingStep: KYCStep;
  status: ApiStatus;
  isOpen: boolean;

  /**
   * The resumable session this attempt belongs to, from `session.start`. Not a
   * credential — auth is still the API key — just the id the finished
   * verification links back to. Null on hosted mounts (which authenticate AS a
   * session already) and in preview.
   */
  sessionId: string | null;
  /**
   * Set when the server refused this session as CANCELLED by the organisation
   * (lib/session-cancelled.ts). Terminal for this run: the modal swaps to the
   * cancelled screen and nothing else is saved or submitted. `message` is the
   * server's own sentence, null for the catalogue default.
   */
  sessionCancelled: { message: string | null } | null;
  /**
   * A KYB application whose business half already committed, resumed before
   * the applicant's own verification went through (lib/resumed-application.ts).
   * The submitting screen replays the business submission under its original
   * request id instead of sending a new one the server would refuse.
   */
  resumedApplication: import('../lib/resumed-application').ResumedApplication | null;

  // Step 1b – country selection (multi-region flows; null = use config default)
  selectedCountry: AnyCountry | null;
  /** True while the declared country is a GUESS (geo/locale default, or the
   *  pin's reverse-geocoded place) — an explicit pick clears it, and only a
   *  guess may be silently replaced by a better one. */
  countryAutoPicked: boolean;

  // Step 2 – ID type selection
  selectedIdType: AnyIdType | null;

  /** Multi-ID flows: which slot is being walked (0-based; == count when all
   *  committed and the run has moved on to liveness/submission). */
  multiIdSlotIndex: number;
  /**
   * Evidence committed per finished slot, in pick order.
   *
   * The submission's `idChecks` are built from this — by an explicit whitelist,
   * because the preview images below must never reach the wire (nor the session
   * progress blob). They are kept only so going BACK to an earlier ID restores
   * what was captured instead of forcing a pointless retake.
   */
  multiIdSlots: Array<{
    idType: string;
    idNumber?: string;
    documentFront?: string;
    documentBack?: string;
    /** Local previews — restored on back, never sent anywhere. */
    documentFrontImage?: string | null;
    documentBackImage?: string | null;
    /** Each check's OWN document recording, uploaded with the submission.
   *  Local blobs — stripped from every payload by multiIdWireSlots. */
    documentFrontVideoBlob?: Blob | null;
    documentBackVideoBlob?: Blob | null;
  }>;

  // Step 3 – Document capture (base64 previews for display only)
  documentFrontImage: string | null;
  documentBackImage: string | null;

  // Media IDs returned by the server after each upload
  mediaIds: MediaIds;

  // Step 3b – ID input (number-only IDs)
  idNumber: string;
  userData: KYCUserData;

  // Step 4 – Liveness / selfie
  selfieImage: string | null;
  /**
   * The selfie upload's progress report, written by LivenessStep. The
   * biometric scopes hand over before the upload lands (the review is off),
   * so the submitted step waits on THIS rather than on the step's own state.
   * See lib/selfie-upload-wait.ts.
   */
  selfieUpload: import('../lib/selfie-upload-wait').SelfieUploadState;

  // Video blobs captured during document and liveness steps
  documentFrontVideoBlob: Blob | null;
  documentBackVideoBlob: Blob | null;
  livenessVideoBlob: Blob | null;

  // Step 2b — business (KYB) workflow details (replaces id-type/capture steps)
  business: BusinessDetails;
  /** Step 2b — the paid registry check at company selection. */
  businessCheck: BusinessCheckState;

  // Steps 2c/2d/2e — KYB application extras (key people, documents, applicant)
  businessApplication: BusinessApplicationState;

  /**
   * Supporting documents the person uploaded — artefacts the org holds on
   * file, not the identity evidence this verification is decided on. Each
   * entry is `{ type, mediaId }` on the wire; `fileName` is display only and
   * is dropped from session progress like every other preview artefact.
   */
  supportingDocuments: Array<{ type: string; mediaId: string; fileName?: string; method?: 'drawn' | 'uploaded' }>;

  // Steps 1b/1c — contact verification (email/phone OTP). The proof tokens are
  // single-use server mints submitted with /verify; destinations are kept for
  // display ("Verified a***@gmail.com").
  contact: {
    emailToken: string | null;
    emailAddress: string | null;
    phoneToken: string | null;
    phoneNumber: string | null;
    // Channels whose proof the SERVER refused at submit (422
    // contact_verification_required). Proofs are single-use and expire ~30
    // minutes after the OTP check, but they ride session progress and are
    // restored on resume — so a resumed attempt can carry a dead proof while
    // the step still shows "verified". This list is what routes the person
    // back to re-verify instead of a Try Again that resubmits the same dead
    // token forever; SET_CONTACT_PROOF clears its channel.
    expired: Array<'email' | 'phone'>;
  };

  // Step 4b — extra-info questionnaire answers, keyed by question key
  questionnaireAnswers: Record<string, QuestionnaireAnswerValue>;

  // Step 4c — proof of address (mediaId lives in mediaIds.proofOfAddress)
  poaDocumentType: PoaDocumentType | null;
  poaFileName: string | null;

  // Step 4d — Address Intelligence (smart-address capture). The photo's
  // mediaId lives in mediaIds.addressPhoto; the pin + directions + the
  // one-shot device fix (attestPresence) live here and ride the verify body.
  address: {
    lat: number;
    lng: number;
    accuracy: number | null;
    directions: string;
    propertyName: string;
    propertyNumber: string;
    /** A street the applicant TYPED. Prefilled from the map's answer in the
     *  edit-details sheet; stored only once the applicant edits it, so an
     *  untouched prefill is never submitted as their claim. */
    street?: string;
    /** The rest of the OkHi-style edit-details form (user decision
     *  2026-08-31): unit, plus area/region corrections. All applicant claims,
     *  stored only when typed; the server never feeds them into
     *  corroboration. */
    unit?: string;
    neighbourhood?: string;
    city?: string;
    state?: string;
    postcode?: string;
    /** The pin's human-readable line ("11 Bassey Street, Calabar") — from the
     *  search pick or a reverse geocode. Shown in the flow AND sent with the
     *  submission as the applicant-confirmed line: the server prefers it for
     *  the composed address over its own reverse geocode, whose OSM coverage
     *  drops whole streets in our markets. */
    label?: string;
    /** Where the label was PICKED for (a search selection's own coordinates).
     *  Presence means the label is human-confirmed: it survives pin nudges
     *  within the keep radius instead of being re-derived on every drag.
     *  Absent = the label came from a reverse geocode. Never on the wire. */
    pickedAt?: { lat: number; lng: number };
    /** The applicant explicitly chose to KEEP the picked label after moving
     *  the pin. Reset when the pin crosses the credibility radius, so the
     *  question is asked again exactly once out there. Never on the wire. */
    labelKept?: boolean;
    /** The label broken down (street/area/city/state/postcode) — what the
     *  details sheet shows as structured rows. Display only, like label. */
    parts?: {
      street?: string | null;
      area?: string | null;
      city?: string | null;
      state?: string | null;
      postcode?: string | null;
      /** ISO-2 of the pin's own place, from the reverse geocode. */
      country?: string | null;
    };
    /** Street View entrance frame — coordinates only; the server fetches the
     *  image with its own key. */
    streetView?: { panoId: string; heading: number; pitch: number; fov: number };
    deviceLat?: number;
    deviceLng?: number;
    deviceAccuracy?: number;
    capturedAt?: string;
  } | null;
  /** Local preview (object URL) of the uploaded entrance photo, so the review
   *  step can show it on the map. Display artefact — never serialised. */
  addressPhotoPreview: string | null;
  /** The presence "how it works" primer was acknowledged this session. */
  addressIntroSeen: boolean;
  /** Dev/sandbox only: the pinned address RESULT outcome (the business
   *  flow's sandboxOutcome, for the address check). Null = the server's
   *  default (attested with a location fix, else corroborated). Rides
   *  metadata.sandboxOutcome at submit; production ignores it. */
  addressSandboxOutcome:
    | 'address_attested'
    | 'address_corroborated'
    | 'address_collected'
    | 'address_mismatch'
    | null;

  // Step 5 – Submission result
  verificationId: string | null;
  /**
   * Last technical error (submission failures). Carries the typed `code` so the
   * consumer's `onError` receives a `KYCError`, not a bare string. Capture-step
   * errors (camera permission, upload-after-retries) report to `onError`
   * directly and do not set this — they have their own inline UI.
   */
  error: KYCError | null;
}

// ---------------------------------------------------------------------------
// Actions (discriminated union)
// ---------------------------------------------------------------------------

export type KYCAction =
  | { type: 'OPEN_MODAL' }
  | { type: 'SET_SESSION_ID'; payload: string }
  | { type: 'SET_SESSION_CANCELLED'; payload: { message: string | null } }
  | { type: 'SET_RESUMED_APPLICATION'; payload: import('../lib/resumed-application').ResumedApplication | null }
  | {
      type: 'RESTORE_PROGRESS';
      payload: {
        step?: string;
        mediaIds?: Record<string, string>;
        data?: Record<string, unknown>;
      };
    }
  | { type: 'CLOSE_MODAL' }
  | { type: 'SET_STEP'; payload: KYCStep }
  | { type: 'SET_OPENING_STEP'; payload: KYCStep }
  | { type: 'SET_COUNTRY'; payload: AnyCountry }
  | { type: 'SET_COUNTRY_AUTO'; payload: AnyCountry }
  | { type: 'SELECT_ID_TYPE'; payload: AnyIdType }
  // Multi-ID: commit the current slot's evidence (ID type + number/documents)
  // and move to nextStep — the next slot's picker, or liveness after the last.
  | { type: 'COMMIT_MULTI_ID_SLOT'; payload: { nextStep: KYCStep } }
  // Multi-ID: step BACK into the last committed slot — pops it and restores its
  // evidence, so the applicant can change an ID they already did.
  | { type: 'UNCOMMIT_MULTI_ID_SLOT'; payload: { step: KYCStep } }
  | { type: 'SET_ID_NUMBER'; payload: string }
  | { type: 'SET_USER_DATA'; payload: Partial<KYCUserData> }
  // Business (KYB) details
  | { type: 'SET_BUSINESS_DETAILS'; payload: Partial<BusinessDetails> }
  | { type: 'SET_BUSINESS_CHECK'; payload: Partial<BusinessCheckState> }
  // KYB application extras (key people / documents / applicant role+name)
  | { type: 'SET_BUSINESS_APPLICATION'; payload: Partial<BusinessApplicationState> }
  | { type: 'SET_SUPPORTING_DOCUMENTS'; payload: KYCState['supportingDocuments'] }
  // Document capture
  | { type: 'SET_DOCUMENT_FRONT'; payload: string }
  | { type: 'SET_DOCUMENT_BACK'; payload: string }
  | { type: 'CLEAR_DOCUMENT_FRONT' }
  | { type: 'CLEAR_DOCUMENT_BACK' }
  | { type: 'CLEAR_DOCUMENT_ALL' }
  // Media IDs (set after each upload completes)
  | { type: 'SET_MEDIA_ID'; payload: { mediaType: keyof MediaIds; mediaId: string | undefined } }
  | { type: 'CLEAR_MEDIA_IDS' }
  // Selfie
  | { type: 'SET_SELFIE_IMAGE'; payload: string }
  | { type: 'CLEAR_SELFIE_IMAGE' }
  | { type: 'SET_SELFIE_UPLOAD'; payload: import('../lib/selfie-upload-wait').SelfieUploadState }
  // Video blobs
  | { type: 'SET_DOCUMENT_FRONT_VIDEO'; payload: Blob }
  | { type: 'SET_DOCUMENT_BACK_VIDEO'; payload: Blob }
  | { type: 'SET_LIVENESS_VIDEO'; payload: Blob }
  | { type: 'CLEAR_LIVENESS_VIDEO' }
  // Contact verification (email/phone OTP proof)
  | { type: 'SET_CONTACT_PROOF'; payload: { channel: 'email' | 'phone'; token: string; destination: string } }
  // The server refused these channels' proofs at submit (stale/claimed) — drop
  // the tokens and flag the channels so their steps re-verify then resubmit.
  | { type: 'CLEAR_CONTACT_PROOFS'; payload: { channels: Array<'email' | 'phone'> } }
  // Questionnaire
  | { type: 'SET_QUESTIONNAIRE_ANSWER'; payload: { key: string; value: QuestionnaireAnswerValue | undefined } }
  // Proof of Address
  | { type: 'SET_POA_DOCUMENT'; payload: { documentType: PoaDocumentType; fileName: string } }
  | { type: 'CLEAR_POA_DOCUMENT' }
  | { type: 'SET_ADDRESS'; payload: NonNullable<KYCState['address']> }
  | { type: 'SET_ADDRESS_PHOTO_PREVIEW'; payload: string | null }
  | { type: 'SET_ADDRESS_INTRO_SEEN' }
  | { type: 'SET_ADDRESS_SANDBOX_OUTCOME'; payload: KYCState['addressSandboxOutcome'] }
  | { type: 'CLEAR_ADDRESS' }
  // Submission
  | { type: 'SUBMIT_VERIFICATION' }
  | { type: 'SUBMISSION_SUCCESS'; payload: string }
  | { type: 'SET_ERROR'; payload: KYCError }
  | { type: 'CLEAR_ERROR' }
  | { type: 'RETRY' }
  | { type: 'RESET' };
