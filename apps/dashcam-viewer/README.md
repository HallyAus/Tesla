# TeslaCam Viewer

A local-first, in-browser TeslaCam / Sentry footage viewer. It opens a real
`TeslaCam` USB folder, plays all cameras in sync, overlays telemetry, draws the
event location on a map, and exports stills and combined multi-camera clips.

**100% client-side. No backend. No upload.** Your footage never leaves your machine —
files are read directly in the browser via the File System Access API.

## Features

- **Folder loading** of a real `TeslaCam` directory via `window.showDirectoryPicker()`
  (File System Access API), with graceful fallback to `<input webkitdirectory>` and
  drag-and-drop. Unsupported browsers get a clear message; permission denials are
  surfaced explicitly.
- **TeslaCam parser** (`src/lib/teslacam/`): walks the tree, recognizes
  `RecentClips` / `SavedClips` / `SentryClips`, groups `.mp4` files by their
  `YYYY-MM-DD_HH-MM-SS` prefix into **segments**, groups consecutive segments into
  **events**, and parses `event.json` (`timestamp, city, est_lat, est_lon, reason, camera`).
  Cameras handled: `front, back, left_repeater, right_repeater, left_pillar, right_pillar`.
  The module is pure/typed and unit-tested.
- **Event sidebar** grouped by bucket (**Sentry / Saved / Recent**), each row showing
  date/time, a reason icon, city, camera count, duration, and the humanized trigger
  reason.
- **Synchronized multi-camera grid** driven by a single **master clock**, so cameras
  never drift, even across segment boundaries.
- **Camera layout presets**:
  - **Full front** — one large front camera.
  - **Front + back**.
  - **4-up** — front / back / left + right repeaters.
  - **6-up** — all cameras including the B-pillars.
  - **Focus** — one large tile plus a thumbnail strip; pick the focus camera, or
    **click any tile to promote it** to the large slot.
- **Timeline / scrubbing**: an event-spanning timeline showing **segment boundaries**
  and **event markers** (e.g. the Sentry trigger), click-to-seek, **frame stepping**
  (← / →), previous/next-segment jumps, and current-time / total-duration readouts.
  Real video durations from `loadedmetadata` drive the timeline (falling back to the
  60 s/segment default until metadata loads).
- **Telemetry overlay**: a speed / steering / brake / accelerator / Autopilot HUD for
  events that carry a full driving track (the demo). For real folders it surfaces
  everything `event.json` actually provides (reason, city, trigger camera, estimated
  location) and shows an honest **"location only"** state rather than fake gauges.
- **Route map**: MapLibre GL JS with a free OpenStreetMap raster style (no API key),
  marking `est_lat/est_lon` and drawing the GPS route polyline when telemetry has GPS.
  The map is **code-split / lazy-loaded** so it is only fetched when a located event
  is shown.
- **Export**:
  - **Snapshot PNG** — composites the *active layout* onto one canvas and downloads it.
  - **Export WebM clip** — composites the active layout onto a canvas, records it with
    `canvas.captureStream()` + `MediaRecorder`, shows a progress bar, and downloads a
    combined `.webm`. Feature-detected; the button is hidden when unsupported.
- **Keyboard shortcuts** + an in-app **shortcuts help overlay** (`?`).
- **Fullscreen** for the player stage (`F` or the ⛶ button).
- **UI/UX**: cohesive dark theme, loading states, explicit empty/error/permission
  states, responsive layout, focus-visible outlines, ARIA labels, keyboard-navigable
  controls, and `prefers-reduced-motion` respected by the demo animation.
- **Sample / demo mode**: a "Load sample event" button that ships **no `.mp4` files**.
  Each camera feed is synthesized procedurally on a `<canvas>` driven by the same
  master clock, paired with a realistic generated `event.json` and a synthetic
  telemetry track. Demo and real-folder playback share the same components.

## Keyboard shortcuts

| Key            | Action                          |
| -------------- | ------------------------------- |
| `Space` / `K`  | Play / pause                    |
| `←` / `→`      | Step one frame back / forward   |
| `,` / `.`      | Previous / next segment         |
| `J` / `L`      | Rewind / fast-forward (~1 s)    |
| `0` – `9`      | Seek to 0 % – 90 %              |
| `F`            | Toggle fullscreen               |
| `S`            | Snapshot current frame (PNG)    |
| `?`            | Toggle the shortcuts overlay    |

Shortcuts are ignored while typing in a form field.

## Setup

```bash
cd apps/dashcam-viewer
npm install
npm run dev      # start the dev server (Vite)
npm run build    # type-check (tsc -b) + production bundle
npm run preview  # serve the production build
npm test         # run the Vitest unit tests
npm run lint     # tsc --noEmit type-check
```

