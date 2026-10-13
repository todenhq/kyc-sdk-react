// node:fs / node:path are declared in node-builtins.d.ts — this browser-typed
// package has no @types/node, deliberately. Path convention copied from
// __tests__/config-wiring.test.ts, the repo's other source-scanning test.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advanceTarget, easeToward } from './CaptureRing';

const SRC = join(new URL('..', import.meta.url).pathname);
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

const source = read('components/CaptureRing.tsx');
const step = read('steps/LivenessStep.tsx');
const hook = read('hooks/useLiveness.ts');
// The liveness camera is full screen on every device, so the line runs around
// its tall window (steps/liveness/WindowRing), paced by this file's functions.
const live = read('steps/liveness/LiveView.tsx');
const review = read('steps/liveness/ReviewView.tsx');
const windowRing = read('steps/liveness/WindowRing.tsx');

// The ring's correctness is mostly about WHERE it is drawn and WHAT it is
// driven by, neither of which a render test in jsdom can see: jsdom lays
// nothing out, computes no stroke geometry, and runs no animation frames. These
// assert the handful of decisions that are silently reversible in an edit.
// The build-up is two numbers. The TARGET is where the test has got to and
// only ever moves forward; the DISPLAY eases toward it. Both are arithmetic.
describe('advanceTarget', () => {
  it('never goes backwards, however far the real number falls', () => {
    // The steady-frame counters underneath genuinely decay when the face
    // drifts. An arc that unwound would read as the app losing work already
    // done, and would punish the person struggling hardest to hold still.
    let target = 0.7;
    for (const real of [0.6, 0.4, 0.2, 0]) {
      expect(advanceTarget(target, real)).toBe(target);
    }
  });

  it('follows real progress exactly — it invents none of its own', () => {
    expect(advanceTarget(0.2, 0.5)).toBe(0.5);
    expect(advanceTarget(0.5, 1)).toBe(1);
  });

  it('is clamped, so a counter that overshoots its threshold closes the ring cleanly', () => {
    expect(advanceTarget(0.9, 16 / 15)).toBe(1);
    expect(advanceTarget(0.9, Number.NaN)).toBe(0.9);
  });
});

describe('easeToward', () => {
  const FRAME = 1 / 60;

  it('never overshoots, so the arc can never appear to go backwards', () => {
    let shown = 0;
    for (let i = 0; i < 120; i++) {
      const next = easeToward(shown, 0.5, FRAME);
      expect(next).toBeGreaterThanOrEqual(shown);
      expect(next).toBeLessThanOrEqual(0.5);
      shown = next;
    }
  });

  it('turns a step in the target into motion, not a cut', () => {
    // A gesture landing jumps the target a whole segment. One frame later the
    // display has moved a fraction of that, not all of it.
    const after = easeToward(0.25, 0.5, FRAME);
    expect(after).toBeGreaterThan(0.25);
    expect(after).toBeLessThan(0.35);
  });

  it('is frame-rate independent: two half-frames equal one whole frame', () => {
    const whole = easeToward(0, 1, FRAME);
    const halves = easeToward(easeToward(0, 1, FRAME / 2), 1, FRAME / 2);
    expect(halves).toBeCloseTo(whole, 10);
  });

  it('closes on the target fast enough to land with the shutter flash', () => {
    // ~95% of the gap in three time constants (0.27s).
    let shown = 0;
    let t = 0;
    while (t < 0.3) { shown = easeToward(shown, 1, FRAME); t += FRAME; }
    expect(shown).toBeGreaterThan(0.95);
  });

  it('holds still on a zero or negative interval', () => {
    expect(easeToward(0.3, 1, 0)).toBe(0.3);
    expect(easeToward(0.3, 1, -1)).toBe(0.3);
  });
});

