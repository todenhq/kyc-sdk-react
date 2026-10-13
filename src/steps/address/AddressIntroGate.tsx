'use client';

import React from 'react';
import { BellRing, MapPinCheck, MapPinHouse, Radar } from '../../components/icons';
import { Button } from '../../components/ui/button';
import { IntroDisclosures } from './IntroDisclosures';
import { cn } from '../../lib/utils';
import { useVerificationContext } from '../../context/VerificationContext';
import { useVerificationConfig } from '../../context/VerificationConfigContext';
import type { VerificationStep } from '../../types/config';
import { useText, type TextFn } from '../../i18n';
import { showsPresencePromise } from '../../lib/presence-promise';

/**
 * The presence "how it works" screen — drawn in the SUCCESS CARD's language
 * (user decision 2026-08-29: the eyebrow badge, the milestone track with
 * stage labels, the header band), so the promise made here and the "address
 * check active" card at the end read as two frames of one story. The three
 * plain-language disclosures (the OkHi-patterned consent copy) sit under it
 * as a smoothly animated accordion.
 */
// The second milestone's caption depends on which tier the org runs. With
// background geofencing on, the "allow all the time" prompt is coming, and
// OkHi's integration guidance is to say so ONCE, up front, beside the
// education — not to surprise the person with it after capture.
const milestonesFor = (
  background: boolean,
  t: TextFn,
): Array<{
  Icon: typeof MapPinCheck;
  stage: string;
  title: string;
  caption: string;
  state: 'active' | 'ahead';
}> => [
  {
    Icon: MapPinHouse,
    stage: t('address.intro.step1.stage'),
    title: t('address.intro.step1.title'),
    caption: t('address.intro.step1.caption'),
    state: 'active',
  },
  {
    Icon: Radar,
    stage: t('address.intro.step2.stage'),
    title: t('address.intro.step2.title'),
    caption: t(background ? 'address.intro.step2.caption.background' : 'address.intro.step2.caption'),
    state: 'ahead',
  },
  {
    Icon: BellRing,
    stage: t('address.intro.step3.stage'),
    title: t('address.intro.step3.title'),
    caption: t('address.intro.step3.caption'),
    state: 'ahead',
  },
];

export function useAddressIntroGate(step: VerificationStep, firstStep: VerificationStep): React.ReactElement | null {
  const { state, dispatch } = useVerificationContext();
  const config = useVerificationConfig();
  const t = useText();
  // Only in the builder preview: a browser flow starts no presence watch
  // (lib/presence-promise.ts), so the primer would promise a check that never runs.
  const presence = showsPresencePromise(config);
  // Background monitoring is on unless the workflow turns it off.
  const background = config.addressCollection?.presence?.background !== false;
  if (step !== firstStep || !presence || state.addressIntroSeen) return null;
  const MILESTONES = milestonesFor(background, t);

  return (
    <div className="space-y-4 animate-slide-up">
      {/* The success card's exact shape: header band + milestone track. */}
      <div className="overflow-hidden rounded-2xl border border-primary/15">
        <div className="space-y-1 bg-primary/[0.06] px-4 pb-3 pt-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <MapPinCheck className="h-3 w-3" />
            {t('address.intro.badge')}
          </span>
          <p className="text-base font-semibold">{t('address.intro.title')}</p>
          <p className="text-xs text-muted-foreground">{t('address.intro.description')}</p>
        </div>

        <div className="grid gap-0 px-4 py-5 sm:grid-cols-3 sm:gap-4">
          {MILESTONES.map(({ Icon, stage, title, caption, state: nodeState }, i) => (
            <div
              key={title}
              className="relative flex gap-3.5 pb-5 last:pb-0 sm:flex-col sm:items-center sm:gap-2.5 sm:pb-0 sm:text-center"
            >
              {i < MILESTONES.length - 1 && (
                <>
                  <span className="absolute bottom-0 left-[19px] top-11 w-px bg-primary/15 sm:hidden" aria-hidden />
                  <span
                    className="absolute left-[calc(50%+1.75rem)] right-[calc(-50%+1.75rem)] top-5 hidden h-px border-t-2 border-dotted border-primary/25 sm:block"
                    aria-hidden
                  />
                </>
              )}
              {/* Numbered medallion: the sequence is the point, so each node
                  wears its step number. Upcoming nodes are TINTED, not greyed
                  out — they are the plan, not disabled controls. */}
              <span className="relative z-10 shrink-0">
                <span
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full',
                    nodeState === 'active'
                      ? 'bg-primary text-primary-foreground shadow-[0_0_0_5px] shadow-primary/15'
                      : 'bg-primary/10 text-primary ring-1 ring-primary/20',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span
                  className={cn(
                    'absolute -right-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border text-[9px] font-bold',
                    nodeState === 'active'
                      ? 'border-primary bg-background text-primary'
                      : 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {i + 1}
                </span>
              </span>
              <span className="min-w-0 pt-1 sm:pt-0">
                <span
                  className={cn(
                    'block text-[10px] font-semibold uppercase tracking-wider',
                    nodeState === 'active' ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {stage}
                </span>
                <span className="mt-0.5 block text-sm font-semibold leading-tight">{title}</span>
                <span className="mt-1 block text-xs leading-snug text-muted-foreground">{caption}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <IntroDisclosures background={background} />

      <Button
        onClick={() => dispatch({ type: 'SET_ADDRESS_INTRO_SEEN' })}
        className="h-12 w-full rounded-xl text-base font-medium"
      >
        {t('address.intro.start')}
      </Button>
    </div>
  );
}
