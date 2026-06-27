"""Diagnostics for Tesla Tracker config entries.

Surfaces enough to debug detection/aggregation without leaking secrets or
precise home coordinates. Tokens (none are stored by this integration, but
guard anyway) and GPS coordinates are redacted.
"""

from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.core import HomeAssistant

from . import TeslaTrackerConfigEntry

# Config keys that may carry sensitive values if present.
TO_REDACT = {
    "access_token",
    "refresh_token",
    "token",
    "latitude",
    "longitude",
}


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: TeslaTrackerConfigEntry
) -> dict[str, Any]:
    """Return diagnostics for a config entry."""
    coordinator = entry.runtime_data
    drives = coordinator.store.drives

    last = drives[-1] if drives else None
    last_summary = None
    if last is not None:
        last_summary = {
            "start": last.start.isoformat(),
            "end": last.end.isoformat(),
            "distance": round(last.distance, 3),
            "duration_min": round(last.duration_s / 60, 1),
            "route_points": len(last.route),
        }

    return {
        "entry": {
            "title": entry.title,
            "options": async_redact_data(dict(entry.options), TO_REDACT),
            "data": async_redact_data(dict(entry.data), TO_REDACT),
        },
        "config": {
            "unit": coordinator.unit,
            "idle_gap_s": coordinator.detector.idle_gap,
            "min_distance": coordinator.detector.min_distance,
            "gps_jitter_m": coordinator.detector.gps_jitter_m,
            "odo_glitch": coordinator.detector.odo_glitch,
        },
        "stats": {
            "drive_count": len(drives),
            "in_drive": coordinator.detector.in_drive,
            "has_in_progress_snapshot": coordinator.store.in_progress is not None,
            "total_distance": round(sum(d.distance for d in drives), 3),
            "last_drive": last_summary,
        },
    }
