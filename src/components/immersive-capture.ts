'use client';

import { createContext, useContext } from 'react';

/**
 * Whether the current step has taken over the whole surface.
 *
 * A live document camera wants the entire display: on a phone the framing guide
 * has to be big enough to align a card against, and the modal's banner, header,
 * body padding and footer between them eat roughly a third of the viewport. The
 * native SDKs already hand the surface over (React Native's `immersiveCapture`,
 * which mirrors the Flutter screen), so this is the web's equivalent seam.
 *
 * It is a CONTEXT rather than a step prop for the same reason the capture light
 * is: the modal owns the chrome, the step owns the knowledge of when its camera
 * is live, and threading a flag back up through the step registry would couple
 * every step to a concern only one of them has.
 *
 * The step is responsible for turning it off — on unmount, and whenever it
 * leaves the live-camera phase — or the chrome would stay hidden on the review
 * screen that follows.
 */
export const ImmersiveCaptureContext = createContext<(immersive: boolean) => void>(
  () => {},
);

export function useSetImmersiveCapture(): (immersive: boolean) => void {
  return useContext(ImmersiveCaptureContext);
}

/**
 * How a step that has taken the surface closes the flow, or null when closing
 * is not offered (`disableClose`, or outside the modal). The header normally
 * holds the close button; a step that hides the header has to offer its own.
 */
export const ImmersiveCloseContext = createContext<(() => void) | null>(null);

export function useImmersiveClose(): (() => void) | null {
  return useContext(ImmersiveCloseContext);
}
