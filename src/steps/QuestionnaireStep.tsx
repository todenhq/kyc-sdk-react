'use client';

import React, { useState } from 'react';
import { StepHeader } from '../components/StepHeader';
import { Button } from '../components/ui/button';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { hasProofOfAddressStep, hasAddressCollectionStep, addressReturnStep } from '../lib/post-capture';
import { hasSupportingDocumentsStep, verifiedIdsFromState } from '../lib/supporting-documents';
import { isBusinessFlow } from '../lib/business';
import { nextBusinessStep, prevBusinessStep } from '../lib/business-application';
import { QuestionField } from './QuestionnaireFields';
import type { QuestionnaireAnswerValue } from '../types/config';
import { useText } from '../i18n';

/**
 * Extra-info questionnaire (compliance declarations — income, source of funds,
 * …), shown after capture, right before submission. Fields come from the
 * workflow config; answers ride the /verify submission and are re-validated
 * server-side against the published definition. Money questions store two
 * keys: `<key>` (amount) + `<key>_currency`.
 */
export function QuestionnaireStep() {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const questionnaire = config.questionnaire;
  const fields = questionnaire?.fields ?? [];
  const answers = state.questionnaireAnswers;

  const setAnswer = (key: string, value: QuestionnaireAnswerValue | undefined) => {
    dispatch({ type: 'SET_QUESTIONNAIRE_ANSWER', payload: { key, value } });
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
  };

  const handleBack = () => {
    // Mirror the forward path. In a business flow the questionnaire sits
    // inside the company section (after documents, before key people), so Back
    // walks that order.
    if (isBusinessFlow(config)) {
      dispatch({ type: 'SET_STEP', payload: prevBusinessStep('questionnaire', config) });
      return;
    }
    // Individual capture leg: the address step when it ran, else Proof of
    // Address, else liveness, else capture.
    const backTo = hasAddressCollectionStep(config.addressCollection)
      ? addressReturnStep(config)
      : hasSupportingDocumentsStep(config.supportingDocuments, verifiedIdsFromState(state, config))
      ? 'supporting-documents'
      : hasProofOfAddressStep(config.proofOfAddress)
      ? 'proof-of-address'
      : config.enableSelfie !== false
        ? 'liveness'
        : state.selectedIdType &&
            config.getIdTypeDefinition(state.selectedIdType)?.requiresDocumentCapture === false
          ? 'id-input'
          : 'document-capture';
    dispatch({ type: 'SET_STEP', payload: backTo });
  };

  const handleContinue = () => {
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      const value = answers[field.key];
      const empty =
        value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
      if (field.required && empty) {
        nextErrors[field.key] = t('questionnaire.error.required');
        continue;
      }
      // An "Other" choice obliges a description. Required whenever the flagged
      // option is picked, regardless of whether the question itself is
      // required: an unexplained "Other" is the answer that most needs
      // explaining.
      const detailOption = (field.options ?? []).find(
        (o) => o.requiresDetail && (Array.isArray(value) ? value.includes(o.value) : value === o.value),
      );
      if (detailOption) {
        const detail = answers[`${field.key}_other`];
        if (typeof detail !== 'string' || !detail.trim()) {
          nextErrors[field.key] = t('questionnaire.error.detailRequired', { option: detailOption.label });
          continue;
        }
      }
      if ((field.type === 'number' || field.type === 'money') && !empty) {
        const num = Number(value);
        if (!Number.isFinite(num) || (field.type === 'money' && num < 0)) {
          nextErrors[field.key] = t(
            field.type === 'money' ? 'questionnaire.error.invalidAmount' : 'questionnaire.error.invalidNumber',
          );
        } else if (field.min !== undefined && num < field.min) {
          nextErrors[field.key] = t('questionnaire.error.min', { min: field.min.toLocaleString() });
        } else if (field.max !== undefined && num > field.max) {
          nextErrors[field.key] = t('questionnaire.error.max', { max: field.max.toLocaleString() });
        }
      }
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    // Money answers always carry their currency companion — default the
    // definition's first currency when the user never touched the picker.
    for (const field of fields) {
      if (field.type !== 'money') continue;
      if (answers[field.key] !== undefined && answers[`${field.key}_currency`] === undefined) {
        const fallback = field.currencies?.[0];
        if (fallback) setAnswer(`${field.key}_currency`, fallback);
      }
    }
    // Business flows continue INTO the rest of the application (key people,
    // then the applicant's own verification); only the individual flow — and a
    // business flow with nothing after the questionnaire — submits here.
    if (isBusinessFlow(config)) {
      const next = nextBusinessStep('questionnaire', config);
      if (next !== 'submitted') {
        dispatch({ type: 'SET_STEP', payload: next });
        return;
      }
    }
    dispatch({ type: 'SUBMIT_VERIFICATION' });
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <StepHeader
        title={t('questionnaire.title', undefined, questionnaire?.title)}
        description={t('questionnaire.description', undefined, questionnaire?.description)}
        onBack={handleBack}
      />

      <div className="flex flex-col gap-4">
        {fields.map((field) => (
          <QuestionField
            key={field.key}
            field={field}
            value={answers[field.key]}
            currencyValue={answers[`${field.key}_currency`] as string | undefined}
            detailValue={answers[`${field.key}_other`] as string | undefined}
            error={errors[field.key]}
            onChange={(value) => setAnswer(field.key, value)}
            onCurrencyChange={(currency) => setAnswer(`${field.key}_currency`, currency)}
            onDetailChange={(detail) => setAnswer(`${field.key}_other`, detail)}
          />
        ))}
      </div>

      <Button onClick={handleContinue} className="w-full h-12 rounded-xl text-base font-medium">
        {t('common.continue')}
      </Button>
    </div>
  );
}
