# TeslaCam Viewer

A local-first, in-browser TeslaCam / Sentry footage viewer — our open version of
[tesclip.com](https://tesclip.com/). It opens a real `TeslaCam` USB folder, plays
all cameras in sync, overlays telemetry, and draws the event location on a map.

**100% client-side. No backend. No upload.** Your footage never leaves your machine —
files are read directly in the browser via the File System Access API.

## Features

- **Folder loading** of a real `TeslaCam` directory via `window.showDirectoryPicker()`
  (File System Access API), with graceful fallback to `<input webkitdirectory>` and
  drag-and-drop. Unsupported browsers get a clear message.
- **TeslaCam parser** (`src/lib/teslacam/`): walks the tree, recognizes
  `RecentClips` / `SavedClips` / `SentryClips`, groups `.mp4` files by their
  `YYYY-MM-DD_HH-MM-SS` prefix into **segments**, groups consecutive segments into
  **events**, and parses `event.json` (`timestamp, city, est_lat, est_lon, reason, camera`).
  Cameras handled: `front, back, left_repeater, right_repeater, left_pillar, right_pillar`.
  The module is pure/typed and unit-tested.
- **Synchronized multi-camera grid**: one `<video>` per camera driven by a single
  **master clock**, with play/pause, an event-spanning scrubber that crosses segment
  boundaries, and variable playback speed (0.25×–4×). Videos continuously re-sync to
  the master clock so cameras don't drift.
- **Telemetry overlay**: speed / steering / brake / accelerator / Autopilot HUD that
  reads a telemetry track when present and degrades gracefully (clear "no telemetry"
  state) when absent.
- **Route map**: MapLibre GL JS with a free OpenStreetMap raster style (no API key),
  marking `est_lat/est_lon` and drawing the GPS route polyline when telemetry has GPS.
- **Export**: "Snapshot PNG" of the current frame for the lead camera (canvas → PNG).
- **Sample / demo mode**: a "Load sample event" button that ships **no `.mp4` files**.
  Each camera feed is synthesized procedurally on a `<canvas>` (moving scene +
  burned-in camera label + live timestamp) driven by the same master clock, paired with
  a realistic generated `event.json` and a synthetic telemetry track. Demo mode and
  real-folder playback share the same player / overlay / map components.

## Setup

```bash
cd apps/dashcam-viewer
npm install
npm run dev      # start the dev server (Vite)
npm run build    # type-check (tsc -b) + production bundle
npm run preview  # serve the production build
npm test         # run the Vitest parser/telemetry unit tests
npm run lint     # tsc --noEmit type-check
```

Requires Node 18+.

## Browser support

| Capability                         | Chrome / Edge | Firefox / Safari |
| ---------------------------------- | ------------- | ---------------- |
| File System Access folder picker   | ✅            | ❌ (falls back)  |
| `<input webkitdirectory>` fallback | ✅            | ✅               |
| Drag-and-drop folder               | ✅            | ✅ (most)        |
| Demo mode / playback / map         | ✅            | ✅               |

The File System Access API (`showDirectoryPicker`) is Chromium-only today. Other
browsers automatically use the `webkitdirectory` / drag-and-drop fallback, which
loads the same data through the same parser.

> **Codecs:** real TeslaCam clips are H.264 `.mp4`, which every modern browser can play.

## Privacy

- Nothing is uploaded. There is no server and no network call for your footage.
- Clips are read with `URL.createObjectURL` and played locally; object URLs are
  revoked when you switch events/sources.
- The only outbound requests are OpenStreetMap map tiles (only when an event has GPS
  coordinates). Remove the map if you want a fully offline build.

## Architecture notes

- `src/lib/teslacam/` — pure parser (`parse.ts`) + browser directory walking
  (`loadDirectory.ts`). The pure half has no DOM dependency and is unit-tested.
- `src/lib/player/model.ts` — a `PlayableEvent` abstraction that both real folders
  (`fromLibrary.ts`) and the demo generator (`src/lib/demo/generate.ts`) produce, so
  the grid / overlay / map components are identical across modes.
- `src/hooks/useMasterClock.ts` — the single source of playback truth (rAF-driven,
  rate-scaled). Video tiles correct toward it; procedural tiles render from it.

## Follow-ups (out of MVP scope)

- **Multi-camera mux export.** Today export is a single-camera PNG snapshot. A full
  follow-up would composite all cameras onto one canvas, capture it with
  `canvas.captureStream()` + `MediaRecorder` (or `ffmpeg.wasm` for true mux/encode),
  and download a combined `.webm`/`.mp4` clip for the selected time range.
- **Embedded telemetry from real clips.** Newer Tesla firmware can embed a telemetry
  stream; parsing it from real clips (vs. the synthetic demo track) is a follow-up.
  The overlay already consumes a generic `TelemetryTrack`, so only the extractor is missing.
- **Worker-based parsing** for very large drives, and thumbnail/keyframe previews.
