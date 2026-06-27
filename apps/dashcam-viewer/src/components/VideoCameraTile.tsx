import { useEffect, useRef } from 'react';
import type { CameraTrack } from '../lib/player/model';
import type { CameraName } from '../lib/teslacam/types';
import type { MasterClock } from '../hooks/useMasterClock';

/** How far (seconds) a video may drift from the master clock before we hard-seek. */
const RESYNC_THRESHOLD = 0.35;

interface Props {
  track: CameraTrack;
  clock: MasterClock;
  label: string;
  className?: string;
  /** Register/unregister the live <video> element for compositing/snapshot. */
  registerElement?: (camera: CameraName, el: HTMLVideoElement | null) => void;
  /** Report a measured segment duration once metadata loads. */
  onSegmentDuration?: (camera: CameraName, segIndex: number, durationSec: number) => void;
  onActivate?: (camera: CameraName) => void;
}

/**
 * A real-footage camera tile. Plays the correct segment `<video>` for the
 * master clock's time, swapping src at segment boundaries, and continuously
 * nudges `currentTime` back toward the master clock to hold sync.
 */
export function VideoCameraTile({
  track,
  clock,
  label,
  className,
  registerElement,
  onSegmentDuration,
  onActivate,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const currentSegRef = useRef<number>(-1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !track.segments) return;
    registerElement?.(track.camera, video);
    let raf = 0;

    const segments = track.segments;

    const onMeta = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        onSegmentDuration?.(track.camera, currentSegRef.current, video.duration);
      }
    };
    video.addEventListener('loadedmetadata', onMeta);

    const loop = () => {
      const t = clock.readTime();
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
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener('loadedmetadata', onMeta);
      registerElement?.(track.camera, null);
    };
  }, [track, clock, registerElement, onSegmentDuration]);

  return (
    <div
      className={`cam-tile ${className ?? ''}`}
      onClick={() => onActivate?.(track.camera)}
      role={onActivate ? 'button' : undefined}
      tabIndex={onActivate ? 0 : undefined}
      onKeyDown={(e) => {
        if (onActivate && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onActivate(track.camera);
        }
      }}
      aria-label={onActivate ? `Focus ${label} camera` : undefined}
    >
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
