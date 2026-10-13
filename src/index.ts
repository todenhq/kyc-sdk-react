// Components
//
// Face re-authentication runs through this same entry point: mount it with a
// workflow whose scope is `biometric-authentication` and the flow walks the
// liveness step and submits to /verify like every other scope.
export { Verification, useVerification } from './Verification';
// The text catalogue: what the dashboard's Texts editor lists, and the defaults.
export { TEXT_GROUPS, DEFAULT_TEXTS, BASE_LANGUAGE, resolveText } from './i18n';
export type { TextEntry, TextGroup, WorkflowTexts } from './i18n';

// Hosted "continue on your phone" entry — mounted by the Myaza-hosted
// verification page (`/verify/<token>`), not by integrators directly.
export { HostedVerification } from './HostedVerification';
export { HostedLoadingScreen } from './hosted/HostedScreen';
export type { HostedVerificationProps, HostedVerificationReadyInfo } from './HostedVerification';

// Context (for advanced usage)
export { VerificationProvider, useVerificationContext } from './context/VerificationContext';

// Types
export type {
  VerificationConfig,
  VerificationProps,
  UseVerificationReturn,
  VerificationStep,
  VerificationAppearance,
  VerificationConsentContent,
  VerificationSuccessContent,
  VoiceGuidanceConfig,
  VoiceGuidanceOption,
  SupportedCountry,
  AnyCountry,
  IdType,
  AnyIdType,
  QuestionnaireConfig,
  QuestionnaireField,
  QuestionnaireFieldOption,
  QuestionnaireAnswerValue,
  EmailVerificationConfig,
  PhoneVerificationConfig,
  OtpInputStyle,
} from './types/config';

export type {
  VerificationSubmission,
  VerificationResult,
  VerificationErrorCode,
  VerificationErrorDetails,
} from './types/verification';

// The biometric scopes' flow options (selfie review, where the verdict lands,
// the Done button), resolved the same way on the server and every SDK.
export type { BiometricFlowConfig, BiometricFlowOptions, BiometricCopy, BiometricCopyText } from './lib/biometric-options';
export { biometricFlowOptions, showsSelfieReview, waitsForResult, showsDoneButton } from './lib/biometric-options';

// Verification Flow types — the dashboard-built config templates the SDK can
// run from via the `workflowId` prop.
export type { WorkflowConfigPayload, WorkflowResolutionResponse } from './services/api';

// Business (KYB) workflow types — workflow-required; the SDK enters the
// business flow only when the resolved config carries subjectType 'business'.
export type {
  SubjectType,
  WorkflowBusinessConfig,
  WorkflowKeyPeopleConfig,
  WorkflowBusinessDocumentsConfig,
  WorkflowBusinessDocumentTypeConfig,
  WorkflowBusinessApplicantConfig,
  BusinessDocumentKey,
  KeyPersonRole,
  ApplicantRole,
} from './types/business';

// `VerificationError` is a class (extends Error) — export it as a value so consumers can
// `instanceof`-narrow the error passed to onError.
export { VerificationError } from './types/verification';

// The branded QR, exported so the dashboard renders the SAME code an applicant
// sees in the SDK rather than growing a second, plainer one of its own.
export { StyledQRCode, type StyledQRCodeProps } from './components/StyledQRCode';
export { MYAZA_QR_LOGO } from './lib/qr-logo';

// The earlier names, kept as deprecated aliases.
export {
  MyazaKYC,
  useMyazaKYC,
  MyazaKYCHosted,
} from './deprecated-names';
export type {
  MyazaKYCConfig,
  MyazaKYCProps,
  UseMyazaKYCReturn,
  MyazaKYCHostedProps,
  MyazaKYCHostedReadyInfo,
} from './deprecated-names';

// Earlier KYC-prefixed names, kept as deprecated aliases of the names above.
export type { VerificationAppearance as KYCAppearance } from './types/config';
export type { VerificationConsentContent as KYCConsentContent } from './types/config';
export { VerificationError as KYCError } from './types/verification';
export type { VerificationErrorCode as KYCErrorCode } from './types/verification';
export type { VerificationErrorDetails as KYCErrorDetails } from './types/verification';
export { VerificationProvider as KYCProvider } from './context/VerificationContext';
export type { VerificationResult as KYCResult } from './types/verification';
export type { VerificationStep as KYCStep } from './types/config';
export type { VerificationSubmission as KYCSubmission } from './types/verification';
export type { VerificationSuccessContent as KYCSuccessContent } from './types/config';
export { useVerificationContext as useKYCContext } from './context/VerificationContext';
