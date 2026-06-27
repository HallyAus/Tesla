import { LAYOUT_PRESETS, type LayoutId } from '../lib/player/layout';
import type { CameraName } from '../lib/teslacam/types';

const CAMERA_SHORT: Record<CameraName, string> = {
  front: 'Front',
  back: 'Back',
  left_repeater: 'L. Rep',
  right_repeater: 'R. Rep',
  left_pillar: 'L. Pillar',
  right_pillar: 'R. Pillar',
};

interface Props {
  layout: LayoutId;
  onLayout: (id: LayoutId) => void;
  /** Cameras available on the current event, for the focus picker. */
  cameras: CameraName[];
  focus: CameraName | null;
  onFocus: (cam: CameraName) => void;
}

/** Layout preset buttons + (when in focus layout) a focus-camera picker. */
export function LayoutSwitcher({ layout, onLayout, cameras, focus, onFocus }: Props) {
  return (
    <div className="layout-bar" role="toolbar" aria-label="Camera layout">
      <div className="layout-presets" role="group" aria-label="Layout presets">
        {LAYOUT_PRESETS.map((p) => (
          <button
            key={p.id}
            className={`chip ${layout === p.id ? 'chip--active' : ''}`}
            onClick={() => onLayout(p.id)}
            aria-pressed={layout === p.id}
          >
            {p.label}
          </button>
        ))}
      </div>

      {layout === 'focus' && cameras.length > 1 && (
        <div className="focus-picker">
          <label className="focus-label" htmlFor="focus-select">
            Focus
          </label>
          <select
            id="focus-select"
            className="rate"
            value={focus ?? cameras[0]}
            onChange={(e) => onFocus(e.target.value as CameraName)}
            aria-label="Focus camera"
          >
            {cameras.map((c) => (
              <option key={c} value={c}>
                {CAMERA_SHORT[c]}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
