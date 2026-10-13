import type {
  AddressCollectionConfig,
  VerificationStep,
  PoaDocumentType,
  PoaNameRule,
  ProofOfAddressConfig,
  QuestionnaireConfig,
  SupportingDocumentsConfig,
} from '../types/config';
import type { SubjectType, WorkflowBusinessConfig } from '../types/business';
import { hasActiveQuestionnaire } from './questionnaire';
import { hasSupportingDocumentsStep } from './supporting-documents';
import { isBusinessFlow } from './business';
import { addressFlowOptions, addressFlowSteps, addressVendorsStubbed } from '../steps/address/flow-steps';

/** The slice the address entry/exit resolution reads — the callers pass the
 *  whole config context, so these ride along for free. */
interface AddressFlowFacts {
  addressCollection?: AddressCollectionConfig;
  serverConfig?: {
    addressSearch?: boolean;
    googleMapsBrowserKey?: string | null;
    mapsFrameUrl?: string | null;
    environment?: 'DEVELOPMENT' | 'SANDBOX' | 'PRODUCTION';
  } | null;
  previewMode?: boolean;
  subjectType?: SubjectType;
  business?: WorkflowBusinessConfig;
}

/** The address flow's steps for THIS mount (KYB = the single premises step). */
function flowStepsFor(config: AddressFlowFacts): VerificationStep[] {
  if (isBusinessFlow(config)) return ['address-collection'];
  return addressFlowSteps(
    addressFlowOptions({
      photo: config.addressCollection?.photo,
      streetView: config.addressCollection?.streetView,
      serverSearch: Boolean(config.serverConfig?.addressSearch),
      previewMode: addressVendorsStubbed({
        previewMode: config.previewMode,
        environment: config.serverConfig?.environment,
      }),
      hasGoogleKey: Boolean(config.serverConfig?.googleMapsBrowserKey),
      hasStreetViewFrame: Boolean(config.serverConfig?.mapsFrameUrl),
    }),
  );
}

/** Entering the address flow FORWARDS lands on its first step (search when a
 *  backend is on) — routing straight to the pin step skipped search entirely,
 *  which shipped. */
export function addressEntryStep(config: AddressFlowFacts): VerificationStep {
  return flowStepsFor(config)[0]!;
}

/** Backing INTO the address flow (from the questionnaire) lands on its LAST
 *  step — the review — not the pin. */
export function addressReturnStep(config: AddressFlowFacts): VerificationStep {
  const steps = flowStepsFor(config);
  return steps[steps.length - 1]!;
}

/** Whether the Proof of Address step is part of the flow. */
export function hasProofOfAddressStep(poa: ProofOfAddressConfig | undefined | null): boolean {
  return poa?.enabled === true;
}

export const POA_ALL_KINDS = [
  'utility_bill',
  'bank_statement',
  'tenancy_agreement',
  'government_document',
  'other',
] as const;

/** A kind THIS build knows how to label and draw. A newer kind the dashboard
 *  offers before the SDK ships is hidden from the picker rather than rendered
 *  as a blank card (the business-products rule). */
const knownKinds = (kinds: readonly string[] | undefined): PoaDocumentType[] =>
  (kinds ?? []).filter((k): k is PoaDocumentType => (POA_ALL_KINDS as readonly string[]).includes(k));

/**
 * The document kinds the PoA step offers for a given country: the per-country
 * override when the workflow sets one (the builder matrix's row cells), else
 * the global `documentTypes`, else every kind. Re-derived as the effective
 * country changes (the address scope's declared-country pick included).
 */
export function poaOfferedKinds(
  poa: ProofOfAddressConfig | undefined | null,
  country: string | undefined | null,
): PoaDocumentType[] {
  const override = knownKinds(country ? poa?.countryDocuments?.[country.toUpperCase()] : undefined);
  if (override.length > 0) return override;
  const global = knownKinds(poa?.documentTypes);
  if (global.length > 0) return global;
  return [...POA_ALL_KINDS];
}

/**
 * The name rule the server will judge THIS document under — the country's
 * per-kind exception, else the workflow default, else `required`. Mirror of
 * the server's `resolvePoaNamePolicy` (kyc-core lib/proof-of-address/
 * name-policy.ts) and the RN / Flutter twins — keep the four in lockstep. Read
 * only to word the step: under `off` the header stops asking for the name.
 */
export function poaNamePolicy(
  poa: ProofOfAddressConfig | undefined | null,
  country: string | undefined | null,
  kind: PoaDocumentType | undefined | null,
): PoaNameRule {
  const exception = country && kind ? poa?.countryNameMatch?.[country.toUpperCase()]?.[kind] : undefined;
  if (exception === 'required' || exception === 'optional' || exception === 'off') return exception;
  const def = poa?.nameMatch;
  return def === 'optional' || def === 'off' ? def : 'required';
}

