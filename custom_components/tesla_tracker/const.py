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

# --- Storage ----------------------------------------------------------------
STORAGE_VERSION: Final = 1
STORAGE_KEY_TEMPLATE: Final = f"{DOMAIN}.{{entry_id}}.drives"

# --- Sensor keys ------------------------------------------------------------
SENSOR_DISTANCE_TODAY: Final = "distance_today"
SENSOR_DISTANCE_YESTERDAY: Final = "distance_yesterday"
SENSOR_DISTANCE_WEEK: Final = "distance_this_week"
SENSOR_DISTANCE_MONTH: Final = "distance_this_month"
SENSOR_DRIVES_TODAY: Final = "drives_today"
SENSOR_LAST_DRIVE: Final = "last_drive"

# --- Aggregation periods ----------------------------------------------------
PERIOD_TODAY: Final = "today"
PERIOD_YESTERDAY: Final = "yesterday"
PERIOD_WEEK: Final = "week"
PERIOD_MONTH: Final = "month"
