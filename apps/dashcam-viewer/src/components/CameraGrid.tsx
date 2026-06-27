import { useMemo } from 'react';
import type { PlayableEvent } from '../lib/player/model';
import { trackForCamera } from '../lib/player/model';
import { resolveLayout, type LayoutId } from '../lib/player/layout';
import type { CameraName } from '../lib/teslacam/types';
import type { MasterClock } from '../hooks/useMasterClock';
import { VideoCameraTile } from './VideoCameraTile';
import { ProceduralCameraTile } from './ProceduralCameraTile';

export const CAMERA_LABELS: Record<CameraName, string> = {
  front: 'Front',
  back: 'Back',
  left_repeater: 'Left Repeater',
  right_repeater: 'Right Repeater',
  left_pillar: 'Left Pillar',
  right_pillar: 'Right Pillar',
};

export type ElementRef = HTMLVideoElement | HTMLCanvasElement;

interface Props {
  event: PlayableEvent;
  clock: MasterClock;
  layout: LayoutId;
  focus: CameraName | null;
  registerElement: (camera: CameraName, el: ElementRef | null) => void;
  onSegmentDuration?: (camera: CameraName, segIndex: number, durationSec: number) => void;
  onActivate: (camera: CameraName) => void;
}

/** The synchronized multi-camera grid, rendering the resolved layout. */
export function CameraGrid({
  event,
  clock,
  layout,
  focus,
  registerElement,
  onSegmentDuration,
  onActivate,
}: Props) {
  const resolved = useMemo(
    () => resolveLayout(layout, event.cameras, focus),
    [layout, event.cameras, focus],
  );

  const gridClass = resolved.hasFocus
    ? 'cam-grid cam-grid--focus'
    : 'cam-grid';

  return (
    <div
      className={gridClass}
      data-count={resolved.cameras.length}
      data-focus={resolved.hasFocus ? 'true' : 'false'}
    >
      {resolved.cameras.map((camera, i) => {
        const track = trackForCamera(event, camera);
        if (!track) return null;
        const tileClass =
          resolved.hasFocus && i === 0 ? 'cam-tile--focus' : '';
        return track.kind === 'video' ? (
          <VideoCameraTile
            key={camera}
            track={track}
            clock={clock}
            label={CAMERA_LABELS[camera]}
            className={tileClass}
            registerElement={registerElement}
            onSegmentDuration={onSegmentDuration}
            onActivate={onActivate}
          />
        ) : (
          <ProceduralCameraTile
            key={camera}
            track={track}
            clock={clock}
            label={CAMERA_LABELS[camera]}
            className={tileClass}
            registerElement={registerElement}
            onActivate={onActivate}
          />
        );
      })}
    </div>
  );
}
