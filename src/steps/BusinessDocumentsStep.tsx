'use client';

import React, { useState } from 'react';
import { StepHeader } from '../components/StepHeader';
import { Button } from '../components/ui/button';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import {
  nextBusinessStep,
  prevBusinessStep,
  resolveBusinessDocumentTypes,
} from '../lib/business-application';
import { BusinessDocumentSlot, BUSINESS_DOC_ACCEPTED_MIMES } from './BusinessDocumentSlot';
import { uploadSizeError } from '../lib/upload-limits';
import type { BusinessDocumentKey } from '../types/business';
import { useText } from '../i18n';

/**
 * Business-documents step: one upload slot per configured document type. Each
 * file uploads immediately (type 'business_document'); Continue is blocked
 * until every REQUIRED slot has a mediaId. Uploads are stored in flow state as
 * `[{ type, mediaId, fileName }]` and ride the business /verify submission.
 */
export function BusinessDocumentsStep() {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();
  const slots = resolveBusinessDocumentTypes(config.business, t);
  const uploads = state.businessApplication.documents;

  const [uploadingKey, setUploadingKey] = useState<BusinessDocumentKey | null>(null);
  const [errors, setErrors] = useState<Partial<Record<BusinessDocumentKey, string>>>({});
  // In-memory Files for tap-to-preview (lost on remount — the row degrades to
  // the plain uploaded state; the mediaId in flow state is what matters).
  const [files, setFiles] = useState<Partial<Record<BusinessDocumentKey, File>>>({});

  const uploadFor = (key: BusinessDocumentKey) => uploads.find((d) => d.type === key) ?? null;
  const setError = (key: BusinessDocumentKey, message: string | null) =>
    setErrors((prev) => ({ ...prev, [key]: message ?? undefined }));

  const handlePick = async (key: BusinessDocumentKey, file: File) => {
    setError(key, null);
    if (!BUSINESS_DOC_ACCEPTED_MIMES.includes((file.type.split(';')[0] || '').toLowerCase())) {
      setError(key, t('business.documents.errorFileType'));
      return;
    }
    const sizeError = uploadSizeError(file.type, file.size);
    if (sizeError) {
      setError(key, sizeError);
      return;
    }
    setUploadingKey(key);
    try {
      const mediaId = await config.api.upload(file, 'business_document');
      setFiles((prev) => ({ ...prev, [key]: file }));
      dispatch({
        type: 'SET_BUSINESS_APPLICATION',
        payload: {
          documents: [
            ...state.businessApplication.documents.filter((d) => d.type !== key),
            { type: key, mediaId, fileName: file.name },
          ],
        },
      });
    } catch {
      setError(key, t('business.documents.errorUpload'));
    } finally {
      setUploadingKey(null);
    }
  };

  const handleRemove = (key: BusinessDocumentKey) => {
    setFiles((prev) => ({ ...prev, [key]: undefined }));
    dispatch({
      type: 'SET_BUSINESS_APPLICATION',
      payload: { documents: uploads.filter((d) => d.type !== key) },
    });
  };

  const requiredComplete = slots.every((slot) => !slot.required || uploadFor(slot.key) !== null);

  const handleContinue = () => {
    if (!requiredComplete) return;
    const next = nextBusinessStep('business-documents', config);
    if (next === 'submitted') {
      dispatch({ type: 'SUBMIT_VERIFICATION' });
    } else {
      dispatch({ type: 'SET_STEP', payload: next });
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <StepHeader
        title={t('business.documents.title')}
        description={t('business.documents.description')}
        onBack={() =>
          dispatch({ type: 'SET_STEP', payload: prevBusinessStep('business-documents', config) })
        }
      />

      <div className="space-y-3">
        {slots.map((slot) => (
          <BusinessDocumentSlot
            key={slot.key}
            label={slot.label}
            required={slot.required}
            fileName={uploadFor(slot.key)?.fileName ?? null}
            file={files[slot.key] ?? null}
            uploading={uploadingKey === slot.key}
            error={errors[slot.key] ?? null}
            onPick={(file) => void handlePick(slot.key, file)}
            onRemove={() => handleRemove(slot.key)}
          />
        ))}
      </div>

      <Button
        onClick={handleContinue}
        disabled={!requiredComplete || uploadingKey !== null}
        className="w-full"
      >
        {t('common.continue')}
      </Button>
    </div>
  );
}
