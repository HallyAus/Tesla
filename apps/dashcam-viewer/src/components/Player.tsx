import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PlayableEvent } from '../lib/player/model';
import { timelineSegmentsFor } from '../lib/player/model';
import type { CameraName } from '../lib/teslacam/types';
import { useMasterClock } from '../hooks/useMasterClock';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import {
  defaultLayoutFor,
  resolveLayout,
  promoteToFocus,
  type LayoutId,
} from '../lib/player/layout';
import {
  formatTime,
  nextSegmentStart,
  prevSegmentStart,
  seekToPercent,
  segmentBoundaries,
  stepFrame,
  totalDuration,
} from '../lib/player/timeline';
import { telemetryFromEvent } from '../lib/telemetry/fromEvent';
import { snapshotElement } from '../lib/export/snapshot';
import {
  drawComposite,
  type CompositeSource,
} from '../lib/export/composite';
import {
  downloadBlob,
  isRecordingSupported,
  recordCompositeClip,
} from '../lib/export/recordClip';
import { clipFileName, snapshotFileName } from '../lib/export/filename';
import { CameraGrid, CAMERA_LABELS, type ElementRef } from './CameraGrid';
import { TelemetryOverlay } from './TelemetryOverlay';
import { TransportControls, type TimelineMarker } from './TransportControls';
import { LayoutSwitcher } from './LayoutSwitcher';
import { ShortcutsHelp } from './ShortcutsHelp';
import { RouteMap } from './RouteMap';

interface Props {
  event: PlayableEvent;
  onError: (msg: string) => void;
}

const COMPOSITE_W = 1280;
const COMPOSITE_H = 720;

/**
 * The full player surface, shared by real-folder and demo modes:
 * layout switcher + synchronized camera grid + telemetry overlay + transport +
 * route map, with keyboard shortcuts, fullscreen, and multi-camera export.
 */
