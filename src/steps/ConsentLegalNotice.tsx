'use client';

import React from 'react';
import { useOptionalVerificationConfig } from '../context/VerificationConfigContext';
import { useText } from '../i18n';
import { PRIVACY_URL, TERMS_URL } from '../lib/brand';
import { effectiveTrustAttribution, myazaProviderName, needsProcessorDisclosure } from '../lib/trust-attribution';

const LINK_CLASS = 'font-medium text-foreground underline underline-offset-2 hover:text-primary';

/**
 * The consent notice above the Continue button, one paragraph. The sentence is
 * a catalogue text with `{terms}` and `{privacy}` where the two links sit; the
 * link labels are texts of their own.
 *
 * When the org's own logo replaces Myaza's in the footer, the paragraph opens
 * by naming Myaza as the provider for that organisation and calls the terms
 * Myaza's: Myaza still processes the applicant's data (and biometrics), so
 * data protection law needs it disclosed. None of that wording is customisable.
 */
export function ConsentLegalNotice({
  isBusiness,
  capturesFace,
  recordsVideo,
}: {
  isBusiness: boolean;
  capturesFace: boolean;
  recordsVideo: boolean;
}) {
  const t = useText();
  const config = useOptionalVerificationConfig();
  const branding = config?.serverConfig?.branding;
  const attribution = effectiveTrustAttribution(
    branding?.trustAttribution,
    config?.previewTrustAttribution,
    config?.previewMode,
  );
  const namesMyaza = needsProcessorDisclosure(attribution);
  const org = namesMyaza
    ? myazaProviderName(attribution, config?.appearance?.companyName, branding?.companyName)
    : '';
  const lead = namesMyaza
    ? org
      ? t('welcome.legal.providedFor', { org })
      : t('welcome.legal.providedByMyaza')
    : null;

  // `{terms}` / `{privacy}` are not passed as values, so t() leaves them in place
  // for the split below to swap for the links.
  const key = namesMyaza ? 'welcome.legal.myaza' : 'welcome.legal';
  const sentence = t(isBusiness ? `${key}.business` : key);
  const parts = sentence.split(/(\{terms\}|\{privacy\})/);
  const extra = capturesFace
    ? t('welcome.legal.faceAndRecording')
    : recordsVideo
      ? t('welcome.legal.recording')
      : null;

  return (
    <p className="pb-2 text-xs leading-relaxed text-muted-foreground">
      {lead && <>{lead} </>}
      {parts.map((part, i) =>
        part === '{terms}' ? (
          <a key={i} href={TERMS_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            {t('welcome.legal.termsLink')}
          </a>
        ) : part === '{privacy}' ? (
          <a key={i} href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
            {t('welcome.legal.privacyLink')}
          </a>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
      {extra && <> {extra}</>}
    </p>
  );
}
