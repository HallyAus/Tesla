"""Pure-Python aggregation core for Tesla Tracker.

This module has ZERO Home Assistant imports so it can be unit-tested with plain
``pytest`` and reused anywhere. It turns a list of :class:`Drive` records into
day / week / month rollups.

All datetimes are expected to be timezone-aware. Callers inject ``now`` (and
implicitly its tzinfo) so behaviour is deterministic and testable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Iterable

__all__ = [
    "Drive",
    "Rollup",
    "rollup",
    "rollup_today",
    "rollup_yesterday",
    "rollup_week",
    "rollup_month",
    "daily_series",
    "drives_in_window",
]

# Period identifiers (kept local so this module needs no HA const import).
PERIOD_TODAY = "today"
PERIOD_YESTERDAY = "yesterday"
PERIOD_WEEK = "week"
PERIOD_MONTH = "month"


@dataclass
class Drive:
    """A single completed drive.

    ``start`` / ``end`` are timezone-aware datetimes. ``distance`` is in the
    user's configured unit (km or mi). ``route`` is an ordered list of
    ``(lat, lon)`` samples; it is optional and ignored by aggregation maths.
    """

    start: datetime
    end: datetime
    distance: float
    start_location: tuple[float, float] | None = None
    end_location: tuple[float, float] | None = None
    route: list[tuple[float, float]] = field(default_factory=list)

    @property
    def duration_s(self) -> float:
        """Drive duration in seconds (never negative)."""
        return max(0.0, (self.end - self.start).total_seconds())

    @classmethod
    def from_dict(cls, data: dict) -> "Drive":
        """Build a Drive from a plain JSON-friendly dict (ISO datetimes)."""
        route = [tuple(pt) for pt in data.get("route", [])]
        start_loc = data.get("start_location")
        end_loc = data.get("end_location")
        return cls(
            start=_parse_dt(data["start"]),
            end=_parse_dt(data["end"]),
            distance=float(data["distance"]),
            start_location=tuple(start_loc) if start_loc else None,
            end_location=tuple(end_loc) if end_loc else None,
            route=route,
        )

    def to_dict(self) -> dict:
        """Serialise to a plain JSON-friendly dict (ISO datetimes)."""
        return {
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "distance": self.distance,
            "start_location": list(self.start_location)
            if self.start_location
            else None,
            "end_location": list(self.end_location) if self.end_location else None,
            "route": [list(pt) for pt in self.route],
        }


@dataclass
class Rollup:
    """Aggregated totals for a period."""

    period: str
    start: datetime
    end: datetime
    distance: float = 0.0
    drive_count: int = 0
    duration_s: float = 0.0
    series: list[dict] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "period": self.period,
            "start": self.start.isoformat(),
            "end": self.end.isoformat(),
            "distance": round(self.distance, 3),
            "drive_count": self.drive_count,
            "duration_s": round(self.duration_s, 1),
            "series": self.series,
        }


def _parse_dt(value) -> datetime:
    if isinstance(value, datetime):
        return value
    # Python's fromisoformat handles offsets (incl. "Z" on 3.11+).
    text = str(value)
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    return datetime.fromisoformat(text)


def _day_bounds(d: date, tz) -> tuple[datetime, datetime]:
    """Return [start, end) datetimes for the calendar day ``d`` in ``tz``."""
    start = datetime.combine(d, time.min, tzinfo=tz)
    end = start + timedelta(days=1)
    return start, end


def period_bounds(period: str, now: datetime) -> tuple[datetime, datetime]:
    """Compute the half-open ``[start, end)`` window for ``period`` at ``now``.

    Week starts on Monday. Month boundaries respected. ``now`` carries the tz.
    """
    tz = now.tzinfo
    today = now.date()

    if period == PERIOD_TODAY:
        return _day_bounds(today, tz)

    if period == PERIOD_YESTERDAY:
        return _day_bounds(today - timedelta(days=1), tz)

    if period == PERIOD_WEEK:
        # Monday == weekday() 0.
        monday = today - timedelta(days=today.weekday())
        start = datetime.combine(monday, time.min, tzinfo=tz)
        end = start + timedelta(days=7)
        return start, end

    if period == PERIOD_MONTH:
        start = datetime.combine(today.replace(day=1), time.min, tzinfo=tz)
        if start.month == 12:
            nxt = start.replace(year=start.year + 1, month=1)
        else:
            nxt = start.replace(month=start.month + 1)
        return start, nxt

    raise ValueError(f"Unknown period: {period!r}")


def drives_in_window(
    drives: Iterable[Drive], start: datetime, end: datetime
) -> list[Drive]:
    """Drives whose *start* falls within the half-open window ``[start, end)``."""
    return [d for d in drives if start <= d.start < end]


def daily_series(drives: Iterable[Drive], start: datetime, end: datetime) -> list[dict]:
    """Per-day distance/count series across ``[start, end)`` for charting.

    Produces one entry per calendar day from ``start`` up to (not incl.) ``end``,
    so empty days appear as zeros — friendly for bar/line charts.
    """
    tz = start.tzinfo
    buckets: dict[date, dict] = {}
    cur = start
    while cur < end:
        buckets[cur.date()] = {
            "date": cur.date().isoformat(),
            "distance": 0.0,
            "drive_count": 0,
        }
        cur += timedelta(days=1)

    for d in drives:
        if not (start <= d.start < end):
            continue
        # Bucket by the drive's start day in the window's timezone.
        local_day = d.start.astimezone(tz).date() if tz else d.start.date()
        bucket = buckets.get(local_day)
        if bucket is None:
            continue
        bucket["distance"] += d.distance
        bucket["drive_count"] += 1

    series = list(buckets.values())
    for b in series:
        b["distance"] = round(b["distance"], 3)
    return series


def rollup(drives: Iterable[Drive], period: str, now: datetime) -> Rollup:
    """Generic rollup for any supported ``period`` at ``now``."""
    drives = list(drives)
    start, end = period_bounds(period, now)
    window = drives_in_window(drives, start, end)

    result = Rollup(period=period, start=start, end=end)
    result.distance = sum(d.distance for d in window)
    result.drive_count = len(window)
    result.duration_s = sum(d.duration_s for d in window)
    # Per-day series only meaningful for multi-day periods, but harmless for day.
    result.series = daily_series(drives, start, end)
    return result


def rollup_today(drives: Iterable[Drive], now: datetime) -> Rollup:
    return rollup(drives, PERIOD_TODAY, now)


def rollup_yesterday(drives: Iterable[Drive], now: datetime) -> Rollup:
    return rollup(drives, PERIOD_YESTERDAY, now)


def rollup_week(drives: Iterable[Drive], now: datetime) -> Rollup:
    return rollup(drives, PERIOD_WEEK, now)


def rollup_month(drives: Iterable[Drive], now: datetime) -> Rollup:
    return rollup(drives, PERIOD_MONTH, now)
