import type { Size } from './liveness-cutout';

// ---------------------------------------------------------------------------
// The window's outline cut into equal parts: one per stage of the test
// (positioning, each step, the capture), with a small gap between them, so the
// line shows how many stages there are and which one is filling.
//
// The same outline as windowOutline (clockwise from twelve o'clock), split by
// distance along it. Mirrors the React Native SDK's lib/windowSegments.ts and the Flutter SDK's
// _CaptureRingPainter, which
// takes its parts from the path's own metric; here each part is written out as
// its own path, because the line is revealed with a dash offset and a part
// that is its own path needs only that one number per frame.
// ---------------------------------------------------------------------------

/** Gap between two parts, along the line. The ends are round, so what is seen
 *  is this less one stroke width. */
export const SEGMENT_GAP = 10;

export interface OutlineSegment {
  d: string;
  /** Where this part starts and ends, as distances along the whole outline. */
  from: number;
  to: number;
}

interface Piece {
  length: number;
  arc: boolean;
  /** The point at [t] (0..length) along this piece. */
  at: (t: number) => [number, number];
}

function pieces(window: Size, inset: number): { list: Piece[]; r: number } {
  const w = window.width - inset * 2;
  const h = window.height - inset * 2;
  const r = w / 2;
  const x0 = inset;
  const y0 = inset;
  const x1 = x0 + w;
  const y1 = y0 + h;
  const cx = x0 + r;
  const side = Math.max(0, h - w);
  // Angles run clockwise from twelve o'clock.
  const arc = (cy: number, start: number, sweep: number): Piece => ({
    length: r * sweep,
    arc: true,
    at: (t) => {
      const a = start + t / r;
      return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    },
  });
  const list: Piece[] = [
    arc(y0 + r, 0, Math.PI / 2),
    { length: side, arc: false, at: (t) => [x1, y0 + r + t] },
    arc(y1 - r, Math.PI / 2, Math.PI),
    { length: side, arc: false, at: (t) => [x0, y1 - r - t] },
    arc(y0 + r, (3 * Math.PI) / 2, Math.PI / 2),
  ];
  return { list, r };
}

const n = (v: number): string => v.toFixed(2);

/**
 * The outline in [parts] equal parts. One part is the whole outline with no
 * gap. [inset] pulls the line in by half its stroke, as windowOutline does.
 */
export function outlineSegments(window: Size, inset: number, parts: number, gap = SEGMENT_GAP): OutlineSegment[] {
  const { list, r } = pieces(window, inset);
  const total = list.reduce((sum, p) => sum + p.length, 0);
  const count = Math.max(1, Math.floor(parts));
  const each = total / count;
  // A gap that would swallow the part it separates is no gap at all.
  const g = count === 1 || gap >= each ? 0 : gap;
  const out: OutlineSegment[] = [];
  for (let i = 0; i < count; i++) {
    const from = i * each + g / 2;
    const to = (i + 1) * each - g / 2;
    let d = '';
    let start = 0;
    for (const piece of list) {
      const end = start + piece.length;
      const a = Math.max(from, start);
      const b = Math.min(to, end);
      if (piece.length > 0 && b > a) {
        if (d === '') {
          const [mx, my] = piece.at(a - start);
          d = `M${n(mx)} ${n(my)}`;
        }
        const [x, y] = piece.at(b - start);
        d += piece.arc ? ` A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y)}` : ` L${n(x)} ${n(y)}`;
      }
      start = end;
    }
    out.push({ d, from, to });
  }
  return out;
}

/**
 * How much of a part the line has reached, 0..1, when it has travelled [done]
 * along the whole outline.
 */
export function segmentFill(segment: OutlineSegment, done: number): number {
  const span = segment.to - segment.from;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (done - segment.from) / span));
}
