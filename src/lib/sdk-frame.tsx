'use client';

/**
 * SdkFrame — the style-isolation boundary for embedded SDK mounts.
 *
 * The SDK ships a full Tailwind build, and mounting that globally in a host
 * app collides in both directions: the host's `.hidden`, element resets and
 * `!important` rules restyle the SDK, and the SDK's preflight, utilities and
 * document-global keyframes break the host (the dashboard hit all three
 * before it was banished to the hosted page). Shadow DOM makes both
 * directions structurally impossible: host selectors cannot match inside a
 * shadow tree, and the SDK's sheet lives only inside its roots.
 *
 * TWO shadow hosts, not one:
 *
 * - An INLINE host at the mount point, for in-flow content (the trigger
 *   button). `display: contents` keeps it out of the host app's layout.
 * - A PORTAL host appended to document.body, whose in-shadow frame is the
 *   portal target for every floating surface (Dialog, Select, dropdown menus,
 *   the liveness flash overlay). It sits at body level for the same reason
 *   those surfaces used to portal to document.body directly: `fixed`
 *   positioning resolves against the viewport only when no ancestor is
 *   transformed, and the mount point's host-app ancestors are not ours to
 *   vet. The frame is also the SDK's theme root — `.dark` lives on it, since
 *   a class on the host page's <html> cannot match across the boundary.
 *
 * Both roots adopt one shared CSSStyleSheet (sdk-styles.ts). The children are
 * React-portaled into the inline frame, so React context (config, theme,
 * portal host) flows into the shadow tree unchanged.
 */

import React, { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PortalHostContext, ThemeRootContext } from './sdk-frame-context';
import { applySdkStyles } from './sdk-styles';

/**
 * Near-max int32, Stripe-style: the SDK's modal is meant to sit above host
 * chrome (sticky headers with ambitious z-indexes included). Internal layers
 * (overlay 50 / menus 70 / flash 100) still resolve among themselves inside
 * this one stacking context.
 */
const PORTAL_HOST_Z = '2147482647';

interface Frames {
  inline: HTMLElement;
  portal: HTMLElement;
}

function makeFrame(shadow: ShadowRoot): HTMLElement {
  applySdkStyles(shadow);
  const frame = document.createElement('div');
  frame.setAttribute('data-verification-frame', '');
  // Scroll events stop at the boundary. Radix's scroll lock
  // (react-remove-scroll) preventDefaults wheel/touchmove at the DOCUMENT
  // unless its own React capture handler vouched for the event first — and
  // that handler never fires for events born inside a shadow-root portal, so
  // the lock ate every scroll in the SDK's own modal (measured: programmatic
  // scrollTop worked, real wheel did not). Stopping propagation here, in the
  // bubble phase AFTER every inner handler has seen the event, means the
  // document listener never sees SDK-internal scrolls and native scrolling
  // just works. The lock still does its real job — host-page scrolling stays
  // locked (body overflow + events outside the frame still reach it), and
  // passive listeners keep the browser's scroll fast path.
  for (const type of ['wheel', 'touchmove'] as const) {
    frame.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  }
  shadow.appendChild(frame);
  return frame;
}

export function SdkFrame({ isolate = true, children }: { isolate?: boolean; children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [frames, setFrames] = useState<Frames | 'unsupported' | null>(null);

  useLayoutEffect(() => {
    if (!isolate) return undefined;
    const host = hostRef.current;
    if (!host) return undefined;
    if (typeof host.attachShadow !== 'function') {
      // Ancient browser: render in light DOM, where the consumer's global
      // ./styles.css import (still shipped) styles the SDK as before.
      setFrames('unsupported');
      return undefined;
    }

    // The inline shadow root survives remounts (a shadow root cannot be
    // detached), so reuse its frame; StrictMode's double-invoke lands here.
    const inlineShadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    const inline =
      inlineShadow.querySelector<HTMLElement>('[data-verification-frame]') ?? makeFrame(inlineShadow);

    const portalHost = document.createElement('div');
    portalHost.setAttribute('data-myaza-kyc-portal', '');
    portalHost.style.position = 'relative';
    portalHost.style.zIndex = PORTAL_HOST_Z;
    document.body.appendChild(portalHost);
    const portal = makeFrame(portalHost.attachShadow({ mode: 'open' }));
    // Isolation cuts the SDK off from the host page's `.dark` class, so a
    // dark host app would abruptly get a light modal. Seed the host page's
    // CURRENT mode once; from then on the frame's theme is its own (the
    // configured `appearance.theme` and the in-flow toggle write here).
    portal.classList.toggle('dark', document.documentElement.classList.contains('dark'));

    setFrames({ inline, portal });
    return () => {
      setFrames(null);
      portalHost.remove();
    };
  }, [isolate]);

  if (!isolate) return <>{children}</>;
  if (frames === 'unsupported') return <div data-myaza-kyc="">{children}</div>;

  return (
    <div ref={hostRef} data-myaza-kyc="">
      {frames &&
        createPortal(
          <PortalHostContext.Provider value={frames.portal}>
            <ThemeRootContext.Provider value={frames.portal}>{children}</ThemeRootContext.Provider>
          </PortalHostContext.Provider>,
          frames.inline,
        )}
    </div>
  );
}
