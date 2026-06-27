import type { ClipEvent } from '../lib/teslacam/types';

interface Props {
  events: ClipEvent[];
  selectedId: string | null;
  onSelect: (ev: ClipEvent) => void;
}

const BUCKET_LABEL: Record<string, string> = {
  RecentClips: 'Recent',
  SavedClips: 'Saved',
  SentryClips: 'Sentry',
};

/** Sidebar list of parsed events from a real folder. */
export function EventList({ events, selectedId, onSelect }: Props) {
  return (
    <ul className="event-list">
      {events.map((ev) => (
        <li key={ev.id + ev.bucket}>
          <button
            className={`event-row ${ev.id === selectedId ? 'event-row--active' : ''}`}
            onClick={() => onSelect(ev)}
          >
            <span className={`pill pill--${ev.bucket}`}>
              {BUCKET_LABEL[ev.bucket] ?? ev.bucket}
            </span>
            <span className="event-when">{ev.startTime.toLocaleString()}</span>
            <span className="event-meta">
              {ev.metadata?.city ? `${ev.metadata.city} · ` : ''}
              {ev.cameras.length} cam · {Math.round(ev.durationSec)}s
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
