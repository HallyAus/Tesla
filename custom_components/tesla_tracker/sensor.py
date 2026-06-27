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

from . import TeslaTrackerConfigEntry
from .const import (
    DOMAIN,
    NAME,
    PERIOD_MONTH,
    PERIOD_TODAY,
    PERIOD_WEEK,
    PERIOD_YESTERDAY,
    SENSOR_DISTANCE_MONTH,
    SENSOR_DISTANCE_TODAY,
    SENSOR_DISTANCE_WEEK,
    SENSOR_DISTANCE_YESTERDAY,
    SENSOR_DRIVES_TODAY,
    SENSOR_LAST_DRIVE,
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


def _drive_count_value(period: str):
    return lambda c: c.rollup(period).drive_count


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


def _distance_descriptions(unit_of_measurement):
    return [
        TrackerSensorDescription(
            key=SENSOR_DISTANCE_TODAY,
            translation_key=SENSOR_DISTANCE_TODAY,
            device_class=SensorDeviceClass.DISTANCE,
            state_class=SensorStateClass.TOTAL,
            native_unit_of_measurement=unit_of_measurement,
            value_fn=_distance_value(PERIOD_TODAY),
        ),
        TrackerSensorDescription(
            key=SENSOR_DISTANCE_YESTERDAY,
            translation_key=SENSOR_DISTANCE_YESTERDAY,
            device_class=SensorDeviceClass.DISTANCE,
            state_class=SensorStateClass.TOTAL,
            native_unit_of_measurement=unit_of_measurement,
            value_fn=_distance_value(PERIOD_YESTERDAY),
        ),
        TrackerSensorDescription(
            key=SENSOR_DISTANCE_WEEK,
            translation_key=SENSOR_DISTANCE_WEEK,
            device_class=SensorDeviceClass.DISTANCE,
            state_class=SensorStateClass.TOTAL,
            native_unit_of_measurement=unit_of_measurement,
            value_fn=_distance_value(PERIOD_WEEK),
        ),
        TrackerSensorDescription(
            key=SENSOR_DISTANCE_MONTH,
            translation_key=SENSOR_DISTANCE_MONTH,
            device_class=SensorDeviceClass.DISTANCE,
            state_class=SensorStateClass.TOTAL,
            native_unit_of_measurement=unit_of_measurement,
            value_fn=_distance_value(PERIOD_MONTH),
        ),
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
    descriptions.append(
        TrackerSensorDescription(
            key=SENSOR_DRIVES_TODAY,
            translation_key=SENSOR_DRIVES_TODAY,
            state_class=SensorStateClass.TOTAL,
            native_unit_of_measurement="drives",
            value_fn=_drive_count_value(PERIOD_TODAY),
        )
    )
    descriptions.append(
        TrackerSensorDescription(
            key=SENSOR_LAST_DRIVE,
            translation_key=SENSOR_LAST_DRIVE,
            device_class=SensorDeviceClass.DISTANCE,
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
