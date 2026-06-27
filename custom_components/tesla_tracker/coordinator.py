"""Tesla Tracker coordinator.

Subscribes to source-entity state changes from ``tesla_fleet`` and drives the
pure :class:`DriveDetector` state machine. All HA-specific glue lives here; the
detection heuristic itself is in ``drive_detect.py`` so it stays unit-testable.
"""

from __future__ import annotations

import logging
from datetime import datetime

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import (
    STATE_UNAVAILABLE,
    STATE_UNKNOWN,
)
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.event import (
    EventStateChangedData,
    async_track_state_change_event,
)
from homeassistant.util import dt as dt_util

from . import aggregation
from .aggregation import Drive
from .const import (
    CONF_IDLE_GAP,
    CONF_MIN_DISTANCE,
    CONF_ODOMETER_ENTITY,
    CONF_SHIFT_ENTITY,
    CONF_TRACKER_ENTITY,
    CONF_UNIT,
    DEFAULT_IDLE_GAP,
    DEFAULT_MIN_DISTANCE,
    DEFAULT_UNIT,
    UNIT_KM,
    UNIT_MI,
)
from .const import MI_PER_KM
from .drive_detect import DriveDetector, Sample
from .store import DriveStore

_LOGGER = logging.getLogger(__name__)

_INVALID = (None, STATE_UNAVAILABLE, STATE_UNKNOWN, "")


def _to_float(value) -> float | None:
    if value in _INVALID:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


class TeslaTrackerCoordinator:
    """Glue between HA state events, the detector, and the store."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        store: DriveStore,
    ) -> None:
        self.hass = hass
        self.entry = entry
        self.store = store

        opts = {**entry.data, **entry.options}
        self.odometer_entity: str = opts[CONF_ODOMETER_ENTITY]
        self.tracker_entity: str | None = opts.get(CONF_TRACKER_ENTITY)
        self.shift_entity: str | None = opts.get(CONF_SHIFT_ENTITY)
        self.unit: str = opts.get(CONF_UNIT, DEFAULT_UNIT)
        idle_gap = float(opts.get(CONF_IDLE_GAP, DEFAULT_IDLE_GAP))
        min_distance = float(opts.get(CONF_MIN_DISTANCE, DEFAULT_MIN_DISTANCE))

        self.detector = DriveDetector(
            idle_gap=idle_gap, min_distance=min_distance
        )
        self._unsub = None
        self._listeners: list = []

    # --- lifecycle ---------------------------------------------------------
    async def async_start(self) -> None:
        await self.store.async_load()
        # Resume an in-progress drive captured before a restart (if any).
        self.detector.resume(self.store.in_progress)
        if self.store.in_progress is not None:
            await self.store.async_set_in_progress(None)

        entities = [self.odometer_entity]
        if self.tracker_entity:
            entities.append(self.tracker_entity)
        if self.shift_entity:
            entities.append(self.shift_entity)

        self._unsub = async_track_state_change_event(
            self.hass, entities, self._handle_state_event
        )
        # Seed from current state so a restart mid-drive doesn't lose context.
        self._ingest(dt_util.utcnow())

    async def async_stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None
        # Persist any in-flight drive so it resumes after a restart rather than
        # being force-closed (which would split one trip into two).
        snapshot = self.detector.snapshot()
        await self.store.async_set_in_progress(snapshot)

    @callback
    def async_add_listener(self, update_callback) -> None:
        self._listeners.append(update_callback)

    def _notify(self) -> None:
        for cb in self._listeners:
            cb()

    # --- sampling ----------------------------------------------------------
    def _read_location(self) -> tuple[float, float] | None:
        if not self.tracker_entity:
            return None
        state = self.hass.states.get(self.tracker_entity)
        if state is None:
            return None
        lat = state.attributes.get("latitude")
        lon = state.attributes.get("longitude")
        flat, flon = _to_float(lat), _to_float(lon)
        if flat is None or flon is None:
            return None
        return (flat, flon)

    def _read_shift(self) -> str | None:
        if not self.shift_entity:
            return None
        state = self.hass.states.get(self.shift_entity)
        if state is None or state.state in _INVALID:
            return None
        return str(state.state)

    def _read_odometer(self) -> float | None:
        state = self.hass.states.get(self.odometer_entity)
        if state is None:
            return None
        return _to_float(state.state)

    def _build_sample(self, ts: datetime) -> Sample | None:
        odo = self._read_odometer()
        loc = self._read_location()
        shift = self._read_shift()
        if odo is None and loc is None and shift is None:
            return None
        return Sample(ts=ts, odometer=odo, location=loc, shift=shift)

    @callback
    def _handle_state_event(self, event: Event[EventStateChangedData]) -> None:
        self._ingest(event.time_fired)

    def _ingest(self, ts: datetime) -> None:
        sample = self._build_sample(ts)
        if sample is None:
            return
        completed = self.detector.process(sample)
        if completed is not None:
            self.hass.async_create_task(self._on_drive_complete(completed))

    async def _on_drive_complete(self, drive: Drive) -> None:
        _LOGGER.debug(
            "Recorded drive %s -> %s, %.2f", drive.start, drive.end, drive.distance
        )
        await self.store.async_add(drive)
        self._notify()

    # --- aggregation helpers (consumed by sensors) -------------------------
    def _converted(self, drives: list[Drive]) -> list[Drive]:
        """Source odometer is assumed in km. Convert to mi if configured."""
        if self.unit != UNIT_MI:
            return drives
        out: list[Drive] = []
        for d in drives:
            out.append(
                Drive(
                    start=d.start,
                    end=d.end,
                    distance=d.distance * MI_PER_KM,
                    start_location=d.start_location,
                    end_location=d.end_location,
                    route=d.route,
                )
            )
        return out

    def rollup(self, period: str):
        now = dt_util.now()
        return aggregation.rollup(self._converted(self.store.drives), period, now)

    @property
    def last_drive(self) -> Drive | None:
        drives = self._converted(self.store.drives)
        return drives[-1] if drives else None

    def _month_bounds(self):
        now = dt_util.now()
        return aggregation.period_bounds(aggregation.PERIOD_MONTH, now)

    def avg_distance_per_day_month(self) -> float:
        start, end = self._month_bounds()
        return aggregation.avg_distance_per_driving_day(
            self._converted(self.store.drives), start, end
        )

    def longest_drive_month(self) -> Drive | None:
        start, end = self._month_bounds()
        return aggregation.longest_drive(
            self._converted(self.store.drives), start, end
        )

    # --- services ----------------------------------------------------------
    async def async_recalculate(self) -> None:
        """Re-derive nothing destructive; drives are the source of truth.

        Rollups are computed on demand from stored drives, so recalculation
        simply re-sorts/normalises the persisted list and notifies sensors so
        any cached UI values refresh immediately.
        """
        drives = sorted(self.store.drives, key=lambda d: d.start)
        await self.store.async_replace(drives)
        self._notify()

    async def async_clear_history(self) -> None:
        """Wipe all stored drives (caller enforces confirmation)."""
        await self.store.async_replace([])
        self._notify()

    def export_payload(self) -> dict:
        """JSON-serialisable export of the full drive history."""
        return {
            "version": 1,
            "unit": self.unit,
            "exported_at": dt_util.now().isoformat(),
            "drive_count": len(self.store.drives),
            "drives": [d.to_dict() for d in self._converted(self.store.drives)],
        }
