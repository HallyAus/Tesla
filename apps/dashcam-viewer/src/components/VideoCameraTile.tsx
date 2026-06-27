import { useEffect, useRef } from 'react';
import type { CameraTrack } from '../lib/player/model';
import type { MasterClock } from '../hooks/useMasterClock';

/** How far (seconds) a video may drift from the master clock before we hard-seek. */
const RESYNC_THRESHOLD = 0.35;

interface Props {
  track: CameraTrack;
  clock: MasterClock;
  label: string;
}

/**
 * A real-footage camera tile. Plays the correct segment `<video>` for the
 * master clock's time, swapping src at segment boundaries, and continuously
 * nudges `currentTime` back toward the master clock to hold sync.
 */
export function VideoCameraTile({ track, clock, label }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentSegRef = useRef<number>(-1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !track.segments) return;
    let raf = 0;

    const segments = track.segments;

    const loop = () => {
      const t = clock.readTime();
      // Find the segment covering time t.
      let idx = segments.findIndex(
        (s) => t >= s.startSec && t < s.startSec + s.durationSec,
      );
      if (idx === -1) idx = t < segments[0].startSec ? 0 : segments.length - 1;
      const seg = segments[idx];

      if (idx !== currentSegRef.current) {
        currentSegRef.current = idx;
        if (video.src !== seg.url) video.src = seg.url;
      }

      const localTime = Math.max(0, t - seg.startSec);
      const drift = Math.abs(video.currentTime - localTime);
      if (drift > RESYNC_THRESHOLD && Number.isFinite(localTime)) {
        try {
          video.currentTime = localTime;
        } catch {
          /* seeking before metadata is ready – ignore */
        }
      }

      video.playbackRate = clock.playbackRate;
      if (clock.isPlaying && video.paused) void video.play().catch(() => {});
      if (!clock.isPlaying && !video.paused) video.pause();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [track, clock]);

  return (
    <div className="cam-tile">
      <video
        ref={videoRef}
        muted
        playsInline
        preload="auto"
        className="cam-video"
        data-camera={track.camera}
      />
      <span className="cam-label">{label}</span>
    </div>
  );
}
