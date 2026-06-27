/**
 * Demo / sample event generator.
 *
 * Ships ZERO binary assets. Each camera feed is synthesized procedurally on a
 * canvas (a moving road scene + burned-in camera label + live timestamp),
 * driven by the same master clock as real playback. A realistic `event.json`
 * and a synthetic telemetry track (speed / steering / brake / autopilot / GPS)
 * are generated alongside, so the demo exercises the full pipeline:
 * synced grid + telemetry overlay + route map.
 */

import { CAMERA_NAMES, type CameraName, type EventMetadata } from '../teslacam/types';
import type { TelemetrySample, TelemetryTrack } from '../telemetry/types';
import type { CameraTrack, PlayableEvent } from '../player/model';

const DEMO_DURATION_SEC = 60;
const DEMO_START = new Date('2024-01-15T14:30:00');

// A plausible Sentry event in San Francisco.
const DEMO_META: EventMetadata = {
  timestamp: '2024-01-15T14:30:00',
  city: 'San Francisco, CA',
  est_lat: 37.7749,
  est_lon: -122.4194,
  reason: 'sentry_aware_object_detection',
  camera: '0',
};

/** Per-camera tint + label so the synthesized tiles look distinct. */
const CAMERA_STYLE: Record<CameraName, { hue: number; label: string }> = {
  front: { hue: 210, label: 'FRONT' },
  back: { hue: 20, label: 'BACK' },
  left_repeater: { hue: 140, label: 'LEFT REPEATER' },
  right_repeater: { hue: 280, label: 'RIGHT REPEATER' },
  left_pillar: { hue: 100, label: 'LEFT PILLAR' },
  right_pillar: { hue: 320, label: 'RIGHT PILLAR' },
};

/**
 * Build a synthetic telemetry track: a short drive that accelerates, swerves,
 * brakes, and toggles Autopilot, with a GPS path radiating from the event site.
 */
export function generateTelemetry(
  durationSec = DEMO_DURATION_SEC,
  baseLat = DEMO_META.est_lat!,
  baseLon = DEMO_META.est_lon!,
): TelemetryTrack {
  const samples: TelemetrySample[] = [];
  const hz = 5; // 5 samples/sec
  const n = durationSec * hz;
  for (let i = 0; i <= n; i++) {
    const t = i / hz;
    const phase = t / durationSec; // 0..1
    // Speed: ramp up to ~60 km/h, dip for a brake event near 70%.
    const brakeEvent = phase > 0.65 && phase < 0.78;
    const speedKph = brakeEvent
      ? Math.max(0, 60 - (phase - 0.65) * 400)
      : 8 + Math.sin(phase * Math.PI) * 55;
    // Steering: gentle weave.
    const steeringDeg = Math.sin(t * 0.8) * 35 * (1 - phase * 0.3);
    const brake = brakeEvent ? 0.9 : 0;
    const accelerator = brakeEvent ? 0 : Math.max(0, 0.4 + Math.sin(t * 0.5) * 0.3);
    const autopilot = phase > 0.2 && phase < 0.6;
    // GPS: drift roughly north-east, with the weave applied.
    const lat = baseLat + phase * 0.004 + Math.sin(t * 0.8) * 0.00015;
    const lon = baseLon + phase * 0.005 + Math.cos(t * 0.6) * 0.00015;
    samples.push({
      t,
      speedKph: Math.round(speedKph * 10) / 10,
      steeringDeg: Math.round(steeringDeg * 10) / 10,
      brake,
      accelerator: Math.round(accelerator * 100) / 100,
      autopilot,
      lat,
      lon,
    });
  }
  return { samples, durationSec };
}

/** Whether the user prefers reduced motion (guards the demo animation). */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Draw one procedural camera frame for `eventTimeSec` onto `ctx`. */
function drawCameraFrame(
  camera: CameraName,
  ctx: CanvasRenderingContext2D,
  eventTimeSec: number,
  width: number,
  height: number,
  reducedMotion: boolean,
): void {
  const style = CAMERA_STYLE[camera];
  // When the user prefers reduced motion, freeze the moving scene at a fixed
  // pose so the tiles still render (and the live timestamp still ticks) but
  // nothing visually slides/scrolls.
  const t = reducedMotion ? 0 : eventTimeSec;

  // Sky / ground split with a per-camera tint.
  const horizon = height * 0.45;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, `hsl(${style.hue}, 40%, 30%)`);
  sky.addColorStop(1, `hsl(${style.hue}, 35%, 18%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizon);

  ctx.fillStyle = `hsl(${style.hue}, 12%, 12%)`;
  ctx.fillRect(0, horizon, width, height - horizon);

  // Perspective road with moving lane dashes (the "moving scene").
  ctx.fillStyle = '#22252b';
  ctx.beginPath();
  ctx.moveTo(width * 0.5 - 12, horizon);
  ctx.lineTo(width * 0.5 + 12, horizon);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#d9c441';
  ctx.lineWidth = 3;
  const speed = 70; // px/sec of dash travel
  const dashLen = 28;
  const gap = 40;
  const cycle = dashLen + gap;
  const phase = (t * speed) % cycle;
  for (let y = horizon; y < height; y += cycle) {
    const yy = y + phase;
    if (yy > height) continue;
    const scale = (yy - horizon) / (height - horizon);
    const x = width * 0.5;
    ctx.lineWidth = 1 + scale * 4;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x, Math.min(height, yy + dashLen * (0.4 + scale)));
    ctx.stroke();
  }

  // A drifting object (so motion is obvious even when paused vs playing).
  const objX = ((t * 40) % (width + 80)) - 40;
  ctx.fillStyle = `hsl(${(style.hue + 180) % 360}, 70%, 55%)`;
  ctx.fillRect(objX, horizon - 18, 26, 18);

  // Burned-in camera label.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(8, 8, ctx.measureText(style.label).width + 110, 28);
  ctx.fillStyle = '#fff';
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(style.label, 16, 23);

  // Live timestamp (event start + elapsed).
  const wall = new Date(DEMO_START.getTime() + eventTimeSec * 1000);
  const ts = wall.toLocaleTimeString([], { hour12: false });
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  const tw = ctx.measureText(ts).width + 16;
  ctx.fillRect(width - tw - 8, 8, tw, 28);
  ctx.fillStyle = '#fff';
  ctx.fillText(ts, width - tw, 23);
}

/** Build the full demo {@link PlayableEvent}. */
export function generateDemoEvent(): PlayableEvent {
  const reducedMotion = prefersReducedMotion();
  const tracks: CameraTrack[] = CAMERA_NAMES.map((camera) => ({
    camera,
    kind: 'procedural',
    draw: (ctx, t, w, h) => drawCameraFrame(camera, ctx, t, w, h, reducedMotion),
  }));

  return {
    id: 'demo-2024-01-15_14-30-00',
    title: `Sentry · ${DEMO_META.city} · ${DEMO_START.toLocaleString()}`,
    source: 'demo',
    startTime: DEMO_START,
    durationSec: DEMO_DURATION_SEC,
    cameras: [...CAMERA_NAMES],
    tracks,
    metadata: DEMO_META,
    telemetry: generateTelemetry(),
  };
}
