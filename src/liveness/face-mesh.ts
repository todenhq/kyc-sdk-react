// ---------------------------------------------------------------------------
// MediaPipe Face Mesh loader
// The ~10 MB of WASM and model files are NOT bundled: they are fetched, from
// the list of sources in face-mesh-sources.ts (the KYC server first, the
// public CDN as the fallback), and a source that fails is skipped for the next.
// ---------------------------------------------------------------------------

import type { NormalizedLandmark } from './types';
import { faceMeshSources, type FaceMeshOrigin } from './face-mesh-sources';
import {
  loadFaceMeshScript,
  type FaceMeshInstance,
  type FaceMeshResults,
} from './face-mesh-script';

// ---------------------------------------------------------------------------
// Where to load from. Set by `primeFaceMesh` at SDK mount, which is the one
// place that knows the server the SDK was mounted with; the public CDN alone
// until then.
// ---------------------------------------------------------------------------

let origin: FaceMeshOrigin = {};

/**
 * Say where the files are loaded from. Call it before the first load starts
 * (SDK mount): a model already loading or loaded keeps the source it has.
 */
export function setFaceMeshOrigin(from: FaceMeshOrigin): void {
  origin = from;
}

/** How long one source has to download and start the model. */
const INIT_TIMEOUT_MS = 25_000;

// ---------------------------------------------------------------------------
// Persistent warm instance — created once (at SDK load time via
// `primeFaceMesh()`) and reused for the lifetime of the page. The WASM model is
// expensive to initialize, so we never tear it down between liveness sessions;
// instead each session just attaches its own landmark callback and detaches it
// on close. This keeps re-entry (and retake) instant instead of re-loading the
// model every time.
// ---------------------------------------------------------------------------

let sharedInstance: FaceMeshInstance | null = null;
let sharedInitPromise: Promise<FaceMeshInstance> | null = null;

// The single active consumer's landmark callback. The instance's onResults
// dispatcher (installed once, below) forwards to whatever is set here. Only one
// liveness session runs at a time, so a single slot is enough.
//
// `faceCount` is the number of faces MediaPipe found in the frame — the liveness
// flow uses `> 1` to pause challenges ("Make sure only your face is visible").
type LandmarkCallback = (
  landmarks: NormalizedLandmark[] | null,
  faceCount: number,
) => void;

let activeCallback: LandmarkCallback | null = null;

// ---------------------------------------------------------------------------
// Shared options used for both prewarming and live instances
// ---------------------------------------------------------------------------

function applyOptions(instance: FaceMeshInstance) {
  instance.setOptions({
    // Detect up to 2 faces so the liveness flow can spot (and pause on) a second
    // person in frame. Only the largest/first face drives gesture detection.
    maxNumFaces: 2,
    refineLandmarks: true,
    minDetectionConfidence: 0.35,
    minTrackingConfidence: 0.35,
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface FaceMeshHandle {
  /** Send a video frame for landmark detection */
  send: (video: HTMLVideoElement) => Promise<void>;
  /** Clean up resources */
  close: () => void;
}

/**
 * Build the shared FaceMesh instance once and initialize its WASM model. The
 * single `onResults` dispatcher forwards every frame's landmarks to the current
 * `activeCallback`, so individual sessions never need to re-register results or
 * re-initialize. Concurrent callers share the same in-flight promise.
 */
function ensureInstance(): Promise<FaceMeshInstance> {
  if (sharedInstance) return Promise.resolve(sharedInstance);
  if (sharedInitPromise) return sharedInitPromise;

  sharedInitPromise = (async () => {
    const sources = faceMeshSources(origin);
    let lastError: unknown = new Error('No Face Mesh source');
    // One source at a time, each to completion: the script, then the model it
    // fetches from the same place. Whatever goes wrong, the next one is tried.
    for (const base of sources) {
      let instance: FaceMeshInstance | null = null;
      try {
        const FaceMesh = await loadFaceMeshScript(base);
        instance = new FaceMesh({ locateFile: (f) => `${base}${f}` });
        applyOptions(instance);

        // Installed once for the instance's lifetime; routes to the active session.
        instance.onResults((results: FaceMeshResults) => {
          const cb = activeCallback;
          if (!cb) return; // no session attached, ignore stray frames
          const faces = results.multiFaceLandmarks ?? [];
          if (faces.length > 0) {
            cb(faces[0], faces.length);
          } else {
            cb(null, 0);
          }
        });

        await Promise.race([
          instance.initialize(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Face Mesh did not start from ${base}`)), INIT_TIMEOUT_MS),
          ),
        ]);
        sharedInstance = instance;
        return instance;
      } catch (err) {
        lastError = err;
        // Tear down the partial instance before the next source is tried.
        try { instance?.close(); } catch { /* ignore */ }
      }
    }
    // Every source failed. Allow a later retry (the step's Try Again).
    sharedInstance = null;
    sharedInitPromise = null;
    throw lastError;
  })();

  return sharedInitPromise;
}

/**
 * Call this as early as possible (on SDK mount) to pre-load the MediaPipe
 * script and initialize the WASM model in the background. When the user reaches
 * the liveness step, `createFaceMesh` reuses the warm instance immediately
 * instead of waiting for the model to download.
 *
 * [from] says where the files are loaded from (see face-mesh-sources.ts).
 */
export function primeFaceMesh(from?: FaceMeshOrigin): void {
  if (from) setFaceMeshOrigin(from);
  // Kick off (or reuse) the shared init; failures are retried on demand later.
  ensureInstance().catch(() => { /* prewarm is best-effort */ });
}

/**
 * Attach a liveness session to the shared FaceMesh instance. Reuses the
 * already-warm model (no re-initialization between sessions or retakes); if
 * priming hasn't finished, this awaits the same in-flight init.
 *
 * `close()` only detaches this session's callback — the warm instance is kept
 * alive for the next session.
 */
export async function createFaceMesh(
  onLandmarks: LandmarkCallback,
): Promise<FaceMeshHandle> {
  const instance = await ensureInstance();
  activeCallback = onLandmarks;

  return {
    send: (video: HTMLVideoElement) => instance.send({ image: video }),
    close: () => {
      // Detach only — keep the instance warm. Guard against clobbering a newer
      // session that may have attached in the meantime.
      if (activeCallback === onLandmarks) activeCallback = null;
    },
  };
}
