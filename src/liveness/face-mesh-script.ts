// ---------------------------------------------------------------------------
// The MediaPipe Face Mesh script: its shape, and loading it from ONE source.
// Which sources are tried, and in what order, is face-mesh.ts's business.
// ---------------------------------------------------------------------------

import type { NormalizedLandmark } from './types';

// ---------------------------------------------------------------------------
// Types for the MediaPipe JS API (we only use what we need)
// ---------------------------------------------------------------------------

export interface FaceMeshResults {
  multiFaceLandmarks?: NormalizedLandmark[][];
}

export interface FaceMeshInstance {
  setOptions: (opts: Record<string, unknown>) => void;
  onResults: (callback: (results: FaceMeshResults) => void) => void;
  initialize: () => Promise<void>;
  send: (input: { image: HTMLVideoElement }) => Promise<void>;
  close: () => void;
}

export interface FaceMeshConstructor {
  new (config: { locateFile: (file: string) => string }): FaceMeshInstance;
}

/** How long one source has to hand over its script before the next is tried. */
const SCRIPT_TIMEOUT_MS = 15_000;

function globalFaceMesh(): FaceMeshConstructor | undefined {
  return (window as unknown as Record<string, unknown>).FaceMesh as FaceMeshConstructor | undefined;
}

/**
 * The script from one source. Resolves with the constructor it defines, and
 * rejects (taking its tag back out) when the source is unreachable, too slow,
 * or answers with something that is not the script: a host with no such file
 * often answers 200 with its own HTML page.
 */
export function loadFaceMeshScript(base: string): Promise<FaceMeshConstructor> {
  // Already defined by an earlier attempt or session: the script is the same
  // pinned version whichever source it came from.
  const existing = globalFaceMesh();
  if (existing) return Promise.resolve(existing);

  return new Promise<FaceMeshConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const fail = (message: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      script.remove();
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail(`Face Mesh script timed out from ${base}`), SCRIPT_TIMEOUT_MS);
    script.src = `${base}face_mesh.js`;
    script.async = true;
    script.onload = () => {
      const FM = globalFaceMesh();
      if (!FM) {
        fail(`Face Mesh script from ${base} did not define FaceMesh`);
        return;
      }
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(FM);
    };
    script.onerror = () => fail(`Failed to load Face Mesh script from ${base}`);
    document.head.appendChild(script);
  });
}
