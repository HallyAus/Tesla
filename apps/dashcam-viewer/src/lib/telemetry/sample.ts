import type { TelemetrySample, TelemetryTrack } from './types';

/**
 * Linearly interpolate the telemetry track at time `t` (seconds from event start).
 * Returns `null` when the track is empty. Clamps to the track's bounds.
 */
export function sampleTelemetry(
  track: TelemetryTrack | null | undefined,
  t: number,
): TelemetrySample | null {
  if (!track || track.samples.length === 0) return null;
  const s = track.samples;
  if (t <= s[0].t) return s[0];
  if (t >= s[s.length - 1].t) return s[s.length - 1];

  // Binary search for the bracketing pair.
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = s[lo];
  const b = s[hi];
  const span = b.t - a.t || 1;
  const f = (t - a.t) / span;
  const lerp = (x: number, y: number) => x + (y - x) * f;

  const out: TelemetrySample = {
    t,
    speedKph: lerp(a.speedKph, b.speedKph),
    steeringDeg: lerp(a.steeringDeg, b.steeringDeg),
    brake: lerp(a.brake, b.brake),
    accelerator: lerp(a.accelerator, b.accelerator),
    autopilot: f < 0.5 ? a.autopilot : b.autopilot,
  };
  if (a.lat != null && b.lat != null && a.lon != null && b.lon != null) {
    return { ...out, lat: lerp(a.lat, b.lat), lon: lerp(a.lon, b.lon) };
  }
  return out;
}

/** All GPS points in the track, for drawing a route polyline. */
export function trackRoute(
  track: TelemetryTrack | null | undefined,
): Array<[number, number]> {
  if (!track) return [];
  const pts: Array<[number, number]> = [];
  for (const s of track.samples) {
    if (s.lon != null && s.lat != null) pts.push([s.lon, s.lat]);
  }
  return pts;
}
