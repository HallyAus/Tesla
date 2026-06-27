import { describe, expect, it } from 'vitest';
import {
  bucketForPath,
  DEFAULT_SEGMENT_SEC,
  materializeLibrary,
  normalizeCamera,
  parseClipFileName,
  parseEventJson,
  parseLibrary,
  parseTimestamp,
  type RawClipFile,
} from './parse';
import type { ClipSource } from './types';

// --- helpers ---------------------------------------------------------------

const dummySource: ClipSource = { url: 'blob:dummy', size: 1 };

function clip(relativePath: string, text = ''): RawClipFile {
  const name = relativePath.slice(relativePath.lastIndexOf('/') + 1);
  return {
    relativePath,
    name,
    getSource: async () => dummySource,
    getText: async () => text,
  };
}

const CAMS = [
  'front',
  'back',
  'left_repeater',
  'right_repeater',
  'left_pillar',
  'right_pillar',
] as const;

function segmentFiles(dir: string, ts: string): RawClipFile[] {
  return CAMS.map((cam) => clip(`${dir}/${ts}-${cam}.mp4`));
}

// --- parseTimestamp --------------------------------------------------------

describe('parseTimestamp', () => {
  it('parses a valid prefix', () => {
    const d = parseTimestamp('2024-01-15_14-30-00');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2024);
    expect(d!.getMonth()).toBe(0); // January
    expect(d!.getDate()).toBe(15);
    expect(d!.getHours()).toBe(14);
    expect(d!.getMinutes()).toBe(30);
    expect(d!.getSeconds()).toBe(0);
  });

  it('accepts a prefix with trailing content', () => {
    expect(parseTimestamp('2024-01-15_14-30-00-front.mp4')).not.toBeNull();
  });

  it('rejects malformed strings', () => {
    expect(parseTimestamp('not-a-timestamp')).toBeNull();
    expect(parseTimestamp('2024/01/15')).toBeNull();
    expect(parseTimestamp('')).toBeNull();
  });

  it('rejects impossible dates (rollover)', () => {
    expect(parseTimestamp('2024-13-40_25-00-00')).toBeNull();
  });
});

// --- camera detection ------------------------------------------------------

describe('normalizeCamera', () => {
  it('recognizes all six cameras case-insensitively', () => {
    for (const cam of CAMS) {
      expect(normalizeCamera(cam)).toBe(cam);
      expect(normalizeCamera(cam.toUpperCase())).toBe(cam);
    }
  });

  it('rejects unknown cameras', () => {
    expect(normalizeCamera('roof')).toBeNull();
    expect(normalizeCamera('')).toBeNull();
  });
});

describe('parseClipFileName', () => {
  it('extracts timestamp + camera', () => {
    const r = parseClipFileName('2024-01-15_14-30-00-left_repeater.mp4');
    expect(r).toEqual({
      timestampPrefix: '2024-01-15_14-30-00',
      camera: 'left_repeater',
    });
  });

  it('handles all camera names', () => {
    for (const cam of CAMS) {
      const r = parseClipFileName(`2024-01-15_14-30-00-${cam}.mp4`);
      expect(r?.camera).toBe(cam);
    }
  });

  it('returns null for non-mp4 or unknown cameras', () => {
    expect(parseClipFileName('event.json')).toBeNull();
    expect(parseClipFileName('2024-01-15_14-30-00-roof.mp4')).toBeNull();
    expect(parseClipFileName('thumb.png')).toBeNull();
  });
});

// --- bucket detection ------------------------------------------------------

describe('bucketForPath', () => {
  it('detects each bucket', () => {
    expect(bucketForPath('TeslaCam/RecentClips/x.mp4')).toBe('RecentClips');
    expect(bucketForPath('TeslaCam/SavedClips/2024/x.mp4')).toBe('SavedClips');
    expect(bucketForPath('TeslaCam/SentryClips/2024/x.mp4')).toBe('SentryClips');
  });
  it('returns null when no bucket present', () => {
    expect(bucketForPath('Some/Other/x.mp4')).toBeNull();
  });
});

// --- event.json parsing ----------------------------------------------------

describe('parseEventJson', () => {
  it('parses a full record with numeric coercion', () => {
    const json = JSON.stringify({
      timestamp: '2024-01-15T14:30:00',
      city: 'San Francisco',
      est_lat: '37.7749',
      est_lon: -122.4194,
      reason: 'sentry_aware_object_detection',
      camera: '1',
    });
    const meta = parseEventJson(json);
    expect(meta.city).toBe('San Francisco');
    expect(meta.est_lat).toBeCloseTo(37.7749);
    expect(meta.est_lon).toBeCloseTo(-122.4194);
    expect(meta.reason).toBe('sentry_aware_object_detection');
    expect(meta.camera).toBe('1');
  });

  it('tolerates missing fields', () => {
    const meta = parseEventJson('{"city":"Reno"}');
    expect(meta.city).toBe('Reno');
    expect(meta.est_lat).toBeUndefined();
  });

  it('throws on invalid JSON', () => {
    expect(() => parseEventJson('{not json')).toThrow();
  });
});

