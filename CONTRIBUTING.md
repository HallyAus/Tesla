# Contributing

Thanks for your interest in contributing to **Tesla Companion**! This repo is a monorepo
containing two independent products:

- **Dashcam Viewer** — `apps/dashcam-viewer/` (Vite + React + TypeScript, 100% client-side)
- **Tesla Tracker** — `custom_components/tesla_tracker/` (Home Assistant custom integration, Python)

This is an independent community project. It is not affiliated with, endorsed by, or connected to
Tesla, Inc.

## Privacy ground rules

These are non-negotiable and define the project:

- **No secrets in the repo.** Never commit Tesla tokens, refresh tokens, API keys, Home Assistant
  `secrets.yaml`, `.env` files, or any credential. Tesla tokens live **only** in the user's own
  Home Assistant instance.
- **No personal data.** Do not commit real dashcam footage, GPS traces, VINs, or location history.
  Use the bundled sample/fixtures instead.
- **No telemetry, no upload.** Neither product may upload footage, location, or usage data to any
  server. The viewer is 100% local; the tracker stays inside the user's Home Assistant. PRs that
  add network upload or analytics will not be accepted.

## Getting started

### Dashcam Viewer (`apps/dashcam-viewer/`)

Requires Node.js 22.

```bash
cd apps/dashcam-viewer
npm ci                 # install from package-lock.json
npm run dev            # start the dev server
```

Local checks (these mirror CI):

```bash
npm run build          # tsc -b && vite build
npm test               # vitest run
npx tsc --noEmit       # type-check (same as `npm run lint`)
```

### Tesla Tracker (`custom_components/tesla_tracker/`)

Requires Python 3.11 or 3.12.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r tests/requirements-test.txt
```

Local checks (these mirror CI):

```bash
python -m pytest tests/ -q
python -m py_compile $(find custom_components/tesla_tracker -name "*.py")
```

The integration is HACS-installable. To test inside Home Assistant, copy or symlink
`custom_components/tesla_tracker/` into your HA `config/custom_components/` directory. It depends on
the official **Tesla Fleet** integration being configured first.

## Branch & PR conventions

1. Branch off `main`. Use a descriptive branch name, e.g. `fix/viewer-route-map` or
   `feat/tracker-weekly-km`.
2. Keep PRs focused on a single product / concern where possible.
3. Make sure the relevant local checks above pass before opening a PR.
4. Fill out the pull request template, including the testing checklist.
5. CI must be green:
   - `viewer.yml` runs on changes under `apps/dashcam-viewer/**`
   - `tracker.yml` runs on changes under `custom_components/**` or `tests/**`
   - `validate.yml` runs HACS validation and Home Assistant `hassfest`
6. A maintainer will review. Squash-merge is preferred to keep history tidy.

## Reporting bugs & requesting features

Use the issue templates (Bug report / Feature request). For security issues, **do not** open a
public issue — see [`SECURITY.md`](SECURITY.md).

## Code of conduct

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).
