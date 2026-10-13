'use client';

import React, { useEffect } from 'react';
import { Check, ScanFace, UserRoundPlus } from '../components/icons';
import { StepHeader } from '../components/StepHeader';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { cn } from '../lib/utils';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { CountryFlag } from '../components/CountryFlag';
import {
  APPLICANT_ROLE_LABELS,
  applicantCountryOptions,
  applicantRoleLabel,
  applicantSelfCountry,
  initialsOf,
  isKeyPersonRowValid,
  namesLooselyMatch,
  prevBusinessStep,
} from '../lib/business-application';
import type { ApplicantRole } from '../types/business';
import { useText } from '../i18n';

const ROLES = Object.keys(APPLICANT_ROLE_LABELS) as ApplicantRole[];


/** The filled/empty radio dot every selectable row carries on its right. */
function RadioDot({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        selected ? 'border-primary bg-primary' : 'border-muted-foreground/40',
      )}
    >
      {selected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3.5} />}
    </span>
  );
}

/**
 * Applicant-role step ("Now verify your own identity"): the person submitting
 * the KYB application declares who they are, then runs the ordinary individual
 * capture leg for their own identity.
 *
 * When key people were entered earlier, the applicant may BE one of them — so
 * the step first asks "which of these is you?" (pre-selected when the
 * consumer's userData name matches). Picking themselves flags that entry on
 * the submission and the server merges the two records: one person, one KYC,
 * one screening, no duplicate invite. "I'm not one of these" falls through to
 * the plain role + name form.
 */
