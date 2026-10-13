'use client';

import React, { useEffect } from 'react';
import {
  Fingerprint,
  FileText,
  Landmark,
  IdCard,
  Contact,
  BookUser,
} from '../components/icons';
import { StepHeader } from '../components/StepHeader';
import { Card } from '../components/ui/card';
import { cn } from '../lib/utils';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { listIdTypeDefinitions } from '../utils/id-definitions';
import { isBusinessFlow } from '../lib/business';
import { multiIdEvidenceStep, multiIdPlan } from '../lib/multi-id';
import { applicantCountryOptions, applicantSelfCountry } from '../lib/business-application';
import type { AnyIdType, AnyCountry, IdTypeDefinition } from '../types/config';
import { defaultCountry } from '../lib/country-default';
import { useText } from '../i18n';

// Keyed by idType key, so the generic Global-Documents types (passport /
// drivers-license / national-id) get sensible icons in ANY country; unknown
// keys fall back to the generic document icon (FileText) below.
const ID_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  bvn: Landmark, // Bank Verification Number → bank/landmark
  nin: Fingerprint,
  vnin: Fingerprint,
  passport: BookUser,
  'drivers-license': IdCard, // an ID card, like the other licences and cards
  pvc: Contact, // Permanent Voter's Card
  'ghana-card': IdCard,
  voters: Contact,
  ssnit: IdCard,
  'national-id': IdCard,
  cni: IdCard,
  'residence-card': IdCard,
};

interface IdTypeStepProps {
  country?: AnyCountry;
  allowedIdTypes?: AnyIdType[];
}

