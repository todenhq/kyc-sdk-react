'use client';

import React from 'react';
import { ChevronRight } from '../components/icons';
import { cn } from '../lib/utils';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { StepHeader } from '../components/StepHeader';
import { CountryFlag } from '../components/CountryFlag';
import { CountryRegionPicker } from '../components/CountryRegionPicker';
import { businessCountryName, isBusinessFlow } from '../lib/business';
import { applicantCountryOptions } from '../lib/business-application';
import type { AnyCountry } from '../types/config';
import { useText } from '../i18n';

// Above this many offered countries, the flat button list becomes unusable, so
// we switch to the searchable, region-grouped picker (Global Documents can
// offer ~200 countries).
const SEARCH_THRESHOLD = 5;

/**
 * Country selection for multi-region flows (config.countries has >1 entry).
 * Picking a country sets the session's EFFECTIVE country (the config provider
 * resolves it for every later step) and moves on to the ID-type list.
 *
 * Renders ANY ISO country (Global Documents): a flat list for a few countries,
 * or a searchable + region-grouped picker past SEARCH_THRESHOLD. Names come from
 * `Intl.DisplayNames` and `CountryFlag` renders the matching SVG flag.
 */
export function CountrySelectStep() {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();

  // Multi-region flows (and a mapped applicant workflow's overlay) carry
  // `countries`; a plain KYB applicant leg does not, so it falls back to the
  // org's GRANTED countries — the applicant may hold an ID issued anywhere
  // the org can verify. One helper, shared with the continue/back branches.
  const options = applicantCountryOptions(config);
  const selected = state.selectedCountry ?? null;

  const pick = (country: AnyCountry) => {
    dispatch({ type: 'SET_COUNTRY', payload: country });
    dispatch({ type: 'SET_STEP', payload: 'id-type' });
  };

  return (
    // flex-1 + min-h-0 so the picker fills the (flex-col) modal body and owns
    // its own scroll — the modal's height is unchanged; only the list grows.
    <div className="flex min-h-0 flex-1 flex-col gap-6 animate-slide-up">
      <StepHeader
        title={t('selectDocument.country.title')}
        description={t('selectDocument.country.description')}
        // In the KYB applicant leg this step sits after applicant-role, not
        // after consent.
        onBack={() =>
          dispatch({ type: 'SET_STEP', payload: isBusinessFlow(config) ? 'applicant-role' : 'consent' })
        }
      />

      {options.length > SEARCH_THRESHOLD ? (
        <CountryRegionPicker
          countries={options}
          selected={selected}
          geoCountry={config.serverConfig?.geoCountry}
          onPick={pick}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {options.map((country) => (
            <button
              key={country}
              type="button"
              onClick={() => pick(country)}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors',
                selected === country
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/40'
                  : 'border-border hover:border-primary/40 hover:bg-muted/40',
              )}
            >
              <CountryFlag code={country} className="h-8 w-8" title={businessCountryName(country)} />
              <span className="flex-1 text-base font-medium">{businessCountryName(country)}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
