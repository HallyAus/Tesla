"""Plain-pytest tests for the pure aggregation core."""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from conftest import aggregation

Drive = aggregation.Drive
UTC = timezone.utc

FIXTURE = (
    Path(__file__).resolve().parent / "fixtures" / "sample_drives.json"
)


def mk(start: datetime, distance: float, dur_min: int = 20) -> Drive:
    return Drive(start=start, end=start + timedelta(minutes=dur_min),
                 distance=distance)


def load_fixture():
    data = json.loads(FIXTURE.read_text())
    drives = [Drive.from_dict(d) for d in data["drives"]]
    now = datetime.fromisoformat(data["reference_now"])
    return drives, now


# --- period_bounds ----------------------------------------------------------

def test_today_bounds():
    now = datetime(2025, 1, 15, 13, 30, tzinfo=UTC)
    start, end = aggregation.period_bounds("today", now)
    assert start == datetime(2025, 1, 15, 0, 0, tzinfo=UTC)
    assert end == datetime(2025, 1, 16, 0, 0, tzinfo=UTC)


def test_yesterday_bounds():
    now = datetime(2025, 1, 15, 13, 30, tzinfo=UTC)
    start, end = aggregation.period_bounds("yesterday", now)
    assert start == datetime(2025, 1, 14, 0, 0, tzinfo=UTC)
    assert end == datetime(2025, 1, 15, 0, 0, tzinfo=UTC)


def test_week_starts_monday():
    # 2025-01-15 is a Wednesday; Monday of that week is 2025-01-13.
    now = datetime(2025, 1, 15, 13, 30, tzinfo=UTC)
    start, end = aggregation.period_bounds("week", now)
    assert start == datetime(2025, 1, 13, 0, 0, tzinfo=UTC)
    assert start.weekday() == 0  # Monday
    assert end == datetime(2025, 1, 20, 0, 0, tzinfo=UTC)


def test_week_on_a_monday_includes_that_monday():
    now = datetime(2025, 1, 13, 9, 0, tzinfo=UTC)  # Monday
    start, end = aggregation.period_bounds("week", now)
    assert start == datetime(2025, 1, 13, 0, 0, tzinfo=UTC)
    assert end == datetime(2025, 1, 20, 0, 0, tzinfo=UTC)


def test_month_bounds():
    now = datetime(2025, 1, 15, 13, 30, tzinfo=UTC)
    start, end = aggregation.period_bounds("month", now)
    assert start == datetime(2025, 1, 1, 0, 0, tzinfo=UTC)
    assert end == datetime(2025, 2, 1, 0, 0, tzinfo=UTC)


def test_month_december_rolls_to_january():
    now = datetime(2024, 12, 20, 0, 0, tzinfo=UTC)
    start, end = aggregation.period_bounds("month", now)
    assert start == datetime(2024, 12, 1, 0, 0, tzinfo=UTC)
    assert end == datetime(2025, 1, 1, 0, 0, tzinfo=UTC)


def test_unknown_period_raises():
    now = datetime(2025, 1, 15, tzinfo=UTC)
    try:
        aggregation.period_bounds("decade", now)
    except ValueError:
        return
    raise AssertionError("expected ValueError")


# --- rollups ----------------------------------------------------------------

def test_empty_data():
    now = datetime(2025, 1, 15, 12, 0, tzinfo=UTC)
    r = aggregation.rollup([], "week", now)
    assert r.distance == 0
    assert r.drive_count == 0
    assert r.duration_s == 0
    # Series still spans 7 days, all zero.
    assert len(r.series) == 7
    assert all(s["distance"] == 0 for s in r.series)


