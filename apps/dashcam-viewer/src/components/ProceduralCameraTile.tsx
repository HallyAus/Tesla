import { useEffect, useRef } from 'react';
import type { CameraTrack } from '../lib/player/model';
import type { CameraName } from '../lib/teslacam/types';
import type { MasterClock } from '../hooks/useMasterClock';

interface Props {
  track: CameraTrack;
  clock: MasterClock;
  label: string;
  className?: string;
  /** Register/unregister the live <canvas> for compositing/snapshot. */
  registerElement?: (camera: CameraName, el: HTMLCanvasElement | null) => void;
  onActivate?: (camera: CameraName) => void;
}

const W = 480;
const H = 270;

/**
 * A demo camera tile. Repaints its procedural feed every animation frame using
 * the master clock's time, so it stays perfectly in sync with all other tiles.
 */
export function ProceduralCameraTile({
  track,
  clock,
  label,
  className,
  registerElement,
  onActivate,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !track.draw) return;
    registerElement?.(track.camera, canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const loop = () => {
      track.draw!(ctx, clock.readTime(), W, H);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      registerElement?.(track.camera, null);
    };
  }, [track, clock, registerElement]);

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
      <canvas ref={canvasRef} width={W} height={H} className="cam-video" />
      <span className="cam-label">{label}</span>
    </div>
  );
}
