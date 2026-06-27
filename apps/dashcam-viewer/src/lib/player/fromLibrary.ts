/** Adapt a parsed real-folder {@link ClipEvent} into a {@link PlayableEvent}. */

import { CAMERA_NAMES, type CameraName, type ClipEvent } from '../teslacam/types';
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

  return {
    id: event.id,
    title,
    source: 'folder',
    startTime: event.startTime,
    durationSec: event.durationSec,
    cameras: event.cameras as CameraName[],
    tracks,
    metadata: event.metadata,
    // Real folders may embed telemetry in newer firmware; not parsed in MVP.
    telemetry: null,
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
