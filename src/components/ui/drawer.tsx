'use client';

import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { cn } from '../../lib/utils';
import { useThemeVars } from '../../lib/theme-context';
import { usePortalHost } from '../../lib/sdk-frame-context';

function Drawer({ shouldScaleBackground = true, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />;
}

const DrawerTrigger = DrawerPrimitive.Trigger;
const DrawerPortal = DrawerPrimitive.Portal;
const DrawerClose = DrawerPrimitive.Close;

function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      className={cn('fixed inset-0 z-50 bg-black/80', className)}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  style,
  direction = 'bottom',
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
  /**
   * Must match the `direction` on the Drawer root. `bottom` (default) is the
   * mobile drawer — grab handle, rounded top. `right` is the desktop side
   * sheet — full-height panel sliding in from the right, no handle.
   */
  direction?: 'bottom' | 'right';
}) {
  // verification-root only restores the DEFAULT tokens inside the portal; the brand
  // overrides are inline vars on the modal root, so re-apply them here.
  const themeVars = useThemeVars();
  // SdkFrame mounts portal into the SDK's shadow frame; null = document.body.
  const portalHost = usePortalHost();
  return (
    <DrawerPortal container={portalHost ?? undefined}>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        className={cn(
          // `text-foreground` is load-bearing: in a shadow-isolated mount the
          // host reset (`all: initial`) severs inherited page colour, so a
          // surface that only sets its background renders BLACK text — on a
          // dark theme, black on near-black. Same pattern as DialogContent.
          'verification-root fixed z-50 flex flex-col bg-background text-foreground',
          direction === 'right'
            ? // A plain full-height panel — no rounded corners, no border;
              // the overlay alone separates it from the page.
              'inset-y-0 right-0 h-full w-full max-w-md'
            : 'inset-x-0 bottom-0 mt-24 h-auto rounded-t-[10px] border border-border',
          className,
        )}
        style={{ ...themeVars, ...style }}
        {...props}
      >
        {direction === 'bottom' && <div className="mx-auto mt-4 h-2 w-25 rounded-full bg-muted" />}
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid gap-1.5 p-4 text-center sm:text-left', className)} {...props} />;
}

function DrawerFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />;
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
