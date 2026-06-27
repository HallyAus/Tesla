import { useCallback, useMemo, useRef } from 'react';
import type { PlayableEvent } from '../lib/player/model';
import { useMasterClock } from '../hooks/useMasterClock';
import { snapshotElement } from '../lib/export/snapshot';
import { CameraGrid } from './CameraGrid';
import { TelemetryOverlay } from './TelemetryOverlay';
import { TransportControls } from './TransportControls';
import { RouteMap } from './RouteMap';

interface Props {
  event: PlayableEvent;
  onError: (msg: string) => void;
}

/**
 * The full player surface, shared by real-folder and demo modes:
 * synchronized camera grid + telemetry overlay + transport + route map.
 */
export function Player({ event, onError }: Props) {
  const clock = useMasterClock(event.durationSec);
  // Map camera -> live DOM element so we can snapshot the current frame.
  const canvasMap = useRef(new Map<string, HTMLCanvasElement>());

  const registerCanvas = useCallback(
    (camera: string, canvas: HTMLCanvasElement | null) => {
      if (canvas) canvasMap.current.set(camera, canvas);
      else canvasMap.current.delete(camera);
    },
    [],
  );

  const segmentBoundaries = useMemo(() => {
    // Boundaries from the first video track's segments (demo has none).
    const vid = event.tracks.find((t) => t.kind === 'video' && t.segments);
    if (!vid?.segments) return [];
    return vid.segments.slice(1).map((s) => s.startSec);
  }, [event]);

  const handleSnapshot = useCallback(() => {
    try {
      const cam = event.cameras[0];
      // Prefer a registered procedural canvas; else snapshot the first video.
      const canvas = canvasMap.current.get(cam);
      const stamp = Math.round(clock.time * 1000);
      const base = `${event.id}-${cam}-${stamp}ms.png`;
      if (canvas) {
        void snapshotElement(canvas, base);
        return;
      }
      const video = document.querySelector<HTMLVideoElement>(
        `video[data-camera="${cam}"]`,
      );
      if (video) void snapshotElement(video, base);
      else onError('No camera frame available to snapshot.');
    } catch (err) {
      onError((err as Error).message);
    }
  }, [event, clock, onError]);

  return (
    <div className="player">
      <div className="stage">
        <div className="stage-grid">
          <CameraGrid event={event} clock={clock} registerCanvas={registerCanvas} />
          <div className="overlay-layer">
            <TelemetryOverlay telemetry={event.telemetry} clock={clock} />
          </div>
        </div>
        <aside className="stage-side">
          <RouteMap event={event} />
          <EventDetails event={event} />
        </aside>
      </div>

      <TransportControls
        clock={clock}
        segmentBoundaries={segmentBoundaries}
        onSnapshot={handleSnapshot}
      />
    </div>
  );
}

function EventDetails({ event }: { event: PlayableEvent }) {
  const m = event.metadata;
  return (
    <div className="event-details">
      <h3>{event.title}</h3>
      <dl>
        {m?.reason && (
          <>
            <dt>Reason</dt>
            <dd>{m.reason}</dd>
          </>
        )}
        {m?.city && (
          <>
            <dt>City</dt>
            <dd>{m.city}</dd>
          </>
        )}
        {typeof m?.est_lat === 'number' && typeof m?.est_lon === 'number' && (
          <>
            <dt>Location</dt>
            <dd>
              {m.est_lat.toFixed(4)}, {m.est_lon.toFixed(4)}
            </dd>
          </>
        )}
        <dt>Cameras</dt>
        <dd>{event.cameras.length}</dd>
        <dt>Duration</dt>
        <dd>{Math.round(event.durationSec)}s</dd>
      </dl>
    </div>
  );
}
