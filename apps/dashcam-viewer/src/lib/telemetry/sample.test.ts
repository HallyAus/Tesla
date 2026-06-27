import { describe, expect, it } from 'vitest';
import { sampleTelemetry, trackRoute } from './sample';
import type { TelemetryTrack } from './types';

const track: TelemetryTrack = {
  durationSec: 10,
  samples: [
    { t: 0, speedKph: 0, steeringDeg: 0, brake: 0, accelerator: 0, autopilot: false, lat: 10, lon: 20 },
    { t: 10, speedKph: 100, steeringDeg: 40, brake: 1, accelerator: 1, autopilot: true, lat: 11, lon: 21 },
  ],
};

describe('sampleTelemetry', () => {
  it('returns null for an empty/absent track', () => {
    expect(sampleTelemetry(null, 5)).toBeNull();
    expect(sampleTelemetry({ samples: [], durationSec: 0 }, 5)).toBeNull();
  });

  it('clamps to bounds', () => {
    expect(sampleTelemetry(track, -5)?.speedKph).toBe(0);
    expect(sampleTelemetry(track, 99)?.speedKph).toBe(100);
  });

  it('interpolates linearly between samples', () => {
    const s = sampleTelemetry(track, 5);
    expect(s?.speedKph).toBeCloseTo(50);
    expect(s?.steeringDeg).toBeCloseTo(20);
    expect(s?.lat).toBeCloseTo(10.5);
    expect(s?.lon).toBeCloseTo(20.5);
  });

  it('picks the nearer sample for boolean autopilot', () => {
    expect(sampleTelemetry(track, 4)?.autopilot).toBe(false);
    expect(sampleTelemetry(track, 6)?.autopilot).toBe(true);
  });
});

describe('trackRoute', () => {
  it('collects [lon,lat] points', () => {
    expect(trackRoute(track)).toEqual([
      [20, 10],
      [21, 11],
    ]);
  });
  it('is empty for null', () => {
    expect(trackRoute(null)).toEqual([]);
  });
});
