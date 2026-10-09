// ---------------------------------------------------------------------------
// The face window of the full-screen liveness camera.
//
// The camera owns the surface (a phone's screen, or the whole modal on a
// desktop): the feed runs edge to edge and
// everything but a tall, round-ended window for the face is blurred behind a
// tint of the flow's own background colour. The window is at the exact centre
// of the frame because that is the centre of the camera picture, and "centre
// your face" is judged against the picture.
//
// Its size is worked out from the box the camera is ACTUALLY drawn in, never
// the viewport: the two disagree whenever the SDK does not have the whole
// display.
//
// Mirrors the React Native SDK's lib/livenessCutout.ts + lib/faceWindow.ts and
// the Flutter SDK's screens/liveness_cutout.dart + liveness/face_window.dart.
// One rule in three languages: change a number in one and change all three.
// ---------------------------------------------------------------------------

export const CUTOUT_MAX_WIDTH = 280;
export const CUTOUT_MIN_WIDTH = 200;

/** A face is taller than it is wide. */
export const CUTOUT_ASPECT = 1.32;

/** The room above the window at which the gesture picture is drawn at its
 *  full size (and, with 70 more, the long lighting note fits above it). */
export const ROOM_FOR_GESTURE = 150;

/** The gesture picture's smallest side. Under this the drawing is too small
 *  to follow at arm's length. */
export const GESTURE_MIN_SIZE = 56;
/** What the instruction's pill and the gap under the picture take of the room. */
export const GESTURE_PILL_ROOM = 66;

/** The gesture picture at its full size, where there is the room for it. */
export const GESTURE_FULL_SIZE = 96;

/**
 * The side of the gesture picture for the room above the window. The picture
 * ALWAYS stands on its own above the instruction: on a short phone it used to
 * move inside the instruction's pill, where it was 28 points across and easy
 * to miss beside the words. It now shrinks with the room instead, down to
 * GESTURE_MIN_SIZE, and never past [full].
 */
export function gestureSize(room: number, full: number): number {
  return Math.max(GESTURE_MIN_SIZE, Math.min(full, Math.floor(room - GESTURE_PILL_ROOM)));
}

/**
 * The height of the block above the window. On a phone too short for even the
 * smallest picture and its instruction, the block keeps that height and runs
 * over the window's top edge (the hair, not the face) instead of shrinking the
 * picture further.
 */
export function aboveHeight(room: number): number {
  return Math.max(room, GESTURE_MIN_SIZE + GESTURE_PILL_ROOM);
}

/** How much of the background colour covers the blurred feed in a lit room. */
export const LIVENESS_TINT = 0.16;
/** In a dark room: the step is lit so the SCREEN lights the face, and a thin
 *  tint over a dark room is a dark screen. */
export const LIVENESS_DIM_ROOM_TINT = 0.66;
/** With no blur under it (a slow phone, more contrast asked for): it then has
 *  to do the blur's job of quietening the room. */
export const LIVENESS_FLAT_TINT = 0.74;

