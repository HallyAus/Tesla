import { describe, expect, it } from 'vitest';
import { computeTileRects } from './composite';

describe('computeTileRects', () => {
  it('returns nothing for zero tiles', () => {
    expect(computeTileRects(100, 100, 0, false)).toEqual([]);
  });

  it('fills the canvas for a single tile', () => {
    expect(computeTileRects(640, 360, 1, false)).toEqual([
      { x: 0, y: 0, w: 640, h: 360 },
    ]);
  });

  it('lays out a near-square grid for non-focus', () => {
    const rects = computeTileRects(640, 360, 4, false);
    expect(rects).toHaveLength(4);
    // 2x2 grid.
    expect(rects[0]).toEqual({ x: 0, y: 0, w: 320, h: 180 });
    expect(rects[3]).toEqual({ x: 320, y: 180, w: 320, h: 180 });
  });

  it('tiles do not overlap and cover the width per row', () => {
    const rects = computeTileRects(641, 360, 6, false); // 3 cols x 2 rows
    // First row x-ranges should tile [0, 641].
    const row0 = rects.slice(0, 3);
    expect(row0[0].x).toBe(0);
    expect(row0[2].x + row0[2].w).toBe(641);
  });

  it('focus layout puts a large tile on top + a thumbnail strip', () => {
    const rects = computeTileRects(600, 400, 4, true);
    expect(rects).toHaveLength(4);
    // Focus tile spans full width and most of the height.
    expect(rects[0].x).toBe(0);
    expect(rects[0].w).toBe(600);
    expect(rects[0].h).toBeLessThan(400);
    // 3 thumbnails below, tiling the width.
    const strip = rects.slice(1);
    expect(strip).toHaveLength(3);
    expect(strip[0].x).toBe(0);
    expect(strip[2].x + strip[2].w).toBe(600);
    expect(strip.every((r) => r.y === rects[0].h)).toBe(true);
  });
});
