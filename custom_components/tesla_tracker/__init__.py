"""The Tesla Tracker integration."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from typing import TypeAlias

from .const import CONF_SHOW_PANEL, DEFAULT_SHOW_PANEL, DOMAIN
from .coordinator import TeslaTrackerCoordinator
from .panel import async_register_panel, async_unregister_panel
from .services import async_register_services, async_unregister_services
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
    async_register_services(hass)

    # Register the bundled dashcam viewer sidebar panel unless the user disabled
    # it. Registration is ref-counted across entries (see panel.py); we track
    # whether *this* entry holds a ref so unload can release exactly one.
    if entry.options.get(CONF_SHOW_PANEL, DEFAULT_SHOW_PANEL):
        await async_register_panel(hass)
        hass.data[DOMAIN].setdefault("_panel_entries", set()).add(entry.entry_id)

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(
    hass: HomeAssistant, entry: TeslaTrackerConfigEntry
) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    domain_data = hass.data.get(DOMAIN, {})
    coordinator: TeslaTrackerCoordinator | None = domain_data.pop(
        entry.entry_id, None
    )
    if coordinator is not None:
        await coordinator.async_stop()

    # Release this entry's panel ref if it registered one.
    panel_entries: set[str] = domain_data.get("_panel_entries", set())
    if entry.entry_id in panel_entries:
        panel_entries.discard(entry.entry_id)
        async_unregister_panel(hass)

    async_unregister_services(hass)
    return unload_ok


async def _async_update_listener(
    hass: HomeAssistant, entry: TeslaTrackerConfigEntry
) -> None:
    """Reload the entry when options change."""
    await hass.config_entries.async_reload(entry.entry_id)
