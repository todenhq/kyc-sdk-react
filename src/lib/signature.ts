// A signature drawn on screen, as the strokes the server draws the image from.
//
// The SDK sends POINTS, never a picture: the server renders one image for the
// web, React Native and Flutter SDKs alike, so all three produce the same file.
// MIRROR of the server's `signatureProblem` (kyc-core src/lib/signature/render.ts)
// for the one rule the applicant needs to hear about before submitting: a tap
// or a dot is not a signature. Keep the ratio in lockstep with the server's.

export interface SignaturePoint {
  x: number;
  y: number;
}
export type SignatureStroke = SignaturePoint[];

export interface SignatureDrawing {
  strokes: SignatureStroke[];
  /** The pad's size, in the same units as the points. */
  width: number;
  height: number;
}

/** Ink, as a share of the pad's shorter side, below which nothing was signed. */
export const MIN_INK_RATIO = 0.6;
/** The server refuses more than this; a pad stops recording well before it. */
export const MAX_POINTS = 20000;

export function inkLength(strokes: SignatureStroke[]): number {
  let total = 0;
  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i += 1) {
      total += Math.hypot(stroke[i]!.x - stroke[i - 1]!.x, stroke[i]!.y - stroke[i - 1]!.y);
    }
  }
  return total;
}

export function pointCount(strokes: SignatureStroke[]): number {
  return strokes.reduce((sum, stroke) => sum + stroke.length, 0);
}

/** Whether there is enough ink to keep as a signature. */
export function hasSignature(drawing: SignatureDrawing): boolean {
  return inkLength(drawing.strokes) >= MIN_INK_RATIO * Math.min(drawing.width, drawing.height);
}

/** Round to one decimal: enough for a smooth line, a third of the payload. */
export function compactDrawing(drawing: SignatureDrawing): SignatureDrawing {
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    width: r(drawing.width),
    height: r(drawing.height),
    strokes: drawing.strokes.filter((s) => s.length > 0).map((s) => s.map((p) => ({ x: r(p.x), y: r(p.y) }))),
  };
}

/**
 * Fit a drawing to a pad that changed size (expanded, shrunk, or rotated), so
 * nothing already signed ends up outside the box. One uniform scale, so the
 * signature keeps its shape; growing only the height leaves it where it is.
 */
export function rescaleStrokes(
  strokes: SignatureStroke[],
  from: { width: number; height: number },
  to: { width: number; height: number },
): SignatureStroke[] {
  if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) return strokes;
  const scale = Math.min(to.width / from.width, to.height / from.height);
  if (Math.abs(scale - 1) < 0.01) return strokes;
  return strokes.map((stroke) => stroke.map((p) => ({ x: p.x * scale, y: p.y * scale })));
}

/**
 * The box the ink itself covers, for a preview that fills its tile whatever
 * part of the pad was signed in. Null when nothing was drawn.
 */
export function inkBounds(
  strokes: SignatureStroke[],
): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const p of stroke) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
}

/** One stroke as SVG path data. A lone point is a dot: a zero-length line. */
export function strokePath(stroke: SignatureStroke): string {
  if (stroke.length === 0) return '';
  const [first, ...rest] = stroke;
  if (rest.length === 0) return `M${first!.x} ${first!.y} L${first!.x} ${first!.y}`;
  return `M${first!.x} ${first!.y} ${rest.map((p) => `L${p.x} ${p.y}`).join(' ')}`;
}

/** The preview tile, and how a drawing is fitted into it. */
export const PREVIEW_TILE = { width: 72, height: 40, padding: 6, ink: 1.5 };

export function previewFrame(strokes: SignatureStroke[]): { viewBox: string; strokeWidth: number } | null {
  const box = inkBounds(strokes);
  if (!box) return null;
  const { width, height, padding, ink } = PREVIEW_TILE;
  const scale = Math.min((width - 2 * padding) / box.width, (height - 2 * padding) / box.height);
  const pad = padding / scale;
  return {
    viewBox: `${box.x - pad} ${box.y - pad} ${box.width + 2 * pad} ${box.height + 2 * pad}`,
    // In the drawing's own units, so the line is the same weight in every preview.
    strokeWidth: ink / scale,
  };
}