export function Player({ event, onError }: Props) {
  // Measured per-segment durations override the 60s default once metadata loads.
  const [measured, setMeasured] = useState<Record<number, number>>({});

  const segments = useMemo(() => {
    const base = timelineSegmentsFor(event);
    if (base.length === 0) return base;
    // Recompute offsets from measured durations where known.
    let offset = 0;
    return base.map((s, i) => {
      const dur = measured[i] ?? s.durationSec;
      const out = { startSec: offset, durationSec: dur };
      offset += dur;
      return out;
    });
  }, [event, measured]);

  const duration = useMemo(
    () => totalDuration(segments, event.durationSec),
    [segments, event.durationSec],
  );

  const clock = useMasterClock(duration);

  const [layout, setLayout] = useState<LayoutId>(() =>
    defaultLayoutFor(event.cameras),
  );
  const [focus, setFocus] = useState<CameraName | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const elements = useRef(new Map<CameraName, ElementRef>());
  const abortRef = useRef<AbortController | null>(null);

  // Reset layout/measurements when the event changes.
  useEffect(() => {
    setLayout(defaultLayoutFor(event.cameras));
    setFocus(null);
    setMeasured({});
    elements.current.clear();
  }, [event.id, event.cameras]);

  const registerElement = useCallback(
    (camera: CameraName, el: ElementRef | null) => {
      if (el) elements.current.set(camera, el);
      else elements.current.delete(camera);
    },
    [],
  );

  const onSegmentDuration = useCallback(
    (_camera: CameraName, segIndex: number, durationSec: number) => {
      if (segIndex < 0) return;
      setMeasured((prev) => {
        // Keep the max across cameras for a given segment index.
        const existing = prev[segIndex];
        if (existing != null && Math.abs(existing - durationSec) < 0.05) return prev;
        const next = Math.max(existing ?? 0, durationSec);
        if (existing === next) return prev;
        return { ...prev, [segIndex]: next };
      });
    },
    [],
  );

  const boundaries = useMemo(() => segmentBoundaries(segments), [segments]);

  const eventInfo = useMemo(
    () => telemetryFromEvent(event.metadata, duration),
    [event.metadata, duration],
  );

  const markers = useMemo<TimelineMarker[]>(() => {
    // The Sentry trigger is at the event start in Tesla's model; surface it.
    if (eventInfo.reasonLabel) {
      return [{ t: 0, label: eventInfo.reasonLabel, kind: 'trigger' }];
    }
    return [];
  }, [eventInfo.reasonLabel]);

  const resolved = useMemo(
    () => resolveLayout(layout, event.cameras, focus),
    [layout, event.cameras, focus],
  );

  // --- compositing helpers --------------------------------------------------

  const collectSources = useCallback((): CompositeSource[] => {
    const out: CompositeSource[] = [];
    for (const cam of resolved.cameras) {
      const el = elements.current.get(cam);
      if (!el) continue;
      const isVideo = el instanceof HTMLVideoElement;
      out.push({
        element: el,
        label: CAMERA_LABELS[cam],
        srcW: isVideo ? el.videoWidth : el.width,
        srcH: isVideo ? el.videoHeight : el.height,
      });
    }
    return out;
  }, [resolved.cameras]);

  // --- export: PNG snapshot of the composite --------------------------------

  const handleSnapshot = useCallback(() => {
    try {
      const sources = collectSources();
      if (sources.length === 0) {
        onError('No camera frame available to snapshot.');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = COMPOSITE_W;
      canvas.height = COMPOSITE_H;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');
      drawComposite(ctx, COMPOSITE_W, COMPOSITE_H, sources, resolved.hasFocus);
      const name = snapshotFileName(event.id, resolved.focus ?? resolved.cameras[0], clock.time);
      void snapshotElement(canvas, name);
    } catch (err) {
      onError((err as Error).message);
    }
  }, [collectSources, resolved, event.id, clock, onError]);

  // --- export: WebM clip of the composite -----------------------------------

  const recordingSupported = useMemo(() => isRecordingSupported(), []);

  const handleExportClip = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    setExportProgress(0);
    const wasPlaying = clock.isPlaying;
    clock.pause();

    const canvas = document.createElement('canvas');
    canvas.width = COMPOSITE_W;
    canvas.height = COMPOSITE_H;
    const ctx = canvas.getContext('2d');
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      if (!ctx) throw new Error('Canvas 2D context unavailable.');
      const result = await recordCompositeClip({
        canvas,
        startSec: 0,
        endSec: duration,
        fps: 30,
        signal: abort.signal,
        drawFrame: (t) => {
          // Drive the master clock so video tiles seek to `t`, then composite.
          clock.seek(t);
          const sources = collectSources();
          drawComposite(ctx, COMPOSITE_W, COMPOSITE_H, sources, resolved.hasFocus);
        },
        onProgress: setExportProgress,
      });
      downloadBlob(result.blob, clipFileName(event.id, layout, 0, duration));
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onError((err as Error).message);
      }
    } finally {
      abortRef.current = null;
      setExporting(false);
      setExportProgress(0);
      clock.seek(0);
      if (wasPlaying) clock.play();
    }
  }, [exporting, clock, duration, collectSources, resolved.hasFocus, event.id, layout, onError]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // --- focus / layout interactions ------------------------------------------

  const handleActivate = useCallback((camera: CameraName) => {
    const { layout: nextLayout, focus: nextFocus } = promoteToFocus(camera);
    setLayout(nextLayout);
    setFocus(nextFocus);
  }, []);

  const handleLayout = useCallback((id: LayoutId) => {
    setLayout(id);
  }, []);

  // --- fullscreen -----------------------------------------------------------

  const toggleFullscreen = useCallback(() => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else if (el.requestFullscreen) {
      void el.requestFullscreen().catch(() => {});
    }
  }, []);

  // --- keyboard shortcuts ---------------------------------------------------

  const shortcuts = useMemo(
    () => ({
      togglePlay: () => clock.toggle(),
      frameStep: (frames: number) =>
        clock.seek(stepFrame(clock.readTime(), frames, duration)),
      prevSegment: () => clock.seek(prevSegmentStart(segments, clock.readTime())),
      nextSegment: () =>
        clock.seek(nextSegmentStart(segments, clock.readTime(), duration)),
      rewind: () => clock.seek(stepFrame(clock.readTime(), -30, duration)),
      forward: () => clock.seek(stepFrame(clock.readTime(), 30, duration)),
      seekPercent: (digit: number) => clock.seek(seekToPercent(digit, duration)),
      toggleFullscreen,
      snapshot: handleSnapshot,
      toggleHelp: () => setShowHelp((v) => !v),
    }),
    [clock, duration, segments, toggleFullscreen, handleSnapshot],
  );

  useKeyboardShortcuts(shortcuts, !exporting);

  return (
    <div className="player">
      <LayoutSwitcher
        layout={layout}
        onLayout={handleLayout}
        cameras={event.cameras}
        focus={resolved.focus}
        onFocus={(c) => setFocus(c)}
      />

      <div className="stage">
        <div className="stage-grid" ref={stageRef}>
          <CameraGrid
            event={event}
            clock={clock}
            layout={layout}
            focus={focus}
            registerElement={registerElement}
            onSegmentDuration={onSegmentDuration}
            onActivate={handleActivate}
          />
          <div className="overlay-layer">
            <TelemetryOverlay
              telemetry={event.telemetry}
              clock={clock}
              reasonLabel={event.source === 'folder' ? eventInfo.reasonLabel : null}
            />
          </div>
          <button
            className="btn btn--icon fs-btn"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            title="Fullscreen (F)"
          >
            ⛶
          </button>
        </div>
        <aside className="stage-side">
          <RouteMap event={event} />
          <EventDetails event={event} reasonLabel={eventInfo.reasonLabel} duration={duration} />
        </aside>
      </div>

      <TransportControls
        clock={clock}
        segmentBoundaries={boundaries}
        markers={markers}
        onSnapshot={handleSnapshot}
        onFrameStep={shortcuts.frameStep}
        onPrevSegment={shortcuts.prevSegment}
        onNextSegment={shortcuts.nextSegment}
        onExportClip={recordingSupported ? handleExportClip : undefined}
        exporting={exporting}
        exportProgress={exportProgress}
      />

      {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function EventDetails({
  event,
  reasonLabel,
  duration,
}: {
  event: PlayableEvent;
  reasonLabel: string | null;
  duration: number;
}) {
  const m = event.metadata;
  return (
    <div className="event-details">
      <h3>{event.title}</h3>
      <dl>
        {reasonLabel && (
          <>
            <dt>Reason</dt>
            <dd>{reasonLabel}</dd>
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
        {m?.camera != null && m.camera !== '' && (
          <>
            <dt>Trigger cam</dt>
            <dd>#{m.camera}</dd>
          </>
        )}
        <dt>Cameras</dt>
        <dd>{event.cameras.length}</dd>
        <dt>Duration</dt>
        <dd>{formatTime(duration)}</dd>
      </dl>
    </div>
  );
}
