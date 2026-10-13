'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, Check } from '../components/icons';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { DateField } from '../components/DateField';
import { CountryFlag, currencyFlagCode } from '../components/CountryFlag';
import { UiSelect } from '../components/UiSelect';
import { cn } from '../lib/utils';
import { useDropdownAnchor } from '../lib/use-dropdown-anchor';
import type { QuestionnaireAnswerValue, QuestionnaireField as FieldDef } from '../types/config';
import { useText } from '../i18n';

// ---------------------------------------------------------------------------
// Amount formatting — typed digits render with thousands separators; money
// caps subunits at 2dp. The stored answer is always the plain number.
// ---------------------------------------------------------------------------

export function formatAmountString(raw: string, maxDecimals: number | null): string {
  let s = raw.replace(/[^0-9.]/g, '');
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) {
    let decimals = s.slice(firstDot + 1).replace(/\./g, '');
    if (maxDecimals !== null) decimals = decimals.slice(0, maxDecimals);
    s = `${s.slice(0, firstDot)}.${decimals}`;
  }
  const [int = '', dec] = s.split('.');
  const intFmt = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (dec !== undefined) return `${intFmt || '0'}.${dec}`;
  return intFmt;
}

function parseAmount(display: string): number | undefined {
  const n = Number(display.replace(/,/g, ''));
  return display.trim() === '' || !Number.isFinite(n) ? undefined : n;
}

function AmountInput({
  inputId,
  value,
  placeholder,
  maxDecimals,
  onChange,
}: {
  inputId: string;
  value: number | undefined;
  placeholder?: string;
  /** null = unlimited (plain numbers); 2 = money subunits. */
  maxDecimals: number | null;
  onChange: (value: number | undefined) => void;
}) {
  // Display text is local so trailing dots/zeros survive while typing; the
  // numeric answer re-seeds it if it changes from outside (e.g. step re-entry).
  const [display, setDisplay] = useState(value !== undefined ? formatAmountString(String(value), maxDecimals) : '');
  const [seededFrom, setSeededFrom] = useState(value);
  if (value !== seededFrom && value !== parseAmount(display)) {
    setSeededFrom(value);
    setDisplay(value !== undefined ? formatAmountString(String(value), maxDecimals) : '');
  }

  return (
    <Input
      id={inputId}
      inputMode="decimal"
      value={display}
      placeholder={placeholder}
      onChange={(e) => {
        const next = formatAmountString(e.target.value, maxDecimals);
        setDisplay(next);
        onChange(parseAmount(next));
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// One questionnaire field
// ---------------------------------------------------------------------------

export function QuestionField({
  field,
  value,
  currencyValue,
  detailValue,
  error,
  onChange,
  onCurrencyChange,
  onDetailChange,
}: {
  field: FieldDef;
  value: QuestionnaireAnswerValue | undefined;
  /** money only: the `<key>_currency` companion answer. */
  currencyValue?: string;
  /** choice fields only: the `<key>_other` companion answer. */
  detailValue?: string;
  error?: string;
  onChange: (value: QuestionnaireAnswerValue | undefined) => void;
  onCurrencyChange?: (currency: string | undefined) => void;
  onDetailChange?: (detail: string | undefined) => void;
}) {
  const t = useText();
  const inputId = `kyc-q-${field.key}`;
  const currencies = field.currencies ?? [];
  const currency = currencyValue ?? currencies[0];

  // The chosen option that is not an answer on its own ("Other"). Covers both
  // select (a single value) and multiselect (a list).
  const detailOption = (field.options ?? []).find(
    (o) => o.requiresDetail && (Array.isArray(value) ? value.includes(o.value) : value === o.value),
  );

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>

      {field.type === 'text' && (
        <Input id={inputId} value={(value as string) ?? ''} placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value || undefined)} />
      )}
      {field.type === 'number' && (
        <AmountInput inputId={inputId} value={value as number | undefined}
          placeholder={field.placeholder} maxDecimals={null} onChange={onChange} />
      )}
      {field.type === 'money' && (
        <div className="flex gap-2">
          {currencies.length > 1 ? (
            <div className="w-32 shrink-0">
              <UiSelect
                aria-label="Currency"
                value={currency || undefined}
                options={currencies.map((code) => ({
                  value: code,
                  label: code,
                  icon: <CountryFlag code={currencyFlagCode(code)} className="h-4 w-4" />,
                }))}
                onChange={(v) => onCurrencyChange?.(v || undefined)}
              />
            </div>
          ) : (
            <span className="flex h-12 shrink-0 items-center gap-2 rounded-xl border border-input bg-muted/40 px-3 text-sm font-medium text-muted-foreground">
              {currency && <CountryFlag code={currencyFlagCode(currency)} className="h-4 w-4" />}
              {currency ?? '—'}
            </span>
          )}
          <div className="flex-1">
            <AmountInput inputId={inputId} value={value as number | undefined}
              placeholder={field.placeholder ?? t('questionnaire.amountPlaceholder')}
              maxDecimals={2} onChange={onChange} />
          </div>
        </div>
      )}
      {field.type === 'date' && (
        <DateField inputId={inputId} value={value as string | undefined} placeholder={field.placeholder} onChange={onChange} />
      )}
      {field.type === 'select' && (
        <UiSelect
          id={inputId}
          value={(value as string) || undefined}
          placeholder={field.placeholder ?? t('questionnaire.selectPlaceholder')}
          options={(field.options ?? []).map((opt) => ({ value: opt.value, label: opt.label }))}
          onChange={(v) => onChange(v || undefined)}
        />
      )}
      {field.type === 'multiselect' && (
        <div className="flex flex-col gap-2">
          {(field.options ?? []).map((opt) => {
            const selected = Array.isArray(value) ? (value as string[]) : [];
            const checked = selected.includes(opt.value);
            return (
              <label
                key={opt.value}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-xl border p-3 text-sm transition-colors',
                  checked ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v: boolean | 'indeterminate') => {
                    const next = v === true ? [...selected, opt.value] : selected.filter((s) => s !== opt.value);
                    onChange(next.length > 0 ? next : undefined);
                  }}
                />
                {opt.label}
              </label>
            );
          })}
        </div>
      )}
      {/* Free text behind an "Other" choice. Always required once that option
          is picked: an unexplained "Other" is the answer a compliance reviewer
          most needs spelled out. */}
      {detailOption && (
        <div className="space-y-1.5 pt-2">
          <Label htmlFor={`${inputId}-other`}>
            {detailOption.detailLabel || t('questionnaire.detailLabel')}
            <span className="text-destructive"> *</span>
          </Label>
          <Input
            id={`${inputId}-other`}
            value={detailValue ?? ''}
            maxLength={200}
            placeholder={
              detailOption.detailPlaceholder ||
              t('questionnaire.detailPlaceholder', { option: detailOption.label })
            }
            onChange={(e) => onDetailChange?.(e.target.value || undefined)}
          />
        </div>
      )}

      {field.type === 'boolean' && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={field.label}>
          {[{ label: t('questionnaire.yes'), v: true }, { label: t('questionnaire.no'), v: false }].map((opt) => {
            const active = value === opt.v;
            return (
              <button
                key={String(opt.v)}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(opt.v)}
                className={cn(
                  'flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {active && <Check className="h-4 w-4" />}
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date picker — anchored into the dialog root, NOT a Radix popover: that
// portals to document.body, which Dialog sets to `pointer-events: none`, so
// taps on the calendar fell through to whatever was behind it.
// ---------------------------------------------------------------------------

