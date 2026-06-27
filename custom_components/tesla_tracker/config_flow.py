"""Config and options flow for Tesla Tracker."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    CONF_DAILY_RESET,
    CONF_IDLE_GAP,
    CONF_MIN_DISTANCE,
    CONF_ODOMETER_ENTITY,
    CONF_SHIFT_ENTITY,
    CONF_SHOW_PANEL,
    CONF_TRACKER_ENTITY,
    CONF_UNIT,
    DEFAULT_DAILY_RESET,
    DEFAULT_IDLE_GAP,
    DEFAULT_MIN_DISTANCE,
    DEFAULT_SHOW_PANEL,
    DEFAULT_UNIT,
    DOMAIN,
    NAME,
    UNIT_KM,
    UNIT_MI,
)

UNIT_OPTIONS = [
    selector.SelectOptionDict(value=UNIT_KM, label="Kilometres (km)"),
    selector.SelectOptionDict(value=UNIT_MI, label="Miles (mi)"),
]


def _schema(defaults: dict[str, Any], *, include_panel: bool = False) -> vol.Schema:
    """Build the (re)usable form schema for both config and options flows.

    ``include_panel`` adds the "Show dashcam viewer panel" toggle (options flow
    only).
    """
    fields: dict[Any, Any] = {
            vol.Required(
                CONF_ODOMETER_ENTITY,
                default=defaults.get(CONF_ODOMETER_ENTITY, vol.UNDEFINED),
            ): selector.EntitySelector(
                selector.EntitySelectorConfig(domain="sensor")
            ),
            vol.Required(
                CONF_TRACKER_ENTITY,
                default=defaults.get(CONF_TRACKER_ENTITY, vol.UNDEFINED),
            ): selector.EntitySelector(
                selector.EntitySelectorConfig(domain=["device_tracker", "sensor"])
            ),
            vol.Optional(
                CONF_SHIFT_ENTITY,
                default=defaults.get(CONF_SHIFT_ENTITY, vol.UNDEFINED),
            ): selector.EntitySelector(
                selector.EntitySelectorConfig(domain=["sensor", "binary_sensor"])
            ),
            vol.Required(
                CONF_UNIT, default=defaults.get(CONF_UNIT, DEFAULT_UNIT)
            ): selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=UNIT_OPTIONS,
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            ),
            vol.Required(
                CONF_DAILY_RESET,
                default=defaults.get(CONF_DAILY_RESET, DEFAULT_DAILY_RESET),
            ): selector.TimeSelector(),
            vol.Required(
                CONF_IDLE_GAP,
                default=defaults.get(CONF_IDLE_GAP, DEFAULT_IDLE_GAP),
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=30,
                    max=3600,
                    step=30,
                    unit_of_measurement="s",
                    mode=selector.NumberSelectorMode.BOX,
                )
            ),
            vol.Required(
                CONF_MIN_DISTANCE,
                default=defaults.get(CONF_MIN_DISTANCE, DEFAULT_MIN_DISTANCE),
            ): selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=0,
                    max=10,
                    step=0.05,
                    unit_of_measurement="km",
                    mode=selector.NumberSelectorMode.BOX,
                )
            ),
    }
    if include_panel:
        fields[
            vol.Required(
                CONF_SHOW_PANEL,
                default=defaults.get(CONF_SHOW_PANEL, DEFAULT_SHOW_PANEL),
            )
        ] = selector.BooleanSelector()
    return vol.Schema(fields)


def _validate(hass, user_input: dict[str, Any]) -> dict[str, str]:
    """Return a mapping of field -> error key for any invalid selections."""
    errors: dict[str, str] = {}
    odo = user_input.get(CONF_ODOMETER_ENTITY)
    if odo and hass.states.get(odo) is None:
        errors[CONF_ODOMETER_ENTITY] = "entity_not_found"
    tracker = user_input.get(CONF_TRACKER_ENTITY)
    if tracker and hass.states.get(tracker) is None:
        errors[CONF_TRACKER_ENTITY] = "entity_not_found"
    shift = user_input.get(CONF_SHIFT_ENTITY)
    if shift and hass.states.get(shift) is None:
        errors[CONF_SHIFT_ENTITY] = "entity_not_found"
    return errors


class TeslaTrackerConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle the initial configuration flow."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = _validate(self.hass, user_input)
            if not errors:
                await self.async_set_unique_id(
                    f"{DOMAIN}_{user_input[CONF_ODOMETER_ENTITY]}"
                )
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=NAME, data=user_input)

        return self.async_show_form(
            step_id="user",
            data_schema=_schema(user_input or {}),
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: ConfigEntry,
    ) -> "TeslaTrackerOptionsFlow":
        return TeslaTrackerOptionsFlow(config_entry)


class TeslaTrackerOptionsFlow(OptionsFlow):
    """Allow re-configuring the same settings after setup."""

    def __init__(self, config_entry: ConfigEntry) -> None:
        self.config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        errors: dict[str, str] = {}
        if user_input is not None:
            errors = _validate(self.hass, user_input)
            if not errors:
                return self.async_create_entry(title="", data=user_input)
            defaults = user_input
        else:
            # Options override data; fall back to the original config entry data.
            defaults = {**self.config_entry.data, **self.config_entry.options}

        return self.async_show_form(
            step_id="init",
            data_schema=_schema(defaults, include_panel=True),
            errors=errors,
        )
