'use client';

import React, { useState } from 'react';
import { StepHeader } from '../components/StepHeader';
import { supportingDocumentsIntro } from './supporting-documents-intro';
import { Button } from '../components/ui/button';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { BUSINESS_DOC_ACCEPTED_MIMES } from './BusinessDocumentSlot';
import { SupportingDocumentCard } from './SupportingDocumentCard';
import { isPdfMime, uploadSizeError } from '../lib/upload-limits';
import { resolveSupportingDocuments, verifiedIdsFromState } from '../lib/supporting-documents';
import { stepAfterSupportingDocuments } from '../lib/post-capture';
import { stepBeforeSupportingDocuments } from '../lib/supporting-documents-nav';
import { useText } from '../i18n';
import { VerificationApiError } from '../services/api';
import { hasSignature, type SignatureDrawing } from '../lib/signature';

/**
 * Supporting-documents step: one upload slot per requested document.
 *
 * These are artefacts the organisation keeps ON FILE — the org names each one
 * and writes the guidance under it — and NOT the identity evidence this
 * verification is decided on. The person has already been verified against the government
 * record by the time they get here, so a document that cannot be read costs
 * them nothing: the server records it and the verification stands.
 *
 * Each card names the values that will be read off that document, because a
 * supporting document is whatever the organisation called it: a slot with a
 * title alone says nothing about what handing it over is FOR.
 *
 * Which documents are asked for depends on the ID they picked, so this step
 * only appears when that resolution produces something (see VerificationModal).
 */
export function SupportingDocumentsStep() {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();
  const slots = resolveSupportingDocuments(
    config.supportingDocuments,
    verifiedIdsFromState(state, config),
  );

  const goBack = () =>
    dispatch({ type: 'SET_STEP', payload: stepBeforeSupportingDocuments(config, state) });
  const goNext = () => {
    const next = stepAfterSupportingDocuments(config);
    dispatch(next === 'submitted' ? { type: 'SUBMIT_VERIFICATION' } : { type: 'SET_STEP', payload: next });
  };
  const uploads = state.supportingDocuments;

  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  // In-memory Files for tap-to-preview only; lost on remount, which degrades
  // the row to the plain uploaded state. The mediaId is what matters.
  const [files, setFiles] = useState<Record<string, File | undefined>>({});

  const uploadFor = (key: string) => uploads.find((d) => d.type === key) ?? null;
  const setError = (key: string, message: string | null) =>
    setErrors((prev) => ({ ...prev, [key]: message ?? undefined }));

  const handlePick = async (key: string, file: File) => {
    setError(key, null);
    if (!BUSINESS_DOC_ACCEPTED_MIMES.includes((file.type.split(';')[0] || '').toLowerCase())) {
      setError(key, t('supportingDocuments.error.fileType'));
      return;
    }
    if (uploadSizeError(file.type, file.size)) {
      const tooLarge = isPdfMime(file.type) ? 'pdfTooLarge' : 'imageTooLarge';
      setError(key, t(`supportingDocuments.error.${tooLarge}`));
      return;
    }
    setUploadingKey(key);
    try {
      const mediaId = await config.api.upload(file, 'supporting_document');
      setFiles((prev) => ({ ...prev, [key]: file }));
      dispatch({
        type: 'SET_SUPPORTING_DOCUMENTS',
        payload: [...uploads.filter((d) => d.type !== key), { type: key, mediaId, fileName: file.name, method: 'uploaded' }],
      });
    } catch {
      setError(key, t('supportingDocuments.error.uploadFailed'));
    } finally {
      setUploadingKey(null);
    }
  };

  const handleSign = async (key: string, drawing: SignatureDrawing) => {
    setError(key, null);
    if (!hasSignature(drawing)) {
      setError(key, t('supportingDocuments.error.signatureEmpty'));
      return;
    }
    setUploadingKey(key);
    try {
      const mediaId = await config.api.uploadSignature(drawing);
      dispatch({
        type: 'SET_SUPPORTING_DOCUMENTS',
        payload: [...uploads.filter((d) => d.type !== key), { type: key, mediaId, method: 'drawn' }],
      });
    } catch (err) {
      const empty = err instanceof VerificationApiError && err.code === 'signature_empty';
      setError(key, t(empty ? 'supportingDocuments.error.signatureEmpty' : 'supportingDocuments.error.signatureFailed'));
    } finally {
      setUploadingKey(null);
    }
  };

  const handleRemove = (key: string) => {
    setFiles((prev) => ({ ...prev, [key]: undefined }));
    dispatch({ type: 'SET_SUPPORTING_DOCUMENTS', payload: uploads.filter((d) => d.type !== key) });
  };

  const requiredComplete = slots.every((slot) => !slot.required || uploadFor(slot.key) !== null);
  const optionalOnly = slots.every((slot) => !slot.required);

  return (
    <div className="space-y-6 animate-slide-up">
      <StepHeader
        title={t('supportingDocuments.title')}
        description={supportingDocumentsIntro(slots, t)}
        onBack={goBack}
      />

      <div className="space-y-3">
        {slots.map((slot, index) => (
          <SupportingDocumentCard
            key={slot.key}
            position={index + 1}
            total={slots.length}
            label={slot.label}
            description={slot.description}
            required={slot.required}
            reads={slot.reads}
            // A restored upload may carry no file name; the mediaId is what says it is there.
            fileName={uploadFor(slot.key) ? (uploadFor(slot.key)?.fileName ?? slot.label) : null}
            capture={slot.capture}
            drawn={uploadFor(slot.key)?.method === 'drawn'}
            onSign={(drawing) => void handleSign(slot.key, drawing)}
            file={files[slot.key] ?? null}
            uploading={uploadingKey === slot.key}
            error={errors[slot.key] ?? null}
            onPick={(file) => void handlePick(slot.key, file)}
            onRemove={() => handleRemove(slot.key)}
          />
        ))}
      </div>

      <Button
        onClick={goNext}
        disabled={!requiredComplete || uploadingKey !== null}
        className="w-full"
      >
        {t(optionalOnly && uploads.length === 0 ? 'common.skip' : 'common.continue')}
      </Button>
    </div>
  );
}
