import type { PlayableEvent } from '../lib/player/model';
import type { CameraName } from '../lib/teslacam/types';
import type { MasterClock } from '../hooks/useMasterClock';
import { VideoCameraTile } from './VideoCameraTile';
import { ProceduralCameraTile } from './ProceduralCameraTile';

const CAMERA_LABELS: Record<CameraName, string> = {
  front: 'Front',
  back: 'Back',
  left_repeater: 'Left Repeater',
  right_repeater: 'Right Repeater',
  left_pillar: 'Left Pillar',
  right_pillar: 'Right Pillar',
};

interface Props {
  event: PlayableEvent;
  clock: MasterClock;
  registerCanvas?: (camera: string, canvas: HTMLCanvasElement | null) => void;
}

/** The synchronized multi-camera grid. */
export function CameraGrid({ event, clock, registerCanvas }: Props) {
  return (
    <div className="cam-grid" data-count={event.tracks.length}>
      {event.tracks.map((track) =>
        track.kind === 'video' ? (
          <VideoCameraTile
            key={track.camera}
            track={track}
            clock={clock}
            label={CAMERA_LABELS[track.camera]}
          />
        ) : (
          <ProceduralCameraTile
            key={track.camera}
            track={track}
            clock={clock}
            label={CAMERA_LABELS[track.camera]}
            registerCanvas={registerCanvas}
          />
        ),
      )}
    </div>
  );
}
