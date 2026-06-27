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
