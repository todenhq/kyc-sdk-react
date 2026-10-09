'use client';

import React from 'react';
import { MoveLeft, X } from '../../components/icons';
import { useBackAvailable } from '../../components/opening-step';
import { useImmersiveClose } from '../../components/immersive-capture';
import { useText } from '../../i18n';

// Back and close for the full-screen camera, which has no header to hold
// them. Each is the header's own glyph on a solid disc in the flow's colours:
// behind them is a camera, and a bare glyph on whatever the room looks like is
// not a button. 40px to look at, 44 to tap.

function RoundButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="group flex h-11 w-11 cursor-pointer touch-manipulation items-center justify-center rounded-full outline-none"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary text-foreground/80 transition-transform duration-150 group-focus-visible:ring-2 group-focus-visible:ring-ring group-active:scale-95 motion-reduce:transition-none">
        {children}
      </span>
    </button>
  );
}

export function ImmersiveControls({ onBack }: { onBack: () => void }) {
  const t = useText();
  const backAvailable = useBackAvailable();
  const close = useImmersiveClose();
  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-10 flex justify-between px-2.5"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)' }}
    >
      <span className="pointer-events-auto">
        {backAvailable ? (
          <RoundButton label={t('common.back')} onClick={onBack}>
            <MoveLeft className="h-[22px] w-[22px]" aria-hidden />
          </RoundButton>
        ) : null}
      </span>
      <span className="pointer-events-auto">
        {close ? (
          <RoundButton label={t('common.close')} onClick={close}>
            <X className="h-5 w-5" aria-hidden />
          </RoundButton>
        ) : null}
      </span>
    </div>
  );
}