export function ApplicantRoleStep() {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();
  const { applicantRole, applicantName, applicantKeyPersonIndex, keyPeople } =
    state.businessApplication;

  const setApplication = (payload: {
    applicantRole?: ApplicantRole;
    applicantName?: string;
    applicantKeyPersonIndex?: number | null;
  }) => dispatch({ type: 'SET_BUSINESS_APPLICATION', payload });

  // The valid entered PEOPLE, keeping their ORIGINAL index — the payload flag
  // is index-based, so the list and the submission can never disagree. A
  // corporate shareholder is excluded: "which of these is you?" is a question
  // about humans, and a company can never be the person filling in the form.
  const people = keyPeople
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => !row.isCorporate && isKeyPersonRowValid(row));
  const hasPeople = people.length > 0;

  // Local tri-state: a person's index, 'other', or nothing chosen yet.
  const [selection, setSelection] = React.useState<number | 'other' | null>(() =>
    applicantKeyPersonIndex !== null ? applicantKeyPersonIndex : applicantRole ? 'other' : null,
  );

  const pickPerson = (index: number) => {
    setSelection(index);
    const person = keyPeople[index]!;
    setApplication({
      applicantKeyPersonIndex: index,
      applicantRole: person.role,
      applicantName: person.name.trim(),
    });
  };
  const pickOther = () => {
    setSelection('other');
    setApplication({ applicantKeyPersonIndex: null });
  };

  // First arrival: pre-fill from the consumer's userData — pre-SELECT their
  // own key-person entry when the name matches (they still confirm). When the
  // name matches NOBODY listed, "I'm not one of these people" is what that
  // fact means, so it is pre-selected too (with the name pre-filled in the
  // form it reveals) — leaving nothing selected made the applicant re-answer
  // a question their integrator already answered. A stored choice is never
  // overridden, and the selection stays theirs to change.
  useEffect(() => {
    if (applicantRole || applicantKeyPersonIndex !== null) return;
    const prop = [config.userData?.firstName, config.userData?.lastName]
      .filter(Boolean)
      .join(' ');
    if (!prop) return;
    const match = people.find(({ row }) => namesLooselyMatch(prop, row.name));
    if (match) {
      pickPerson(match.index);
    } else {
      if (hasPeople) setSelection('other');
      if (!applicantName) setApplication({ applicantName: prop });
    }
    // Once, on arrival — a later userData change must not clobber a choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canContinue = hasPeople
    ? typeof selection === 'number' || (selection === 'other' && !!applicantRole)
    : !!applicantRole;

  return (
    <div className="space-y-6 animate-slide-up">
      <StepHeader
        title={t('business.applicant.title')}
        description={t('business.applicant.description')}
        onBack={() =>
          dispatch({ type: 'SET_STEP', payload: prevBusinessStep('applicant-role', config) })
        }
      />

      <div className="flex items-center gap-3 rounded-xl bg-secondary/40 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ScanFace className="h-4.5 w-4.5" />
        </span>
        <p className="text-sm text-foreground/90">{t('business.applicant.notice')}</p>
      </div>

      {hasPeople && (
        <div className="space-y-3">
          <Label>{t('business.applicant.whoLabel')}</Label>
          <div role="radiogroup" aria-label="Who are you?" className="space-y-2">
            {people.map(({ row, index }) => {
              const isSelected = selection === index;
              const country = row.country.trim().toUpperCase();
              const pct = row.ownershipPct.trim();
              return (
                <button
                  key={index}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => pickPerson(index)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all',
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'hover:border-primary/40 hover:bg-muted/40',
                  )}
                >
                  {/* Monogram avatar with the ID-issuing-country flag badge. */}
                  <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {initialsOf(row.name)}
                    {country !== '' && (
                      <span className="absolute -bottom-0.5 -right-1 rounded-full ring-2 ring-background">
                        <CountryFlag code={country} className="block h-4 w-4" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{row.name.trim()}</span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {applicantRoleLabel(row.role, t)}
                      {pct !== '' && (
                        <>
                          {' · '}
                          <span className="font-medium text-foreground/80">
                            {t('business.applicant.ownership', { pct })}
                          </span>
                        </>
                      )}
                    </span>
                  </span>
                  <RadioDot selected={isSelected} />
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={selection === 'other'}
              onClick={pickOther}
              className={cn(
                'flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-all',
                selection === 'other'
                  ? 'border-primary bg-primary/5 shadow-sm'
                  : 'border-dashed hover:border-primary/40 hover:bg-muted/40',
              )}
            >
              <span
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                  selection === 'other'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-secondary text-muted-foreground',
                )}
              >
                <UserRoundPlus className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium">
                {t('business.applicant.notListed')}
              </span>
              <RadioDot selected={selection === 'other'} />
            </button>
          </div>
          {typeof selection === 'number' && (
            <div className="flex items-start gap-2 rounded-lg bg-primary/5 px-3 py-2.5">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <p className="text-xs text-foreground/80">{t('business.applicant.selfNote')}</p>
            </div>
          )}
        </div>
      )}

      {(!hasPeople || selection === 'other') && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="applicantRole">{t('business.applicant.roleLabel')}</Label>
            <Select
              value={applicantRole ?? ''}
              onValueChange={(role) => setApplication({ applicantRole: role as ApplicantRole })}
            >
              <SelectTrigger id="applicantRole">
                <SelectValue placeholder={t('business.applicant.rolePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {applicantRoleLabel(role, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="applicantName">
              {t('business.applicant.nameLabel')}{' '}
              <span className="text-muted-foreground">{t('business.optional')}</span>
            </Label>
            <Input
              id="applicantName"
              placeholder={t('business.applicant.namePlaceholder')}
              value={applicantName}
              onChange={(e) => setApplication({ applicantName: e.target.value })}
            />
          </div>
        </div>
      )}

      <Button
        // The applicant may hold an ID issued anywhere the org can verify —
        // more than one granted country means they pick theirs first, exactly
        // like a multi-region individual flow. EXCEPT when they picked
        // themselves from the key people AND that entry carries a country:
        // "where was your ID issued?" was already answered there, so the
        // country-select step is skipped and the leg uses that country.
        onClick={() => {
          const selfCountry = applicantSelfCountry(state.businessApplication);
          if (selfCountry) {
            dispatch({ type: 'SET_COUNTRY', payload: selfCountry });
            dispatch({ type: 'SET_STEP', payload: 'id-type' });
            return;
          }
          dispatch({
            type: 'SET_STEP',
            payload:
              applicantCountryOptions(config).length > 1 ? 'country-select' : 'id-type',
          });
        }}
        disabled={!canContinue}
        className="w-full"
      >
        {t('common.continue')}
      </Button>
    </div>
  );
}
