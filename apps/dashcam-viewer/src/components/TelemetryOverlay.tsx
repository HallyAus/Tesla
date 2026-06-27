import { sampleTelemetry } from '../lib/telemetry/sample';
import type { TelemetryTrack } from '../lib/telemetry/types';
import type { MasterClock } from '../hooks/useMasterClock';

interface Props {
  telemetry: TelemetryTrack | null;
  clock: MasterClock;
}

/**
 * Speed / steering / brake / Autopilot HUD. Reads the telemetry track at the
 * master clock's time. Degrades gracefully: when no track is present it shows a
 * clear "no telemetry" state instead of empty gauges.
 */
export function TelemetryOverlay({ telemetry, clock }: Props) {
  if (!telemetry || telemetry.samples.length === 0) {
    return (
      <div className="telemetry telemetry--empty">
        <span>No telemetry track for this event</span>
      </div>
    );
  }

  const s = sampleTelemetry(telemetry, clock.time);
  if (!s) return null;

  const speed = Math.round(s.speedKph);
  const braking = s.brake > 0.15;

  return (
    <div className="telemetry">
      <div className="tlm-item tlm-speed">
        <span className="tlm-value">{speed}</span>
        <span className="tlm-unit">km/h</span>
      </div>

      <div className="tlm-item">
        <span className="tlm-label">Steering</span>
        <div className="steering">
          <div
            className="steering-needle"
            style={{ transform: `rotate(${s.steeringDeg}deg)` }}
          />
        </div>
        <span className="tlm-sub">{Math.round(s.steeringDeg)}°</span>
      </div>

      <div className="tlm-item">
        <span className="tlm-label">Brake</span>
        <div className="bar">
          <div
            className="bar-fill bar-fill--brake"
            style={{ width: `${Math.min(100, s.brake * 100)}%` }}
          />
        </div>
        <span className={`badge ${braking ? 'badge--on' : ''}`}>
          {braking ? 'BRAKING' : 'idle'}
        </span>
      </div>

      <div className="tlm-item">
        <span className="tlm-label">Accelerator</span>
        <div className="bar">
          <div
            className="bar-fill bar-fill--accel"
            style={{ width: `${Math.min(100, s.accelerator * 100)}%` }}
          />
        </div>
      </div>

      <div className="tlm-item">
        <span className="tlm-label">Autopilot</span>
        <span className={`badge ${s.autopilot ? 'badge--ap' : ''}`}>
          {s.autopilot ? 'ENGAGED' : 'off'}
        </span>
      </div>
    </div>
  );
}
