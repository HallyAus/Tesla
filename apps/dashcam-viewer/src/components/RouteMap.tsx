import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { PlayableEvent } from '../lib/player/model';
import { trackRoute } from '../lib/telemetry/sample';

/** Free raster style using OpenStreetMap tiles — no API key required. */
const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

interface Props {
  event: PlayableEvent;
}

/**
 * MapLibre GL map showing the event GPS location and (when telemetry has GPS)
 * the driven route polyline. Falls back to a message when no coordinates exist.
 */
export function RouteMap({ event }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const lat = event.metadata?.est_lat;
  const lon = event.metadata?.est_lon;
  const route = trackRoute(event.telemetry);
  const hasPoint = typeof lat === 'number' && typeof lon === 'number';

  useEffect(() => {
    if (!containerRef.current || !hasPoint) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [lon!, lat!],
      zoom: 14,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.on('load', () => {
      // Event marker.
      new maplibregl.Marker({ color: '#e82127' })
        .setLngLat([lon!, lat!])
        .setPopup(
          new maplibregl.Popup().setText(
            event.metadata?.city ?? event.title,
          ),
        )
        .addTo(map);

      // Route polyline, if telemetry carried GPS.
      if (route.length > 1) {
        map.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: route },
          },
        });
        map.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#3aa0ff', 'line-width': 4 },
        });
        const b = route.reduce(
          (acc, c) => acc.extend(c as [number, number]),
          new maplibregl.LngLatBounds(
            route[0] as [number, number],
            route[0] as [number, number],
          ),
        );
        map.fitBounds(b, { padding: 40, maxZoom: 16, duration: 0 });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, hasPoint, lat, lon]);

  if (!hasPoint) {
    return (
      <div className="map map--empty">
        <span>No GPS location in event.json</span>
      </div>
    );
  }

  return <div ref={containerRef} className="map" />;
}
