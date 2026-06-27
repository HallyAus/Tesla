"""Serve and register the local-first dashcam viewer as a sidebar panel.

The viewer (``apps/dashcam-viewer``) is a static, 100% client-side Vite/React
app. Its production bundle is committed under this package's ``panel/`` directory
(synced by ``scripts/build_panel.sh``) so HACS can ship a working panel without
running ``npm`` — Home Assistant cannot build JS.

We mount that bundle as static files and register an ``iframe`` built-in panel
pointing at the served ``index.html``.

Because the panel is served **same-origin** from Home Assistant, the browser's
File System Access API (``window.showDirectoryPicker``) works *inside the iframe*
whenever HA itself is on a secure context (HTTPS / localhost — e.g. Nabu Casa
Remote or an HTTPS reverse proxy). On a plain-HTTP LAN connection the viewer
auto-detects the insecure context and makes drag-and-drop the primary path. Either
way footage never leaves the browser — there is no upload and no server round-trip
for video.

Registration is **ref-counted** so multiple Tesla Tracker config entries share a
single panel + static-path registration; the panel is removed only when the last
entry that wanted it is unloaded.
"""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.core import HomeAssistant

from .const import (
    DOMAIN,
    PANEL_DIR_NAME,
    PANEL_ICON,
    PANEL_SLUG,
    PANEL_TITLE,
    PANEL_URL_PATH,
)

_LOGGER = logging.getLogger(__name__)

# Key in hass.data[DOMAIN] holding the panel ref-count + registration state.
_PANEL_STATE: str = "_panel_state"


def _panel_dir() -> Path:
    """Absolute path to the committed, prebuilt viewer bundle."""
    return Path(__file__).parent / PANEL_DIR_NAME


async def _async_register_static_path(hass: HomeAssistant) -> None:
    """Mount the panel bundle as static files.

    Prefers the modern ``async_register_static_paths`` + ``StaticPathConfig``
    API (HA 2024.7+) and falls back to the legacy ``register_static_path`` on
    older cores.
    """
    panel_dir = str(_panel_dir())
    try:
        # Modern API (async, non-blocking).
        from homeassistant.components.http import StaticPathConfig

        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    PANEL_URL_PATH,
                    panel_dir,
                    # cache_headers=False so a freshly synced bundle is picked
                    # up without users hard-refreshing.
                    False,
                )
            ]
        )
    except ImportError:
        # Legacy fallback for older HA cores.
        hass.http.register_static_path(PANEL_URL_PATH, panel_dir, False)


def _async_register_iframe_panel(hass: HomeAssistant) -> None:
    """Register the iframe sidebar panel pointing at the served index.html."""
    from homeassistant.components.frontend import async_register_built_in_panel

    async_register_built_in_panel(
        hass,
        "iframe",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_SLUG,
        config={"url": f"{PANEL_URL_PATH}/index.html"},
        require_admin=False,
    )


async def async_register_panel(hass: HomeAssistant) -> None:
    """Register the dashcam viewer panel (idempotent, ref-counted).

    Safe to call once per config entry that wants the panel; the underlying
    static path + iframe panel are registered only on the first call.
    """
    domain_data = hass.data.setdefault(DOMAIN, {})
    state: dict = domain_data.setdefault(_PANEL_STATE, {"refs": 0, "registered": False})
    state["refs"] += 1

    if state["registered"]:
        return

    if not (_panel_dir() / "index.html").is_file():
        _LOGGER.warning(
            "Dashcam viewer bundle missing at %s; sidebar panel not registered. "
            "Run scripts/build_panel.sh to (re)build it.",
            _panel_dir(),
        )
        return

    await _async_register_static_path(hass)
    _async_register_iframe_panel(hass)
    state["registered"] = True
    _LOGGER.debug("Registered Dashcam Viewer panel at /%s", PANEL_SLUG)


def async_unregister_panel(hass: HomeAssistant) -> None:
    """Release one ref; remove the panel when the last holder unloads."""
    from homeassistant.components.frontend import async_remove_panel

    domain_data = hass.data.get(DOMAIN, {})
    state: dict | None = domain_data.get(_PANEL_STATE)
    if not state:
        return

    state["refs"] = max(0, state["refs"] - 1)
    if state["refs"] > 0 or not state["registered"]:
        return

    # Last entry unloaded — remove the sidebar panel. The static path cannot be
    # un-registered on current HA cores; it is harmless (serves static files
    # only) and is cleared on the next HA restart.
    async_remove_panel(hass, PANEL_SLUG)
    state["registered"] = False
    _LOGGER.debug("Removed Dashcam Viewer panel /%s", PANEL_SLUG)
