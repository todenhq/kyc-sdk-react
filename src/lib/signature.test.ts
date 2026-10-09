import { describe, expect, it } from 'vitest';
import { compactDrawing, hasSignature, inkLength, pointCount, rescaleStrokes } from './signature';

const line = (x1: number, y1: number, x2: number, y2: number) => [{ x: x1, y: y1 }, { x: x2, y: y2 }];
const pad = { width: 320, height: 160 };

describe('a signature drawn on screen', () => {
  it('measures ink across strokes', () => {
    expect(inkLength([line(0, 0, 3, 4), line(0, 0, 0, 10)])).toBe(15);
    expect(pointCount([line(0, 0, 1, 1), [{ x: 2, y: 2 }]])).toBe(3);
  });

  it('needs real ink: a tap or a short dash is not a signature', () => {
    expect(hasSignature({ ...pad, strokes: [] })).toBe(false);
    expect(hasSignature({ ...pad, strokes: [[{ x: 5, y: 5 }]] })).toBe(false);
    expect(hasSignature({ ...pad, strokes: [line(10, 10, 40, 10)] })).toBe(false);
    // The server's own floor: 0.6 of the shorter side (96 here).
    expect(hasSignature({ ...pad, strokes: [line(10, 10, 105, 10)] })).toBe(false);
    expect(hasSignature({ ...pad, strokes: [line(10, 10, 110, 10)] })).toBe(true);
  });

  it('sends rounded points and drops empty strokes', () => {
    const out = compactDrawing({ width: 320.04, height: 160, strokes: [[], [{ x: 1.234, y: 5.678 }]] });
    expect(out).toEqual({ width: 320, height: 160, strokes: [[{ x: 1.2, y: 5.7 }]] });
  });
});

describe('a pad that changes size', () => {
  const stroke = [{ x: 100, y: 300 }, { x: 200, y: 320 }];

  it('shrinks the drawing to fit when the pad gets smaller, keeping its shape', () => {
    const out = rescaleStrokes([stroke], { width: 320, height: 360 }, { width: 320, height: 180 });
    expect(out).toEqual([[{ x: 50, y: 150 }, { x: 100, y: 160 }]]);
  });

  it('leaves the drawing alone when only the height grows', () => {
    expect(rescaleStrokes([stroke], { width: 320, height: 180 }, { width: 320, height: 360 })).toEqual([stroke]);
  });

  it('ignores a pad that has not been measured yet', () => {
    expect(rescaleStrokes([stroke], { width: 0, height: 0 }, { width: 320, height: 180 })).toEqual([stroke]);
  });
});
