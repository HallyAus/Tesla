"""Plain-pytest tests for the pure drive-detection state machine."""

from datetime import datetime, timedelta, timezone

from conftest import drive_detect

DriveDetector = drive_detect.DriveDetector
Sample = drive_detect.Sample
UTC = timezone.utc


def t(minutes: float) -> datetime:
    return datetime(2025, 1, 15, 8, 0, tzinfo=UTC) + timedelta(minutes=minutes)


def test_shift_based_drive_start_stop():
    det = DriveDetector(idle_gap=300, min_distance=0.05)
    assert det.process(Sample(t(0), odometer=100.0, shift="P")) is None
    # Enter Drive gear -> drive starts.
    assert det.process(Sample(t(0.1), odometer=100.0, shift="D")) is None
    assert det.in_drive
    det.process(Sample(t(5), odometer=105.0, shift="D"))
    det.process(Sample(t(10), odometer=112.0, shift="D"))
    # Park -> drive completes.
    drive = det.process(Sample(t(11), odometer=112.0, shift="P"))
    assert drive is not None
    assert not det.in_drive
    assert round(drive.distance, 2) == 12.0
    assert drive.start == t(0.1)
    assert drive.end == t(11)


def test_short_drive_discarded():
    det = DriveDetector(idle_gap=300, min_distance=0.5)
    det.process(Sample(t(0), odometer=100.0, shift="D"))
    det.process(Sample(t(1), odometer=100.1, shift="D"))
    drive = det.process(Sample(t(2), odometer=100.1, shift="P"))
    assert drive is None  # 0.1 km < min_distance


def test_idle_timeout_closes_drive_without_shift():
    # No shift signal at all: rely on odometer movement + idle gap.
    det = DriveDetector(idle_gap=300, min_distance=0.05)
    # Without shift we need a baseline; prime then movement.
    det.prime(Sample(t(0), odometer=200.0))
    assert det.in_drive
    det.process(Sample(t(2), odometer=205.0))   # moving
    det.process(Sample(t(4), odometer=210.0))   # moving
    # No movement for >= idle_gap (300s = 5min) -> closes on next sample.
    drive = det.process(Sample(t(4 + 6), odometer=210.0))
    assert drive is not None
    assert round(drive.distance, 2) == 10.0
    # End time is the last movement, not the idle sample.
    assert drive.end == t(4)


def test_route_polyline_accumulates():
    det = DriveDetector(idle_gap=300, min_distance=0.05)
    det.process(Sample(t(0), odometer=0.0, location=(1.0, 1.0), shift="D"))
    det.process(Sample(t(1), odometer=1.0, location=(1.1, 1.1), shift="D"))
    det.process(Sample(t(2), odometer=2.0, location=(1.2, 1.2), shift="D"))
    drive = det.process(Sample(t(3), odometer=2.0, location=(1.2, 1.2), shift="P"))
    assert drive is not None
    assert drive.route[0] == (1.0, 1.0)
    assert drive.route[-1] == (1.2, 1.2)
    assert len(drive.route) >= 3
    assert drive.start_location == (1.0, 1.0)
    assert drive.end_location == (1.2, 1.2)


def test_position_movement_as_signal_when_odometer_flat():
    det = DriveDetector(idle_gap=120, min_distance=0.0)
    det.prime(Sample(t(0), odometer=50.0, location=(0.0, 0.0)))
    # Odometer flat but position changes -> considered moving (keeps drive alive).
    det.process(Sample(t(1), odometer=50.0, location=(0.1, 0.1)))
    det.process(Sample(t(2), odometer=50.0, location=(0.2, 0.2)))
    assert det.in_drive
    # Now go idle past the gap.
    drive = det.process(Sample(t(2 + 3), odometer=50.0, location=(0.2, 0.2)))
    assert drive is not None
    # Distance is odometer-based (flat) -> 0, but min_distance=0 keeps it.
    assert drive.distance == 0.0


def test_two_drives_separated_by_park():
    det = DriveDetector(idle_gap=300, min_distance=0.05)
    det.process(Sample(t(0), odometer=0.0, shift="D"))
    det.process(Sample(t(5), odometer=10.0, shift="D"))
    d1 = det.process(Sample(t(6), odometer=10.0, shift="P"))
    assert d1 is not None and round(d1.distance, 1) == 10.0

    det.process(Sample(t(60), odometer=10.0, shift="D"))
    det.process(Sample(t(65), odometer=18.0, shift="D"))
    d2 = det.process(Sample(t(66), odometer=18.0, shift="P"))
    assert d2 is not None and round(d2.distance, 1) == 8.0


