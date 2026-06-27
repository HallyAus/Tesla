import { describe, expect, it } from 'vitest';
import {
  formatReason,
  hasDrivingSignals,
  telemetryFromEvent,
} from './fromEvent';
import type { EventMetadata } from '../teslacam/types';
import type { TelemetryTrack } from './types';

describe('formatReason', () => {
  it('humanizes known Tesla reasons', () => {
    expect(formatReason('sentry_aware_object_detection')).toBe('Sentry: object detected');
    expect(formatReason('sentry_aware_accel_v2')).toBe('Sentry: acceleration / impact');
    expect(formatReason('user_interaction_honk')).toBe('Honk detected');
    expect(formatReason('user_interaction_dashcam_panel_save')).toBe('Manually saved');
  });
  it('falls back to a humanized token', () => {
    expect(formatReason('some_new_reason')).toBe('Some New Reason');
  });
  it('returns null for missing reason', () => {
    expect(formatReason(undefined)).toBeNull();
  });
});

describe('telemetryFromEvent', () => {
  it('builds a GPS-only track when coordinates are present', () => {
    const meta: EventMetadata = {
      est_lat: 37.77,
      est_lon: -122.41,
      reason: 'sentry_aware_object_detection',
      camera: '0',
    };
    const info = telemetryFromEvent(meta, 60);
    expect(info.hasLocation).toBe(true);
    expect(info.reasonLabel).toBe('Sentry: object detected');
    expect(info.triggerCamera).toBe('0');
    expect(info.track).not.toBeNull();
    expect(info.track!.samples).toHaveLength(2);
    expect(info.track!.samples[0].lat).toBeCloseTo(37.77);
    expect(info.track!.samples[1].t).toBe(60);
    // No fabricated driving signals.
    expect(hasDrivingSignals(info.track)).toBe(false);
  });

  it('returns a null track when no coordinates exist', () => {
    const info = telemetryFromEvent({ city: 'Reno' }, 60);
    expect(info.hasLocation).toBe(false);
    expect(info.track).toBeNull();
  });

  it('handles undefined metadata', () => {
    const info = telemetryFromEvent(undefined, 60);
    expect(info.hasLocation).toBe(false);
    expect(info.track).toBeNull();
    expect(info.reasonLabel).toBeNull();
    expect(info.triggerCamera).toBeNull();
  });

  it('ignores non-finite coordinates', () => {
    const info = telemetryFromEvent({ est_lat: NaN, est_lon: 1 }, 60);
    expect(info.hasLocation).toBe(false);
  });
});

describe('hasDrivingSignals', () => {
  it('is true when any sample has motion', () => {
    const track: TelemetryTrack = {
      durationSec: 1,
      samples: [
        { t: 0, speedKph: 0, steeringDeg: 0, brake: 0, accelerator: 0, autopilot: false },
        { t: 1, speedKph: 30, steeringDeg: 0, brake: 0, accelerator: 0, autopilot: false },
      ],
    };
    expect(hasDrivingSignals(track)).toBe(true);
  });
  it('is false for empty/null/all-zero tracks', () => {
    expect(hasDrivingSignals(null)).toBe(false);
    expect(hasDrivingSignals({ durationSec: 0, samples: [] })).toBe(false);
  });
});
