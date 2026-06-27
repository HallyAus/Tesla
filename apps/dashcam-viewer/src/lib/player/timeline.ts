/**
 * Timeline math, kept pure and DOM-free for unit testing.
 *
 * The timeline spans every segment of an event. It exposes:
 *  - segment boundaries (for drawing tick marks),
 *  - event markers (e.g. the Sentry trigger timestamp from event.json),
 *  - time<->fraction conversions for the scrubber,
 *  - frame stepping at an assumed frame rate, and
 *  - human-readable time formatting.
 */

/** Tesla dashcam clips are ~36 fps; we step the timeline at this rate. */
export const ASSUMED_FPS = 36;

export interface TimelineSegment {
  /** Offset of this segment from the event start, seconds. */
  readonly startSec: number;
  readonly durationSec: number;
}

export interface TimelineMarker {
  /** Seconds from event start. */
  readonly t: number;
  readonly label: string;
  readonly kind: 'trigger' | 'segment';
}

/**
 * Compute segment boundary offsets (the start of every segment AFTER the
 * first). Used to draw tick marks on the scrubber.
 */
export function segmentBoundaries(segments: readonly TimelineSegment[]): number[] {
  return segments.slice(1).map((s) => s.startSec);
}

/**
 * Total duration of a list of segments. Falls back to `fallbackSec` when the
 * list is empty (e.g. demo mode, which has no video segments).
 */
export function totalDuration(
  segments: readonly TimelineSegment[],
  fallbackSec: number,
): number {
  if (segments.length === 0) return fallbackSec;
  const last = segments[segments.length - 1];
  return last.startSec + last.durationSec;
}

/** Clamp a time into [0, duration]. */
export function clampTime(t: number, durationSec: number): number {
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.min(durationSec, t));
}

/** Convert a time to a 0..1 fraction of the duration (0 when duration is 0). */
export function timeToFraction(t: number, durationSec: number): number {
  if (durationSec <= 0) return 0;
  return clampTime(t, durationSec) / durationSec;
}

/** Convert a 0..1 fraction back to a time. */
export function fractionToTime(f: number, durationSec: number): number {
  return clampTime(f * durationSec, durationSec);
}

/** Step `t` by `frames` frames (negative = backwards) at `fps`. */
export function stepFrame(
  t: number,
  frames: number,
  durationSec: number,
  fps = ASSUMED_FPS,
): number {
  return clampTime(t + frames / fps, durationSec);
}

/** Find the index of the segment covering time `t`, or -1. */
export function segmentIndexAt(
  segments: readonly TimelineSegment[],
  t: number,
): number {
  return segments.findIndex(
    (s) => t >= s.startSec && t < s.startSec + s.durationSec,
  );
}

/** Start time of the previous segment relative to `t` (for `,` shortcut). */
export function prevSegmentStart(
  segments: readonly TimelineSegment[],
  t: number,
): number {
  // A small epsilon so pressing prev while just inside a boundary goes back.
  const EPS = 0.25;
  let target = 0;
  for (const s of segments) {
    if (s.startSec < t - EPS) target = s.startSec;
    else break;
  }
  return target;
}

/** Start time of the next segment relative to `t` (for `.` shortcut). */
export function nextSegmentStart(
  segments: readonly TimelineSegment[],
  t: number,
  durationSec: number,
): number {
  for (const s of segments) {
    if (s.startSec > t + 1e-3) return s.startSec;
  }
  return durationSec;
}

/** Seek to a digit-key percentage (0..9 -> 0%..90%). */
export function seekToPercent(digit: number, durationSec: number): number {
  const pct = Math.max(0, Math.min(9, Math.floor(digit))) / 10;
  return fractionToTime(pct, durationSec);
}

/** Format seconds as `M:SS` (or `H:MM:SS` past an hour). */
export function formatTime(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const total = Math.floor(t);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, '0');
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}
