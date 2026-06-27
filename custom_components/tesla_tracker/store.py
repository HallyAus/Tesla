"""Versioned persistence for drive + route history.

Uses Home Assistant's :class:`homeassistant.helpers.storage.Store` so history
survives restarts and outlives the recorder purge window. The persisted schema
is versioned via ``STORAGE_VERSION`` so future migrations are possible.
"""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .aggregation import Drive
from .const import STORAGE_KEY_TEMPLATE, STORAGE_VERSION

# Cap how many drives we keep persisted to bound the JSON size. Two years of
# heavy use (~10 drives/day) is comfortably under this.
MAX_DRIVES = 10000


class DriveStore:
    """Load/save the list of completed drives for one config entry."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store: Store = Store(
            hass,
            STORAGE_VERSION,
            STORAGE_KEY_TEMPLATE.format(entry_id=entry_id),
        )
        self._drives: list[Drive] = []
        self._loaded = False

    @property
    def drives(self) -> list[Drive]:
        return self._drives

    async def async_load(self) -> list[Drive]:
        """Load drives from disk (idempotent)."""
        if self._loaded:
            return self._drives
        raw = await self._store.async_load()
        if raw and isinstance(raw, dict):
            self._drives = [
                Drive.from_dict(d) for d in raw.get("drives", [])
            ]
        self._loaded = True
        return self._drives

    async def async_add(self, drive: Drive) -> None:
        """Append a completed drive and persist."""
        self._drives.append(drive)
        if len(self._drives) > MAX_DRIVES:
            self._drives = self._drives[-MAX_DRIVES:]
        await self.async_save()

    async def async_save(self) -> None:
        await self._store.async_save(
            {
                "version": STORAGE_VERSION,
                "drives": [d.to_dict() for d in self._drives],
            }
        )

    async def async_remove(self) -> None:
        """Delete the persisted store (on config-entry removal)."""
        await self._store.async_remove()
