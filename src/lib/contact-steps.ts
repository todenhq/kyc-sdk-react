import type {
  AddressCollectionConfig,
  EmailVerificationConfig,
  VerificationStep,
  PhoneVerificationConfig,
  ProofOfAddressConfig,
  QuestionnaireConfig,
} from '../types/config';
import { stepAfterCapture } from './post-capture';
import { configScope, isFaceScope } from './scope';

// Contact-verification step presence + navigation helpers. The steps sit
// right after consent (a cheap pre-filter before document/liveness spend),
// email before phone when both are on.

export function hasEmailVerificationStep(cfg: EmailVerificationConfig | undefined | null): boolean {
  return cfg?.enabled === true;
}

export function hasPhoneVerificationStep(cfg: PhoneVerificationConfig | undefined | null): boolean {
  return cfg?.enabled === true;
}

interface ContactStepConfig {
  emailVerification?: EmailVerificationConfig;
  phoneVerification?: PhoneVerificationConfig;
  countries?: Array<{ country: string }>;
  subjectTypeIsBusiness: boolean;
  // Scoped flows skip the identity section entirely; the fields below ride
  // along from the call sites' full-config spread so stepAfterCapture can
  // resolve PoA → address flow → questionnaire without a second seam.
  scope?: import('./scope').WorkflowScope;
  proofOfAddress?: ProofOfAddressConfig;
  questionnaire?: QuestionnaireConfig;
  addressCollection?: AddressCollectionConfig;
  serverConfig?: { addressSearch?: boolean; googleMapsBrowserKey?: string | null } | null;
  previewMode?: boolean;
}

/** The step that follows the flow's contact section (or consent when none). */
function stepAfterContactSection(config: ContactStepConfig): VerificationStep {
  if (config.subjectTypeIsBusiness) return 'business-details';
  // Scoped flows have no identity section — each goes straight to its
  // headline step. The biometric scopes run the liveness capture; the
  // address scope enters the post-capture chain (PoA when enabled, then the
  // address flow); a contact scope has nothing after its codes but submission.
  const scope = configScope(config);
  if (isFaceScope(scope)) return 'liveness';
  if (scope === 'questionnaire') return 'questionnaire';
  if (scope === 'contact') return 'submitted';
  // No verified IDs on a scoped flow: the server rejects supporting
  // documents there, so the step can never be part of this chain.
  if (scope === 'address') return stepAfterCapture(config, []);
  const multiRegion = (config.countries?.length ?? 0) > 1;
  return multiRegion ? 'country-select' : 'id-type';
}

/** The LAST step of the consent/contact section — where the first step after
 *  it backs into. Address-only flows use this: their first content step is
 *  the address section, whose Back must not land on an ID screen. */
export function lastContactStep(config: {
  emailVerification?: EmailVerificationConfig;
  phoneVerification?: PhoneVerificationConfig;
}): VerificationStep {
  if (hasPhoneVerificationStep(config.phoneVerification)) return 'phone-verification';
  if (hasEmailVerificationStep(config.emailVerification)) return 'email-verification';
  return 'consent';
}

/**
 * Where Back on the liveness step lands.
 *
 * In a full flow that is the evidence step just walked (typed number or
 * document); the KYB applicant leg is shaped the same way. In a FACE-SCOPED
 * flow there is no identity section at all — the step order is consent, the
 * contact codes, liveness — so Back is the end of the contact section. The
 * liveness step used to assume the full shape and hard-code the evidence step,
 * which put a biometric re-authentication on an "Enter your ID Number" screen
 * that its workflow does not contain and its submission could never use.
 *
 * Mirrors what buildStepOrder puts before 'liveness', and is tested against it.
 */
export function stepBeforeLiveness(
  config: {
    emailVerification?: EmailVerificationConfig;
    phoneVerification?: PhoneVerificationConfig;
    scope?: import('./scope').WorkflowScope | string;
  },
  evidence: 'document-capture' | 'id-input',
): VerificationStep {
  if (isFaceScope(configScope(config))) return lastContactStep(config);
  return evidence;
}

/** Where Continue on the consent step goes. */
export function firstStepAfterConsent(config: ContactStepConfig): VerificationStep {
  if (hasEmailVerificationStep(config.emailVerification)) return 'email-verification';
  if (hasPhoneVerificationStep(config.phoneVerification)) return 'phone-verification';
  return stepAfterContactSection(config);
}

/** Where Continue on a contact step goes. */
export function stepAfterContact(config: ContactStepConfig, current: 'email-verification' | 'phone-verification'): VerificationStep {
  if (current === 'email-verification' && hasPhoneVerificationStep(config.phoneVerification)) {
    return 'phone-verification';
  }
  return stepAfterContactSection(config);
}