def test_today_vs_yesterday_separation():
    now = datetime(2025, 1, 15, 12, 0, tzinfo=UTC)
    drives = [
        mk(datetime(2025, 1, 15, 8, 0, tzinfo=UTC), 10.0),   # today
        mk(datetime(2025, 1, 14, 8, 0, tzinfo=UTC), 5.0),    # yesterday
        mk(datetime(2025, 1, 14, 23, 59, tzinfo=UTC), 3.0),  # still yesterday
        mk(datetime(2025, 1, 15, 0, 0, tzinfo=UTC), 7.0),    # exactly today start
    ]
    today = aggregation.rollup(drives, "today", now)
    yest = aggregation.rollup(drives, "yesterday", now)
    assert today.distance == 17.0
    assert today.drive_count == 2
    assert yest.distance == 8.0
    assert yest.drive_count == 2


def test_drive_at_day_boundary_belongs_to_next_day():
    now = datetime(2025, 1, 15, 12, 0, tzinfo=UTC)
    # 23:59 on the 14th is yesterday; 00:00 on 15th is today (half-open).
    drives = [mk(datetime(2025, 1, 15, 0, 0, tzinfo=UTC), 4.0)]
    assert aggregation.rollup(drives, "today", now).drive_count == 1
    assert aggregation.rollup(drives, "yesterday", now).drive_count == 0


def test_duration_sum():
    now = datetime(2025, 1, 15, 12, 0, tzinfo=UTC)
    drives = [
        mk(datetime(2025, 1, 15, 8, 0, tzinfo=UTC), 10.0, dur_min=30),
        mk(datetime(2025, 1, 15, 9, 0, tzinfo=UTC), 10.0, dur_min=15),
    ]
    r = aggregation.rollup(drives, "today", now)
    assert r.duration_s == (30 + 15) * 60


def test_daily_series_buckets_correctly():
    now = datetime(2025, 1, 15, 12, 0, tzinfo=UTC)
    drives = [
        mk(datetime(2025, 1, 13, 8, 0, tzinfo=UTC), 10.0),  # Mon
        mk(datetime(2025, 1, 13, 18, 0, tzinfo=UTC), 5.0),  # Mon
        mk(datetime(2025, 1, 15, 8, 0, tzinfo=UTC), 7.0),   # Wed
    ]
    week = aggregation.rollup(drives, "week", now)
    series = {s["date"]: s for s in week.series}
    assert series["2025-01-13"]["distance"] == 15.0
    assert series["2025-01-13"]["drive_count"] == 2
    assert series["2025-01-14"]["distance"] == 0.0
    assert series["2025-01-15"]["distance"] == 7.0


# --- fixture (multi-day / multi-week / multi-month) -------------------------

def test_fixture_rollups():
    drives, now = load_fixture()
    today = aggregation.rollup(drives, "today", now)
    yest = aggregation.rollup(drives, "yesterday", now)
    week = aggregation.rollup(drives, "week", now)
    month = aggregation.rollup(drives, "month", now)

    # Today: two morning drives on Jan 15.
    assert today.drive_count == 2
    assert round(today.distance, 1) == round(19.7 + 12.5, 1)

    # Yesterday: three drives on Jan 14.
    assert yest.drive_count == 3
    assert round(yest.distance, 1) == round(21.4 + 23.8 + 8.1, 1)

    # Week (Mon Jan13 .. Sun Jan19): Mon x2 + yesterday x3 + today x2 = 7.
    assert week.drive_count == 7

    # Month (Jan 2025): excludes the two December drives -> 10 of 12.
    assert month.drive_count == 10
    # December drives must NOT leak into the month rollup.
    dec_distance = 18.4 + 32.1
    assert round(month.distance, 1) != 0
    assert all(s["date"].startswith("2025-01") for s in month.series)
    # Month total should not include December distances.
    jan_total = sum(
        d.distance for d in drives if d.start.month == 1 and d.start.year == 2025
    )
    assert round(month.distance, 1) == round(jan_total, 1)
    assert round(month.distance, 1) != round(jan_total + dec_distance, 1)


def test_helpers_match_generic():
    drives, now = load_fixture()
    assert (
        aggregation.rollup_today(drives, now).distance
        == aggregation.rollup(drives, "today", now).distance
    )
    assert (
        aggregation.rollup_month(drives, now).drive_count
        == aggregation.rollup(drives, "month", now).drive_count
    )
