/**
 * Playback model shared by real-folder mode and demo mode.
 *
 * The UI never talks to `<video>` elements or canvases directly; it consumes a
 * {@link PlayableEvent}, which exposes per-camera *frame sources* plus a single
 * timeline. Real mode backs frame sources with segmented `<video>` playback;
 * demo mode backs them with a procedural canvas renderer. Both share the same
 * master-clock contract so the synced grid / overlay / map are identical.
 */

import type { CameraName, EventMetadata } from '../teslacam/types';
import type { TelemetryTrack } from '../telemetry/types';

/** What a single camera tile needs in order to render at a given event time. */
export interface CameraTrack {
  readonly camera: CameraName;
  readonly kind: 'video' | 'procedural';
  /**
   * For `kind: 'video'`: ordered segment clip URLs with their offsets so the
   * player can swap the `<video>` src across segment boundaries.
   */
  readonly segments?: Array<{
    readonly url: string;
    /** Offset of this segment from the event start, seconds. */
    readonly startSec: number;
    readonly durationSec: number;
  }>;
  /**
   * For `kind: 'procedural'`: a draw callback that paints the camera feed for a
   * given event time onto the supplied canvas context.
   */
  readonly draw?: (
    ctx: CanvasRenderingContext2D,
    eventTimeSec: number,
    width: number,
    height: number,
  ) => void;
}

export interface PlayableEvent {
  readonly id: string;
  readonly title: string;
  readonly source: 'folder' | 'demo';
  /** Wall-clock start of the event. */
  readonly startTime: Date;
  /** Total duration across all segments, seconds. */
  readonly durationSec: number;
  /** Cameras available, in canonical display order. */
  readonly cameras: CameraName[];
  readonly tracks: CameraTrack[];
  readonly metadata?: EventMetadata;
  /** Telemetry track, or null when none is available. */
  readonly telemetry: TelemetryTrack | null;
  /** Release any object URLs / resources held by this event. */
  dispose?: () => void;
}

export function trackForCamera(
  event: PlayableEvent,
  camera: CameraName,
): CameraTrack | undefined {
  return event.tracks.find((t) => t.camera === camera);
}

/** Build the timeline segments (offset + duration) for an event's video tracks. */
export function timelineSegmentsFor(
  event: PlayableEvent,
): Array<{ startSec: number; durationSec: number }> {
  const vid = event.tracks.find((t) => t.kind === 'video' && t.segments);
  if (!vid?.segments) return [];
  return vid.segments.map((s) => ({
    startSec: s.startSec,
    durationSec: s.durationSec,
  }));
}
