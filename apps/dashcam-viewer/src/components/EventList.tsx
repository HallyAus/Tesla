import { useMemo } from 'react';
import type { ClipBucket, ClipEvent } from '../lib/teslacam/types';
import { formatReason } from '../lib/telemetry/fromEvent';
import { formatTime } from '../lib/player/timeline';

interface Props {
  events: ClipEvent[];
  selectedId: string | null;
  onSelect: (ev: ClipEvent) => void;
}

const BUCKET_LABEL: Record<ClipBucket, string> = {
  RecentClips: 'Recent',
  SavedClips: 'Saved',
  SentryClips: 'Sentry',
};

const BUCKET_ORDER: ClipBucket[] = ['SentryClips', 'SavedClips', 'RecentClips'];

/** A small emoji icon for the trigger reason / bucket. */
function reasonIcon(ev: ClipEvent): string {
  const r = (ev.metadata?.reason ?? '').toLowerCase();
  if (r.includes('object')) return '👁';
  if (r.includes('accel') || r.includes('impact')) return '💥';
  if (r.includes('honk')) return '📣';
  if (ev.bucket === 'SentryClips') return '🛡';
  if (ev.bucket === 'SavedClips') return '⭐';
  return '🎞';
}

/** Sidebar list of parsed events, grouped by bucket (Sentry / Saved / Recent). */
export function EventList({ events, selectedId, onSelect }: Props) {
  const groups = useMemo(() => {
    const byBucket = new Map<ClipBucket, ClipEvent[]>();
    for (const ev of events) {
      const arr = byBucket.get(ev.bucket) ?? [];
      arr.push(ev);
      byBucket.set(ev.bucket, arr);
    }
    return BUCKET_ORDER.filter((b) => byBucket.has(b)).map((b) => ({
      bucket: b,
      events: byBucket.get(b)!,
    }));
  }, [events]);

  return (
    <div className="event-groups">
      {groups.map((g) => (
        <section key={g.bucket} className="event-group">
          <h3 className="event-group-title">
            {BUCKET_LABEL[g.bucket]}
            <span className="count">{g.events.length}</span>
          </h3>
          <ul className="event-list">
            {g.events.map((ev) => {
              const reason = formatReason(ev.metadata?.reason);
              return (
                <li key={ev.id + ev.bucket}>
                  <button
                    className={`event-row ${ev.id === selectedId ? 'event-row--active' : ''}`}
                    onClick={() => onSelect(ev)}
                    aria-current={ev.id === selectedId ? 'true' : undefined}
                  >
                    <span className="event-thumb" aria-hidden="true">
                      {reasonIcon(ev)}
                    </span>
                    <span className="event-text">
                      <span className="event-when">{ev.startTime.toLocaleString()}</span>
                      <span className="event-meta">
                        {ev.metadata?.city ? `${ev.metadata.city} · ` : ''}
                        {ev.cameras.length} cam · {formatTime(ev.durationSec)}
                      </span>
                      {reason && <span className="event-reason">{reason}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
