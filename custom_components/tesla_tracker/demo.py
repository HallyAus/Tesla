"""Runnable demo for the pure aggregation core.

Loads ``tests/fixtures/sample_drives.json`` and prints today/yesterday/week/
month rollups. Runs with no Home Assistant installed.

Usage:
    python custom_components/tesla_tracker/demo.py
    # or with an explicit "now":
    python custom_components/tesla_tracker/demo.py 2025-01-15T12:00:00+00:00
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

# Allow running as a plain script (no package install).
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import aggregation  # type: ignore
    from aggregation import Drive
else:  # pragma: no cover - only when imported as a package
    from . import aggregation
    from .aggregation import Drive

FIXTURE = (
    Path(__file__).resolve().parents[2]
    / "tests"
    / "fixtures"
    / "sample_drives.json"
)


def load_drives(path: Path) -> list[Drive]:
    data = json.loads(path.read_text())
    return [Drive.from_dict(d) for d in data["drives"]]


def main() -> None:
    drives = load_drives(FIXTURE)

    if len(sys.argv) > 1:
        now = datetime.fromisoformat(sys.argv[1])
    else:
        # Default to the fixture's documented reference "now" for stable output.
        now = datetime(2025, 1, 15, 12, 0, 0, tzinfo=timezone.utc)

    print(f"Reference now: {now.isoformat()}")
    print(f"Total drives in fixture: {len(drives)}\n")

    for period in ("today", "yesterday", "week", "month"):
        r = aggregation.rollup(drives, period, now)
        print(
            f"{period:<10} "
            f"distance={r.distance:8.2f}  "
            f"drives={r.drive_count:3d}  "
            f"duration={r.duration_s / 60:6.1f} min"
        )

    print("\nThis-week per-day series:")
    week = aggregation.rollup_week(drives, now)
    for row in week.series:
        bar = "#" * int(row["distance"] // 5)
        print(
            f"  {row['date']}  {row['distance']:7.2f}  "
            f"({row['drive_count']} drives) {bar}"
        )


if __name__ == "__main__":
    main()
