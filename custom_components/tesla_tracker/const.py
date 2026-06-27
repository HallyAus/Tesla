"""Constants for the Tesla Tracker integration."""

from __future__ import annotations

from typing import Final

DOMAIN: Final = "tesla_tracker"
NAME: Final = "Tesla Tracker"

# --- Config / options keys --------------------------------------------------
CONF_ODOMETER_ENTITY: Final = "odometer_entity"
CONF_TRACKER_ENTITY: Final = "tracker_entity"
CONF_SHIFT_ENTITY: Final = "shift_entity"
CONF_UNIT: Final = "unit"
CONF_DAILY_RESET: Final = "daily_reset"
CONF_IDLE_GAP: Final = "idle_gap"
CONF_MIN_DISTANCE: Final = "min_distance"
CONF_SHOW_PANEL: Final = "show_panel"

# --- Units ------------------------------------------------------------------
UNIT_KM: Final = "km"
UNIT_MI: Final = "mi"
VALID_UNITS: Final = (UNIT_KM, UNIT_MI)
MI_PER_KM: Final = 0.621371

# --- Defaults ---------------------------------------------------------------
DEFAULT_UNIT: Final = UNIT_KM
DEFAULT_DAILY_RESET: Final = "00:00:00"
# Seconds of no movement before a drive is considered finished.
DEFAULT_IDLE_GAP: Final = 300
# Minimum distance (in odometer source units, normally km) to count as a drive.
MIN_DRIVE_DISTANCE: Final = 0.05
DEFAULT_MIN_DISTANCE: Final = 0.5
# Whether the bundled local-first dashcam viewer sidebar panel is shown.
DEFAULT_SHOW_PANEL: Final = True

# --- Dashcam viewer panel ---------------------------------------------------
# The prebuilt viewer bundle is committed under this package's ``panel/`` dir
# (synced by scripts/build_panel.sh) and served same-origin from HA.
PANEL_DIR_NAME: Final = "panel"
# URL the static bundle is mounted at (same-origin, so the iframe's File System
# Access API works when HA itself is on a secure context).
PANEL_URL_PATH: Final = "/tesla_tracker_panel"
# Sidebar panel slug (the path after /<slug> in the HA frontend URL).
PANEL_SLUG: Final = "tesla-tracker-dashcam-viewer"
PANEL_TITLE: Final = "Dashcam Viewer"
PANEL_ICON: Final = "mdi:cctv"

# --- Storage ----------------------------------------------------------------
STORAGE_VERSION: Final = 1
STORAGE_KEY_TEMPLATE: Final = f"{DOMAIN}.{{entry_id}}.drives"

# --- Services ---------------------------------------------------------------
SERVICE_RECALCULATE: Final = "recalculate"
SERVICE_EXPORT_DRIVES: Final = "export_drives"
SERVICE_CLEAR_HISTORY: Final = "clear_history"
ATTR_FILENAME: Final = "filename"
ATTR_CONFIRM: Final = "confirm"

# --- Sensor keys ------------------------------------------------------------
SENSOR_DISTANCE_TODAY: Final = "distance_today"
SENSOR_DISTANCE_YESTERDAY: Final = "distance_yesterday"
SENSOR_DISTANCE_WEEK: Final = "distance_this_week"
SENSOR_DISTANCE_MONTH: Final = "distance_this_month"
SENSOR_DISTANCE_YEAR: Final = "distance_this_year"
SENSOR_DISTANCE_TOTAL: Final = "distance_total"
SENSOR_DRIVES_TODAY: Final = "drives_today"
SENSOR_DRIVES_WEEK: Final = "drives_this_week"
SENSOR_DRIVES_MONTH: Final = "drives_this_month"
SENSOR_DURATION_TODAY: Final = "duration_today"
SENSOR_DURATION_WEEK: Final = "duration_this_week"
SENSOR_DURATION_MONTH: Final = "duration_this_month"
SENSOR_AVG_PER_DAY_MONTH: Final = "avg_distance_per_day_this_month"
SENSOR_LONGEST_DRIVE_MONTH: Final = "longest_drive_this_month"
SENSOR_LAST_DRIVE: Final = "last_drive"

# --- Aggregation periods ----------------------------------------------------
PERIOD_TODAY: Final = "today"
PERIOD_YESTERDAY: Final = "yesterday"
PERIOD_WEEK: Final = "week"
PERIOD_MONTH: Final = "month"
PERIOD_YEAR: Final = "year"
PERIOD_TOTAL: Final = "total"
