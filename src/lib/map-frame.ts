import type { LatLng } from './map-tiles';

// The framed Google-map picker's client half (the OkHi model): the SDK embeds
// OUR hosted /embed/map page in an iframe and talks to it over postMessage.
// This file is the PROTOCOL — pure, unit-tested, shared by the iframe
// component so a malformed or foreign message can never reach step state.
//
// Message shapes (add-only; the page mirrors them):
//   page -> parent: { source: 'myaza-map', type: 'ready' | 'failed' }
//                   { source: 'myaza-map', type: 'pin', lat, lng }
//   parent -> page: { source: 'myaza-sdk', type: 'center', lat, lng, zoom? }

export const MAP_FRAME_SOURCE = 'myaza-map';
export const MAP_PARENT_SOURCE = 'myaza-sdk';

/** How long to wait for `ready` before falling back to the OSM picker.
 *  20 seconds: the hosted page is rendered per request and then loads Google's
 *  script, and from a phone on mobile data that measured over 8 seconds often
 *  enough that the map fell back to the built-in picker while the real one
 *  was still on its way (production, 2026-10-04). The three SDKs keep one
 *  value. */
export const MAP_FRAME_READY_TIMEOUT_MS = 20000;

export interface MapFrameOptions {
  /** The embedding page's own origin — the page posts its messages to exactly
   *  this target, so pins are never readable by a different window. */
  parentOrigin: string;
  center: LatLng;
  zoom: number;
  /** Recentre-and-zoom-in when the parent already holds a pin. */
  hasPin: boolean;
  theme?: 'light' | 'dark';
  primaryColor?: string;
}

/** The full iframe src: the server-minted frame URL (which already carries the
 *  signed grant) plus the render-time parameters. */
export function buildMapFrameSrc(frameUrl: string, opts: MapFrameOptions): string {
  const url = new URL(frameUrl);
  url.searchParams.set('origin', opts.parentOrigin);
  url.searchParams.set('lat', String(opts.center.lat));
  url.searchParams.set('lng', String(opts.center.lng));
  url.searchParams.set('zoom', String(opts.hasPin ? 16 : opts.zoom));
  if (opts.theme) url.searchParams.set('theme', opts.theme);
  if (opts.primaryColor) url.searchParams.set('primary', opts.primaryColor);
  return url.toString();
}

/** The origin the parent must see on every message event from the frame. */
export function frameOriginOf(frameUrl: string): string | null {
  try {
    return new URL(frameUrl).origin;
  } catch {
    return null;
  }
}

export type MapFrameMessage =
  | { type: 'ready' }
  | { type: 'failed' }
  | { type: 'pin'; lat: number; lng: number };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validate-and-drop: anything not shaped exactly like a frame message is
 *  null, including a pin with non-finite coordinates. */
export function parseMapFrameMessage(data: unknown): MapFrameMessage | null {
  if (!data || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;
  if (msg.source !== MAP_FRAME_SOURCE) return null;
  if (msg.type === 'ready') return { type: 'ready' };
  if (msg.type === 'failed') return { type: 'failed' };
  if (msg.type === 'pin' && finite(msg.lat) && finite(msg.lng)) {
    if (Math.abs(msg.lat) > 90 || Math.abs(msg.lng) > 180) return null;
    return { type: 'pin', lat: msg.lat, lng: msg.lng };
  }
  return null;
}

/** The parent's recentre message (Use my location, restored progress). */
export function centerMessage(pin: LatLng): Record<string, unknown> {
  return { source: MAP_PARENT_SOURCE, type: 'center', lat: pin.lat, lng: pin.lng, zoom: 16 };
}

// ── The framed STREET VIEW page (embeds' entrance framing) ──────────────────
//
// Same origin, same grant, sibling page: /embed/street-view lives beside
// /embed/map and the grant unlocks the key for either, so the SDK DERIVES its
// URL from the server-minted mapsFrameUrl by swapping the path — the two
// pages ship together with this SDK, and the coupling is recorded on both
// sides. The page is deliberately dumb: it renders the panorama and streams
// the current view (`sv-pov`); the framing chrome, the frame-subtended fov
// maths and the capture decision all stay in the SDK.
//
//   page -> parent: { source: 'myaza-map', type: 'sv-ready' | 'sv-unavailable' }
//                   { source: 'myaza-map', type: 'sv-pov', panoId, heading, pitch, viewFov }

/** The street-view page's URL derived from the map frame's, or null when the
 *  frame URL is not the page family this SDK knows. */
export function streetViewFrameUrlOf(mapsFrameUrl: string): string | null {
  try {
    const url = new URL(mapsFrameUrl);
    if (!url.pathname.endsWith('/embed/map')) return null;
    url.pathname = url.pathname.replace(/\/embed\/map$/, '/embed/street-view');
    return url.toString();
  } catch {
    return null;
  }
}

/** The full iframe src: derived page URL (carrying the signed grant) plus the
 *  render-time parameters — the pin the panorama should look from. */
export function buildStreetViewFrameSrc(
  frameUrl: string,
  opts: { parentOrigin: string; pin: LatLng; theme?: 'light' | 'dark' },
): string {
  const url = new URL(frameUrl);
  url.searchParams.set('origin', opts.parentOrigin);
  url.searchParams.set('lat', String(opts.pin.lat));
  url.searchParams.set('lng', String(opts.pin.lng));
  if (opts.theme) url.searchParams.set('theme', opts.theme);
  return url.toString();
}

export type StreetViewFrameMessage =
  | { type: 'sv-ready' }
  | { type: 'sv-unavailable' }
  | { type: 'sv-pov'; panoId: string; heading: number; pitch: number; viewFov: number };

/** Validate-and-drop for the street-view page's messages. */
export function parseStreetViewFrameMessage(data: unknown): StreetViewFrameMessage | null {
  if (!data || typeof data !== 'object') return null;
  const msg = data as Record<string, unknown>;
  if (msg.source !== MAP_FRAME_SOURCE) return null;
  if (msg.type === 'sv-ready') return { type: 'sv-ready' };
  if (msg.type === 'sv-unavailable') return { type: 'sv-unavailable' };
  if (
    msg.type === 'sv-pov' &&
    typeof msg.panoId === 'string' &&
    msg.panoId.length > 0 &&
    finite(msg.heading) &&
    finite(msg.pitch) &&
    finite(msg.viewFov)
  ) {
    return { type: 'sv-pov', panoId: msg.panoId, heading: msg.heading, pitch: msg.pitch, viewFov: msg.viewFov };
  }
  return null;
}
