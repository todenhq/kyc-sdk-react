// ---------------------------------------------------------------------------
// Can this phone afford the blur?
//
// The full-screen liveness camera blurs the live feed everywhere but the face
// window. A blur over a moving video is recomposited on every frame, and on a
// slow phone that costs the frames the face detector also needs. So the screen
// watches the gap between its animation frames and, when too many are long,
// gives the blur up for a flat tint. Once given up it stays given up: a screen
// that switched back and forth would be worse than either.
//
// The same rule as the Flutter SDK's liveness/blur_budget.dart. The numbers
// differ on purpose: Flutter times the raster thread, where the blur is drawn;
// a browser only offers the gap between frames on the main thread, which the
// face detector also slows, so "slow" here is a frame worse than 20 a second.
// ---------------------------------------------------------------------------

/** A gap longer than this is a frame rate under 20 a second. */
export const BLUR_SLOW_FRAME_MS = 50;
/** How many frames are judged at a time. */
export const BLUR_WINDOW_FRAMES = 60;
/** The share of slow frames in one window that ends the blur. */
export const BLUR_SLOW_SHARE = 0.4;
/** The first frames after the camera opens are always slow and say nothing. */
export const BLUR_WARMUP_FRAMES = 30;

export class BlurBudget {
  private seen = 0;
  private inWindow = 0;
  private slow = 0;
  private ok = true;

  get affordable(): boolean {
    return this.ok;
  }

  /** Feed the gap since the last frame. True when THIS frame ended the blur. */
  add(frameMs: number): boolean {
    if (!this.ok) return false;
    this.seen++;
    if (this.seen <= BLUR_WARMUP_FRAMES) return false;
    this.inWindow++;
    if (frameMs > BLUR_SLOW_FRAME_MS) this.slow++;
    if (this.inWindow < BLUR_WINDOW_FRAMES) return false;
    const tooSlow = this.slow / this.inWindow >= BLUR_SLOW_SHARE;
    this.inWindow = 0;
    this.slow = 0;
    if (!tooSlow) return false;
    this.ok = false;
    return true;
  }
}