describe('CaptureRing', () => {
  it('reads progress from a ref, never from a prop value', () => {
    // Through React state this would re-render the liveness step on every frame
    // of the face-mesh loop, which is the busiest thing on the page.
    expect(source).toMatch(/progressRef:\s*\{\s*current:\s*number\s*\}/);
    expect(source).toContain('requestAnimationFrame');
    expect(source).toContain('cancelAnimationFrame');
  });

  it('keeps width and dashes in ONE coordinate system', () => {
    // `non-scaling-stroke` computes the whole stroke, dashes included, in
    // screen pixels. A 309-unit dash against a ~790px ring drew two and a half
    // arcs — the "more than one line".
    expect(source).not.toMatch(/vectorEffect=/);
    expect(source).toContain('strokeWidth={STROKE}');
    expect(source).toContain('const R = 50 - STROKE / 2');
  });

  it('is one ring, on the liveness frame only', () => {
    // A second ring on the review screen, for the upload, made two circles of
    // one flow. The upload's signal is the Continue button's own spinner.
    expect(live.match(/<WindowRing/g)).toHaveLength(1);
    expect(review).not.toContain('WindowRing');
    expect(step).not.toContain('<CaptureRing');
    expect(source).not.toMatch(/trickle/i);
  });

  it('is one green line over a track that carries the warning', () => {
    // Around the window the line is green from its first pixel, as on Flutter:
    // it is the frame filling in, and the frame's own colour (the brand tint,
    // red on a warning) is the track underneath, which is what changes.
    expect(windowRing).toContain('stroke="var(--verification-success)"');
    expect(windowRing).toContain('stroke={track}');
    expect(live).toContain("'var(--destructive)'");
    // Paced by the same two functions as the circle: one rule, not two.
    expect(windowRing).toContain("import { advanceTarget, easeToward } from '../../components/CaptureRing'");
  });

  it('has flat ends, sized to the border it traces', () => {
    expect(source).toContain('strokeLinecap="butt"');
    expect(source).toContain('const STROKE = 1.6');
  });

  it('never rotates', () => {
    // A stroke that grows and a stroke that spins are two different claims. The
    // growth IS the animation; `-rotate-90` is a static origin that puts the
    // start of the arc at twelve o'clock.
    expect(source).not.toContain('animate-spin');
    expect(source).toContain('-rotate-90');
  });

  it('starts as an empty circle and grows to a closed one', () => {
    // One dash the length of the whole circumference, fully offset out of view;
    // the loop walks that offset to zero.
    expect(source).toContain('strokeDasharray={CIRCUMFERENCE}');
    expect(source).toContain('strokeDashoffset={CIRCUMFERENCE}');
  });

  it('measures the circumference instead of trusting pathLength', () => {
    // `pathLength` on a <circle> is honoured unevenly; where it is ignored, a
    // dash array of 1 means one USER UNIT against ~309, which renders as a
    // hundred and fifty tiny dashes rather than one arc.
    // The ATTRIBUTE, not the word: the comment above the geometry explains why
    // the trick was dropped, and that explanation is worth keeping.
    expect(source).not.toMatch(/pathLength=\{/);
    expect(source).toContain('const CIRCUMFERENCE = 2 * Math.PI * R');
  });

  it('stays on screen until the arc has closed', () => {
    // The counter reaches the shutter and the phase changes in the SAME frame,
    // so unmounting early swept the ring away mid-build and the user never saw
    // a finished circle. `ringOnFrame` includes `complete`.
    expect(live).toMatch(/const ringOn = !p\.loading && p\.phase !== 'loading' && p\.phase !== 'failed'/);
  });
});

describe('the capture ring in the liveness step', () => {
  it('spans the whole test, one updater owning the number', () => {
    expect(hook).toContain('livenessProgressRef');
    expect(hook).toContain('const updateLivenessProgress');
    // Every segment is measured by what actually gates it, and the divisors are
    // the same constants the phase transitions fire on — otherwise the ring
    // fills to somewhere other than where the test moves on.
    expect(hook).toContain('positionStableRef.current / POSITION_STABLE_FRAMES');
    expect(hook).toContain('positionStableRef.current > POSITION_STABLE_FRAMES');
    expect(hook).toContain('positionStableRef.current / CAPTURE_STABLE_FRAMES');
    expect(hook).toContain('positionStableRef.current > CAPTURE_STABLE_FRAMES');
    // A challenge's only continuous measure is its clock, and the clock never
    // fills the segment on its own: time running out is not progress.
    expect(hook).toContain('Math.min(CHALLENGE_SEGMENT_CAP, onClock)');
    // The capture segment is capped the same way: only `complete` closes the
    // ring, so a finished circle always means the still is in hand.
    expect(hook).toContain(
      'Math.min(CHALLENGE_SEGMENT_CAP, positionStableRef.current / CAPTURE_STABLE_FRAMES)',
    );
    expect(hook).not.toMatch(/livenessProgressRef\.current = positionStableRef/);
  });

  it('resets when a test starts, and closes at the shutter', () => {
    expect(hook).toMatch(/livenessProgressRef\.current = 0/);
    expect(hook).toContain('livenessProgressRef.current = 1');
  });

  it('is on the frame from positioning to the shutter, over a neutral track', () => {
    // The border is the ring's track for the whole test; the review screen's
    // frame wears the same faint primary, so the two screens share one line.
    expect(live).toContain('{ringOn && <WindowRing');
    expect(live).toContain("'color-mix(in srgb, var(--primary) 35%, transparent)'");
    expect(step).toContain('progressRef={liveness.livenessProgressRef}');
  });

  it('fires the shutter flash on complete, not on capturing', () => {
    // It used to say "Got it!" the moment the challenges passed, before any
    // photo existed, which left the real wait looking finished.
    expect(live).toContain("{p.phase === 'complete' && (");
    expect(live).toContain('animate-capture-flash');
    expect(live).not.toMatch(/p\.phase === 'capturing'[^\n]*capture-flash/);
    // The rendered text node, not the word: the comment above the flash still
    // names the copy it replaced, and that explanation is the point of it.
    expect(step).not.toMatch(/>\s*Got it!\s*</);
    expect(live).not.toMatch(/>\s*Got it!\s*</);
  });
});
