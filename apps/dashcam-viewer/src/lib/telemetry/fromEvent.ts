/**
 * Build a best-effort telemetry track from a real event's `event.json`.
 *
 * Tesla's `event.json` does NOT contain a per-frame telemetry stream (speed,
 * steering, pedals). Newer firmware can embed a separate telemetry stream in
 * the clips themselves, but it is not extractable client-side today (see the
 * README "Known limitations"). So for REAL folders we DO NOT fabricate driving
 * data — instead we surface what `event.json` genuinely provides:
 *
 *   - the trigger reason / city / camera (for the event details panel), and
 *   - the estimated GPS point (`est_lat` / `est_lon`) so the map and overlay
 *     can show a single location pin.
 *
 * This returns `null` when there is no usable GPS, which keeps the overlay in
 * its honest "no telemetry" state rather than showing fake gauges.
 */

import type { EventMetadata } from '../teslacam/types';
import type { TelemetryTrack } from './types';

export interface EventTelemetryInfo {
  /** A minimal GPS-only telemetry track, or null when no coordinates exist. */
  readonly track: TelemetryTrack | null;
  /** True when `event.json` carried estimated coordinates. */
  readonly hasLocation: boolean;
  /** Human-readable trigger reason, normalized (e.g. "Sentry: object detection"). */
  readonly reasonLabel: string | null;
  /** Which camera index triggered a Sentry event, if recorded. */
  readonly triggerCamera: string | null;
}

/** Map Tesla's raw `reason` token to a friendly label. */
export function formatReason(reason?: string): string | null {
  if (!reason) return null;
  const r = reason.toLowerCase();
  if (r.includes('object_detection')) return 'Sentry: object detected';
  if (r.includes('accel')) return 'Sentry: acceleration / impact';
  if (r.includes('sentry')) return 'Sentry event';
  if (r.includes('honk')) return 'Honk detected';
  if (r.includes('user') || r.includes('save')) return 'Manually saved';
  // Fall back to a humanized version of the raw token.
  return reason
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Derive event-level telemetry info from parsed `event.json` metadata.
 * `durationSec` is used to bound the single-point GPS track.
 */
export function telemetryFromEvent(
  metadata: EventMetadata | undefined,
  durationSec: number,
): EventTelemetryInfo {
  const lat = metadata?.est_lat;
  const lon = metadata?.est_lon;
  const hasLocation =
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon);

  let track: TelemetryTrack | null = null;
  if (hasLocation) {
    // A static two-sample track at the event location so the map can place a
    // marker and the route helpers have something to read. No fabricated
    // speed/steering/pedal data — those stay at zero/false and the overlay
    // recognizes the GPS-only case.
    track = {
      durationSec,
      samples: [
        {
          t: 0,
          speedKph: 0,
          steeringDeg: 0,
          brake: 0,
          accelerator: 0,
          autopilot: false,
          lat,
          lon,
        },
        {
          t: durationSec,
          speedKph: 0,
          steeringDeg: 0,
          brake: 0,
          accelerator: 0,
          autopilot: false,
          lat,
          lon,
        },
      ],
    };
  }

  return {
    track,
    hasLocation,
    reasonLabel: formatReason(metadata?.reason),
    triggerCamera: metadata?.camera ?? null,
  };
}

/**
 * Whether a telemetry track carries real driving signals (speed/steering/
 * pedals) vs. being a GPS-only / location-only track. The overlay uses this to
 * decide between full gauges and a "location only" notice.
 */
export function hasDrivingSignals(track: TelemetryTrack | null): boolean {
  if (!track || track.samples.length === 0) return false;
  return track.samples.some(
    (s) =>
      s.speedKph !== 0 ||
      s.steeringDeg !== 0 ||
      s.brake !== 0 ||
      s.accelerator !== 0 ||
      s.autopilot,
  );
}
