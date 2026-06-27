/**
 * Camera layout presets, as pure data + selection logic.
 *
 * A layout maps the cameras available on an event onto a set of *slots*. The
 * grid component renders one tile per slot. This module is DOM-free and unit-
 * tested: given the cameras present and a chosen layout + focus camera, it
 * returns the ordered list of cameras to show and the CSS grid class to use.
 */

import { CAMERA_NAMES, type CameraName } from '../teslacam/types';

export type LayoutId =
  | 'full-front'
  | 'front-back'
  | 'quad'
  | 'six-up'
  | 'focus';

export interface LayoutPreset {
  readonly id: LayoutId;
  readonly label: string;
  /** Cameras this layout wants, in display order (subset is fine). */
  readonly cameras: CameraName[];
  /** Whether the layout has a single large "focus" tile + thumbnails. */
  readonly hasFocus: boolean;
}

export const LAYOUT_PRESETS: readonly LayoutPreset[] = [
  { id: 'full-front', label: 'Full front', cameras: ['front'], hasFocus: false },
  {
    id: 'front-back',
    label: 'Front + back',
    cameras: ['front', 'back'],
    hasFocus: false,
  },
  {
    id: 'quad',
    label: '4-up',
    cameras: ['front', 'back', 'left_repeater', 'right_repeater'],
    hasFocus: false,
  },
  {
    id: 'six-up',
    label: '6-up',
    cameras: [...CAMERA_NAMES],
    hasFocus: false,
  },
  {
    id: 'focus',
    label: 'Focus',
    cameras: [...CAMERA_NAMES],
    hasFocus: true,
  },
] as const;

export function getLayout(id: LayoutId): LayoutPreset {
  const found = LAYOUT_PRESETS.find((l) => l.id === id);
  // The id type is closed, so this is exhaustive; fall back defensively.
  return found ?? LAYOUT_PRESETS[0];
}

/**
 * Pick a sensible default layout for the cameras present:
 *  - 1 camera  -> full-front
 *  - 2 cameras -> front-back
 *  - 3-4       -> quad
 *  - 5+        -> six-up
 */
export function defaultLayoutFor(available: readonly CameraName[]): LayoutId {
  const n = available.length;
  if (n <= 1) return 'full-front';
  if (n === 2) return 'front-back';
  if (n <= 4) return 'quad';
  return 'six-up';
}

export interface ResolvedLayout {
  readonly id: LayoutId;
  /** Cameras to render, in order. First is the focus tile when `hasFocus`. */
  readonly cameras: CameraName[];
  readonly hasFocus: boolean;
  /** The focus camera (only meaningful when `hasFocus`). */
  readonly focus: CameraName | null;
}

/**
 * Resolve a layout against the cameras actually present on an event.
 *
 * - Intersects the layout's wanted cameras with what's available, preserving
 *   canonical order.
 * - For the focus layout, promotes `focusCamera` (if available) to the front so
 *   the grid renders it as the large tile; remaining cameras become thumbnails.
 * - Never returns an empty camera list when the event has any camera.
 */
export function resolveLayout(
  layoutId: LayoutId,
  available: readonly CameraName[],
  focusCamera?: CameraName | null,
): ResolvedLayout {
  const preset = getLayout(layoutId);
  const availSet = new Set(available);

  // Cameras the layout wants AND the event has, in canonical order.
  let cameras = preset.cameras.filter((c) => availSet.has(c));

  // Guard: if nothing intersects but the event has cameras, show them all
  // (e.g. a "full-front" layout on an event that somehow lacks the front cam).
  if (cameras.length === 0 && available.length > 0) {
    cameras = CAMERA_NAMES.filter((c) => availSet.has(c));
  }

  if (!preset.hasFocus) {
    return {
      id: preset.id,
      cameras,
      hasFocus: false,
      focus: null,
    };
  }

  // Focus layout: promote the chosen focus camera to the front.
  const focus =
    focusCamera && availSet.has(focusCamera)
      ? focusCamera
      : (cameras[0] ?? null);

  const ordered = focus
    ? [focus, ...cameras.filter((c) => c !== focus)]
    : cameras;

  return {
    id: preset.id,
    cameras: ordered,
    hasFocus: true,
    focus,
  };
}

/**
 * Promote a camera to focus. Returns the layout id + focus camera the UI should
 * switch to when a tile is clicked. Clicking a tile always enters the focus
 * layout with that camera large.
 */
export function promoteToFocus(camera: CameraName): {
  layout: LayoutId;
  focus: CameraName;
} {
  return { layout: 'focus', focus: camera };
}
