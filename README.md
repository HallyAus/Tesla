# Tesla Companion

An open, **privacy-first** toolkit for Tesla owners, in two parts:

1. **Dashcam Viewer** (`apps/dashcam-viewer/`) — a local-first, in-browser viewer for
   TeslaCam / Sentry Mode footage. Inspired by [TesClip](https://tesclip.com/): it reads the
   raw `TeslaCam` folders straight off your USB drive, plays all cameras in sync, overlays
   telemetry, and draws the GPS route on a map. **Your footage never leaves your machine** —
   there is no upload and no server.

2. **Tesla Tracker** (`custom_components/tesla_tracker/`) — a
   [Home Assistant](https://www.home-assistant.io/) custom integration (HACS-installable) that
   sits on top of the official **Tesla Fleet** integration and tracks your vehicle over time:
   **daily / weekly / monthly kilometres, drives, and route history** (including previous days),
   exposed as sensors with ready-made Lovelace dashboard cards.

> This is an independent, community project. It is not affiliated with, endorsed by, or
> connected to Tesla, Inc. "Tesla" is a trademark of Tesla, Inc.

---

## Repository layout

```
.
├── apps/
│   └── dashcam-viewer/          # Product 1 — local-first TeslaCam viewer (Vite + React + TS)
├── custom_components/
│   └── tesla_tracker/           # Product 2 — Home Assistant integration (Python)
├── dashboards/                  # Lovelace dashboard YAML for Tesla Tracker
├── docs/                        # Architecture & usage docs
└── hacs.json                    # HACS metadata (points HACS at the integration)
```

## Quick start

### Dashcam Viewer
```bash
cd apps/dashcam-viewer
npm install
npm run dev            # open the printed localhost URL, then "Open TeslaCam folder"
```
A bundled sample clip set lets you try it without a USB drive. See
[`docs/dashcam-viewer.md`](docs/dashcam-viewer.md).

### Tesla Tracker (Home Assistant)
1. Set up the built-in **Tesla Fleet** integration in Home Assistant.
2. Install this repo in HACS as a custom repository (type: *Integration*), or copy
   `custom_components/tesla_tracker/` into your HA `config/custom_components/`.
3. Add the integration, point it at your Tesla Fleet vehicle, and import the dashboard from
   [`dashboards/`](dashboards/). See [`docs/ha-integration.md`](docs/ha-integration.md).

## Architecture

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design of both products and how
they relate.

## Privacy

- The **viewer** runs entirely in your browser using the File System Access API. Footage is read
  locally and never uploaded.
- The **tracker** stores drive/route history inside your own Home Assistant instance. No data is
  sent to any third party beyond the Tesla Fleet API you already authorize in Home Assistant.

## License

MIT — see [`LICENSE`](LICENSE).
