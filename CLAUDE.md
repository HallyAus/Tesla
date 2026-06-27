# Project guidelines

## Positioning / wording
- Describe this project on its own terms. **Do not name, link to, compare against, or credit
  any third-party Tesla dashcam-viewer product** in code, comments, docs, commit messages,
  PR text, or release notes. Describe what *our* tools do, not what they are "like".
- Keep the privacy framing front and center: the viewer is 100% local (no upload, no server);
  the tracker keeps data inside the user's own Home Assistant.

## Repo conventions
- Two independent products: `apps/dashcam-viewer/` (Vite + React + TS) and
  `custom_components/tesla_tracker/` (Home Assistant integration). They don't depend on each
  other at runtime.
- Keep the integration's `aggregation.py` and `drive_detect.py` free of Home Assistant imports
  so they stay unit-testable with plain `pytest`.
- Always merge work to `main`.
