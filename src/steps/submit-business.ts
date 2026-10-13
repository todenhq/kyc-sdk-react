// ---------------------------------------------------------------------------
// Business (KYB) APPLICATION submission — the registry-details submit plus the
// application extras (documents, key people, applicant declaration), and the
// follow-up APPLICANT submission: a SECOND, ordinary INDIVIDUAL verification
// linked back to the application via `metadata.userId = applicantKeyPersonId`.
// Extracted from SubmittedStep per the 200-line rule.
// ---------------------------------------------------------------------------

import { withRetry } from '../lib/retry';
import { businessProductsForCountry } from '../lib/business';
import {
  hasApplicantVerification,
  hasBusinessDocumentsStep,
  hasKeyPeopleCollection,
  keyPeoplePayload,
  splitFullName,
} from '../lib/business-application';
import {
  generateRequestId,
  buildSubmitMetadata,
  uploadCaptureVideos,
  silentCaptureForSubmit,
  withSilentCaptureMetadata,
} from './submit-helpers';
import { settleLivenessVideo } from '../lib/integrity-signals';
import type { VerificationConfigValue } from '../context/VerificationConfigContext';
import type { VerificationState } from '../context/types';
import type { VerifyRequest } from '../services/api';

interface SubmitBusinessOptions {
  config: VerificationConfigValue;
  state: VerificationState;
  requestId: string;
  onRetry: (attempt: number, total: number) => void;
}

/**
 * Submit the business application. Resolves with the BUSINESS verificationId;
 * when the server mints an `applicantKeyPersonId` and applicant media was
 * captured, the applicant's own individual verification is submitted
 * fire-and-forget (a failure never blocks the submitted screen — the org can
 * re-invite the applicant from the dashboard).
 */
export async function submitBusinessApplication({
  config,
  state,
  requestId,
  onRetry,
}: SubmitBusinessOptions): Promise<{ verificationId: string; keyPeopleInvites: Array<{ keyPersonId: string; name: string; inviteUrl: string }> }> {
  const business = config.business!;
  const registrationNumber = state.business.registrationNumber.trim();
  const registrationName = state.business.registrationName.trim();
  const contactEmail = state.business.contactEmail.trim();
  const address = state.business.address.trim();
  const email = state.business.email.trim();
  const phone = state.business.phone.trim();
  const website = state.business.website.trim();
  // The five registry facts, sent only when filled. The server drops any the
  // workflow has switched off, so an over-send is validate-and-drop rather than
  // an error, and an under-send is what the required-field 422 is for.
  const stated = Object.fromEntries(
    (
      ['dateOfIncorporation', 'taxId', 'vatNumber', 'companyType', 'natureOfBusiness'] as const
    )
      .map((k) => [k, state.business[k].trim()])
      .filter(([, v]) => v !== ''),
  );
  // Multi-registry workflows: the picked country (step state) wins over the
  // workflow's primary; products were already narrowed to that country.
  const country = state.business.country ?? business.country;
  const product = state.business.product ?? businessProductsForCountry(business, country)[0]!;

  const app = state.businessApplication;
  // Application extras ride the business block ONLY when the workflow
  // configures them — the server ignores unconfigured fields anyway.
  const documents =
    hasBusinessDocumentsStep(business) && app.documents.length > 0
      ? app.documents.map((d) => ({ type: d.type, mediaId: d.mediaId }))
      : undefined;
  const keyPeople = hasKeyPeopleCollection(business)
    ? keyPeoplePayload(app.keyPeople, app.applicantKeyPersonIndex)
    : [];
  const applicant =
    hasApplicantVerification(business) && app.applicantRole
      ? {
          role: app.applicantRole,
          ...(app.applicantName.trim() ? { name: app.applicantName.trim() } : {}),
        }
      : undefined;

  const result = await withRetry(
    () =>
      config.api.verify({
        country,
        // Resumable session this application belongs to (dropped if not ours).
        ...(state.sessionId ? { sessionId: state.sessionId } : {}),
        // The product key rides on idType for transport symmetry.
        idType: product,
        business: {
          registrationNumber,
          ...(registrationName ? { registrationName } : {}),
          ...(contactEmail ? { contactEmail } : {}),
          ...(address ? { address } : {}),
          ...(email ? { email } : {}),
          ...(phone ? { phone } : {}),
          ...(website ? { website } : {}),
          ...stated,
          product,
          ...(documents ? { documents } : {}),
          ...(keyPeople.length > 0 ? { keyPeople } : {}),
          // The FATF fallback, attested: no natural person qualifies as a UBO.
          ...(app.uboUnidentifiable ? { uboUnidentifiable: true } : {}),
          ...(applicant ? { applicant } : {}),
        },
        ...(config.workflowId ? { workflowId: config.workflowId } : {}),
        ...(config.userId ? { userId: config.userId } : {}),
        ...(Object.keys(state.questionnaireAnswers).length > 0
          ? { questionnaire: state.questionnaireAnswers }
          : {}),
        // Contact-verification proof tokens (the applicant's email/phone OTP).
        ...(state.contact.emailToken || state.contact.phoneToken
          ? {
              contact: {
                ...(state.contact.emailToken ? { emailToken: state.contact.emailToken } : {}),
                ...(state.contact.phoneToken ? { phoneToken: state.contact.phoneToken } : {}),
              },
            }
          : {}),
        metadata: {
          ...buildSubmitMetadata(config.metadata, requestId, config.deviceIntelligence !== false),
          // Ignored by production, so it is safe to send whenever it is set.
          ...(state.business.sandboxOutcome
            ? { sandboxOutcome: state.business.sandboxOutcome }
            : {}),
        },
      }),
    { onRetry },
  );

  // Applicant KYC: fire-and-forget — the submitted screen shows after the
  // BUSINESS submit; a failed applicant submit only warns (non-blocking).
  if (result.applicantKeyPersonId && applicantMediaCaptured(state)) {
    void submitApplicantVerification(config, state, country, result.applicantKeyPersonId).catch(
      (err) => {
        console.warn(
          '[Verification] Applicant identity submission failed — the organization can re-invite the applicant from the dashboard:',
          err,
        );
      },
    );
  }

  return { verificationId: result.verificationId, keyPeopleInvites: result.keyPeopleInvites ?? [] };
}

