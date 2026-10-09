import { describe, expect, it } from 'vitest';
import { windowOutline } from './liveness-cutout';
import { outlineSegments, segmentFill, SEGMENT_GAP } from './window-segments';

const window = { width: 280, height: 280 * 1.32 };
const inset = 2;

describe('outlineSegments', () => {
  it('cuts the outline into equal parts with a gap between them', () => {
    const { length } = windowOutline(window, inset);
    const parts = outlineSegments(window, inset, 4);
    expect(parts).toHaveLength(4);
    const each = length / 4;
    parts.forEach((part, i) => {
      expect(part.from).toBeCloseTo(i * each + SEGMENT_GAP / 2, 6);
      expect(part.to).toBeCloseTo((i + 1) * each - SEGMENT_GAP / 2, 6);
      expect(part.d.startsWith('M')).toBe(true);
    });
  });

  it('starts at twelve o\'clock and runs clockwise', () => {
    const [first] = outlineSegments(window, inset, 1);
    // One part is the whole outline, with no gap: it starts at the top centre.
    expect(first!.from).toBe(0);
    expect(first!.d.startsWith('M140.00 2.00')).toBe(true);
    const parts = outlineSegments(window, inset, 4);
    // The second part of four begins on the right-hand side.
    const x = Number(parts[1]!.d.slice(1).split(' ')[0]);
    expect(x).toBeGreaterThan(window.width / 2);
  });

  it('drops the gap when it would swallow the part', () => {
    const tiny = { width: 8, height: 8 };
    const parts = outlineSegments(tiny, 0, 6);
    expect(parts[0]!.from).toBe(0);
  });

  it('treats a count below one as one', () => {
    expect(outlineSegments(window, inset, 0)).toHaveLength(1);
  });
});

describe('segmentFill', () => {
  const part = { d: '', from: 100, to: 200 };
  it('is empty before the line reaches the part and full after it', () => {
    expect(segmentFill(part, 50)).toBe(0);
    expect(segmentFill(part, 100)).toBe(0);
    expect(segmentFill(part, 150)).toBe(0.5);
    expect(segmentFill(part, 260)).toBe(1);
  });
});
