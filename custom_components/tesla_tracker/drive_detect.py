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


@dataclass
class DriveDetector:
    """Stateful, HA-free drive detector.

    Parameters
    ----------
    idle_gap : seconds with no movement before a drive auto-closes.
    min_distance : minimum odometer delta (source units) to keep a drive.
    move_epsilon : odometer delta (source units) treated as "moving".
    """

    idle_gap: float = 300.0
    min_distance: float = 0.05
    move_epsilon: float = 0.01

    _active: _ActiveDrive | None = field(default=None, init=False)

    @property
    def in_drive(self) -> bool:
        return self._active is not None

    def _is_moving(self, sample: Sample) -> bool:
        if self._active is None:
            return False
        if (
            sample.odometer is not None
            and self._active.last_odo is not None
            and abs(sample.odometer - self._active.last_odo) >= self.move_epsilon
        ):
            return True
        # Position change as a fallback movement signal.
        if (
            sample.location is not None
            and self._active.last_loc is not None
            and sample.location != self._active.last_loc
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
        end_odo = (
            end_sample.odometer
            if end_sample and end_sample.odometer is not None
            else active.last_odo
        )
        end_loc = (
            end_sample.location
            if end_sample and end_sample.location is not None
            else active.last_loc
        )

        distance = 0.0
        if active.start_odo is not None and end_odo is not None:
            distance = max(0.0, end_odo - active.start_odo)

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