Requires Node 18+.

## Browser support

| Capability                         | Chrome / Edge | Firefox       | Safari        |
| ---------------------------------- | ------------- | ------------- | ------------- |
| File System Access folder picker   | ✅            | ❌ (falls back) | ❌ (falls back) |
| `<input webkitdirectory>` fallback | ✅            | ✅            | ✅            |
| Drag-and-drop folder               | ✅            | ✅ (most)     | ✅ (most)     |
| Synced playback / map / overlay    | ✅            | ✅            | ✅            |
| Multi-camera **WebM** export       | ✅            | ✅            | ⚠️ partial¹   |
| PNG snapshot export                | ✅            | ✅            | ✅            |

¹ WebM/`MediaRecorder` support varies on Safari; the **Export WebM clip** button is
feature-detected and hidden when `MediaRecorder` + a WebM codec are unavailable. PNG
snapshot always works.

The File System Access API (`showDirectoryPicker`) is Chromium-only today. Other
browsers automatically use the `webkitdirectory` / drag-and-drop fallback, which
loads the same data through the same parser.

> **Codecs:** real TeslaCam clips are H.264 `.mp4`, which every modern browser can play.

## Privacy

- Nothing is uploaded. There is no server and no network call for your footage.
- Clips are read with `URL.createObjectURL` and played locally; object URLs are
  revoked when you switch events/sources.
- Exports (PNG / WebM) are generated entirely in the browser and downloaded locally.
- The only outbound requests are OpenStreetMap map tiles, and only when an event has
  GPS coordinates (the map module is lazy-loaded, so without a located event MapLibre
  is never even fetched). Remove the map if you want a fully offline build.

## Architecture notes

- `src/lib/teslacam/` — pure parser (`parse.ts`) + browser directory walking
  (`loadDirectory.ts`). The pure half has no DOM dependency and is unit-tested.
- `src/lib/player/model.ts` — a `PlayableEvent` abstraction that both real folders
  (`fromLibrary.ts`) and the demo generator (`src/lib/demo/generate.ts`) produce, so
  the grid / overlay / map components are identical across modes.
- `src/lib/player/layout.ts` — pure layout-preset selection (which cameras, focus
  promotion). Unit-tested.
- `src/lib/player/timeline.ts` — pure timeline math (segment boundaries, frame
  stepping, seek-percent, time formatting). Unit-tested.
- `src/lib/export/` — `composite.ts` (pure tile-rect geometry, unit-tested) +
  `recordClip.ts` (MediaRecorder capture) + `snapshot.ts` (PNG) + `filename.ts`
  (pure filename/codec helpers, unit-tested).
- `src/lib/telemetry/fromEvent.ts` — maps a real `event.json` into a GPS-only
  telemetry track + humanized reason, **without fabricating driving data**. Unit-tested.
- `src/hooks/useMasterClock.ts` — the single source of playback truth (rAF-driven,
  rate-scaled). Video tiles correct toward it; procedural tiles render from it.
- `src/hooks/useKeyboardShortcuts.ts` — global shortcut wiring.

### Bundle / performance

MapLibre GL JS is by far the heaviest dependency. It is `React.lazy()`-loaded
(`components/RouteMap.tsx`) and split into its own vendor chunk, so the **initial
entry chunk is ~42 kB** (gzip ~15 kB) instead of a single ~970 kB bundle. MapLibre
(~800 kB) is fetched on demand only for located events.

## Known limitations (honest)

- **No per-frame driving telemetry from real clips.** Tesla's `event.json` does **not**
  contain a speed/steering/pedal stream, and newer firmware's embedded telemetry is not
  extractable client-side today. For real folders we therefore surface only what
  `event.json` genuinely provides (reason, city, trigger camera, estimated GPS) and show
  a "location only" overlay state — we never fabricate gauge data. The full HUD with
  live gauges is exercised by the **demo** event, which ships a synthetic track. The
  overlay already consumes a generic `TelemetryTrack`, so if a real extractor becomes
  feasible, only the extractor is missing.
- **WebM export is a real-time canvas capture**, not a frame-accurate mux/encode. It
  records the composited canvas via `MediaRecorder` while stepping the clock, so a clip
  takes roughly its own playback duration to produce and is VP8/VP9 WebM (not `.mp4`).
  A future upgrade could use `ffmpeg.wasm` for true offline mux/encode and `.mp4` output.
- **Segment durations** default to 60 s until each segment's video metadata loads; the
  timeline refines itself as clips report `loadedmetadata`.
- **Very large drives** are parsed on the main thread. Worker-based parsing and
  thumbnail/keyframe previews are future work.
