import { describe, expect, it } from 'vitest';
import {
  defaultLayoutFor,
  getLayout,
  LAYOUT_PRESETS,
  promoteToFocus,
  resolveLayout,
} from './layout';
import { CAMERA_NAMES } from '../teslacam/types';

const ALL = [...CAMERA_NAMES];

describe('defaultLayoutFor', () => {
  it('picks a layout sized to the camera count', () => {
    expect(defaultLayoutFor([])).toBe('full-front');
    expect(defaultLayoutFor(['front'])).toBe('full-front');
    expect(defaultLayoutFor(['front', 'back'])).toBe('front-back');
    expect(defaultLayoutFor(['front', 'back', 'left_repeater'])).toBe('quad');
    expect(defaultLayoutFor(['front', 'back', 'left_repeater', 'right_repeater'])).toBe('quad');
    expect(defaultLayoutFor(ALL)).toBe('six-up');
  });
});

describe('getLayout', () => {
  it('returns each preset by id', () => {
    for (const p of LAYOUT_PRESETS) {
      expect(getLayout(p.id).id).toBe(p.id);
    }
  });
});

describe('resolveLayout', () => {
  it('intersects wanted cameras with available, in canonical order', () => {
    const r = resolveLayout('quad', ['right_repeater', 'front', 'back']);
    // canonical order: front, back, left_repeater, right_repeater
    expect(r.cameras).toEqual(['front', 'back', 'right_repeater']);
    expect(r.hasFocus).toBe(false);
    expect(r.focus).toBeNull();
  });

  it('full-front shows only the front camera', () => {
    expect(resolveLayout('full-front', ALL).cameras).toEqual(['front']);
  });

  it('six-up shows all available cameras', () => {
    expect(resolveLayout('six-up', ALL).cameras).toEqual(ALL);
  });

  it('falls back to all cameras when the layout intersects nothing', () => {
    // full-front but the event has no front camera.
    const r = resolveLayout('full-front', ['back', 'left_repeater']);
    expect(r.cameras).toEqual(['back', 'left_repeater']);
  });

  it('focus layout promotes the chosen focus camera to the front', () => {
    const r = resolveLayout('focus', ALL, 'back');
    expect(r.hasFocus).toBe(true);
    expect(r.focus).toBe('back');
    expect(r.cameras[0]).toBe('back');
    expect(r.cameras).toContain('front');
    expect(new Set(r.cameras)).toEqual(new Set(ALL));
  });

  it('focus layout defaults focus to the first available camera', () => {
    const r = resolveLayout('focus', ['back', 'left_pillar']);
    expect(r.focus).toBe('back');
    expect(r.cameras[0]).toBe('back');
  });

  it('focus layout ignores an unavailable focus camera', () => {
    const r = resolveLayout('focus', ['front', 'back'], 'right_pillar');
    expect(r.focus).toBe('front');
  });

  it('returns empty cameras for an event with no cameras', () => {
    expect(resolveLayout('six-up', []).cameras).toEqual([]);
  });
});

describe('promoteToFocus', () => {
  it('switches to the focus layout with the clicked camera', () => {
    expect(promoteToFocus('left_repeater')).toEqual({
      layout: 'focus',
      focus: 'left_repeater',
    });
  });
});
