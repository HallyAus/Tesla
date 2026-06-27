"""The Tesla Tracker integration."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from typing import TypeAlias

from .const import DOMAIN
from .coordinator import TeslaTrackerCoordinator
from .store import DriveStore

PLATFORMS: list[Platform] = [Platform.SENSOR]

# ConfigEntry subscripting + TypeAlias works on Python 3.11+ (HA target 3.12).
TeslaTrackerConfigEntry: TypeAlias = "ConfigEntry[TeslaTrackerCoordinator]"


async def async_setup_entry(
    hass: HomeAssistant, entry: TeslaTrackerConfigEntry
) -> bool:
    """Set up Tesla Tracker from a config entry."""
    store = DriveStore(hass, entry.entry_id)
    coordinator = TeslaTrackerCoordinator(hass, entry, store)
    await coordinator.async_start()

    entry.runtime_data = coordinator
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = coordinator

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: TeslaTrackerConfigEntry
) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    coordinator: TeslaTrackerCoordinator | None = hass.data.get(DOMAIN, {}).pop(
        entry.entry_id, None
    )
    if coordinator is not None:
        await coordinator.async_stop()
    return unload_ok


async def _async_update_listener(
    hass: HomeAssistant, entry: TeslaTrackerConfigEntry
) -> None:
    """Reload the entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)
