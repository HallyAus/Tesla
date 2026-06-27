import type { MasterClock } from '../hooks/useMasterClock';
import { formatTime, timeToFraction } from '../lib/player/timeline';

const RATES = [0.25, 0.5, 1, 2, 4];

export interface TimelineMarker {
  readonly t: number;
  readonly label: string;
  readonly kind: 'trigger';
}

interface Props {
  clock: MasterClock;
  /** Segment boundaries (seconds) to mark on the scrubber. */
  segmentBoundaries?: number[];
  /** Event markers (e.g. Sentry trigger). */
  markers?: TimelineMarker[];
  onSnapshot?: () => void;
  onFrameStep?: (frames: number) => void;
  onPrevSegment?: () => void;
  onNextSegment?: () => void;
  /** Export-clip controls (omitted when recording is unsupported). */
  onExportClip?: () => void;
  exporting?: boolean;
  exportProgress?: number;
}

/**
 * Play/pause, frame-step + segment-jump buttons, an event-spanning timeline
 * with segment boundaries and event markers, current time / total duration, a
 * speed selector, and the snapshot + clip-export triggers.
 */
export function TransportControls({
  clock,
  segmentBoundaries = [],
  markers = [],
  onSnapshot,
  onFrameStep,
  onPrevSegment,
  onNextSegment,
  onExportClip,
  exporting = false,
  exportProgress = 0,
}: Props) {
  const duration = clock.durationSec;
  return (
    <div className="transport">
      <div className="transport-row">
        <button
          className="btn btn--icon"
          onClick={onPrevSegment}
          aria-label="Previous segment"
          title="Previous segment (,)"
          disabled={!onPrevSegment}
        >
          ⏮
        </button>
        <button
          className="btn btn--icon"
          onClick={() => onFrameStep?.(-1)}
          aria-label="Step back one frame"
          title="Frame back (←)"
          disabled={!onFrameStep}
        >
          ◀|
        </button>
        <button
          className="btn btn--play"
          onClick={clock.toggle}
          aria-label={clock.isPlaying ? 'Pause' : 'Play'}
          title="Play / pause (space)"
        >
          {clock.isPlaying ? '❚❚' : '►'}
        </button>
        <button
          className="btn btn--icon"
          onClick={() => onFrameStep?.(1)}
          aria-label="Step forward one frame"
          title="Frame forward (→)"
          disabled={!onFrameStep}
        >
          |▶
        </button>
        <button
          className="btn btn--icon"
          onClick={onNextSegment}
          aria-label="Next segment"
          title="Next segment (.)"
          disabled={!onNextSegment}
        >
          ⏭
        </button>

        <span className="time" aria-label="Current time">
          {formatTime(clock.time)}
        </span>

        <div className="scrub-wrap">
          <div className="scrub-track" aria-hidden="true">
            <div
              className="scrub-played"
              style={{ width: `${timeToFraction(clock.time, duration) * 100}%` }}
            />
          </div>
          <input
            className="scrub"
            type="range"
            min={0}
            max={duration || 0}
            step={0.05}
            value={clock.time}
            onChange={(e) => clock.seek(Number(e.target.value))}
            aria-label="Seek"
            aria-valuetext={`${formatTime(clock.time)} of ${formatTime(duration)}`}
          />
          {segmentBoundaries.map((b) => (
            <span
              key={`seg-${b}`}
              className="seg-mark"
              style={{ left: `${timeToFraction(b, duration) * 100}%` }}
              title={`Segment @ ${formatTime(b)}`}
            />
          ))}
          {markers.map((m) => (
            <span
              key={`mk-${m.t}-${m.label}`}
              className="event-mark"
              style={{ left: `${timeToFraction(m.t, duration) * 100}%` }}
              title={`${m.label} @ ${formatTime(m.t)}`}
            />
          ))}
        </div>

        <span className="time" aria-label="Total duration">
          {formatTime(duration)}
        </span>

        <select
          className="rate"
          value={clock.playbackRate}
          onChange={(e) => clock.setRate(Number(e.target.value))}
          aria-label="Playback speed"
        >
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </div>

      <div className="transport-row transport-row--export">
        {onSnapshot && (
          <button className="btn" onClick={onSnapshot} title="Snapshot (S)">
            Snapshot PNG
          </button>
        )}
        {onExportClip && (
          <button className="btn btn--accent" onClick={onExportClip} disabled={exporting}>
            {exporting ? 'Recording…' : 'Export WebM clip'}
          </button>
        )}
        {exporting && (
          <div className="export-progress" role="progressbar" aria-valuenow={Math.round(exportProgress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="export-progress-fill" style={{ width: `${exportProgress * 100}%` }} />
            <span className="export-progress-label">{Math.round(exportProgress * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
