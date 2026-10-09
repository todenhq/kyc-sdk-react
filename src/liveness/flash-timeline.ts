// ---------------------------------------------------------------------------
// WHEN each flash colour came on, measured from the start of the liveness
// recording.
//
// The server re-reads the recording to check the flash for itself. Without
// these times it has to FIND the sequence in the video, which works when the
// reflection is strong and guesses when it is faint. With them it looks in the
// right place and only has to decide whether the colour was there.
//
// They are a claim like the sequence itself: the server uses them to know
// where to look, never as evidence that anything was reflected.
//
// Two clocks are involved (the page's and the recorder's), and a recorder takes
// a moment to write its first frame, so the server allows for an offset.
//
// Mirrored by the React Native (liveness/flashTimeline.ts) and Flutter
// (liveness/flash_timeline.dart) SDKs. Change all three together.
// ---------------------------------------------------------------------------

let recordingStartedAt: number | null = null;

/** The liveness recorder started (or stopped: pass null). `performance.now()`. */
export function markRecordingStart(at: number | null): void {
  recordingStartedAt = at;
}

/**
 * The colour-on times as ms from the start of the recording, or undefined when
 * there is no recording to measure from or a colour never ran. One whole,
 * rising list or nothing: half a timeline would point the server at the wrong
 * colours.
 */
export function flashOnsets(onAt: number[], colours: number, startedAt = recordingStartedAt): number[] | undefined {
  if (startedAt === null || onAt.length !== colours || colours === 0) return undefined;
  const onsets = onAt.map((at) => Math.round(at - startedAt));
  const rising = onsets.every((ms, i) => ms >= 0 && (i === 0 || ms > onsets[i - 1]!));
  return rising ? onsets : undefined;
}
