'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '../../lib/utils';
import { useThemeVars } from '../../lib/theme-context';
import { usePortalHost } from '../../lib/sdk-frame-context';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 6, style, ...props }, ref) => {
  // verification-root only restores the DEFAULT tokens inside the portal; the brand
  // overrides are inline vars on the modal root, so re-apply them here.
  const themeVars = useThemeVars();
  // SdkFrame mounts portal into the SDK's shadow frame; null = document.body.
  const portalHost = usePortalHost();
  return (
  <PopoverPrimitive.Portal container={portalHost ?? undefined}>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'verification-root z-[70] rounded-xl border border-border bg-background p-3 text-foreground shadow-md outline-none data-[state=open]:animate-fade-in',
        className,
      )}
      style={{ ...themeVars, ...style }}
      {...props}
    />
  </PopoverPrimitive.Portal>
  );
});
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent };
