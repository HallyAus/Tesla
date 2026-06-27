"""Make the pure modules importable without installing Home Assistant.

We import ``aggregation`` and ``drive_detect`` directly from the package
directory. ``drive_detect`` does ``from .aggregation import Drive``, so we load
the package as a namespace-free shim under the name ``tesla_tracker``.
"""

import importlib.util
import sys
import types
from pathlib import Path

PKG_DIR = (
    Path(__file__).resolve().parents[1]
    / "custom_components"
    / "tesla_tracker"
)


def _load(name: str):
    """Load a module from the package dir under the tesla_tracker namespace."""
    full = f"tesla_tracker.{name}"
    if full in sys.modules:
        return sys.modules[full]
    spec = importlib.util.spec_from_file_location(
        full, PKG_DIR / f"{name}.py"
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[full] = mod
    spec.loader.exec_module(mod)
    return mod


# Register a lightweight package so relative imports (.aggregation) resolve.
if "tesla_tracker" not in sys.modules:
    pkg = types.ModuleType("tesla_tracker")
    pkg.__path__ = [str(PKG_DIR)]
    sys.modules["tesla_tracker"] = pkg

aggregation = _load("aggregation")
drive_detect = _load("drive_detect")
