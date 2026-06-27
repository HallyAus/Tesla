# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the **Tesla Tracker** Home Assistant integration follows
[Semantic Versioning](https://semver.org/) (its version lives in
`custom_components/tesla_tracker/manifest.json` and is what HACS installs).

## [0.2.0] - 2026-06-27

First tagged release. Both products built and polished to release quality.

### Tesla Tracker (Home Assistant integration) — `0.2.0`
- **Added**
  - Sensors: distance today / yesterday / this week / this month / this year / total,
    drive counts (today/week/month), driving durations (today/week/month),
    average distance per driving-day this month, and longest drive this month.
  - Services: `tesla_tracker.recalculate`, `tesla_tracker.export_drives`,
    `tesla_tracker.clear_history` (confirmation-guarded).
  - Config-entry diagnostics with redacted tokens and coordinates.
  - Lovelace dashboard (KPI glance, statistics graph, drives table, route map) with
    optional ApexCharts / flex-table sections.
  - Pure-Python aggregation core and drive-detection state machine (zero Home Assistant
    imports), covered by 38 unit tests.
- **Changed**
  - Hardened drive detection: odometer rollback/glitch rejection, GPS-jitter filtering
    (haversine), and restart-resume of in-progress drives via persisted snapshots.
  - `quality_scale` set to `silver`.

### Dashcam Viewer — `apps/dashcam-viewer`
- **Added**
  - Multi-camera WebM export (canvas `captureStream` + `MediaRecorder`) and full-layout
    PNG snapshot.
  - Camera layout presets (full / front+back / 4-up / 6-up / focus) with click-to-focus.
  - Event-spanning timeline with segment boundaries and Sentry-trigger markers,
    click-to-seek, and frame-step; real video durations drive the scrubber.
  - Keyboard shortcuts with help overlay, and fullscreen.
  - Real-folder telemetry surfaced from `event.json` (location-only, never fabricated).
  - Dark-theme UI polish, grouped event sidebar, and loading/empty/error/permission states.
- **Changed**
  - MapLibre lazy-loaded / code-split: initial bundle reduced from ~970 kB to ~42 kB.
- Covered by 73 unit tests.

### Repository
- **Added**
  - GitHub Actions CI: viewer build/test, tracker pytest, and HACS + hassfest validation.
  - Dependabot, issue forms, PR template, `CONTRIBUTING`, `SECURITY`, `CODE_OF_CONDUCT`.

[0.2.0]: https://github.com/HallyAus/Tesla/releases/tag/v0.2.0
