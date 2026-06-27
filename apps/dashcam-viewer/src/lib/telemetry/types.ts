/**
 * Telemetry track types. Tesla's newer firmware can embed a telemetry stream
 * alongside clips; this app models it as a simple time-series sampled by the
 * master clock. When no track is present the overlay degrades gracefully.
 */

export interface TelemetrySample {
  /** Seconds from the start of the event. */
  readonly t: number;
  /** Vehicle speed in km/h. */
  readonly speedKph: number;
  /** Steering wheel angle in degrees, negative = left. */
  readonly steeringDeg: number;
  /** Brake pedal pressed (0..1, or boolean-ish). */
  readonly brake: number;
  /** Accelerator pedal (0..1). */
  readonly accelerator: number;
  /** Autopilot / Autosteer engaged. */
  readonly autopilot: boolean;
  /** Optional GPS position for route tracing. */
  readonly lat?: number;
  readonly lon?: number;
}

export interface TelemetryTrack {
  /** Samples sorted ascending by `t`. */
  readonly samples: TelemetrySample[];
  /** Total covered duration in seconds. */
  readonly durationSec: number;
}
