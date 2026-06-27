"""Pure-Python drive-detection state machine.

Factored out of ``coordinator.py`` so the heuristic is unit-testable WITHOUT a
Home Assistant install. The coordinator feeds discrete "samples" (one per
relevant state-change event) into :class:`DriveDetector` and receives a
completed :class:`Drive` whenever a drive ends.

Detection heuristic
-------------------
A *sample* carries: timestamp, odometer reading, optional (lat, lon), and
optional shift state ("P"/"R"/"N"/"D" or None when the vehicle doesn't report
it).

A drive is considered **active** when EITHER:
  * shift state is a driving gear (R/N/D), OR
  * shift state is unavailable AND the odometer (or position) is moving.

A drive **ends** when EITHER:
  * shift state returns to "P" (park), OR
  * no movement has been observed for ``idle_gap`` seconds (idle timeout).

Drives shorter than ``min_distance`` are discarded as noise.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta

from .aggregation import Drive

DRIVING_GEARS = frozenset({"R", "N", "D"})
PARK_GEARS = frozenset({"P"})


@dataclass
class Sample:
    """A single observation of the vehicle."""

    ts: datetime
    odometer: float | None = None
    location: tuple[float, float] | None = None
    shift: str | None = None


@dataclass
class _ActiveDrive:
    start_ts: datetime
    start_odo: float | None
    start_loc: tuple[float, float] | None
    last_move_ts: datetime
    last_odo: float | None
    last_loc: tuple[float, float] | None
    route: list[tuple[float, float]] = field(default_factory=list)
    # Accumulated, glitch-filtered odometer distance. Used as the authoritative
    # distance so a mid-drive rollback/spike can't corrupt the total.
    distance: float = 0.0

    def to_dict(self) -> dict:
        """JSON-friendly snapshot for persisting an in-progress drive."""
        return {
            "start_ts": self.start_ts.isoformat(),
            "start_odo": self.start_odo,
            "start_loc": list(self.start_loc) if self.start_loc else None,
            "last_move_ts": self.last_move_ts.isoformat(),
            "last_odo": self.last_odo,
            "last_loc": list(self.last_loc) if self.last_loc else None,
            "route": [list(p) for p in self.route],
            "distance": self.distance,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "_ActiveDrive":
        from datetime import datetime as _dt

        def _loc(v):
            return tuple(v) if v else None

        return cls(
            start_ts=_dt.fromisoformat(data["start_ts"]),
            start_odo=data.get("start_odo"),
            start_loc=_loc(data.get("start_loc")),
            last_move_ts=_dt.fromisoformat(data["last_move_ts"]),
            last_odo=data.get("last_odo"),
            last_loc=_loc(data.get("last_loc")),
            route=[tuple(p) for p in data.get("route", [])],
            distance=float(data.get("distance", 0.0)),
        )


def _haversine_m(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Great-circle distance between two ``(lat, lon)`` points in metres."""
    from math import asin, cos, radians, sin, sqrt

    lat1, lon1 = a
    lat2, lon2 = b
    rlat1, rlat2 = radians(lat1), radians(lat2)
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    h = sin(dlat / 2) ** 2 + cos(rlat1) * cos(rlat2) * sin(dlon / 2) ** 2
    return 2 * 6371000.0 * asin(min(1.0, sqrt(h)))