export interface Size {
  width: number;
  height: number;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * A frame this wide is the desktop modal, not a phone. WEB ONLY: the native
 * SDKs have no desktop, so this is the one rule here with no mirror.
 */
export const DESKTOP_FRAME_WIDTH = 600;
/** The desktop window: a larger share of the height, up to a wider cap. A
 *  window sized for a phone looked small in the middle of a wide modal. */
export const DESKTOP_CUTOUT_MAX_WIDTH = 330;
const DESKTOP_HEIGHT_SHARE = 0.56;
const PHONE_HEIGHT_SHARE = 0.46;

export function livenessCutout(frame: Size): Size {
  const desktop = frame.width >= DESKTOP_FRAME_WIDTH;
  const max = desktop ? DESKTOP_CUTOUT_MAX_WIDTH : CUTOUT_MAX_WIDTH;
  const share = desktop ? DESKTOP_HEIGHT_SHARE : PHONE_HEIGHT_SHARE;
  const width = clamp(
    Math.min(frame.width - 96, (frame.height * share) / CUTOUT_ASPECT, max),
    CUTOUT_MIN_WIDTH,
    max,
  );
  return { width, height: width * CUTOUT_ASPECT };
}

/** How much of the background covers the feed, given the room and the blur. */
export function livenessTint(input: { dimRoom: boolean; blurs: boolean }): number {
  const tint = input.dimRoom ? LIVENESS_DIM_ROOM_TINT : LIVENESS_TINT;
  return input.blurs ? tint : Math.max(tint, LIVENESS_FLAT_TINT);
}

/** A tall window with fully round ends, as one closed subpath. */
function windowPath(left: number, top: number, window: Size): string {
  const r = window.width / 2;
  const right = left + window.width;
  const bottom = top + window.height;
  return (
    `M${left} ${top + r} A${r} ${r} 0 0 1 ${right} ${top + r} ` +
    `V${bottom - r} A${r} ${r} 0 0 1 ${left} ${bottom - r} Z`
  );
}

/** [outer] with a window subtracted at (left, top): for an even-odd clip. */
export function surroundPath(outer: Size, left: number, top: number, window: Size): string {
  return `M0 0 H${outer.width} V${outer.height} H0 Z ${windowPath(left, top, window)}`;
}

// The window sits a little BELOW the centre on a short screen, and only by
// what the block above it is short of. That block is the gesture picture and
// the instruction. The picture is narrow and centred, so it rises into the gap
// BETWEEN the back and close buttons (ImmersiveFrame); only the instruction,
// which is wide, has to stay under them. The window used to be dropped to fit
// the picture under the buttons too, which on a short phone pushed the face
// well below the middle and still left a small picture. The face is judged
// against the window wherever it sits (faceWindowFor takes the drop).
/** The room wanted above the window, from the top inset down: the gap over the
 *  picture (8), the picture on its plate (108), the gap under it (8), the
 *  instruction (46) and the gap over the window (20). */
export const WINDOW_TOP_ROOM = 190;
/** What must stay below the window: the gap under it, the retry panel a failed
 *  check shows there (its words and its button), and the gap to the edge. It
 *  was sized for the step count alone, and the panel was cut off. */
export const WINDOW_BELOW_KEEP = 136;
/** The furthest the window drops. More reads as off-centre. */
export const WINDOW_MAX_DROP = 48;

/**
 * How far below the centre the window sits, for a frame and its window.
 * [topInset] is what the frame must keep clear of at its top (a status bar,
 * on the mobile SDKs; a browser's frame starts under it).
 */
export function windowDrop(frame: Size, window: Size, topInset = 0): number {
  const margin = (frame.height - window.height) / 2;
  const wanted = WINDOW_TOP_ROOM + topInset - margin;
  const spare = margin - WINDOW_BELOW_KEEP;
  return Math.round(Math.max(0, Math.min(wanted, spare, WINDOW_MAX_DROP)));
}

/** The top of the window in its frame: the centre, plus the drop. */
export function windowTop(frame: Size, window: Size): number {
  return (frame.height - window.height) / 2 + windowDrop(frame, window);
}

/** The frame with the window taken out of it. */
export function tintPath(frame: Size, window: Size): string {
  return surroundPath(frame, (frame.width - window.width) / 2, windowTop(frame, window), window);
}

/**
 * The window's own outline, starting at twelve o'clock and running clockwise,
 * with its length: what the progress line is drawn along. `inset` pulls the
 * line in by half its stroke so it sits on the edge rather than across it.
 */
export function windowOutline(window: Size, inset: number): { d: string; length: number } {
  const w = window.width - inset * 2;
  const h = window.height - inset * 2;
  const r = w / 2;
  const x0 = inset;
  const y0 = inset;
  const x1 = x0 + w;
  const y1 = y0 + h;
  const cx = x0 + r;
  const d =
    `M${cx} ${y0} A${r} ${r} 0 0 1 ${x1} ${y0 + r} V${y1 - r} ` +
    `A${r} ${r} 0 0 1 ${x0} ${y1 - r} V${y0 + r} A${r} ${r} 0 0 1 ${cx} ${y0}`;
  return { d, length: 2 * Math.PI * r + 2 * (h - w) };
}

// ── Is the face inside the window? ──────────────────────────────────────────
//
// In the modal the camera circle shows the whole frame, so "a sensible size in
// the frame" is the same statement as "sits in the circle". Full screen the
// frame fills the surface and the window shows only its middle, so the face is
// judged against the WINDOW. Everything is in shares of the camera frame.

/** The window, as shares of the camera frame's width and height. Centred
 *  across; `centreY` is where its middle sits down the frame (0.5 when absent). */
export interface FaceWindow {
  width: number;
  height: number;
  centreY?: number;
}

/** A face wider than this share of the window is spilling over its edges. */
export const FACE_WINDOW_MAX_FILL = 0.84;
/** A face narrower than this share of the window is too far to judge. */
export const FACE_WINDOW_MIN_FILL = 0.46;
/** How far the face's centre may sit from the window's, as a share of the
 *  window's own width and height. */
export const FACE_WINDOW_MAX_DRIFT = 0.2;

/**
 * How much of the frame the window covers, and where its middle sits, for a
 * frame of `frameAspect` (width over height) drawn cover-fit in `frame` with
 * `window` centred across and `drop` pixels below the centre.
 */
export function faceWindowFor(input: { frame: Size; window: Size; frameAspect: number; drop?: number }): FaceWindow {
  const shownWidth = Math.max(input.frame.width, input.frame.height * input.frameAspect);
  const shownHeight = shownWidth / input.frameAspect;
  return {
    width: input.window.width / shownWidth,
    height: input.window.height / shownHeight,
    centreY: 0.5 + (input.drop ?? 0) / shownHeight,
  };
}
