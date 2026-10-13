'use client';

// ─── useSilentCapture ────────────────────────────────────────────────────────
//
// Takes the silent-capture frame (lib/silent-capture.ts) from the document
// camera the step ALREADY has open, when that camera faces the person. It adds
// nothing to the screen and never waits on anything: the frame is copied from
// the live <video> to an offscreen canvas when the browser is idle, encoded as
// JPEG and uploaded in the background. Detection and the recorder read the
// same element and are untouched.

import { useEffect, useRef } from 'react';
import { useVerificationConfig } from '../context/VerificationConfigContext';
import { withRetry } from '../lib/retry';
import {
  SILENT_FRAME_QUALITY,
  canTakeSilentFrame,
  silentCaptureApplies,
  silentFrameSize,
} from '../lib/silent-capture';
import { reserveSilentFrame, silentFrames, uploadSilentFrame } from '../lib/silent-capture-store';

export interface UseSilentCaptureOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** The document camera is live AND faces the person (a laptop webcam). */
  active: boolean;
  /** When to take the frame, in ms after `active` turned true. */
  delayMs: number;
}

/** Run `fn` off the hot path: when the browser is idle, or soon after. */
function whenIdle(fn: () => void): void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(fn, { timeout: 500 });
  else setTimeout(fn, 0);
}

/** Copy the current video frame, unmirrored and scaled down, to a JPEG blob. */
function grabFrame(video: HTMLVideoElement | null): Promise<Blob | null> {
  if (!video || video.readyState < video.HAVE_CURRENT_DATA || !video.videoWidth) {
    return Promise.resolve(null);
  }
  const { width, height } = silentFrameSize(video.videoWidth, video.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  try {
    ctx.drawImage(video, 0, 0, width, height);
  } catch {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', SILENT_FRAME_QUALITY);
    } catch {
      resolve(null);
    }
  });
}

export function useSilentCapture({ videoRef, active, delayMs }: UseSilentCaptureOptions): void {
  const config = useVerificationConfig();
  const applies = silentCaptureApplies(config);
  const apiRef = useRef(config.api);
  apiRef.current = config.api;

  // One frame per camera session (each document side opens its own).
  useEffect(() => {
    if (!active || !applies) return undefined;
    const timer = setTimeout(() => {
      whenIdle(() => {
        if (!canTakeSilentFrame(silentFrames())) return;
        void grabFrame(videoRef.current).then((blob) => {
          if (!blob) return;
          const frame = reserveSilentFrame('document');
          if (!frame) return;
          const api = apiRef.current;
          uploadSilentFrame(frame, () => withRetry(() => api.upload(blob, 'silent_capture'), { retries: 2 }));
        });
      });
    }, delayMs);
    return () => clearTimeout(timer);
  }, [active, applies, delayMs, videoRef]);
}
