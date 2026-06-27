# Architecture

Two independent products share this monorepo. They do **not** depend on each other at runtime;
they're grouped because they serve the same user (a Tesla owner who wants private dashcam review
and long-term vehicle tracking).

```
┌───────────────────────────────┐        ┌─────────────────────────────────────────┐
│  Product 1: Dashcam Viewer    │        │  Product 2: Tesla Tracker (HA)          │
│  apps/dashcam-viewer          │        │  custom_components/tesla_tracker        │
│                               │        │                                         │
│  Browser (no server)          │        │  Home Assistant                         │
│   File System Access API      │        │   tesla_fleet (official) ── entities    │
│      │ reads USB TeslaCam     │        │        │ odometer, lat/lon, state       │
│      ▼                        │        │        ▼                                │
│   Clip parser ──► sync grid   │        │   Tracker coordinator                   │
│      ├─ telemetry overlay     │        │     ├─ drive detection (start/stop)     │
│      ├─ route map (event.json)│        │     ├─ aggregation (day/week/month km)  │
│      └─ export                │        │     ├─ route history store (prev days)  │
│                               │        │     └─ sensors + Lovelace dashboard     │
└───────────────────────────────┘        └─────────────────────────────────────────┘
        100% local                                lives inside your HA instance
```

---

## Product 1 — Dashcam Viewer

### Goal
Open a `TeslaCam` folder and review events with all cameras synchronized, telemetry overlaid,
and the route on a map — entirely client-side.

### How Tesla stores footage
A USB drive formatted for TeslaCam contains a `TeslaCam/` directory with three event buckets:

```
TeslaCam/
├── RecentClips/
├── SavedClips/
│   └── 2024-01-15_14-30-00/
│       ├── event.json
│       ├── 2024-01-15_14-30-00-front.mp4
│       ├── 2024-01-15_14-30-00-back.mp4
│       ├── 2024-01-15_14-30-00-left_repeater.mp4
│       ├── 2024-01-15_14-30-00-right_repeater.mp4
│       ├── 2024-01-15_14-30-00-left_pillar.mp4
│       └── 2024-01-15_14-30-00-right_pillar.mp4
└── SentryClips/
```

- **Clip files** are 1-minute `.mp4` segments. The leading timestamp (`YYYY-MM-DD_HH-MM-SS`) groups
  the cameras of a single segment; an event is a run of consecutive segments.
- **`event.json`** carries `timestamp`, `city`, `est_lat`, `est_lon`, `reason`, and `camera`
  (the camera index that triggered a Sentry event).

### Design
- **Stack:** Vite + React + TypeScript. No backend.
- **File access:** `window.showDirectoryPicker()` (File System Access API) to read the folder tree
  without uploading; a drag-and-drop / `<input webkitdirectory>` fallback is provided.
- **Parser** (`src/lib/teslacam/`): walks the directory, groups files by timestamp into segments,
  groups segments into events, and parses each `event.json`.
- **Playback:** one `<video>` per camera, driven by a single master clock so all cameras stay in
  sync; a timeline scrubber spans a whole event across segment boundaries.
- **Telemetry overlay:** speed / steering / brake / Autopilot, sourced from event metadata where
  available (newer firmware embeds telemetry; the overlay degrades gracefully when absent).
- **Route map:** MapLibre GL drawing the GPS points / `est_lat,est_lon` from the events.
- **Export:** capture the current composited frame / clip (MVP: single-camera + frame snapshot;
  multi-camera mux is a documented follow-up).

### MVP slice (this pass)
Bundled sample event under `public/sample-clips/` → user clicks "Load sample" → synced grid plays,
telemetry overlay renders, route map shows the event location.

### Embedding inside Home Assistant (sidebar panel)
The same static viewer is **bundled into the Tesla Tracker integration** so it appears as a
**Dashcam Viewer** item (`mdi:cctv`) in the HA sidebar — without the two products coupling at
runtime. The wiring is one-directional and build-time only:

- `scripts/build_panel.sh` runs the viewer build (`npm run build`) and copies `dist/` into
  `custom_components/tesla_tracker/panel/`. That bundle is **committed**, because HACS/HA cannot
  run `npm`. Vite's `base: './'` makes every asset URL relative, so the bundle works from HA's
  arbitrary static mount path.
- The integration (`panel.py`) serves `panel/` via `hass.http.async_register_static_paths`
  (`StaticPathConfig`, with a legacy `register_static_path` fallback) at `/tesla_tracker_panel`,
  then registers an `iframe` built-in panel
  (`frontend.async_register_built_in_panel(hass, "iframe", …)`) pointing at the served
  `index.html`. Registration is **ref-counted** across config entries (one shared panel) and the
  panel is removed via `async_remove_panel` when the last holder unloads. An options toggle
  ("Show dashcam viewer panel", default on) lets users disable it.
- **Secure-context caveat.** Because the panel is served **same-origin** from HA, the browser's
  File System Access API works inside the iframe — but only in a **secure context** (HTTPS /
  `localhost`, e.g. Nabu Casa Remote). On plain-HTTP LAN access the viewer auto-detects the
  insecure context (`src/lib/teslacam/secureContext.ts`, a pure unit-tested helper) and promotes
  **drag-and-drop** as the primary path with a friendly note. **Footage never leaves the
  browser** in either path — there is no upload and no server round-trip for video.

---

## Product 2 — Tesla Tracker (Home Assistant)

### Goal
Daily / weekly / monthly tracking of kilometres, drives, and routes — including previous days —
on top of data Home Assistant already gets from the official **Tesla Fleet** integration.

### Why build on `tesla_fleet`
The official integration handles Tesla Fleet API auth and exposes live entities (odometer,
location, charge, shift state). We do **not** re-implement Tesla auth or polling. We consume those
entities and add the analytics layer Tesla/HA don't provide out of the box.

### Design
- **Config flow** (`config_flow.py`): pick the source odometer + tracker entities from the
  `tesla_fleet` integration; choose units (km/mi) and a daily reset time.
- **Coordinator** (`coordinator.py`): subscribes to source-entity state changes; detects **drive
  start/stop** from shift state + odometer/position deltas; records each drive (start/end time,
  distance, polyline of positions).
- **Aggregation core** (`aggregation.py`): a **pure-Python**, HA-independent module that turns a
  list of drives into day / week / month rollups (distance, drive count, duration). Pure so it is
  unit-testable with plain `pytest` (no Home Assistant import needed).
- **Persistence** (`store.py`): HA `Store` (JSON) keeps drive + route history across restarts so
  "previous days" survive — independent of the recorder's purge window.
- **Sensors** (`sensor.py`): `sensor.tesla_tracker_distance_today`,
  `..._this_week`, `..._this_month`, `..._yesterday`, plus drive count / last-route attributes.
  Distance sensors are `total_increasing` where appropriate so HA long-term statistics work too.
- **Dashboard** (`dashboards/`): Lovelace cards for today/week/month, a history table, and a map
  card of recent routes.

### MVP slice (this pass)
`aggregation.py` + a sample drive dataset → pytest proves day/week/month/yesterday rollups are
correct; sensors and config flow wire it into HA; the dashboard YAML renders it.

---

## Conventions
- The two products are independently buildable; CI (future) runs `npm` checks for the viewer and
  `pytest` for the tracker's pure core.
- Secrets (Tesla tokens) are never stored in this repo — they live in the user's Home Assistant.
