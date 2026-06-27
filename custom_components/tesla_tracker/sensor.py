"""Sensor platform for Tesla Tracker."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorEntityDescription,
    SensorStateClass,
)
from homeassistant.const import UnitOfLength
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from homeassistant.const import UnitOfTime

from . import TeslaTrackerConfigEntry
from .const import (
    DOMAIN,
    NAME,
    PERIOD_MONTH,
    PERIOD_TODAY,
    PERIOD_TOTAL,
    PERIOD_WEEK,
    PERIOD_YEAR,
    PERIOD_YESTERDAY,
    SENSOR_AVG_PER_DAY_MONTH,
    SENSOR_DISTANCE_MONTH,
    SENSOR_DISTANCE_TODAY,
    SENSOR_DISTANCE_TOTAL,
    SENSOR_DISTANCE_WEEK,
    SENSOR_DISTANCE_YEAR,
    SENSOR_DISTANCE_YESTERDAY,
    SENSOR_DRIVES_MONTH,
    SENSOR_DRIVES_TODAY,
    SENSOR_DRIVES_WEEK,
    SENSOR_DURATION_MONTH,
    SENSOR_DURATION_TODAY,
    SENSOR_DURATION_WEEK,
    SENSOR_LAST_DRIVE,
    SENSOR_LONGEST_DRIVE_MONTH,
    UNIT_MI,
)
from .coordinator import TeslaTrackerCoordinator


@dataclass(frozen=True, kw_only=True)
class TrackerSensorDescription(SensorEntityDescription):
    """Describes a Tesla Tracker sensor and how to compute its value."""

    value_fn: Callable[[TeslaTrackerCoordinator], float | int | str | None]
    attrs_fn: Callable[[TeslaTrackerCoordinator], dict] | None = None


def _distance_value(period: str):
    return lambda c: round(c.rollup(period).distance, 2)


def _duration_value(period: str):
    # Minutes driven in the period.
    return lambda c: round(c.rollup(period).duration_s / 60, 1)


def _drive_count_value(period: str):
    return lambda c: c.rollup(period).drive_count


def _series_attrs(period: str):
    """Expose the per-day distance series for charting."""
    def _fn(c: TeslaTrackerCoordinator) -> dict:
        r = c.rollup(period)
        return {
            "period_start": r.start.isoformat(),
            "period_end": r.end.isoformat(),
            "daily_series": r.series,
        }
    return _fn


def _avg_per_day_value(c: TeslaTrackerCoordinator):
    return round(c.avg_distance_per_day_month(), 2)


def _longest_drive_value(c: TeslaTrackerCoordinator):
    d = c.longest_drive_month()
    return round(d.distance, 2) if d else None


def _longest_drive_attrs(c: TeslaTrackerCoordinator) -> dict:
    d = c.longest_drive_month()
    if d is None:
        return {}
    return {
        "start": d.start.isoformat(),
        "end": d.end.isoformat(),
        "duration_min": round(d.duration_s / 60, 1),
        "start_location": list(d.start_location) if d.start_location else None,
        "end_location": list(d.end_location) if d.end_location else None,
    }


def _last_drive_value(c: TeslaTrackerCoordinator):
    d = c.last_drive
    return round(d.distance, 2) if d else None


def _last_drive_attrs(c: TeslaTrackerCoordinator) -> dict:
    d = c.last_drive
    if d is None:
        return {}
    return {
        "start": d.start.isoformat(),
        "end": d.end.isoformat(),
        "duration_min": round(d.duration_s / 60, 1),
        "start_location": list(d.start_location) if d.start_location else None,
        "end_location": list(d.end_location) if d.end_location else None,
        "route": [list(p) for p in d.route],
        "route_points": len(d.route),
    }


def _distance_desc(key, period, unit, *, total=True, series=False):
    return TrackerSensorDescription(
        key=key,
        translation_key=key,
        device_class=SensorDeviceClass.DISTANCE,
        # TOTAL_INCREASING for the lifetime odometer-style total; TOTAL (which
        # resets each period) for the rolling windows.
        state_class=(
            SensorStateClass.TOTAL_INCREASING if total else SensorStateClass.TOTAL
        ),
        native_unit_of_measurement=unit,
        value_fn=_distance_value(period),
        attrs_fn=_series_attrs(period) if series else None,
    )


def _distance_descriptions(unit):
    return [
        _distance_desc(SENSOR_DISTANCE_TODAY, PERIOD_TODAY, unit, total=False),
        _distance_desc(
            SENSOR_DISTANCE_YESTERDAY, PERIOD_YESTERDAY, unit, total=False
        ),
        _distance_desc(
            SENSOR_DISTANCE_WEEK, PERIOD_WEEK, unit, total=False, series=True
        ),
        _distance_desc(
            SENSOR_DISTANCE_MONTH, PERIOD_MONTH, unit, total=False, series=True
        ),
        _distance_desc(
            SENSOR_DISTANCE_YEAR, PERIOD_YEAR, unit, total=False, series=True
        ),
        # Lifetime total -> TOTAL_INCREASING so HA treats it as a growing meter.
        _distance_desc(SENSOR_DISTANCE_TOTAL, PERIOD_TOTAL, unit, total=True),
    ]


def _duration_descriptions():
    mins = UnitOfTime.MINUTES
    return [
        TrackerSensorDescription(
            key=SENSOR_DURATION_TODAY,
            translation_key=SENSOR_DURATION_TODAY,
            device_class=SensorDeviceClass.DURATION,
            state_class=SensorStateClass.TOTAL,
            native_unit_of_measurement=mins,
            value_fn=_duration_value(PERIOD_TODAY),
        ),
        TrackerSensorDescription(
            key=SENSOR_DURATION_WEEK,
            translation_key=SENSOR_DURATION_WEEK,
            device_class=SensorDeviceClass.DURATION,
            state_class=SensorStateClass.TOTAL,
            native_unit_of_measurement=mins,
            value_fn=_duration_value(PERIOD_WEEK),
        ),
        TrackerSensorDescription(
            key=SENSOR_DURATION_MONTH,
            translation_key=SENSOR_DURATION_MONTH,
            device_class=SensorDeviceClass.DURATION,
            state_class=SensorStateClass.TOTAL,
            native_unit_of_measurement=mins,
            value_fn=_duration_value(PERIOD_MONTH),
        ),
    ]


def _count_descriptions():
    def _count(key, period):
        return TrackerSensorDescription(
            key=key,
            translation_key=key,
            state_class=SensorStateClass.TOTAL,
            native_unit_of_measurement="drives",
            value_fn=_drive_count_value(period),
        )

    return [
        _count(SENSOR_DRIVES_TODAY, PERIOD_TODAY),
        _count(SENSOR_DRIVES_WEEK, PERIOD_WEEK),
        _count(SENSOR_DRIVES_MONTH, PERIOD_MONTH),
    ]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: TeslaTrackerConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the Tesla Tracker sensors."""
    coordinator = entry.runtime_data
    unit = (
        UnitOfLength.MILES
        if coordinator.unit == UNIT_MI
        else UnitOfLength.KILOMETERS
    )

    descriptions: list[TrackerSensorDescription] = list(
        _distance_descriptions(unit)
    )
    descriptions.extend(_duration_descriptions())
    descriptions.extend(_count_descriptions())
    descriptions.append(
        TrackerSensorDescription(
            key=SENSOR_AVG_PER_DAY_MONTH,
            translation_key=SENSOR_AVG_PER_DAY_MONTH,
            device_class=SensorDeviceClass.DISTANCE,
            state_class=SensorStateClass.MEASUREMENT,
            native_unit_of_measurement=unit,
            value_fn=_avg_per_day_value,
        )
    )
    descriptions.append(
        TrackerSensorDescription(
            key=SENSOR_LONGEST_DRIVE_MONTH,
            translation_key=SENSOR_LONGEST_DRIVE_MONTH,
            device_class=SensorDeviceClass.DISTANCE,
            state_class=SensorStateClass.MEASUREMENT,
            native_unit_of_measurement=unit,
            value_fn=_longest_drive_value,
            attrs_fn=_longest_drive_attrs,
        )
    )
    descriptions.append(
        TrackerSensorDescription(
            key=SENSOR_LAST_DRIVE,
            translation_key=SENSOR_LAST_DRIVE,
            device_class=SensorDeviceClass.DISTANCE,
            state_class=SensorStateClass.MEASUREMENT,
            native_unit_of_measurement=unit,
            value_fn=_last_drive_value,
            attrs_fn=_last_drive_attrs,
        )
    )

    async_add_entities(
        TeslaTrackerSensor(coordinator, entry, desc) for desc in descriptions
    )


class TeslaTrackerSensor(SensorEntity):
    """A single Tesla Tracker sensor."""

    _attr_has_entity_name = True
    entity_description: TrackerSensorDescription

    def __init__(
        self,
        coordinator: TeslaTrackerCoordinator,
        entry: TeslaTrackerConfigEntry,
        description: TrackerSensorDescription,
    ) -> None:
        self.coordinator = coordinator
        self.entity_description = description
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=NAME,
            manufacturer="Tesla Tracker",
            model="Drive Analytics",
        )

    async def async_added_to_hass(self) -> None:
        self.coordinator.async_add_listener(self._handle_update)

    @callback
    def _handle_update(self) -> None:
        self.async_write_ha_state()

    @property
    def native_value(self):
        return self.entity_description.value_fn(self.coordinator)

    @property
    def extra_state_attributes(self):
        if self.entity_description.attrs_fn is None:
            return None
        return self.entity_description.attrs_fn(self.coordinator)
