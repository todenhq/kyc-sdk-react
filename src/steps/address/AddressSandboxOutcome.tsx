'use client';

import React from 'react';
import { BadgeCheck, CircleDashed, ShieldCheck, CircleX, type AppIconComponent } from '../../components/icons';
import { useVerificationContext } from '../../context/VerificationContext';
import { useVerificationConfig } from '../../context/VerificationConfigContext';
import type { VerificationState } from '../../context/types';

// The address flow's "Test result" box — the business flow's sandbox toggle
// (BusinessDetailsStep), for the address RESULT. Shown only off-production,
// on the review step, so an operator walking a dev/sandbox flow can exercise
// every outcome their decision rules branch on. The pick rides
// metadata.sandboxOutcome at submit; production ignores the token entirely.
//
// Four equal columns share one sliding indicator (the business toggle's
// motion), whose fill takes the active outcome's semantic colour. Nothing is
// SENT until the operator clicks; unclicked keeps the server default, which
// the resting position mirrors.

type Outcome = NonNullable<VerificationState['addressSandboxOutcome']>;

// Icons + colours mirror the dashboard's tier/verdict language exactly
// (address-card-bits.tsx TIER_META / VERDICT_META), so the outcome an
// operator picks here wears the same identity on the result page.
const OPTIONS: Array<{
  value: Outcome;
  label: string;
  Icon: AppIconComponent;
  /** The icon's own colour while this tab is INACTIVE, so the row reads as
   *  four outcomes rather than one live state and three dead ones. */
  tint: string;
  /** The sliding indicator's fill when this tab is active. */
  pill: string;
}> = [
  {
    value: 'address_attested',
    label: 'Attested',
    Icon: ShieldCheck,
    tint: 'text-emerald-600 dark:text-emerald-400',
    pill: 'bg-emerald-600',
  },
  {
    value: 'address_corroborated',
    label: 'Corroborated',
    Icon: BadgeCheck,
    tint: 'text-sky-600 dark:text-sky-400',
    pill: 'bg-sky-600',
  },
  {
    value: 'address_collected',
    label: 'Collected',
    Icon: CircleDashed,
    tint: 'text-muted-foreground',
    pill: 'bg-slate-600',
  },
  {
    value: 'address_mismatch',
    label: 'Mismatch',
    Icon: CircleX,
    tint: 'text-red-600 dark:text-red-400',
    pill: 'bg-red-600',
  },
];

export function AddressSandboxOutcome() {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const isSandbox = config.serverConfig?.environment !== 'PRODUCTION';
  if (!isSandbox || config.previewMode) return null;

  // Business-toggle semantics: one tab always reads active (the default pick),
  // but nothing is SENT until the operator actually clicks — unclicked keeps
  // the server default (attested with a location fix, else corroborated),
  // which the resting position mirrors.
  const shown = state.addressSandboxOutcome ?? 'address_attested';
  const index = Math.max(
    0,
    OPTIONS.findIndex((o) => o.value === shown),
  );

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
      <span className="block text-sm font-medium">Test result</span>
      {/* The active state SLIDES between the tabs (the business toggle's
          motion): equal columns are what let the indicator translate by
          exactly its own width per step. The fill colour rides the slide —
          transition-colors beside transition-transform — so moving from
          Attested to Mismatch reads as one pill travelling and turning red,
          not two pills blinking. */}
      <div className="relative grid w-full grid-cols-4 rounded-lg border border-input p-0.5">
        <span
          aria-hidden
          className={`absolute inset-y-0.5 left-0.5 w-[calc(25%-1px)] rounded-md transition-[transform,background-color] duration-200 ease-out motion-reduce:transition-none ${OPTIONS[index]!.pill}`}
          style={{ transform: `translateX(${index * 100}%)` }}
        />
        {OPTIONS.map(({ value, label, Icon, tint }) => {
          const active = shown === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              aria-label={label}
              onClick={() => dispatch({ type: 'SET_ADDRESS_SANDBOX_OUTCOME', payload: value })}
              // Above the indicator, or the label slides out from under it.
              // On a phone the four labels truncated to "Corrob…"/"Misma…", so
              // below sm the tabs are icon-only (the semantic colour carries
              // the identity) and the caption names the active pick instead.
              className={`relative z-10 inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-2.5 text-xs transition-colors sm:py-1.5 ${
                active ? 'text-white' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {/* The active outcome goes white on its pill; the rest keep
                  their own semantic tint, so the row reads as four outcomes
                  to choose between. Mirrored on RN and Flutter. */}
              <Icon className={`h-4 w-4 shrink-0 transition-colors sm:h-3.5 sm:w-3.5 ${active ? 'text-white' : tint}`} />
              <span className="hidden truncate sm:inline">{label}</span>
            </button>
          );
        })}
      </div>
      <span className="block text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{OPTIONS[index]!.label}</span> is returned
        instead of judging the pin.
      </span>
    </div>
  );
}
