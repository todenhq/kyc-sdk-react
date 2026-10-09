// ---------------------------------------------------------------------------
// Flash (screen-reflection) liveness — the screen emits a short RANDOMIZED
// color sequence while the camera records; a live face physically reflects
// those colors in that order. A replayed video, an injected feed, or a screen
// held up to the camera emits its own light and cannot match a sequence that
// didn't exist until this session started.
//
// Detection is pure client-side frame analysis (same trust model as the
// gesture detectors): for each flash we compare the face region's mean RGB
// against the immediately-preceding neutral baseline and check that the
// channel(s) the flash boosted dominate the shift. The liveness video (already
// recorded) captures the flashes for server-side audit.
// ---------------------------------------------------------------------------

import { flashOnsets } from './flash-timeline';

export interface FlashColor {
  /** CSS color painted over the screen. */
  css: string;
  /** Which RGB channels this flash boosts (unit vector-ish). */
  boost: [number, number, number];
  name: string;
}

// High-luminance primaries — maximum reflected signal per channel.
const PALETTE: FlashColor[] = [
  { css: '#ff2020', boost: [1, 0, 0], name: 'red' },
  { css: '#20ff40', boost: [0, 1, 0], name: 'green' },
  { css: '#2050ff', boost: [0, 0, 1], name: 'blue' },
  { css: '#ff20d0', boost: [1, 0, 1], name: 'magenta' },
  { css: '#20ffe0', boost: [0, 1, 1], name: 'cyan' },
];

export interface FlashResult {
  passed: boolean;
  /** Matched flashes / total flashes (0..1). */
  score: number;
  sequence: string[];
  matched: number;
  total: number;
  /** True when ambient light drowned the flashes (no measurable shift at all). */
  inconclusive: boolean;
  /** When each colour came on, in ms from the start of the recording (flash-timeline.ts). */
  onsets?: number[];
}

export function generateFlashSequence(count = 4): FlashColor[] {
  const pool = [...PALETTE];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}

// Mean RGB of the face region (center crop) of the current video frame.
function sampleFace(video: HTMLVideoElement, canvas: HTMLCanvasElement): [number, number, number] | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  // Center 40% of the frame ≈ the positioned face (positioning enforced it).
  const cropW = w * 0.4;
  const cropH = h * 0.5;
  canvas.width = 32;
  canvas.height = 32;
  ctx.drawImage(video, (w - cropW) / 2, (h - cropH) / 2, cropW, cropH, 0, 0, 32, 32);
  const data = ctx.getImageData(0, 0, 32, 32).data;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!; g += data[i + 1]!; b += data[i + 2]!;
  }
  const n = data.length / 4;
  return [r / n, g / n, b / n];
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function sampleWindow(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  durationMs: number,
): Promise<[number, number, number] | null> {
  const samples: [number, number, number][] = [];
  const start = performance.now();
  while (performance.now() - start < durationMs) {
    const s = sampleFace(video, canvas);
    if (s) samples.push(s);
    await delay(66); // ~15 samples/sec
  }
  if (samples.length === 0) return null;
  return samples
    .reduce((acc, s) => [acc[0] + s[0], acc[1] + s[1], acc[2] + s[2]] as [number, number, number])
    .map((v) => v / samples.length) as [number, number, number];
}

/**
 * Run the full flash sequence. `setColor` paints the fullscreen overlay; null
 * asks for the NEUTRAL baseline between colours, which the step paints BLACK
 * while the sequence runs (liveness/flash-overlay.ts). Each colour must ADD
 * light relative to that baseline, and a white step UI behind it (bright
 * screen during the selfie) would make a colour remove light instead.
 * `isActive` lets the caller abort (unmount/retry).
 */
export async function runFlashSequence(
  video: HTMLVideoElement,
  setColor: (css: string | null) => void,
  isActive: () => boolean,
  sequence: FlashColor[] = generateFlashSequence(),
): Promise<FlashResult> {
  const canvas = document.createElement('canvas');
  let matched = 0;
  let measurable = 0;
  const onAt: number[] = [];

  try {
    for (const flash of sequence) {
      if (!isActive()) break;
      // Neutral baseline immediately before each flash (tracks ambient drift).
      setColor(null);
      await delay(150);
      const baseline = await sampleWindow(video, canvas, 300);

      setColor(flash.css);
      onAt.push(performance.now());
      await delay(200); // screen + camera exposure latency
      const lit = await sampleWindow(video, canvas, 450);

      if (!baseline || !lit || !isActive()) continue;

      const shift = [lit[0] - baseline[0], lit[1] - baseline[1], lit[2] - baseline[2]];
      const magnitude = Math.abs(shift[0]!) + Math.abs(shift[1]!) + Math.abs(shift[2]!);
      if (magnitude < 3) continue; // no measurable reflection (bright ambient) — inconclusive flash

      measurable++;
      // The boosted channels' share of the total positive shift must dominate.
      const boostedShift = shift.reduce((acc, v, i) => acc + Math.max(0, v!) * flash.boost[i]!, 0);
      const totalPositive = shift.reduce((acc, v) => acc + Math.max(0, v!), 0);
      const dominance = totalPositive > 0 ? boostedShift / totalPositive : 0;
      if (dominance >= 0.55) matched++;
    }
  } finally {
    setColor(null);
  }

  const total = sequence.length;
  // Inconclusive (no flash could be measured at all) is NOT a pass: bright
  // ambient light and a phone screen held up to the camera both drown the
  // reflection. The caller retries, then falls back to gestures
  // (flash-outcome.ts).
  const inconclusive = measurable === 0;
  const score = total > 0 ? matched / total : 0;
  const passed = !inconclusive && matched >= Math.max(1, Math.ceil(measurable * 0.66));
  const onsets = flashOnsets(onAt, total);
  return { passed, score, sequence: sequence.map((s) => s.name), matched, total, inconclusive, ...(onsets ? { onsets } : {}) };
}
