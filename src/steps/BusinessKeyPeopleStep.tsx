'use client';

import React, { useState, useEffect, useRef } from 'react';
import { StepHeader } from '../components/StepHeader';
import { Button } from '../components/ui/button';
import { useVerificationContext } from '../context/VerificationContext';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import {
  MAX_KEY_PEOPLE_ROWS,
  invalidKeyPersonRows,
  isKeyPersonRowValid,
  keyPeopleMinEntries,
  nextBusinessStep,
  prevBusinessStep,
  keyPeopleRequireEmail,
} from '../lib/business-application';
import { type KeyPeopleSection as SectionKey } from '../lib/key-people-sections';
import { KeyPeopleSectionsList } from './KeyPeopleSectionsList';
import { KeyPersonSheet } from './KeyPersonSheet';
import { KeyPeopleTotals } from './KeyPeopleTotals';
import {
  keyPeopleSectionList,
  defaultUboThreshold,
  emptyKeyPersonEntry,
} from './key-people-step-model';
import { KeyPeopleHints } from './KeyPeopleHints';
import type { KeyPersonEntry } from '../context/types';
import { prefillKeyPeople, shouldPrefill } from '../lib/key-people-prefill';
import { defaultCountry as resolveCountry } from '../lib/country-default';
import { useText } from '../i18n';

type SheetState = { mode: 'add' | 'edit'; section: SectionKey; index?: number } | null;

/**
 * The key-people step, sectioned: Beneficial owners / Shareholders /
 * Directors & representatives, each with a plain-language definition, its own
 * add-tile, and quick-add chips that grant a person already entered another
 * hat. The sections are VIEWS over one shared list (key-people-sections.ts):
 * one human can hold several roles, exactly as the register files them, and
 * a stake at the threshold moves them up on screen exactly as the server will
 * escalate them at submit.
 */
export function BusinessKeyPeopleStep() {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();
  const rows = state.businessApplication.keyPeople;
  const uboUnidentifiable = state.businessApplication.uboUnidentifiable;
  const [sheet, setSheet] = useState<SheetState>(null);
  const defaultCountry =
    resolveCountry(
      state.business.country,
      config.business?.country,
      config.serverConfig.geoCountry,
    ) ?? '';
  const minEntries = keyPeopleMinEntries(config.business);
  const emailRequiredFor = keyPeopleRequireEmail(config.business);
  // The same line the server draws: the workflow's own threshold, else the
  // register's default (NG files significant control from a lower bar).
  const threshold =
    config.business?.keyPeople?.ownershipThreshold ??
    defaultUboThreshold(state.business.country || config.business?.country);

  const setRows = (keyPeople: KeyPersonEntry[]) =>
    dispatch({ type: 'SET_BUSINESS_APPLICATION', payload: { keyPeople } });

  // Start from the register's own officer list, so this is a confirmation
  // rather than a memory test. Once only, and never over anything typed: an
  // applicant who has already entered a name has told us something the
  // register did not.
  const prefilled = useRef(false);
  const officers = state.businessCheck.keyPeople;
  useEffect(() => {
    if (prefilled.current || officers.length === 0 || !shouldPrefill(rows)) return;
    prefilled.current = true;
    setRows(prefillKeyPeople(officers, defaultCountry));
    // setRows/rows are intentionally out of the dep list: this must run on the
    // arrival of officers, not on every edit the applicant then makes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [officers, defaultCountry]);

  const validCount = rows.filter((r) => isKeyPersonRowValid(r, emailRequiredFor)).length;
  const invalidRows = invalidKeyPersonRows(rows, emailRequiredFor);
  const meetsMinimum = validCount >= minEntries;

  const pctOf = (row: KeyPersonEntry): number => {
    const n = Number(row.ownershipPct);
    return row.ownershipPct.trim() !== '' && Number.isFinite(n) ? n : 0;
  };
  const totalPct = rows.reduce((sum, row) => sum + pctOf(row), 0);
  const overAllocated = totalPct > 100;
  const canContinue = meetsMinimum && invalidRows.length === 0 && !overAllocated;

  const sections = keyPeopleSectionList(config.business, threshold, t);
  const canAdd = rows.length < MAX_KEY_PEOPLE_ROWS;

  const editEntry = sheet?.mode === 'edit' && sheet.index != null ? rows[sheet.index] : undefined;

  const handleSave = (entry: KeyPersonEntry) => {
    if (sheet?.mode === 'edit' && sheet.index != null) {
      setRows(rows.map((row, i) => (i === sheet.index ? entry : row)));
    } else {
      setRows([...rows, entry]);
    }
    setSheet(null);
  };
  const handleDelete = () => {
    if (sheet?.mode === 'edit' && sheet.index != null) {
      setRows(rows.filter((_, i) => i !== sheet.index));
    }
    setSheet(null);
  };
  const handleContinue = () => {
    if (!canContinue) return;
    // Half-typed rows are dropped rather than submitted: an entry the user
    // abandoned is not a person they disclosed.
    setRows(rows.filter((r) => isKeyPersonRowValid(r, emailRequiredFor)));
    const next = nextBusinessStep('business-key-people', config);
    if (next === 'submitted') {
      dispatch({ type: 'SUBMIT_VERIFICATION' });
    } else {
      dispatch({ type: 'SET_STEP', payload: next });
    }
  };

  return (
    <div className="space-y-6 animate-slide-up">
      <StepHeader
        title={t('keyPeople.title')}
        description={t('keyPeople.description')}
        onBack={() =>
          dispatch({ type: 'SET_STEP', payload: prevBusinessStep('business-key-people', config) })
        }
      />

      <KeyPeopleHints rowCount={rows.length} minEntries={minEntries} validCount={validCount} />

      <KeyPeopleSectionsList
        sections={sections}
        rows={rows}
        threshold={threshold}
        emailRequiredFor={emailRequiredFor}
        uboUnidentifiable={uboUnidentifiable}
        canAdd={canAdd}
        onRows={setRows}
        onSheet={setSheet}
        onExemption={(next) =>
          dispatch({ type: 'SET_BUSINESS_APPLICATION', payload: { uboUnidentifiable: next } })
        }
      />

      {!canAdd && (
        <p className="text-center text-sm text-muted-foreground">
          {t('keyPeople.limit', { count: MAX_KEY_PEOPLE_ROWS })}
        </p>
      )}

      <KeyPeopleTotals totalPct={totalPct} overAllocated={overAllocated} />

      <Button onClick={handleContinue} disabled={!canContinue} className="w-full">
        {t('common.continue')}
      </Button>

      {sheet && (sheet.mode === 'add' || editEntry) && (
        <KeyPersonSheet
          emailRequiredFor={emailRequiredFor}
          defaultCountry={defaultCountry}
          mode={sheet.mode}
          section={sheet.section}
          corporateKyb={config.business?.keyPeople?.corporateKyb?.enabled === true}
          initial={editEntry ?? emptyKeyPersonEntry(sheet.section, defaultCountry)}
          uboThreshold={threshold}
          otherPctTotal={editEntry ? totalPct - pctOf(editEntry) : totalPct}
          onSave={handleSave}
          onRemove={sheet.mode === 'edit' ? handleDelete : undefined}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