/**
 * Whether the PoA accepted-country list admits the flow's country. Gates the
 * STEP on full flows (an org that accepts address documents from three
 * markets should not collect them from a fourth); the ADDRESS SCOPE is exempt
 * by the caller — there the step hosts the declared-country picker, which
 * already offers only the accepted list. Unset/empty = every country.
 */
export function poaCountryAccepted(
  poa: ProofOfAddressConfig | undefined | null,
  country: string | undefined | null,
): boolean {
  const accepted = poa?.countries;
  if (!accepted?.length) return true;
  if (!country) return true;
  const code = country.toUpperCase();
  return accepted.some((c) => c.toUpperCase() === code);
}

/**
 * The facts the supporting-documents step needs: the flow's request list, and
 * the IDs this attempt has actually committed.
 *
 * `verifiedIds` is REQUIRED on the chain helpers below rather than optional,
 * deliberately. The requested list is resolved PER ID, so an omitted argument
 * would silently drop the step for everybody — the kind of gap that compiles,
 * passes, and only shows up as a document nobody was ever asked for.
 */
export interface SupportingDocumentFacts {
  supportingDocuments?: SupportingDocumentsConfig;
}

/** Whether the Address Intelligence capture step is part of the flow. */
export function hasAddressCollectionStep(
  address: AddressCollectionConfig | undefined | null,
): boolean {
  return address?.enabled === true;
}

/**
 * The step that follows capture/liveness: Proof of Address (when enabled),
 * then the questionnaire (when active), then submission. Call sites map a
 * 'submitted' return to their own submit mechanism (SET_STEP vs
 * SUBMIT_VERIFICATION).
 *
 * In a BUSINESS flow the capture leg is the applicant's own verification, and
 * it is the LAST thing in the application: PoA never runs on KYB, and the
 * questionnaire was already asked back in the company section (before key
 * people). Returning 'questionnaire' here made the reordered flow a loop —
 * questionnaire → key people → applicant capture → questionnaire again.
 */
export function stepAfterCapture(
  config: {
    proofOfAddress?: ProofOfAddressConfig;
    questionnaire?: QuestionnaireConfig;
  } & AddressFlowFacts &
    SupportingDocumentFacts,
  /** `"CC/idType"` composites this attempt has committed (verifiedIdsFor). */
  verifiedIds: string[],
): Extract<
  VerificationStep,
  | 'proof-of-address'
  | 'supporting-documents'
  | 'address-search'
  | 'address-collection'
  | 'questionnaire'
  | 'submitted'
> {
  if (isBusinessFlow(config)) return 'submitted';
  // Paperwork the org files is asked for BEFORE the address evidence the
  // verification is judged on (user decision 2026-09-22).
  if (hasSupportingDocumentsStep(config.supportingDocuments, verifiedIds)) {
    return 'supporting-documents';
  }
  return stepAfterSupportingDocuments(config);
}

/**
 * The step that follows supporting documents (or capture, when the flow asks
 * for none): Proof of Address, then Address Intelligence, then the
 * questionnaire, then submission. The supporting-documents step's Continue
 * resolves through here, so it never asks whether to show itself again.
 */
export function stepAfterSupportingDocuments(
  config: {
    proofOfAddress?: ProofOfAddressConfig;
    questionnaire?: QuestionnaireConfig;
  } & AddressFlowFacts,
): Extract<
  VerificationStep,
  'proof-of-address' | 'address-search' | 'address-collection' | 'questionnaire' | 'submitted'
> {
  if (hasProofOfAddressStep(config.proofOfAddress)) return 'proof-of-address';
  return stepAfterProofOfAddress(config);
}

/**
 * The step that follows Proof of Address: Address Intelligence (when
 * enabled), then the questionnaire, then submission. The PoA step's Continue
 * and the questionnaire's Back both resolve through here so the chain has one
 * owner.
 */
export function stepAfterProofOfAddress(
  config: { questionnaire?: QuestionnaireConfig } & AddressFlowFacts,
): Extract<VerificationStep, 'address-search' | 'address-collection' | 'questionnaire' | 'submitted'> {
  if (hasAddressCollectionStep(config.addressCollection)) {
    return addressEntryStep(config) as Extract<VerificationStep, 'address-search' | 'address-collection'>;
  }
  if (hasActiveQuestionnaire(config.questionnaire)) return 'questionnaire';
  return 'submitted';
}
