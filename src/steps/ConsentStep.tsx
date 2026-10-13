'use client';

import { configScope, isFaceScope } from '../lib/scope';
import React from 'react';
import { ShieldCheck, Lock, RotateCcw } from '../components/icons';
import { Button } from '../components/ui/button';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { useText } from '../i18n';
import { isBusinessFlow } from '../lib/business';
import { firstStepAfterConsent } from '../lib/contact-steps';
import { resubmitNote } from '../lib/resubmit';
import { documentCaptureNeedsCamera } from '../lib/document-capture-methods';
import { hasApplicantVerification } from '../lib/business-application';
import { MobileHandoffSheet } from '../components/MobileHandoffSheet';
import { consentDescription, consentProcessSteps, consentTitle } from './consent-copy';
import { ConsentLegalNotice } from './ConsentLegalNotice';

export function ConsentStep() {
  const { dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const isBusiness = isBusinessFlow(config);
  const scope = isBusiness ? null : configScope(config);
  const faceScope = isFaceScope(scope);
  const t = useText();
  // Tokens fill from userData. Business details aren't collected until after
  // consent, so {businessName} resolves here only when the integrator passes it.
  const copyCase = { isBusiness, scope };
  const title = consentTitle(
    { ...copyCase, firstName: config.userData?.firstName, legacy: config.consent?.title },
    t,
  );
  const description = consentDescription({ ...copyCase, legacy: config.consent?.description }, t);

  const handleContinue = () => {
    // Contact-verification steps (when enabled) come first — a cheap
    // pre-filter before capture/registry spend. Then business flows go to the
    // details form; multi-region individual flows pick the country; single-
    // region goes straight to the ID-type list.
    dispatch({
      type: 'SET_STEP',
      payload: firstStepAfterConsent({ ...config, subjectTypeIsBusiness: isBusiness }),
    });
  };

  // The consent notice must describe THIS flow, not the product. Claiming
  // facial recognition on a flow with no selfie step would be a false statement
  // in a legal notice — and the reverse (recording video without saying so) is
  // the failure that actually matters. Both are derived, never assumed.
  const capturesFace = isBusiness
    ? hasApplicantVerification(config.business)
    : faceScope || (!scope && config.enableSelfie !== false);
  const recordsVideo =
    // Only the camera scan records the document: a photo picked from the device
    // (upload-only document capture) carries no video.
    capturesFace || (!isBusiness && !scope && documentCaptureNeedsCamera(config));

  const steps = consentProcessSteps(config, copyCase, t);

  // A reviewer sent this applicant back. Say so, and say why — the note is the
  // only thing on screen that explains a flow which has silently lost most of
  // its steps. Rendered ABOVE the title so it is read before the instructions.
  const redoNote = resubmitNote(config.resubmit);

  return (
    <div className="space-y-7 animate-slide-up">
      {redoNote && (
        <div className="flex gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-left">
          <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {t('welcome.redo.title')}
            </p>
            <p className="text-sm leading-relaxed text-foreground/80">{redoNote}</p>
          </div>
        </div>
      )}
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="relative flex h-20 w-20 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-primary/10 animate-pulse-ring" />
          <span className="absolute inset-2 rounded-full bg-primary/15" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30">
            <ShieldCheck className="h-7 w-7 text-primary-foreground" />
          </div>
        </div>
        <div className="space-y-1.5">
          <h2 className="text-2xl font-semibold leading-tight font-heading">
            {title}
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            {description}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-secondary/40 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('welcome.process.heading')}
        </p>
        <ul className="mt-4 space-y-3.5">
          {steps.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4.5 w-4.5" />
              </span>
              <span className="text-sm font-medium text-foreground/90">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        {/* The notice sits IMMEDIATELY above the button it describes: consent is
            now given by acting, so the disclosure has to be adjacent to the act
            for that consent to be informed. */}
        <ConsentLegalNotice isBusiness={isBusiness} capturesFace={capturesFace} recordsVideo={recordsVideo} />

        <Button onClick={handleContinue} className="w-full">
          {t('common.continue')}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3 w-3" />
          {t('welcome.secureNote')}
        </p>
        {/* No camera in the business flow — nothing to hand off to a phone for. */}
        {!isBusiness && (
          <div className="flex justify-center pt-1">
            <MobileHandoffSheet />
          </div>
        )}
      </div>
    </div>
  );
}
