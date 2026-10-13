'use client';

import React, { useState } from 'react';
import { BadgeCheck, Building2, Check, Link2 } from '../components/icons';
import { CountryFlag } from '../components/CountryFlag';
import { applicantRoleLabel } from '../lib/business-application';
import { useText } from '../i18n';
import { cn } from '../lib/utils';
import type { KeyPersonRole } from '../types/business';

// Presentational half of "Awaiting users" — the people section of the KYB
// success screen. Split from KeyPeopleInviteLinks so the same list serves both
// the moment of submission (rows built from what the applicant just typed) and
// a later revisit (rows rebuilt server-side, with live statuses).

export type AwaitRole = KeyPersonRole | 'authorized_representative' | (string & {});

export interface AwaitRow {
  name: string;
  role: AwaitRole;
  /** Ownership percentage, already formatted. */
  pct: string | null;
  /** ISO-2. Anything else has no flag to draw. */
  country: string | null;
  status: 'verified' | 'failed' | 'submitted' | 'pending' | 'not_needed';
  inviteUrl?: string;
  isApplicant?: boolean;
  /** A company on the list completes a KYB application, not a KYC. It gets a
   *  Company tag and its pending state reads "KYB pending". */
  isCorporate?: boolean;
}

/** Section order + header text keys, mirroring the grouped "Awaiting users" design. */
const SECTIONS: Array<{ role: string; label: string }> = [
  { role: 'beneficial_owner', label: 'keyPeople.await.group.ubos' },
  { role: 'director', label: 'keyPeople.await.group.directors' },
  { role: 'signatory', label: 'keyPeople.await.group.signatories' },
  { role: 'shareholder', label: 'keyPeople.await.group.shareholders' },
  { role: 'authorized_representative', label: 'keyPeople.await.group.representatives' },
];

const KNOWN_ROLES = new Set(SECTIONS.map((s) => s.role));

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Status pill per state: `label` is its text key. */
const STATUS: Record<AwaitRow['status'], { label: string; className: string }> = {
  verified: { label: 'keyPeople.await.status.verified', className: 'bg-[var(--verification-success)]/10 text-[var(--verification-success)]' },
  submitted: { label: 'keyPeople.await.status.submitted', className: 'bg-[var(--verification-success)]/10 text-[var(--verification-success)]' },
  pending: { label: 'keyPeople.await.status.kycPending', className: 'bg-primary/10 text-primary' },
  // Their invite was voided because the application itself ended. Nothing is
  // pending; it was called off, and saying "pending" sent people chasing links
  // that no longer worked.
  not_needed: { label: 'keyPeople.await.status.notNeeded', className: 'bg-muted text-muted-foreground' },
  failed: { label: 'keyPeople.await.status.failed', className: 'bg-destructive/10 text-destructive' },
};

export function KeyPeopleAwaitList({ rows }: { rows: AwaitRow[] }) {
  const t = useText();
  if (rows.length === 0) return null;

  // Anything whose role we have no section for still has to appear. Grouping by
  // a fixed list and rendering only the matches quietly dropped people, which on
  // a screen whose whole job is "who still owes a check" is the worst failure it
  // could have.
  const groups: Array<{ label: string; rows: AwaitRow[] }> = SECTIONS.map(({ role, label }) => ({
    label: t(label),
    rows: rows.filter((r) => r.role === role),
  })).filter((g) => g.rows.length > 0);
  const others = rows.filter((r) => !KNOWN_ROLES.has(r.role as string));
  if (others.length > 0) groups.push({ label: t('keyPeople.await.group.other'), rows: others });

  const outstanding = rows.filter((r) => r.status === 'pending' || r.status === 'failed').length;

  // Entrance stagger: cards rise in reading order, ~45ms apart, capped so a
  // long roster does not turn into a slow reveal. Together with the skeleton
  // this state replaces (drawn at the same geometry), the hand-off reads as
  // the ghost list resolving into the real one rather than a screen swap.
  let entranceIndex = 0;

  return (
    <div className="w-full space-y-4 text-left animate-fade-in motion-reduce:animate-none">
      {/* Everyone listed is somebody a check is asked of — the server leaves out
          anyone the flow asks nothing of, so there is no longer a subset to
          count. A screening-only signatory has no link and nothing anybody can
          do for them, and naming them here made a task list read as a roster. */}
      <p className="text-center text-sm text-muted-foreground">
        {outstanding === 0 ? t('keyPeople.await.allDone') : t('keyPeople.await.intro')}
      </p>

      {groups.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {group.label}
          </p>
          {group.rows.map((row, i) => (
            <AwaitCard key={`${group.label}-${i}`} row={row} entranceDelayMs={Math.min(entranceIndex++, 8) * 45} />
          ))}
        </div>
      ))}

      {outstanding > 0 && (
        <p className="text-center text-xs text-muted-foreground">{t('keyPeople.await.linkValidity')}</p>
      )}
    </div>
  );
}

function AwaitCard({ row, entranceDelayMs = 0 }: { row: AwaitRow; entranceDelayMs?: number }) {
  const t = useText();
  const [copied, setCopied] = useState(false);
  const status = STATUS[row.status];
  // A company is not doing a KYC: it receives its own KYB application, so the
  // pending pill must not promise a check that will never run under that name.
  const kyb = row.isCorporate && row.status === 'pending';
  const statusLabel = t(kyb ? 'keyPeople.await.status.kybPending' : status.label);

  const copy = async () => {
    if (!row.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(row.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(t('keyPeople.await.copyPrompt', { name: row.name }), row.inviteUrl);
    }
  };

  const roleLabel = applicantRoleLabel(row.role, t) ?? t('keyPeople.await.roleFallback');
  const meta = [roleLabel, ...(row.pct ? [`${row.pct}%`] : [])].join(' · ');

  return (
    // `backwards` fill keeps a delayed card invisible until its turn — without
    // it, every card flashes visible and then restarts its animation.
    <div
      className="space-y-3 rounded-2xl bg-muted/40 p-4 animate-slide-up [animation-fill-mode:backwards] motion-reduce:animate-none"
      style={entranceDelayMs ? { animationDelay: `${entranceDelayMs}ms` } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">
            {row.name}
            {row.isApplicant && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">{t('keyPeople.await.you')}</span>
            )}
            {row.isCorporate && (
              // Readability over subtlety: foreground text on a bordered chip.
              // The muted-on-muted version disappeared on dark org themes.
              <span className="ml-1.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 align-middle text-xs font-semibold normal-case text-foreground">
                <Building2 className="h-3.5 w-3.5" /> {t('keyPeople.await.company')}
              </span>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
            <span>{meta}</span>
            {row.country && (
              <>
                <span>·</span>
                <CountryFlag code={row.country} className="h-4 w-4" />
                <span>{countryName(row.country)}</span>
              </>
            )}
          </p>
        </div>
        {/* The icon is not decoration: status is also carried by colour, and
            colour alone is not a signal everyone receives. */}
        <span
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
            status.className,
          )}
        >
          {row.status === 'verified' && <BadgeCheck className="h-3.5 w-3.5" />}
          {statusLabel}
        </span>
      </div>

      {/* A failed check still gets its link — that is the retry. */}
      {row.inviteUrl && (
        <button
          type="button"
          onClick={() => void copy()}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary/10 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" /> {t('keyPeople.await.linkCopied')}
            </>
          ) : (
            <>
              <Link2 className="h-4 w-4" /> {t('keyPeople.await.copyLink')}
            </>
          )}
        </button>
      )}
    </div>
  );
}
