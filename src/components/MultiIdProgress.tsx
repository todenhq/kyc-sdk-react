'use client';

// The multi-ID run's position strip: one chip per slot, filling in with the
// picked ID's name as each slot commits, the current one highlighted. Rendered
// above the picker/evidence/liveness steps so a reader always knows which of
// the run's IDs the screen is about and how many remain.

import { Check } from './icons';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { cn } from '../lib/utils';
import type { MultiIdPlan } from '../lib/multi-id';
import { useText } from '../i18n';

export function MultiIdProgress({
  plan,
  slots,
}: {
  plan: MultiIdPlan;
  slots: Array<{ idType: string }>;
}) {
  const config = useVerificationConfig();
  const t = useText();
  const labelFor = (idType: string) =>
    config.getIdTypeDefinition(idType)?.label ?? idType.toUpperCase();

  return (
    <div
      className="mb-4 shrink-0 animate-fade-in"
      aria-label={`ID ${Math.min(plan.index + 1, plan.count)} of ${plan.count}`}
    >
      <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-border bg-muted/40 px-3 py-2">
        {Array.from({ length: plan.count }, (_, i) => {
          const committed = slots[i];
          const active = i === plan.index;
          return (
            <div key={i} className="flex min-w-0 items-center gap-2">
              {i > 0 && (
                <div className={cn('h-px w-4 shrink-0', committed || active ? 'bg-primary/50' : 'bg-border')} />
              )}
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  committed
                    ? 'bg-primary text-primary-foreground'
                    : active
                      ? 'border-2 border-primary text-primary'
                      : 'border border-border text-muted-foreground',
                )}
              >
                {committed ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  'truncate text-xs',
                  active ? 'font-medium text-foreground' : 'text-muted-foreground',
                )}
              >
                {committed ? labelFor(committed.idType) : t('selectDocument.multiId.slot', { number: i + 1 })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
