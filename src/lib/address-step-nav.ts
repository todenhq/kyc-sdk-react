import type { VerificationStep, ProofOfAddressConfig, QuestionnaireConfig } from '../types/config';
import type { SubjectType, WorkflowBusinessConfig } from '../types/business';
import { hasSupportingDocumentsStep } from './supporting-documents';
import { hasProofOfAddressStep } from './post-capture';
import { hasActiveQuestionnaire } from './questionnaire';
import { isBusinessFlow } from './business';
import { lastContactStep } from './contact-steps';
import { nextBusinessStep, prevBusinessStep } from './business-application';

// Where the address-collection step goes next and back, split from the step
// component (200-line rule). Pure over config + the selected-ID facts, so the
// component stays a view.

/** The structural slice of config the navigation actually reads (house rule:
 *  helpers take fragments, never the whole props type). */
export interface AddressNavConfig {
  subjectType?: SubjectType;
  business?: WorkflowBusinessConfig;
  questionnaire?: QuestionnaireConfig;
  proofOfAddress?: ProofOfAddressConfig;
  supportingDocuments?: import('../types/config').SupportingDocumentsConfig;
  enableSelfie?: boolean;
  scope?: import('./scope').WorkflowScope;
  emailVerification?: import('../types/config').EmailVerificationConfig;
  phoneVerification?: import('../types/config').PhoneVerificationConfig;
}

/** The step after address collection, or 'submit' when the flow ends here. */
export function addressNextStep(config: AddressNavConfig): VerificationStep | 'submit' {
  if (isBusinessFlow(config)) {
    const next = nextBusinessStep('address-collection', config);
    return next === 'submitted' ? 'submit' : next;
  }
  return hasActiveQuestionnaire(config.questionnaire) ? 'questionnaire' : 'submit';
}

/** The step behind address collection, given what the flow actually ran. */
export function addressBackStep(
  config: AddressNavConfig,
  selectedIdRequiresCapture: boolean | undefined,
  /** `"CC/idType"` composites this attempt committed — [] on flows with no ID. */
  verifiedIds: string[] = [],
): VerificationStep {
  if (isBusinessFlow(config)) return prevBusinessStep('address-collection', config);
  // Supporting documents sit between the address document and the pin, so the
  // address section backs into them before Proof of Address.
  if (hasSupportingDocumentsStep(config.supportingDocuments, verifiedIds)) {
    return 'supporting-documents';
  }
  if (hasProofOfAddressStep(config.proofOfAddress)) return 'proof-of-address';
  // Address scope: there is no capture leg behind the address section — Back
  // lands on the contact section (or consent when none).
  if (config.scope === 'address') return lastContactStep(config);
  if (config.enableSelfie !== false) return 'liveness';
  return selectedIdRequiresCapture === false ? 'id-input' : 'document-capture';
}
