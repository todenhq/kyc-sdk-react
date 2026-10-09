"use client";

import React, { useRef, useEffect, useState } from "react";
import { cn } from "../lib/utils";
import type { LivenessChallenge } from "../liveness/types";

// ---------------------------------------------------------------------------
// Animated avatar showing each gesture.
// The animations are bundled as data URIs (transparent animated WebP, about
// 100 KB each) and loaded lazily per gesture so they don't bloat the main
// bundle — each loads only when its challenge is first shown. Their background
// is keyed out, so the circle behind them takes the theme's primary colour.
// Falls back to URL-based loading (the transparent GIFs) when assetsBasePath
// is explicitly provided.
// ---------------------------------------------------------------------------

// The flash and the passive hold have no gesture to demonstrate — the avatar hides for them.
type GestureChallenge = Exclude<LivenessChallenge, "flash" | "hold">;

const LABEL_MAP: Record<GestureChallenge, string> = {
	nod: "Nod your head up and down",
	turn: "Turn your head to either side",
	blink: "Blink your eyes",
	smile: "Smile",
};

// Lazy loaders — each is a separate chunk in the ESM build (code splitting).
// Imported as data URIs by esbuild so no static file serving is needed.
const GIF_LOADERS: Record<GestureChallenge, () => Promise<{ default: string }>> = {
	nod: () => import("../../gifs/Nod.webp"),
	turn: () => import("../../gifs/Turn.webp"),
	blink: () => import("../../gifs/Blink.webp"),
	smile: () => import("../../gifs/Smile.webp"),
};

interface LivenessAvatarProps {
	gesture: LivenessChallenge | null;
	visible: boolean;
	/**
	 * Override the base path where gesture GIFs are served from (e.g. a CDN URL).
	 * When omitted (the default), GIFs are loaded from the bundled data URIs —
	 * no asset copying or CDN setup required.
	 */
	assetsBasePath?: string;
	className?: string;
	/**
	 * Diameter in px. Absent keeps the modal's own size; the full-screen
	 * camera hands a smaller one, since its avatar sits above the window.
	 */
	size?: number;
}

export function LivenessAvatar({
	gesture: rawGesture,
	visible,
	assetsBasePath,
	className,
	size,
}: LivenessAvatarProps) {
	// Flash and the passive hold have no demonstrable gesture — treat them as "no avatar".
	const gesture: GestureChallenge | null =
		rawGesture === "flash" || rawGesture === "hold" ? null : rawGesture;
	const [displayed, setDisplayed] = useState<GestureChallenge | null>(gesture);
	const [slideState, setSlideState] = useState<"in" | "out-left" | "in-right">(
		"in",
	);
	// Map of gesture → resolved src (data URI or URL)
	const [gifSrcs, setGifSrcs] = useState<Partial<Record<GestureChallenge, string>>>({});
	const prevRef = useRef<GestureChallenge | null>(null);

	// Load the GIF src for a gesture — either from the bundled data URI or URL.
	const loadGif = (g: GestureChallenge) => {
		if (assetsBasePath) {
			const base = assetsBasePath.replace(/\/$/, "");
			const FILE_MAP: Record<GestureChallenge, string> = {
				nod: "Nod.gif",
				turn: "Turn.gif",
				blink: "Blink.gif",
				smile: "Smile.gif",
			};
			setGifSrcs((prev) => ({ ...prev, [g]: `${base}/${FILE_MAP[g]}` }));
		} else {
			GIF_LOADERS[g]().then((mod) => {
				setGifSrcs((prev) => ({ ...prev, [g]: mod.default }));
			});
		}
	};

	// Pre-load the current gesture's GIF as soon as it changes.
	useEffect(() => {
		if (!gesture) return;
		if (!gifSrcs[gesture]) loadGif(gesture);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gesture, assetsBasePath]);

	// Slide transition when the displayed gesture changes.
	useEffect(() => {
		if (gesture && gesture !== prevRef.current) {
			if (prevRef.current !== null) {
				setSlideState("out-left");
				const t = setTimeout(() => {
					setDisplayed(gesture);
					setSlideState("in-right");
					const t2 = setTimeout(() => setSlideState("in"), 300);
					return () => clearTimeout(t2);
				}, 250);
				prevRef.current = gesture;
				return () => clearTimeout(t);
			} else {
				setDisplayed(gesture);
				setSlideState("in");
			}
			prevRef.current = gesture;
		}
	}, [gesture]);

	const g = displayed;
	const src = g ? gifSrcs[g] : undefined;

	return (
		<div
			className={cn(
				"flex justify-center overflow-hidden transition-all duration-300 ease-in-out",
				visible ? "max-h-48 opacity-100" : "max-h-0 opacity-0",
				className,
			)}>
			<div
				className={cn(
					"transition-all duration-250",
					slideState === "out-left" && "translate-x-full opacity-0",
					slideState === "in-right" &&
						"translate-x-0 opacity-100 animate-avatar-slide-in",
					slideState === "in" && "translate-x-0 opacity-100",
				)}>
				<div
					className={cn('overflow-hidden rounded-full bg-primary/10', size == null && 'h-32 w-32')}
					style={size == null ? undefined : { width: size, height: size }}>
					{g && src && (
						<img
							src={src}
							alt={LABEL_MAP[g]}
							className='h-full w-full object-cover scale-125'
						/>
					)}
				</div>
			</div>
		</div>
	);
}
