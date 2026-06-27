/**
 * Core domain types for the TeslaCam parser.
 *
 * Vocabulary (matches how Tesla stores footage):
 *  - clip     : a single `.mp4` file for one camera within one ~1-minute window.
 *  - segment  : all camera clips that share the same `YYYY-MM-DD_HH-MM-SS` prefix.
 *  - event    : a run of consecutive segments (a Saved / Sentry / Recent recording)
 *               plus the optional `event.json` metadata.
 */

/** Cameras TeslaCam can record. Order here is the canonical display order. */
export const CAMERA_NAMES = [
  'front',
  'back',
  'left_repeater',
  'right_repeater',
  'left_pillar',
  'right_pillar',
] as const;

export type CameraName = (typeof CAMERA_NAMES)[number];

/** The three folders Tesla writes under `TeslaCam/`. */
export type ClipBucket = 'RecentClips' | 'SavedClips' | 'SentryClips';

/**
 * A handle to clip bytes. In real-folder mode this is backed by a `File`
 * (from File System Access API or `webkitdirectory`); in demo mode the URL
 * points at a synthesized `MediaSource`/blob, so we keep the abstraction loose.
 */
export interface ClipSource {
  /** Object URL playable by a `<video>` element. */
  readonly url: string;
  /** Size in bytes when known (real files); 0 for synthesized sources. */
  readonly size: number;
  /** Optionally release the underlying object URL. */
  revoke?: () => void;
}

/** One camera's clip inside a segment. */
export interface CameraClip {
  readonly camera: CameraName;
  readonly fileName: string;
  readonly source: ClipSource;
}

/** All camera clips sharing one timestamp prefix. */
export interface Segment {
  /** `YYYY-MM-DD_HH-MM-SS` prefix that identifies the segment. */
  readonly id: string;
  /** Wall-clock start time parsed from the prefix. */
  readonly startTime: Date;
  /** Camera clips present for this segment, keyed by camera name. */
  readonly clips: Partial<Record<CameraName, CameraClip>>;
  /**
   * Segment duration in seconds. Tesla segments are ~60s but the true value is
   * only known once the video metadata loads, so this is a best-effort default.
   */
  durationSec: number;
}

/** Tesla's `event.json` schema (fields are all optional in the wild). */
export interface EventMetadata {
  readonly timestamp?: string;
  readonly city?: string;
  readonly est_lat?: number;
  readonly est_lon?: number;
  readonly reason?: string;
  /** Camera index that triggered a Sentry event (Tesla stores this as a string). */
  readonly camera?: string;
}

/** A run of consecutive segments plus optional metadata. */
export interface ClipEvent {
  /** Stable id (the first segment's id). */
  readonly id: string;
  readonly bucket: ClipBucket;
  readonly segments: Segment[];
  readonly metadata?: EventMetadata;
  /** Start of the first segment. */
  readonly startTime: Date;
  /** Total duration across all segments, seconds. */
  readonly durationSec: number;
  /** Cameras available across the whole event (union of all segments). */
  readonly cameras: CameraName[];
}

/** Result of parsing a whole `TeslaCam` directory. */
export interface ParsedLibrary {
  readonly events: ClipEvent[];
  /** Non-fatal problems encountered while parsing (bad names, JSON errors). */
  readonly warnings: string[];
}
