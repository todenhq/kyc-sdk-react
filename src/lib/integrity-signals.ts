// ---------------------------------------------------------------------------
// Capture-integrity signals, collected during the session and attached to the
// submit metadata (deviceMetadata.integrity on the server). Two families:
//
//  - camera: virtual-camera / injection heuristics inspected when the camera
//    stream starts (OBS, ManyCam, emulated devices defeat ANY liveness that
//    trusts the frames — this flags them for review, it never hard-blocks).
//  - liveness: how Presence Intelligence ran (mode, flash-challenge outcome,
//    face-continuity glitches) — audit context next to the liveness video.
// ---------------------------------------------------------------------------

export interface CameraIntegrity {
  suspect: boolean;
  signals: string[];
  label?: string;
}

export interface LivenessSignals {
  mode: 'gestures' | 'flash' | 'both' | 'passive';
  /** The prompts this run used, in order (e.g. ['turn', 'blink']). */
  challenges?: string[];
  flash?: {
    passed: boolean;
    score: number;
    matched: number;
    total: number;
    inconclusive: boolean;
    sequence: string[];
    /** When each colour came on, ms from the start of the recording. */
    onsets?: number[];
  };
  /** Face-continuity glitches observed during gesture challenges. */
  faceGlitches?: number;
  /** Whether the liveness recording reached the server, and why not when it did not. */
  video?: LivenessVideoReport;
}

/**
 * Why the liveness recording is missing. A stable, add-only vocabulary shared
 * with the React Native and Flutter SDKs; the server stores it verbatim on
 * `Verification.livenessCapture.failure`.
 */
export type LivenessVideoFailure =
  | 'recorder_unsupported' // this browser cannot record video at all
  | 'recorder_start_failed' // recording was possible but did not start
  | 'recording_empty' // the recorder stopped without producing any footage
  | 'upload_failed' // footage existed but could not be uploaded
  | 'recording_missing'; // liveness ran and no footage exists, cause unknown

export interface LivenessVideoReport {
  recorded: boolean;
  failure?: LivenessVideoFailure;
}

// Known virtual-camera / feed-injection software names (label substrings).
const VIRTUAL_CAMERA_MARKERS = [
  'obs',
  'virtual',
  'manycam',
  'xsplit',
  'snap camera',
  'droidcam',
  'iriun',
  'epoccam',
  'mmhmm',
  'splitcam',
  'youcam',
  'fake',
];

let cameraIntegrity: CameraIntegrity | null = null;
let livenessSignals: LivenessSignals | null = null;
// Why the step could not record, when it could not. Held apart from the claim
// so it survives the step's own mode write, and settled at submit.
let recorderFailure: LivenessVideoFailure | null = null;

/** Inspect a just-started camera stream for injection heuristics. Never throws. */
export function inspectCameraStream(stream: MediaStream): void {
  try {
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const signals: string[] = [];
    const label = (track.label || '').toLowerCase();

    for (const marker of VIRTUAL_CAMERA_MARKERS) {
      if (label.includes(marker)) {
        signals.push(`virtual_camera_label:${marker}`);
        break;
      }
    }
    if (!track.label) signals.push('empty_device_label');

    // Real hardware exposes rich capabilities; virtual devices are often bare.
    const getCapabilities = (track as MediaStreamTrack & { getCapabilities?: () => Record<string, unknown> })
      .getCapabilities;
    if (typeof getCapabilities !== 'function') {
      signals.push('no_capabilities_api');
    } else {
      const caps = getCapabilities.call(track) ?? {};
      const keys = Object.keys(caps);
      if (keys.length === 0) signals.push('empty_capabilities');
      if (!('deviceId' in caps) && keys.length > 0) signals.push('no_capability_device_id');
    }

    const settings = track.getSettings?.() ?? {};
    if (settings.frameRate !== undefined && (settings.frameRate <= 0 || settings.frameRate > 240)) {
      signals.push('implausible_frame_rate');
    }

    // Suspect only on the strong marker — the heuristics alone flag too many
    // legitimate webcams; they still ride along as context for reviewers.
    const suspect = signals.some((s) => s.startsWith('virtual_camera_label'));
    cameraIntegrity = { suspect, signals, label: track.label || undefined };
  } catch {
    /* best-effort — never break camera startup */
  }
}

export function recordLivenessSignals(update: Partial<LivenessSignals> & { mode: LivenessSignals['mode'] }): void {
  livenessSignals = { ...livenessSignals, ...update };
}

/** The liveness step could not record (or recorded nothing). Cleared on a fresh recording. */
export function recordRecorderFailure(failure: LivenessVideoFailure | null): void {
  recorderFailure = failure;
}

/**
 * Settle the recording's state at submit, once the upload has been attempted.
 * Only when liveness actually ran (a claim exists): a flow with no liveness
 * step reports nothing.
 */
export function settleLivenessVideo(input: { hadRecording: boolean; uploaded: boolean }): void {
  if (!livenessSignals) return;
  const video: LivenessVideoReport = input.uploaded
    ? { recorded: true }
    : { recorded: false, failure: input.hadRecording ? 'upload_failed' : (recorderFailure ?? 'recording_missing') };
  livenessSignals = { ...livenessSignals, video };
}

/** Snapshot attached to the submit's device metadata (undefined when nothing collected). */
export function getIntegrityMetadata():
  | { camera?: CameraIntegrity; liveness?: LivenessSignals }
  | undefined {
  if (!cameraIntegrity && !livenessSignals) return undefined;
  return {
    ...(cameraIntegrity ? { camera: cameraIntegrity } : {}),
    ...(livenessSignals ? { liveness: livenessSignals } : {}),
  };
}

/** Reset between sessions (modal close). */
export function resetIntegritySignals(): void {
  cameraIntegrity = null;
  livenessSignals = null;
  recorderFailure = null;
}
