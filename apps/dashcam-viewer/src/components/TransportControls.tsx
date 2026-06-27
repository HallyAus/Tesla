import type { MasterClock } from '../hooks/useMasterClock';

const RATES = [0.25, 0.5, 1, 2, 4];

function fmt(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Props {
  clock: MasterClock;
  /** Segment boundaries (seconds) to mark on the scrubber. */
  segmentBoundaries?: number[];
  onSnapshot?: () => void;
}

/**
 * Play/pause, an event-spanning scrubber that crosses segment boundaries, a
 * speed selector, and the snapshot-export trigger.
 */
export function TransportControls({ clock, segmentBoundaries = [], onSnapshot }: Props) {
  return (
    <div className="transport">
      <button
        className="btn btn--play"
        onClick={clock.toggle}
        aria-label={clock.isPlaying ? 'Pause' : 'Play'}
      >
        {clock.isPlaying ? '❚❚' : '►'}
      </button>

      <span className="time">{fmt(clock.time)}</span>

      <div className="scrub-wrap">
        <input
          className="scrub"
          type="range"
          min={0}
          max={clock.durationSec}
          step={0.05}
          value={clock.time}
          onChange={(e) => clock.seek(Number(e.target.value))}
        />
        {segmentBoundaries.map((b) => (
          <span
            key={b}
            className="seg-mark"
            style={{ left: `${(b / clock.durationSec) * 100}%` }}
            title={`Segment @ ${fmt(b)}`}
          />
        ))}
      </div>

      <span className="time">{fmt(clock.durationSec)}</span>

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

      {onSnapshot && (
        <button className="btn" onClick={onSnapshot}>
          Snapshot PNG
        </button>
      )}
    </div>
  );
}
