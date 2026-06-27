/** Adapt a parsed real-folder {@link ClipEvent} into a {@link PlayableEvent}. */

import { CAMERA_NAMES, type CameraName, type ClipEvent } from '../teslacam/types';
import { telemetryFromEvent } from '../telemetry/fromEvent';
import type { CameraTrack, PlayableEvent } from './model';

export function playableFromClipEvent(event: ClipEvent): PlayableEvent {
  const tracks: CameraTrack[] = [];

  for (const camera of CAMERA_NAMES) {
    if (!event.cameras.includes(camera)) continue;
    const segments: NonNullable<CameraTrack['segments']> = [];
    let offset = 0;
    for (const seg of event.segments) {
      const clip = seg.clips[camera];
      if (clip) {
        segments.push({
          url: clip.source.url,
          startSec: offset,
          durationSec: seg.durationSec,
        });
      }
      offset += seg.durationSec;
    }
    if (segments.length > 0) {
      tracks.push({ camera, kind: 'video', segments });
    }
  }

  const title = formatTitle(event.startTime, event.bucket, event.metadata?.city);

  // Surface everything event.json genuinely provides. Tesla's event.json has no
  // per-frame driving stream, so this yields a GPS-only track (for the map/pin)
  // or null — never fabricated speed/steering data. See telemetry/fromEvent.ts.
  const { track: telemetry } = telemetryFromEvent(event.metadata, event.durationSec);

  return {
    id: event.id,
    title,
    source: 'folder',
    startTime: event.startTime,
    durationSec: event.durationSec,
    cameras: event.cameras as CameraName[],
    tracks,
    metadata: event.metadata,
    telemetry,
    dispose: () => {
      for (const seg of event.segments) {
        for (const cam of Object.keys(seg.clips) as CameraName[]) {
          seg.clips[cam]?.source.revoke?.();
        }
      }
    },
  };
}

function formatTitle(start: Date, bucket: string, city?: string): string {
  const label = bucket.replace('Clips', '');
  const when = start.toLocaleString();
  return city ? `${label} · ${city} · ${when}` : `${label} · ${when}`;
}
