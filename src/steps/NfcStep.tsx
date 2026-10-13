'use client';

import React from 'react';
import { Smartphone } from '../components/icons';
import { StepHeader } from '../components/StepHeader';
import { NfcScanIllustration } from '../components/NfcScanIllustration';
import { Button } from '../components/ui/button';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { stepAfterCapture } from '../lib/post-capture';
import { verifiedIdsFromState } from '../lib/supporting-documents';
import { useText } from '../i18n';

/**
 * NFC Chip Verification screen — the eMRTD chip read (e-passports & chip
 * eIDs). The WEB SDK never puts this step in the flow order: browsers can't
 * speak ISO-DEP, so chip reading is the native (mobile) SDKs' job. It exists
 * here as the visual reference the dashboard's builder preview drives to
 * (`previewStep="nfc"`) — the mobile SDK renders the visually-identical
 * screen, so what the builder shows is what end users get.
 */
export function NfcStep() {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();

  const hasLiveness =
    config.enableSelfie !== false &&
    (state.selectedIdType
      ? config.getIdTypeFeatures(config.country, state.selectedIdType)?.livenessCheck ?? config.enableLiveness !== false
      : config.enableLiveness !== false);

  const advance = () => {
    if (hasLiveness) {
      dispatch({ type: 'SET_STEP', payload: 'liveness' });
      return;
    }
    const next = stepAfterCapture(config, verifiedIdsFromState(state, config));
    if (next === 'submitted') {
      dispatch({ type: 'SUBMIT_VERIFICATION' });
    } else {
      dispatch({ type: 'SET_STEP', payload: next });
    }
  };

  const allowSkip = config.nfc?.allowSkip === true;

  return (
    <div className="space-y-6 animate-slide-up">
      <StepHeader
        title={t('nfc.title')}
        description={t('nfc.description')}
        onBack={() => dispatch({ type: 'SET_STEP', payload: 'document-capture' })}
      />

      <NfcScanIllustration />

      <p className="animate-pulse text-center text-sm text-muted-foreground">
        {t('nfc.waiting')}
      </p>

      {/* Subtle capability note — mirrors the camera note on the capture steps. */}
      <div className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Smartphone className="h-3.5 w-3.5 shrink-0" />
        {t('nfc.deviceNote')}
      </div>

      {/* Skip affordance — shown when the workflow allows it, so a user whose
          phone can't read the chip can still proceed. The native SDKs also
          auto-skip on devices with no NFC radio; this is the manual escape
          hatch on NFC-capable phones (and the preview always shows Continue). */}
      {allowSkip && (
        <Button
          variant="ghost"
          onClick={advance}
          className="w-full h-11 rounded-xl text-sm font-medium text-muted-foreground"
        >
          {t('nfc.skip')}
        </Button>
      )}

      {config.previewMode && (
        <Button onClick={advance} className="w-full h-12 rounded-xl text-base font-medium">
          {t('common.continue')}
        </Button>
      )}
    </div>
  );
}
