// ---------------------------------------------------------------------------
// Holding the camera's exposure and white balance still while the flash runs.
//
// A camera left on automatic fights the flash: it sees a red face and shifts
// its white balance away from red, and it sees extra light and lowers its
// exposure. Both shrink the very change the flash check measures, and the
// white balance then swings back after each colour, which looks like the
// opposite colour arriving. Held still, a colour on the screen is a colour on
// the face and nothing else moves.
//
// Browsers expose this unevenly: Chrome on Android and some desktop webcams
// can lock, Safari cannot. Where it is not offered this does nothing and the
// flash runs as before.
// ---------------------------------------------------------------------------

type Mode = 'continuous' | 'manual' | 'single-shot' | 'none';
interface LockCapabilities {
  exposureMode?: Mode[];
  whiteBalanceMode?: Mode[];
  exposureTime?: unknown;
  colorTemperature?: unknown;
}
/** The camera's current values, read just before locking. */
interface LockSettings {
  exposureTime?: number;
  colorTemperature?: number;
}
type LockConstraint = { exposureMode?: Mode; whiteBalanceMode?: Mode; exposureTime?: number; colorTemperature?: number };

/**
 * What to ask for, given what the camera offers. Empty when it offers nothing.
 * The current exposure time and colour temperature are pinned along with the
 * mode where the camera reports them: some cameras jump to a default on going
 * manual, and a jump is exactly what this exists to prevent.
 */
export function lockConstraints(caps: LockCapabilities, locked: boolean, now: LockSettings = {}): LockConstraint {
  const want: Mode = locked ? 'manual' : 'continuous';
  const out: LockConstraint = {};
  // Only a camera that can be released again is ever locked.
  const canDoBoth = (modes?: Mode[]): boolean => !!modes && modes.includes('manual') && modes.includes('continuous');
  if (canDoBoth(caps.exposureMode)) {
    out.exposureMode = want;
    if (locked && caps.exposureTime && typeof now.exposureTime === 'number') out.exposureTime = now.exposureTime;
  }
  if (canDoBoth(caps.whiteBalanceMode)) {
    out.whiteBalanceMode = want;
    if (locked && caps.colorTemperature && typeof now.colorTemperature === 'number') out.colorTemperature = now.colorTemperature;
  }
  return out;
}

const videoTrack = (video: HTMLVideoElement | null): MediaStreamTrack | null => {
  const source = video?.srcObject;
  return source instanceof MediaStream ? (source.getVideoTracks()[0] ?? null) : null;
};

async function apply(track: MediaStreamTrack, locked: boolean): Promise<boolean> {
  const caps = (track.getCapabilities?.() ?? {}) as LockCapabilities;
  const constraint = lockConstraints(caps, locked, (track.getSettings?.() ?? {}) as LockSettings);
  if (Object.keys(constraint).length === 0) return false;
  await track.applyConstraints({ advanced: [constraint as MediaTrackConstraintSet] });
  return true;
}

/**
 * Hold exposure and white balance where they are now. Returns a function that
 * hands them back to the camera; call it however the flash ends. Never throws:
 * a camera that refuses simply stays automatic.
 */
export async function holdCameraSteady(video: HTMLVideoElement | null): Promise<() => void> {
  const track = videoTrack(video);
  if (!track) return () => {};
  try {
    if (!(await apply(track, true))) return () => {};
  } catch {
    return () => {};
  }
  return () => {
    if (track.readyState !== 'live') return;
    void apply(track, false).catch(() => {});
  };
}
