'use client';

import React from 'react';
import { StepHeader } from '../components/StepHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { stepAfterCapture } from '../lib/post-capture';
import { multiIdPlan } from '../lib/multi-id';
import { verifiedIdsFromState } from '../lib/supporting-documents';
import { validateIdNumber } from '../utils/validators';
import type { AnyCountry } from '../types/config';
import { useText } from '../i18n';

interface IdInputStepProps {
  country?: AnyCountry;
}

export function IdInputStep({ country }: IdInputStepProps = {}) {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();

  const resolvedCountry: AnyCountry = country ?? config.country ?? 'NG';

  // Curated local definition (digits/pattern validation) when one exists,
  // else the server-synthesized one — no digits/pattern, so the ID number
  // falls back to a free-text input validated as non-empty.
  const idTypeDef = state.selectedIdType
    ? config.getIdTypeDefinition(state.selectedIdType, resolvedCountry)
    : null;

  // What the field asks for — e.g. Tax ID is looked up by the person's NIN.
  const idLabel = idTypeDef?.inputLabel ?? idTypeDef?.label ?? t('selectDocument.idInput.defaultLabel');

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  // This step asks for the ID NUMBER and nothing else. The name is the
  // integrator's to supply — through `userData` on the mount, or on the session
  // when it is created — because their record is the meaningful claim. A
  // subject typing their own name and us checking it against the register only
  // proves they know their own name, and asking for it invited the typo that
  // fails a lookup the register would have matched.
  const idValidation = state.selectedIdType
    ? validateIdNumber(resolvedCountry, state.selectedIdType, state.idNumber)
    : { valid: state.idNumber.trim() !== '', message: '' };

  const isFormValid = state.idNumber.trim() !== '' && idValidation.valid;

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  const handleContinue = () => {
    if (!isFormValid) return;
    // Skip liveness when the org has it disabled for this ID — go straight
    // to the submission step.
    const features = state.selectedIdType
      ? config.getIdTypeFeatures(resolvedCountry, state.selectedIdType)
      : null;
    const skipLiveness =
      config.enableSelfie === false ||
      (features ? !features.livenessCheck : config.enableLiveness === false);
    const afterRun = skipLiveness ? stepAfterCapture(config, verifiedIdsFromState(state, config)) : 'liveness';
    // Multi-ID: this slot is done — commit its evidence and move to the next
    // slot's picker, or on to liveness after the last slot.
    const plan = multiIdPlan(config, state, config.serverConfig.idTypes);
    if (plan) {
      dispatch({
        type: 'COMMIT_MULTI_ID_SLOT',
        payload: { nextStep: plan.last ? afterRun : 'id-type' },
      });
      return;
    }
    dispatch({ type: 'SET_STEP', payload: afterRun });
  };

  const handleBack = () => {
    // Number-only IDs (BVN/NIN/vNIN) came from id-type, not document-capture
    const prev = idTypeDef && !idTypeDef.requiresDocumentCapture
      ? 'id-type'
      : 'document-capture';
    dispatch({ type: 'SET_STEP', payload: prev });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-5 animate-slide-up">
      <StepHeader
        title={t('selectDocument.idInput.title', { idLabel })}
        description={t('selectDocument.idInput.description')}
        onBack={handleBack}
        country={resolvedCountry}
      />

      <div className="space-y-4">
        {/* ID Number */}
        <div className="space-y-2">
          <Label htmlFor="idNumber">{idLabel}</Label>
          <Input
            id="idNumber"
            placeholder={
              idTypeDef?.digits
                ? t('selectDocument.idInput.placeholderDigits', { digits: idTypeDef.digits, idLabel })
                : t('selectDocument.idInput.placeholder', { idLabel })
            }
            value={state.idNumber}
            onChange={(e) => dispatch({ type: 'SET_ID_NUMBER', payload: e.target.value })}
            className={state.idNumber && !idValidation.valid ? 'border-destructive' : ''}
          />
          {state.idNumber && !idValidation.valid && idValidation.message && (
            <p className="text-sm text-destructive">{idValidation.message}</p>
          )}
        </div>
      </div>

      <Button
        onClick={handleContinue}
        disabled={!isFormValid}
        className="w-full"
      >
        {t('common.continue')}
      </Button>
    </div>
  );
}