// --- segment + event grouping ---------------------------------------------

describe('parseLibrary', () => {
  it('groups clips of one timestamp into a segment with all cameras', () => {
    const lib = parseLibrary({
      files: segmentFiles('TeslaCam/SavedClips/2024-01-15_14-30-00', '2024-01-15_14-30-00'),
    });
    expect(lib.events).toHaveLength(1);
    const ev = lib.events[0];
    expect(ev.bucket).toBe('SavedClips');
    expect(ev.segments).toHaveLength(1);
    expect(Object.keys(ev.segments[0].clips).sort()).toEqual([...CAMS].sort());
    expect(ev.cameras).toEqual([...CAMS]); // canonical order
    expect(ev.segments[0].durationSec).toBe(DEFAULT_SEGMENT_SEC);
  });

  it('groups consecutive segments into a single event', () => {
    const dir = 'TeslaCam/SentryClips/2024-01-15_14-30-00';
    const files = [
      ...segmentFiles(dir, '2024-01-15_14-30-00'),
      ...segmentFiles(dir, '2024-01-15_14-31-00'),
      ...segmentFiles(dir, '2024-01-15_14-32-00'),
    ];
    const lib = parseLibrary({ files });
    expect(lib.events).toHaveLength(1);
    expect(lib.events[0].segments).toHaveLength(3);
    expect(lib.events[0].durationSec).toBe(3 * DEFAULT_SEGMENT_SEC);
  });

  it('splits a large time gap (within one directory) into separate events', () => {
    const dir = 'TeslaCam/RecentClips';
    const files = [
      ...segmentFiles(dir, '2024-01-15_14-30-00'),
      ...segmentFiles(dir, '2024-01-15_14-31-00'),
      // 10-minute jump -> new event
      ...segmentFiles(dir, '2024-01-15_14-41-00'),
    ];
    const lib = parseLibrary({ files });
    expect(lib.events).toHaveLength(2);
    // Newest first.
    expect(lib.events[0].startTime.getTime()).toBeGreaterThan(
      lib.events[1].startTime.getTime(),
    );
  });

  it('attaches event.json metadata and exposes warnings', () => {
    const dir = 'TeslaCam/SavedClips/2024-01-15_14-30-00';
    const files = [
      ...segmentFiles(dir, '2024-01-15_14-30-00'),
      clip(`${dir}/event.json`, JSON.stringify({ city: 'Austin', est_lat: 30.27, est_lon: -97.74 })),
      clip(`${dir}/garbage.mp4`), // unrecognized -> warning
    ];
    const lib = parseLibrary({ files });
    expect(lib.events).toHaveLength(1);
    expect(lib.warnings.some((w) => w.includes('garbage.mp4'))).toBe(true);
  });

  it('handles a partial segment (missing some cameras)', () => {
    const dir = 'TeslaCam/RecentClips';
    const lib = parseLibrary({
      files: [
        clip(`${dir}/2024-01-15_14-30-00-front.mp4`),
        clip(`${dir}/2024-01-15_14-30-00-back.mp4`),
      ],
    });
    expect(lib.events[0].cameras).toEqual(['front', 'back']);
  });
});

describe('materializeLibrary', () => {
  it('resolves sources and parses metadata end to end', async () => {
    const dir = 'TeslaCam/SavedClips/2024-01-15_14-30-00';
    const pending = parseLibrary({
      files: [
        ...segmentFiles(dir, '2024-01-15_14-30-00'),
        clip(`${dir}/event.json`, JSON.stringify({ city: 'Reno', est_lat: 39.5, est_lon: -119.8, reason: 'sentry' })),
      ],
    });
    const lib = await materializeLibrary(pending);
    expect(lib.events).toHaveLength(1);
    expect(lib.events[0].metadata?.city).toBe('Reno');
    expect(lib.events[0].segments[0].clips.front?.source.url).toBe('blob:dummy');
  });

  it('records a warning for malformed event.json instead of throwing', async () => {
    const dir = 'TeslaCam/SavedClips/2024-01-15_14-30-00';
    const pending = parseLibrary({
      files: [
        ...segmentFiles(dir, '2024-01-15_14-30-00'),
        clip(`${dir}/event.json`, '{broken'),
      ],
    });
    const lib = await materializeLibrary(pending);
    expect(lib.warnings.some((w) => w.toLowerCase().includes('event.json'))).toBe(true);
  });
});
