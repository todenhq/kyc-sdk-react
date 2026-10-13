// The consent (welcome) screen's copy: title, description and the "During
// this process we will" list. Split out of ConsentStep so the screen stays
// small; every text comes from the catalogue's `welcome` group.

import type React from 'react';
import {
  BadgeCheck,
  Building2,
  FileText,
  UserRound,
  UsersRound,
  ScanLine,
  ScanFace,
  ImageUp,
  Lock,
  MapPinHouse,
} from '../components/icons';
import { defaultText } from '../i18n/translate';
import type { TextFn } from '../i18n/types';
import { hasEmailVerificationStep, hasPhoneVerificationStep } from '../lib/contact-steps';
import { hasActiveQuestionnaire } from '../lib/questionnaire';
import { hasAddressCollectionStep, hasProofOfAddressStep } from '../lib/post-capture';
import { mayAskSupportingDocuments } from '../lib/supporting-documents';
import { documentCaptureMethods } from '../lib/document-capture-methods';
import {
  hasApplicantVerification,
  hasBusinessDocumentsStep,
  hasKeyPeopleCollection,
} from '../lib/business-application';
import type { VerificationConfigValue } from '../context/VerificationConfigContext';

export interface ProcessStep {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}

/** Scope → the key suffix its title and description use. */
const SCOPE_KEYS: Record<string, string> = {
  address: 'address',
  'biometric-authentication': 'faceCheck',
  'biometric-enrollment': 'faceEnrolment',
  questionnaire: 'questionnaire',
  contact: 'contact',
};

interface CopyCase {
  isBusiness: boolean;
  scope: string | null;
}

/** The screen's variant for keyed copy: business, a scope, or none (the base text). */
function variant({ isBusiness, scope }: CopyCase): string | null {
  if (isBusiness) return 'business';
  return SCOPE_KEYS[scope ?? ''] ?? null;
}

/**
 * The title. An older `consent.title` wins over every variant, as it always did.
 */
export function consentTitle(
  c: CopyCase & { firstName?: string | null; legacy?: string | null },
  t: TextFn = defaultText,
): string {
  const v = variant(c);
  const key = c.firstName ? 'welcome.title.named' : v ? `welcome.title.${v}` : 'welcome.title';
  return t(key, undefined, c.legacy);
}

/** The description. An older `consent.description` wins over every variant. */
export function consentDescription(c: CopyCase & { legacy?: string | null }, t: TextFn = defaultText): string {
  const v = variant(c);
  return t(v ? `welcome.description.${v}` : 'welcome.description', undefined, c.legacy);
}

/**
 * The process list, reflecting the actually-enabled features so it matches
 * the real flow.
 */
export function consentProcessSteps(config: VerificationConfigValue, c: CopyCase, t: TextFn = defaultText): ProcessStep[] {
  const { isBusiness, scope } = c;
  const step = (icon: ProcessStep['icon'], key: string): ProcessStep => ({ icon, label: t(key) });
  // The address scope's bullets are NOT a fixed pair: it verifies an address by
  // the pin, by a document, or by both, so promising a map on a flow that only
  // asks for a document is a promise the flow never keeps. The document's own
  // bullet is appended by the shared post-capture block below.
  const scopeSteps = (): ProcessStep[] => {
    switch (scope) {
      case 'address':
        return hasAddressCollectionStep(config.addressCollection)
          ? [step(MapPinHouse, 'welcome.process.addressPin'), step(BadgeCheck, 'welcome.process.addressDetails')]
          : [];
      case 'biometric-authentication':
        return [step(ScanFace, 'welcome.process.faceSelfie'), step(BadgeCheck, 'welcome.process.faceMatch')];
      case 'biometric-enrollment':
        return [step(ScanFace, 'welcome.process.faceSelfie'), step(BadgeCheck, 'welcome.process.faceEnrol')];
      case 'questionnaire':
        return [step(BadgeCheck, 'welcome.process.questions')];
      case 'contact':
        return [step(Lock, 'welcome.process.contactScope')];
      default:
        return [];
    }
  };
  const steps: ProcessStep[] = isBusiness
    ? [step(Building2, 'welcome.process.businessDetails'), step(BadgeCheck, 'welcome.process.businessRegistry')]
    : scope
      ? scopeSteps()
      : [step(BadgeCheck, 'welcome.process.verifyId'), step(UserRound, 'welcome.process.personalInfo')];
  // On the CONTACT scope the catalogue bullet already says this: appending the
  // generic line showed "confirm your contact details" twice.
  const hasEmail = hasEmailVerificationStep(config.emailVerification);
  const hasPhone = hasPhoneVerificationStep(config.phoneVerification);
  if (scope !== 'contact' && (hasEmail || hasPhone)) {
    const key = hasEmail && hasPhone ? 'contactEmailAndPhone' : hasEmail ? 'contactEmail' : 'contactPhone';
    steps.push(step(Lock, `welcome.process.${key}`));
  }
  if (!isBusiness && !scope && config.enableDocumentCapture !== false) {
    steps.push(
      documentCaptureMethods(config).scan
        ? step(ScanLine, 'welcome.process.captureDocument')
        : step(ImageUp, 'welcome.process.uploadDocument'),
    );
  }
  if (!isBusiness && !scope && config.enableSelfie !== false) {
    steps.push(step(ScanFace, 'welcome.process.selfie'));
  }
  // Post-capture features, in the order the flow runs them. `mayAsk`, NOT the
  // step-order predicate: that one resolves against the verified IDs and
  // consent runs before an ID is picked, so every scoped document would answer
  // "nothing to ask for" and go undisclosed.
  if (!isBusiness && mayAskSupportingDocuments(config.supportingDocuments)) {
    steps.push(step(FileText, 'welcome.process.supportingDocuments'));
  }
  if (!isBusiness && hasProofOfAddressStep(config.proofOfAddress)) {
    steps.push(step(FileText, 'welcome.process.proofOfAddress'));
  }
  if (scope !== 'address' && hasAddressCollectionStep(config.addressCollection)) {
    steps.push(step(MapPinHouse, 'welcome.process.addressMap'));
  }
  // The step-order predicate, not a raw fields check: a questionnaire with
  // questions but enabled: false never runs, so it must not be promised.
  if (scope !== 'questionnaire' && hasActiveQuestionnaire(config.questionnaire)) {
    steps.push(step(BadgeCheck, 'welcome.process.questions'));
  }
  if (isBusiness && hasKeyPeopleCollection(config.business)) {
    steps.push(step(UsersRound, 'welcome.process.keyPeople'));
  }
  if (isBusiness && hasBusinessDocumentsStep(config.business)) {
    steps.push(step(FileText, 'welcome.process.businessDocuments'));
  }
  if (isBusiness && hasApplicantVerification(config.business)) {
    steps.push(step(ScanFace, 'welcome.process.applicant'));
  }
  return steps;
}
