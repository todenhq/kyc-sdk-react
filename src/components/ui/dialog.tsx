"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "../../lib/utils";
import { usePortalHost } from "../../lib/sdk-frame-context";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
	React.ComponentRef<typeof DialogPrimitive.Overlay>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Overlay
		ref={ref}
		className={cn("fixed inset-0 z-50 animate-fade-in transition-colors duration-500", className)}
		{...props}
	/>
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
	React.ComponentRef<typeof DialogPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
		fullscreen?: boolean;
		overlayClassName?: string;
		overlayStyle?: React.CSSProperties;
	}
>(({ className, children, fullscreen, overlayClassName, overlayStyle, ...props }, ref) => {
	// Inside an isolated (SdkFrame) mount the dialog portals into the SDK's
	// body-level shadow frame — styled by the SDK's own sheet and free of
	// transformed host-app ancestors. Null = no boundary (hosted page):
	// Radix's document.body default, as before.
	//
	// It is also why @radix-ui/react-dialog is floored at ^1.1.23. Older
	// versions checked for the DialogTitle with `document.getElementById`,
	// which cannot see into a shadow root, so they console.error'd
	// "`DialogContent` requires a `DialogTitle`" on every open even though the
	// title below is right there, in production as well as dev.
	//
	// Note the floor here only governs what OUR installs resolve: tsup leaves
	// `dependencies` external, so a consumer app supplies its own copy of this
	// package at runtime. Fixing it for an integrator means their range, not
	// ours. See ./dialog-a11y-warning.test.ts.
	const portalHost = usePortalHost();
	return (
	<DialogPortal container={portalHost ?? undefined}>
		<DialogOverlay className={cn("bg-black/60", overlayClassName)} style={overlayStyle} />
		<DialogPrimitive.Content
			ref={ref}
			className={cn(
				"fixed z-50 bg-background text-foreground shadow-lg animate-slide-up focus:outline-none overflow-y-auto",
				// `h-dvh` beside `inset-0`: the height comes from the dynamic viewport
				// unit, not from `bottom: 0`. On iOS Safari a link opened from
				// another app (WhatsApp, Mail) can lay the page out before the
				// viewport has its real size, and a fixed box sized by its insets
				// then keeps that stale height until something forces a relayout:
				// the sheet rendered content-tall with the dimmed page showing
				// beneath "Protected by", and a refresh cured it. Viewport units are
				// re-resolved when the viewport changes; insets were not. Browsers
				// without dvh ignore the rule and fall back to the insets.
				fullscreen
					? "inset-0 h-dvh rounded-none"
					: "inset-0 h-dvh rounded-none xl:inset-auto xl:h-auto xl:left-[50%] xl:top-[50%] xl:translate-x-[-50%] xl:translate-y-[-50%] xl:w-[40vw] xl:max-h-[92vh] xl:rounded-2xl",
				className,
			)}
			{...props}>
			{children}
		</DialogPrimitive.Content>
	</DialogPortal>
	);
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn(
			"flex flex-col space-y-1.5 text-center sm:text-left",
			className,
		)}
		{...props}
	/>
);

const DialogTitle = React.forwardRef<
	React.ComponentRef<typeof DialogPrimitive.Title>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Title
		ref={ref}
		className={cn(
			"text-lg font-semibold leading-none tracking-tight",
			className,
		)}
		{...props}
	/>
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
	React.ComponentRef<typeof DialogPrimitive.Description>,
	React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
	<DialogPrimitive.Description
		ref={ref}
		className={cn("text-sm text-muted-foreground", className)}
		{...props}
	/>
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
	Dialog,
	DialogPortal,
	DialogOverlay,
	DialogClose,
	DialogTrigger,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
};