@dataclass
class DriveDetector:
    """Stateful, HA-free drive detector.

    Parameters
    ----------
    idle_gap : seconds with no movement before a drive auto-closes.
    min_distance : minimum odometer delta (source units) to keep a drive.
    move_epsilon : odometer delta (source units) treated as "moving".
    gps_jitter_m : positional changes smaller than this (metres) are treated as
        GPS noise, not movement.
    odo_glitch : an odometer *increase* larger than this in a single step is
        treated as a sensor glitch and ignored (distance not credited).
    """

    idle_gap: float = 300.0
    min_distance: float = 0.05
    move_epsilon: float = 0.01
    gps_jitter_m: float = 25.0
    odo_glitch: float = 500.0

    _active: _ActiveDrive | None = field(default=None, init=False)

    @property
    def in_drive(self) -> bool:
        return self._active is not None

    def _odo_delta(self, sample: Sample) -> float | None:
        """Sanitised odometer delta vs the last reading.

        Returns the credited delta (>= 0), or ``None`` when there is no usable
        reading. Negative deltas (rollback / counter reset) yield 0.0 and
        implausibly large positive jumps (glitch) yield 0.0 so they are ignored
        for distance and movement.
        """
        if (
            self._active is None
            or sample.odometer is None
            or self._active.last_odo is None
        ):
            return None
        delta = sample.odometer - self._active.last_odo
        if delta < 0:
            # Rollback / glitch: ignore, don't subtract.
            return 0.0
        if delta > self.odo_glitch:
            # Implausible jump: treat as a spike, credit nothing.
            return 0.0
        return delta

    def _is_moving(self, sample: Sample) -> bool:
        if self._active is None:
            return False
        delta = self._odo_delta(sample)
        if delta is not None and delta >= self.move_epsilon:
            return True
        # Position change as a fallback movement signal, but filter GPS jitter.
        if (
            sample.location is not None
            and self._active.last_loc is not None
            and _haversine_m(sample.location, self._active.last_loc)
            >= self.gps_jitter_m
        ):
            return True
        return False

    def _start(self, sample: Sample) -> None:
        self._active = _ActiveDrive(
            start_ts=sample.ts,
            start_odo=sample.odometer,
            start_loc=sample.location,
            last_move_ts=sample.ts,
            last_odo=sample.odometer,
            last_loc=sample.location,
            route=[sample.location] if sample.location else [],
        )

    def _finish(self, end_sample: Sample | None) -> Drive | None:
        active = self._active
        self._active = None
        if active is None:
            return None

        end_ts = end_sample.ts if end_sample else active.last_move_ts
        end_loc = (
            end_sample.location
            if end_sample and end_sample.location is not None
            else active.last_loc
        )

        # Credit any final sanitised step the end sample carries.
        distance = active.distance
        if (
            end_sample is not None
            and end_sample.odometer is not None
            and active.last_odo is not None
        ):
            step = end_sample.odometer - active.last_odo
            if 0 <= step <= self.odo_glitch:
                distance += step

        if distance < self.min_distance:
            return None

        route = list(active.route)
        if end_loc and (not route or route[-1] != end_loc):
            route.append(end_loc)

        return Drive(
            start=active.start_ts,
            end=end_ts,
            distance=distance,
            start_location=active.start_loc,
            end_location=end_loc,
            route=route,
        )

    def process(self, sample: Sample) -> Drive | None:
        """Feed a sample; return a completed Drive if one just ended."""
        completed: Drive | None = None

        shift = sample.shift.upper() if isinstance(sample.shift, str) else None

        if self._active is None:
            # Not currently driving — decide whether to start.
            if shift in DRIVING_GEARS:
                self._start(sample)
            elif shift is None:
                # No shift signal: a movement vs a remembered baseline starts a
                # drive. The coordinator primes a baseline via prime().
                pass
            return None

        # --- We are in a drive ---
        # 1) Explicit park ends the drive.
        if shift in PARK_GEARS:
            return self._finish(sample)

        # Credit the sanitised (rollback/glitch-filtered) odometer delta.
        delta = self._odo_delta(sample)

        moving = self._is_moving(sample)
        if moving:
            self._active.last_move_ts = sample.ts
            if sample.location and (
                not self._active.route or self._active.route[-1] != sample.location
            ):
                self._active.route.append(sample.location)
        else:
            # 2) Idle timeout ends the drive (use this sample's ts as the clock).
            idle = (sample.ts - self._active.last_move_ts).total_seconds()
            if idle >= self.idle_gap:
                completed = self._finish(self._active_end_sample())
                # After closing on idle, this sample may itself start a new drive.
                if shift in DRIVING_GEARS:
                    self._start(sample)
                return completed

        # Accumulate distance from the sanitised delta (ignores rollback/spike).
        if delta is not None:
            self._active.distance += delta

        # Always advance the "last" trackers so deltas are incremental.
        if sample.odometer is not None:
            self._active.last_odo = sample.odometer
        if sample.location is not None:
            self._active.last_loc = sample.location
        return completed

    def _active_end_sample(self) -> Sample | None:
        """Synthesise an end sample at the last movement (for idle close)."""
        if self._active is None:
            return None
        return Sample(
            ts=self._active.last_move_ts,
            odometer=self._active.last_odo,
            location=self._active.last_loc,
        )

    def prime(self, sample: Sample) -> None:
        """Establish a baseline without starting a drive (no-shift mode).

        If subsequent movement is detected the coordinator calls start_from().
        """
        # When there is no shift signal we open a tentative drive on first
        # movement; priming just records a baseline by opening+immediately
        # treating it as not-yet-moved.
        self._start(sample)
        # Mark as not moved: keep last_move_ts at start; if no movement occurs
        # the idle timeout will close it with zero distance (discarded).

    def flush(self, now: datetime) -> Drive | None:
        """Force-close any active drive (e.g. on shutdown)."""
        if self._active is None:
            return None
        return self._finish(Sample(ts=now, odometer=self._active.last_odo,
                                   location=self._active.last_loc))

    # --- restart-resume support -------------------------------------------
    def snapshot(self) -> dict | None:
        """Serialise any in-progress drive so it survives a restart."""
        if self._active is None:
            return None
        return self._active.to_dict()

    def resume(self, data: dict | None) -> None:
        """Restore an in-progress drive captured by :meth:`snapshot`.

        Safe to call with ``None`` (no-op). Replaces any current active drive.
        """
        if not data:
            return
        self._active = _ActiveDrive.from_dict(data)