/** Whether the applicant capture leg actually produced something to submit. */
function applicantMediaCaptured(state: VerificationState): boolean {
  return Boolean(
    state.selectedIdType &&
      (state.mediaIds.selfie || state.mediaIds.documentFront || state.idNumber.trim() !== ''),
  );
}

/**
 * The applicant's own verification — an ordinary INDIVIDUAL submission: the
 * country they picked, the ID type, their captured media, and
 * `metadata.userId = applicantKeyPersonId` (the server-side link back to the
 * application). The KYB workflow itself is never stamped on it (it is not an
 * individual flow) — but when the org mapped an applicant workflow
 * (business.applicant.workflowId), THAT id rides along so the server applies
 * the mapped workflow's gates, pricing and decision graph.
 */
async function submitApplicantVerification(
  config: VerificationConfigValue,
  state: VerificationState,
  country: string,
  applicantKeyPersonId: string,
): Promise<void> {
  const idType = state.selectedIdType!;
  // The applicant's own leg country: their country-select choice is already
  // folded into the context's effective `country` — the registry country
  // (the `country` param) is only the last-resort fallback. A GH-passport
  // applicant on an NG-registered business must submit country=GH.
  const legCountry = String(config.country || country);
  const isNumberOnly =
    config.getIdTypeDefinition(idType, legCountry)?.requiresDocumentCapture === false;
  const idNumber = isNumberOnly ? state.idNumber : undefined;

  // Best-effort capture videos (same contract as the individual flow).
  const videoIds = await uploadCaptureVideos(config.api, state);
  settleLivenessVideo({ hadRecording: Boolean(state.livenessVideoBlob), uploaded: Boolean(videoIds.livenessVideo) });

  // Name: values typed on the id-input step win; the applicant-role step's
  // optional full name fills the gaps.
  const split = splitFullName(state.businessApplication.applicantName) ?? {};
  const firstName = state.userData.firstName.trim() || split.firstName;
  const lastName = state.userData.lastName.trim() || split.lastName;
  const userData =
    firstName || lastName
      ? { ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) }
      : undefined;

  const requestId = generateRequestId('kyc');
  // Silent capture: the applicant's unposed frames ride their own leg.
  const silent = await silentCaptureForSubmit();
  const metadata: VerifyRequest['metadata'] = withSilentCaptureMetadata(
    buildSubmitMetadata(config.metadata, requestId, config.deviceIntelligence !== false),
    silent,
  );
  // The link back to the application — written last so nothing clobbers it.
  metadata.userId = applicantKeyPersonId;

  await withRetry(() =>
    config.api.verify({
      // The applicant's own KYC leg belongs to the same application session.
      ...(state.sessionId ? { sessionId: state.sessionId } : {}),
      country: legCountry,
      idType,
      ...(config.applicantWorkflowId ? { workflowId: config.applicantWorkflowId } : {}),
      ...(idNumber ? { idNumber } : {}),
      ...(userData ? { userData } : {}),
      mediaIds: {
        documentFront: state.mediaIds.documentFront,
        documentBack: state.mediaIds.documentBack,
        selfie: state.mediaIds.selfie,
        ...videoIds,
        ...silent.mediaIds,
      },
      metadata,
    }),
  );
}
