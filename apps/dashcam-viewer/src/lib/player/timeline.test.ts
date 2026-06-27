import { describe, expect, it } from 'vitest';
import {
  ASSUMED_FPS,
  clampTime,
  formatTime,
  fractionToTime,
  nextSegmentStart,
  prevSegmentStart,
  seekToPercent,
  segmentBoundaries,
  segmentIndexAt,
  stepFrame,
  timeToFraction,
  totalDuration,
  type TimelineSegment,
} from './timeline';

const segs: TimelineSegment[] = [
  { startSec: 0, durationSec: 60 },
  { startSec: 60, durationSec: 60 },
  { startSec: 120, durationSec: 45 },
];

describe('segmentBoundaries', () => {
  it('returns starts of every segment after the first', () => {
    expect(segmentBoundaries(segs)).toEqual([60, 120]);
    expect(segmentBoundaries([segs[0]])).toEqual([]);
    expect(segmentBoundaries([])).toEqual([]);
  });
});

describe('totalDuration', () => {
  it('sums to the end of the last segment', () => {
    expect(totalDuration(segs, 60)).toBe(165);
  });
  it('uses the fallback when there are no segments', () => {
    expect(totalDuration([], 42)).toBe(42);
  });
});

describe('clampTime', () => {
  it('clamps into range and handles non-finite', () => {
    expect(clampTime(-5, 100)).toBe(0);
    expect(clampTime(150, 100)).toBe(100);
    expect(clampTime(50, 100)).toBe(50);
    expect(clampTime(NaN, 100)).toBe(0);
  });
});

describe('time<->fraction', () => {
  it('round-trips', () => {
    expect(timeToFraction(50, 100)).toBeCloseTo(0.5);
    expect(fractionToTime(0.5, 100)).toBeCloseTo(50);
  });
  it('is zero when duration is zero', () => {
    expect(timeToFraction(10, 0)).toBe(0);
  });
});

describe('stepFrame', () => {
  it('steps forward/back by frames at the assumed fps', () => {
    expect(stepFrame(1, 1, 100)).toBeCloseTo(1 + 1 / ASSUMED_FPS);
    expect(stepFrame(1, -1, 100)).toBeCloseTo(1 - 1 / ASSUMED_FPS);
  });
  it('clamps at the bounds', () => {
    expect(stepFrame(0, -1, 100)).toBe(0);
    expect(stepFrame(100, 1, 100)).toBe(100);
  });
});

describe('segmentIndexAt', () => {
  it('finds the covering segment', () => {
    expect(segmentIndexAt(segs, 0)).toBe(0);
    expect(segmentIndexAt(segs, 65)).toBe(1);
    expect(segmentIndexAt(segs, 130)).toBe(2);
    expect(segmentIndexAt(segs, 999)).toBe(-1);
  });
});

describe('prev/next segment start', () => {
  it('finds the previous boundary', () => {
    expect(prevSegmentStart(segs, 130)).toBe(120);
    expect(prevSegmentStart(segs, 65)).toBe(60);
    expect(prevSegmentStart(segs, 10)).toBe(0);
  });
  it('finds the next boundary, falling back to duration', () => {
    expect(nextSegmentStart(segs, 10, 165)).toBe(60);
    expect(nextSegmentStart(segs, 65, 165)).toBe(120);
    expect(nextSegmentStart(segs, 130, 165)).toBe(165);
  });
});

describe('seekToPercent', () => {
  it('maps digits 0-9 to 0%-90%', () => {
    expect(seekToPercent(0, 100)).toBe(0);
    expect(seekToPercent(5, 100)).toBe(50);
    expect(seekToPercent(9, 100)).toBeCloseTo(90);
    expect(seekToPercent(12, 100)).toBeCloseTo(90); // clamped
  });
});

describe('formatTime', () => {
  it('formats M:SS and H:MM:SS', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(3661)).toBe('1:01:01');
    expect(formatTime(-3)).toBe('0:00');
  });
});
