import { lazy, Suspense } from 'react';
import type { PlayableEvent } from '../lib/player/model';
import { trackRoute } from '../lib/telemetry/sample';

/**
 * Code-split wrapper for the MapLibre-backed route map.
 *
 * MapLibre GL JS is by far the heaviest dependency in the app (~600 kB). It is
 * only needed when an event actually has GPS coordinates, so we `React.lazy()`
 * the implementation: the initial bundle stays small and MapLibre is fetched on
 * demand the first time a located event is shown. Events without coordinates
 * never load it at all.
 */
const RouteMapImpl = lazy(() => import('./RouteMapImpl'));

interface Props {
  event: PlayableEvent;
}

export function RouteMap({ event }: Props) {
  const lat = event.metadata?.est_lat;
  const lon = event.metadata?.est_lon;
  const hasPoint = typeof lat === 'number' && typeof lon === 'number';
  const hasRoute = trackRoute(event.telemetry).length > 1;

  if (!hasPoint && !hasRoute) {
    return (
      <div className="map map--empty">
        <span>No GPS location in event.json</span>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="map map--empty">
          <span>Loading map…</span>
        </div>
      }
    >
      <RouteMapImpl event={event} />
    </Suspense>
  );
}
