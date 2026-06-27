/**
 * Pure helpers for building export filenames. Kept DOM-free for unit testing.
 */

/** Make a string safe to use as a filename segment. */
export function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'event'
  );
}

/** PNG snapshot filename: `<event>-<camera>-<ms>ms.png`. */
export function snapshotFileName(
  eventId: string,
  camera: string,
  timeSec: number,
): string {
  const ms = Math.max(0, Math.round(timeSec * 1000));
  return `${slugify(eventId)}-${slugify(camera)}-${ms}ms.png`;
}

/**
 * WebM clip filename: `<event>-<layout>-<start>s-<end>s.webm`.
 * Times are rounded to whole seconds for a readable name.
 */
export function clipFileName(
  eventId: string,
  layoutId: string,
  startSec: number,
  endSec: number,
): string {
  const a = Math.max(0, Math.round(startSec));
  const b = Math.max(a, Math.round(endSec));
  return `${slugify(eventId)}-${slugify(layoutId)}-${a}s-${b}s.webm`;
}

/**
 * Pick the best supported MediaRecorder mime type from a candidate list.
 * Returns `null` when MediaRecorder is unavailable or none are supported.
 * The `isSupported` indirection keeps this unit-testable without a DOM.
 */
export function pickRecorderMimeType(
  candidates: readonly string[],
  isSupported: (type: string) => boolean,
): string | null {
  for (const c of candidates) {
    if (isSupported(c)) return c;
  }
  return null;
}

export const WEBM_MIME_CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;
