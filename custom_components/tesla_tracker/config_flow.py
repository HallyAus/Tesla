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
    CONF_ODOMETER_ENTITY,
    CONF_SHIFT_ENTITY,
    CONF_TRACKER_ENTITY,
    CONF_UNIT,
    DEFAULT_DAILY_RESET,
    DEFAULT_IDLE_GAP,
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


def _schema(defaults: dict[str, Any]) -> vol.Schema:
    """Build the (re)usable form schema for both config and options flows."""
    return vol.Schema(
        {
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
        }
    )


class TeslaTrackerConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle the initial configuration flow."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            await self.async_set_unique_id(
                f"{DOMAIN}_{user_input[CONF_ODOMETER_ENTITY]}"
            )
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title=NAME, data=user_input)

        return self.async_show_form(
            step_id="user", data_schema=_schema({})
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
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        # Options override data; fall back to the original config entry data.
        defaults = {**self.config_entry.data, **self.config_entry.options}
        return self.async_show_form(
            step_id="init", data_schema=_schema(defaults)
        )