export function IdTypeStep({ country, allowedIdTypes }: IdTypeStepProps = {}) {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();
  const { serverConfig } = config;

  // Which country's documents to offer. A named country wins; failing that the
  // visitor's own is a better guess than whichever one is hardcoded, and Global
  // Documents means any ISO country resolves to a usable list.
  const resolvedCountry = (defaultCountry(country, serverConfig.geoCountry) ?? 'NG') as AnyCountry;

  // Local curated definitions ∪ server-synthesized ones (Global Documents) —
  // countries with no local ID_TYPES entry render entirely from server rows.
  const allTypes: readonly IdTypeDefinition[] = listIdTypeDefinitions(
    resolvedCountry,
    serverConfig.idTypes,
  );
  // An empty allowlist means "offer everything granted", same as absent — the
  // server treats [] that way, so the picker must too.
  const propAllowed =
    allowedIdTypes && allowedIdTypes.length > 0
      ? allTypes.filter((t) => allowedIdTypes.includes(t.key))
      : allTypes;

  // Intersect with the server-driven access list. While the config is still
  // loading we show nothing (a loader renders below); on error we fall back
  // to the prop list so the SDK is at worst as restrictive as the server.
  const grantedKeys = new Set(
    serverConfig.idTypes
      .filter((row) => row.country === resolvedCountry)
      .map((row) => row.idType),
  );
  const grantedVisible =
    serverConfig.status === 'ready'
      ? propAllowed.filter((t) => grantedKeys.has(t.key))
      : serverConfig.status === 'error'
        ? propAllowed
        : [];
  // Document Intelligence off ⇒ number-only IDs only (there's no document
  // capture step), so drop every document-scanned ID from the picker. This is
  // what makes the disabled "Document Intelligence" step actually disappear from
  // the live flow rather than still offering passports/licenses.
  const visibleTypes =
    config.enableDocumentCapture === false
      ? grantedVisible.filter((t) => !t.requiresDocumentCapture)
      : grantedVisible;

  // Picking an ID type ADVANCES — there is no Continue button. This is a
  // single-select list with nothing else on the step to confirm, so a second
  // tap only restates a decision already made. It also matches country-select,
  // which advances on tap: having one list advance and the next one not was the
  // inconsistency worth removing. A mis-tap costs one Back.
  //
  // NOTE: navigate off `value`, not `state.selectedIdType` — the dispatch above
  // hasn't been applied yet within this handler, so the state read would be a
  // step behind (and empty on the very first selection).
  const handleSelect = (value: string) => {
    dispatch({ type: 'SELECT_ID_TYPE', payload: value });
    // Number-only IDs (e.g. BVN/NIN/vNIN) skip straight to id-input; every
    // document-scanned ID goes through document-capture.
    const def = config.getIdTypeDefinition(value, resolvedCountry);
    const next = def && !def.requiresDocumentCapture ? 'id-input' : 'document-capture';
    dispatch({ type: 'SET_STEP', payload: next });
  };

  // Multi-ID: a slot whose safe options narrowed to ONE ID has no choice to
  // make — auto-select it and go straight to its evidence step. (The options
  // are already filtered to non-stranding picks, so this can never dead-end.)
  const plan = multiIdPlan(config, state, config.serverConfig.idTypes);
  const soleOption = plan && visibleTypes.length === 1 ? visibleTypes[0]!.key : null;
  useEffect(() => {
    if (soleOption) handleSelect(soleOption);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soleOption]);

  // Multi-ID: from a LATER verification's picker, back steps into the one
  // before it — popping that slot and restoring what was captured, so the
  // applicant can change an ID they already did. From the FIRST picker there
  // is nothing to pop, so back means what it always did (the country picker,
  // or consent) — which is also how the country gets changed mid-run.
  const handleBack = () => {
    if (plan && plan.index > 0) {
      const previous = state.multiIdSlots[state.multiIdSlots.length - 1];
      dispatch({
        type: 'UNCOMMIT_MULTI_ID_SLOT',
        payload: {
          step: multiIdEvidenceStep(
            previous ? config.getIdTypeDefinition(previous.idType, resolvedCountry) : null,
          ),
        },
      });
      return;
    }
    handleBackToStart();
  };

  const handleBackToStart = () => {
    // Applicant mode (KYB applicant-verification leg): id-type was reached
    // from applicant-role — via country-select when the org's grants offered
    // the applicant more than one country to pick from. A self-selected key
    // person with a country SKIPPED that step, so back returns to the picker.
    dispatch({
      type: 'SET_STEP',
      payload: isBusinessFlow(config)
        ? applicantSelfCountry(state.businessApplication)
          ? 'applicant-role'
          : applicantCountryOptions(config).length > 1
            ? 'country-select'
            : 'applicant-role'
        : (config.countries?.length ?? 0) > 1
          ? 'country-select'
          : 'consent',
    });
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <StepHeader
        title={t('selectDocument.idType.title')}
        description={t('selectDocument.idType.description')}
        onBack={handleBack}
        country={resolvedCountry}
      />

      {serverConfig.status === 'loading' ? (
        <div className="flex flex-col items-center justify-center py-10 text-sm text-muted-foreground">
          {t('selectDocument.idType.loading')}
        </div>
      ) : serverConfig.status === 'ready' && visibleTypes.length === 0 ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {t('selectDocument.idType.empty')}
        </div>
      ) : null}

      {/* Tapping a card selects and advances, so the radio was a second control
          for a choice already made by the tap — and it read as "confirm this"
          on a list where nothing needs confirming. The card's own border and
          tint carry the selected state. `radiogroup` semantics are kept for
          screen readers and keyboard users, who still need to hear that this is
          a single choice among several. */}
      <div
        role="radiogroup"
        aria-label="Identification document type"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {visibleTypes.map((idType) => {
          const Icon = ID_TYPE_ICONS[idType.key] ?? FileText;
          const isSelected = state.selectedIdType === idType.key;

          return (
            <button
              key={idType.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => handleSelect(idType.key)}
              className="cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
            >
              <Card
                className={cn(
                  'flex items-center gap-3 p-4 transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5'
                    : 'hover:border-muted-foreground/30',
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                    isSelected
                      ? 'bg-primary/10 text-primary'
                      : 'bg-secondary text-muted-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <span className="flex-1 text-sm font-medium">{idType.label}</span>
              </Card>
            </button>
          );
        })}
      </div>

    </div>
  );
}
