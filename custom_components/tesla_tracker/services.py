"""Service handlers for Tesla Tracker.

Registers three services, scoped to the integration domain:

* ``tesla_tracker.recalculate``    – normalise/re-sort stored drives & refresh.
* ``tesla_tracker.export_drives``  – dump drive history to a JSON file in the
  Home Assistant config directory.
* ``tesla_tracker.clear_history``  – delete all stored drives (requires an
  explicit ``confirm: true`` to guard against accidental data loss).

All heavy lifting lives on the coordinator; this module is thin HA glue.
"""

from __future__ import annotations

import json
import logging

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv

from .const import (
    ATTR_CONFIRM,
    ATTR_FILENAME,
    DOMAIN,
    SERVICE_CLEAR_HISTORY,
    SERVICE_EXPORT_DRIVES,
    SERVICE_RECALCULATE,
)

_LOGGER = logging.getLogger(__name__)

_EXPORT_SCHEMA = vol.Schema(
    {vol.Optional(ATTR_FILENAME, default="tesla_tracker_drives.json"): cv.string}
)
_CLEAR_SCHEMA = vol.Schema(
    {vol.Required(ATTR_CONFIRM, default=False): cv.boolean}
)


def _coordinators(hass: HomeAssistant) -> list:
    """All loaded coordinators (one per config entry)."""
    return list(hass.data.get(DOMAIN, {}).values())


def async_register_services(hass: HomeAssistant) -> None:
    """Register integration services once (idempotent)."""

    if hass.services.has_service(DOMAIN, SERVICE_RECALCULATE):
        return

    async def _handle_recalculate(call: ServiceCall) -> None:
        for coordinator in _coordinators(hass):
            await coordinator.async_recalculate()

    async def _handle_export(call: ServiceCall) -> None:
        coords = _coordinators(hass)
        if not coords:
            raise HomeAssistantError("No Tesla Tracker entries are configured.")
        filename = call.data[ATTR_FILENAME]
        if not hass.config.is_allowed_path(hass.config.path(filename)):
            raise ServiceValidationError(
                f"Path {filename!r} is not allowed for writing."
            )
        # Merge payloads if multiple entries exist.
        payload = (
            coords[0].export_payload()
            if len(coords) == 1
            else {
                "version": 1,
                "entries": [c.export_payload() for c in coords],
            }
        )
        path = hass.config.path(filename)

        def _write() -> None:
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(payload, fh, indent=2)

        await hass.async_add_executor_job(_write)
        _LOGGER.info("Exported Tesla Tracker drive history to %s", path)

    async def _handle_clear(call: ServiceCall) -> None:
        if not call.data.get(ATTR_CONFIRM):
            raise ServiceValidationError(
                "Refusing to clear history without 'confirm: true'."
            )
        for coordinator in _coordinators(hass):
            await coordinator.async_clear_history()

    hass.services.async_register(
        DOMAIN, SERVICE_RECALCULATE, _handle_recalculate
    )
    hass.services.async_register(
        DOMAIN, SERVICE_EXPORT_DRIVES, _handle_export, schema=_EXPORT_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_CLEAR_HISTORY, _handle_clear, schema=_CLEAR_SCHEMA
    )


def async_unregister_services(hass: HomeAssistant) -> None:
    """Remove services when the last config entry unloads."""
    if _coordinators(hass):
        return
    for service in (
        SERVICE_RECALCULATE,
        SERVICE_EXPORT_DRIVES,
        SERVICE_CLEAR_HISTORY,
    ):
        if hass.services.has_service(DOMAIN, service):
            hass.services.async_remove(DOMAIN, service)