def test_flush_closes_active_drive():
    det = DriveDetector(idle_gap=300, min_distance=0.05)
    det.process(Sample(t(0), odometer=0.0, shift="D"))
    det.process(Sample(t(5), odometer=9.0, shift="D"))
    drive = det.flush(t(6))
    assert drive is not None
    assert round(drive.distance, 1) == 9.0
    assert not det.in_drive


# --- robustness: rollback / glitch / jitter / resume ------------------------

def test_odometer_rollback_ignored():
    # A momentary backwards reading must not subtract distance.
    det = DriveDetector(idle_gap=300, min_distance=0.05)
    det.process(Sample(t(0), odometer=100.0, shift="D"))
    det.process(Sample(t(2), odometer=110.0, shift="D"))   # +10
    det.process(Sample(t(3), odometer=108.0, shift="D"))   # rollback: ignore
    det.process(Sample(t(5), odometer=115.0, shift="D"))   # +7 from 108
    drive = det.process(Sample(t(6), odometer=115.0, shift="P"))
    assert drive is not None
    # Accumulated: 10 (100->110) + 0 (rollback) + 7 (108->115) = 17.
    assert round(drive.distance, 2) == 17.0


def test_odometer_glitch_spike_ignored():
    # A single absurd jump (sensor spike) must not be credited.
    det = DriveDetector(idle_gap=300, min_distance=0.05, odo_glitch=500.0)
    det.process(Sample(t(0), odometer=100.0, shift="D"))
    det.process(Sample(t(1), odometer=105.0, shift="D"))      # +5
    det.process(Sample(t(2), odometer=99999.0, shift="D"))    # glitch: ignore
    det.process(Sample(t(3), odometer=110.0, shift="D"))      # back to sane
    drive = det.process(Sample(t(4), odometer=112.0, shift="P"))
    assert drive is not None
    # 5 (100->105) + 0 (glitch) + 0 (99999->110 is negative => ignore) + 2.
    assert round(drive.distance, 2) == 7.0


def test_gps_jitter_does_not_keep_drive_alive():
    # Odometer flat, only tiny GPS wobble -> should be treated as idle and close.
    det = DriveDetector(idle_gap=300, min_distance=0.0, gps_jitter_m=25.0)
    det.prime(Sample(t(0), odometer=50.0, location=(-33.8688, 151.2093)))
    # ~1-2 metre wobble at the same spot (well under 25 m jitter threshold).
    det.process(Sample(t(1), odometer=50.0, location=(-33.86881, 151.20931)))
    det.process(Sample(t(2), odometer=50.0, location=(-33.86880, 151.20930)))
    assert det.in_drive  # wobble did NOT count as movement, but gap not hit yet
    # No real movement -> after idle gap (>=300s) the drive closes (zero dist).
    drive = det.process(Sample(t(10), odometer=50.0,
                               location=(-33.86881, 151.20931)))
    assert drive is not None
    assert drive.distance == 0.0


def test_real_gps_movement_keeps_drive_alive():
    # A clearly real move (hundreds of metres) counts even with flat odometer.
    det = DriveDetector(idle_gap=120, min_distance=0.0, gps_jitter_m=25.0)
    det.prime(Sample(t(0), odometer=50.0, location=(-33.8688, 151.2093)))
    det.process(Sample(t(1), odometer=50.0, location=(-33.8700, 151.2110)))
    det.process(Sample(t(2), odometer=50.0, location=(-33.8720, 151.2150)))
    assert det.in_drive
    drive = det.process(Sample(t(2 + 3), odometer=50.0,
                               location=(-33.8720, 151.2150)))
    assert drive is not None
    # Last movement was t(2), so the drive ends there.
    assert drive.end == t(2)


def test_snapshot_and_resume_round_trip():
    # A drive in progress is snapshotted (restart) and resumed without splitting.
    det = DriveDetector(idle_gap=300, min_distance=0.05)
    det.process(Sample(t(0), odometer=100.0, shift="D"))
    det.process(Sample(t(2), odometer=110.0, shift="D"))   # +10 so far
    snap = det.snapshot()
    assert snap is not None
    assert snap["distance"] == 10.0

    # Simulate restart: brand-new detector resumes the in-progress drive.
    det2 = DriveDetector(idle_gap=300, min_distance=0.05)
    assert not det2.in_drive
    det2.resume(snap)
    assert det2.in_drive
    det2.process(Sample(t(4), odometer=118.0, shift="D"))  # +8 after resume
    drive = det2.process(Sample(t(5), odometer=118.0, shift="P"))
    assert drive is not None
    # Full trip preserved: started at t(0), distance 10 + 8 = 18.
    assert drive.start == t(0)
    assert round(drive.distance, 2) == 18.0


def test_resume_none_is_noop():
    det = DriveDetector(idle_gap=300, min_distance=0.05)
    det.resume(None)
    assert not det.in_drive
    assert det.snapshot() is None
