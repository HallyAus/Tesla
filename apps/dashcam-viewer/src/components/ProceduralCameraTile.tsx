import { useEffect, useRef } from 'react';
import type { CameraTrack } from '../lib/player/model';
import type { MasterClock } from '../hooks/useMasterClock';

interface Props {
  track: CameraTrack;
  clock: MasterClock;
  label: string;
  /** Lets the parent capture this canvas for PNG snapshot export. */
  registerCanvas?: (camera: string, canvas: HTMLCanvasElement | null) => void;
}

const W = 480;
const H = 270;

/**
 * A demo camera tile. Repaints its procedural feed every animation frame using
 * the master clock's time, so it stays perfectly in sync with all other tiles.
 */
export function ProceduralCameraTile({ track, clock, label, registerCanvas }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !track.draw) return;
    registerCanvas?.(track.camera, canvas);
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
      registerCanvas?.(track.camera, null);
    };
  }, [track, clock, registerCanvas]);

  return (
    <div className="cam-tile">
      <canvas ref={canvasRef} width={W} height={H} className="cam-video" />
      <span className="cam-label">{label}</span>
    </div>
  );
}
