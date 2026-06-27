/**
 * Pure TeslaCam parsing logic.
 *
 * This module is deliberately free of DOM / File System Access API calls so it
 * can be unit-tested with plain data. The browser-specific directory walking
 * lives in `loadDirectory.ts`, which feeds plain `RawClipFile[]` into here.
 */

import {
  CAMERA_NAMES,
  type CameraName,
  type ClipBucket,
  type ClipEvent,
  type ClipSource,
  type EventMetadata,
  type ParsedLibrary,
  type Segment,
} from './types';

/** The default Tesla segment length, used until real video metadata loads. */
export const DEFAULT_SEGMENT_SEC = 60;

/** Largest gap (seconds) between segment starts that still counts as the same event. */
export const SEGMENT_GAP_TOLERANCE_SEC = 90;

/**
 * A minimal description of one file discovered while walking the directory.
 * `relativePath` is POSIX-style and rooted at (and including) `TeslaCam` when
 * available, e.g. `TeslaCam/SavedClips/2024-01-15_14-30-00/...front.mp4`.
 */
export interface RawClipFile {
  readonly relativePath: string;
  readonly name: string;
  /** Lazily resolves to a playable source; only `.mp4` files need this. */
  readonly getSource: () => Promise<ClipSource>;
  /** Reads file text; only `event.json` files need this. */
  readonly getText: () => Promise<string>;
}

const TIMESTAMP_RE = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/;

/**
 * Parse a `YYYY-MM-DD_HH-MM-SS` prefix into a Date.
 * Returns `null` when the string does not start with a valid timestamp.
 * Treated as local wall-clock time (Tesla writes local time).
 */
export function parseTimestamp(prefix: string): Date | null {
  const m = TIMESTAMP_RE.exec(prefix);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s),
  );
  // Guard against rollover (e.g. month 13 → next year).
  if (
    date.getFullYear() !== Number(y) ||
    date.getMonth() !== Number(mo) - 1 ||
    date.getDate() !== Number(d)
  ) {
    return null;
  }
  return date;
}

/**
 * Given a clip filename, return its `{ timestamp, camera }`.
 * Tesla names are `YYYY-MM-DD_HH-MM-SS-<camera>.mp4`.
 * Returns `null` for anything that is not a recognizable camera clip.
 */
export function parseClipFileName(
  name: string,
): { timestampPrefix: string; camera: CameraName } | null {
  if (!name.toLowerCase().endsWith('.mp4')) return null;
  const m = TIMESTAMP_RE.exec(name);
  if (!m) return null;
  const timestampPrefix = m[0];
  // Strip the prefix, a leading '-', and the extension.
  const rest = name.slice(timestampPrefix.length).replace(/\.mp4$/i, '');
  const cameraRaw = rest.replace(/^-/, '');
  const camera = normalizeCamera(cameraRaw);
  if (!camera) return null;
  return { timestampPrefix, camera };
}

/** Map a raw camera token to a canonical CameraName, or null if unknown. */
export function normalizeCamera(raw: string): CameraName | null {
  const v = raw.trim().toLowerCase();
  if ((CAMERA_NAMES as readonly string[]).includes(v)) {
    return v as CameraName;
  }
  return null;
}

/** Identify which bucket a relative path belongs to. */
export function bucketForPath(relativePath: string): ClipBucket | null {
  if (/(^|\/)RecentClips(\/|$)/.test(relativePath)) return 'RecentClips';
  if (/(^|\/)SavedClips(\/|$)/.test(relativePath)) return 'SavedClips';
  if (/(^|\/)SentryClips(\/|$)/.test(relativePath)) return 'SentryClips';
  return null;
}

/** Parse + validate `event.json` text into typed metadata. */
export function parseEventJson(text: string): EventMetadata {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const num = (v: unknown): number | undefined => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) {
      return Number(v);
    }
    return undefined;
  };
  const str = (v: unknown): string | undefined =>
    typeof v === 'string' ? v : v == null ? undefined : String(v);

  return {
    timestamp: str(raw.timestamp),
    city: str(raw.city),
    est_lat: num(raw.est_lat),
    est_lon: num(raw.est_lon),
    reason: str(raw.reason),
    camera: str(raw.camera),
  };
}

interface ParseInput {
  files: RawClipFile[];
  /** Override the gap tolerance for grouping segments into events. */
  gapToleranceSec?: number;
}

/**
 * Turn a flat list of discovered files into a structured library:
 * group clips → segments, segments → events (per bucket + directory), and
 * attach `event.json` metadata.
 *
 * Note: `getSource()` is NOT called here. Segments hold lazy clip descriptors;
 * callers resolve sources on demand. To keep this synchronous and testable we
 * resolve them eagerly only via {@link materializeLibrary}.
 */
export interface PendingClip {
  readonly camera: CameraName;
  readonly fileName: string;
  readonly getSource: () => Promise<ClipSource>;
}

export interface PendingSegment {
  readonly id: string;
  readonly startTime: Date;
  readonly clips: Partial<Record<CameraName, PendingClip>>;
  durationSec: number;
}

export interface PendingEvent {
  readonly id: string;
  readonly bucket: ClipBucket;
  readonly dirKey: string;
  readonly segments: PendingSegment[];
  metadataText?: () => Promise<string>;
  readonly startTime: Date;
  readonly durationSec: number;
  readonly cameras: CameraName[];
}

export interface PendingLibrary {
  readonly events: PendingEvent[];
  readonly warnings: string[];
}

/** The directory key groups segments that live in the same clip folder. */
function dirOf(relativePath: string): string {
  const idx = relativePath.lastIndexOf('/');
  return idx === -1 ? '' : relativePath.slice(0, idx);
}

export function parseLibrary(input: ParseInput): PendingLibrary {
  const gapTolerance = input.gapToleranceSec ?? SEGMENT_GAP_TOLERANCE_SEC;
  const warnings: string[] = [];

  // 1. Bucket the files: mp4 clips, and event.json by directory.
  const segmentsByDir = new Map<string, Map<string, PendingSegment>>();
  const eventJsonByDir = new Map<string, () => Promise<string>>();
  const bucketByDir = new Map<string, ClipBucket>();

  for (const file of input.files) {
    const bucket = bucketForPath(file.relativePath);
    const dir = dirOf(file.relativePath);

    if (file.name.toLowerCase() === 'event.json') {
      eventJsonByDir.set(dir, file.getText);
      if (bucket) bucketByDir.set(dir, bucket);
      continue;
    }

    const parsed = parseClipFileName(file.name);
    if (!parsed) {
      if (file.name.toLowerCase().endsWith('.mp4')) {
        warnings.push(`Unrecognized clip name: ${file.relativePath}`);
      }
      continue;
    }
    const start = parseTimestamp(parsed.timestampPrefix);
    if (!start) {
      warnings.push(`Bad timestamp in: ${file.relativePath}`);
      continue;
    }
    if (bucket) bucketByDir.set(dir, bucket);

    let segMap = segmentsByDir.get(dir);
    if (!segMap) {
      segMap = new Map();
      segmentsByDir.set(dir, segMap);
    }
    let seg = segMap.get(parsed.timestampPrefix);
    if (!seg) {
      seg = {
        id: parsed.timestampPrefix,
        startTime: start,
        clips: {},
        durationSec: DEFAULT_SEGMENT_SEC,
      };
      segMap.set(parsed.timestampPrefix, seg);
    }
    seg.clips[parsed.camera] = {
      camera: parsed.camera,
      fileName: file.name,
      getSource: file.getSource,
    };
  }

  // 2. Within each directory, sort segments and split into events by time gap.
  const events: PendingEvent[] = [];
  for (const [dir, segMap] of segmentsByDir) {
    const segs = [...segMap.values()].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );
    const bucket = bucketByDir.get(dir) ?? 'RecentClips';
    const metadataText = eventJsonByDir.get(dir);

    let group: PendingSegment[] = [];
    const flush = () => {
      if (group.length === 0) return;
      events.push(buildEvent(group, bucket, dir, metadataText));
      group = [];
    };

    for (const seg of segs) {
      if (group.length === 0) {
        group.push(seg);
        continue;
      }
      const prev = group[group.length - 1];
      const gap =
        (seg.startTime.getTime() - prev.startTime.getTime()) / 1000 -
        prev.durationSec;
      if (gap > gapTolerance) {
        flush();
      }
      group.push(seg);
    }
    flush();
  }

  // Directories that contain only an event.json (no mp4 yet) still surface a warning.
  for (const dir of eventJsonByDir.keys()) {
    if (!segmentsByDir.has(dir)) {
      warnings.push(`event.json with no clips in: ${dir}`);
    }
  }

  events.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
  return { events, warnings };
}

function buildEvent(
  segments: PendingSegment[],
  bucket: ClipBucket,
  dirKey: string,
  metadataText?: () => Promise<string>,
): PendingEvent {
  const startTime = segments[0].startTime;
  const durationSec = segments.reduce((acc, s) => acc + s.durationSec, 0);
  const cameraSet = new Set<CameraName>();
  for (const s of segments) {
    for (const cam of Object.keys(s.clips) as CameraName[]) cameraSet.add(cam);
  }
  const cameras = CAMERA_NAMES.filter((c) => cameraSet.has(c));
  return {
    id: segments[0].id,
    bucket,
    dirKey,
    segments,
    metadataText,
    startTime,
    durationSec,
    cameras,
  };
}

/**
 * Resolve a {@link PendingLibrary} into a fully materialized {@link ParsedLibrary}
 * (clip object URLs + parsed metadata). Async because it reads files.
 */
export async function materializeLibrary(
  pending: PendingLibrary,
): Promise<ParsedLibrary> {
  const warnings = [...pending.warnings];
  const events: ClipEvent[] = [];

  for (const pe of pending.events) {
    const segments: Segment[] = [];
    for (const ps of pe.segments) {
      const clips: Segment['clips'] = {};
      for (const cam of Object.keys(ps.clips) as CameraName[]) {
        const pc = ps.clips[cam]!;
        clips[cam] = {
          camera: cam,
          fileName: pc.fileName,
          source: await pc.getSource(),
        };
      }
      segments.push({
        id: ps.id,
        startTime: ps.startTime,
        clips,
        durationSec: ps.durationSec,
      });
    }

    let metadata: EventMetadata | undefined;
    if (pe.metadataText) {
      try {
        metadata = parseEventJson(await pe.metadataText());
      } catch (err) {
        warnings.push(
          `Failed to parse event.json for ${pe.id}: ${(err as Error).message}`,
        );
      }
    }

    events.push({
      id: pe.id,
      bucket: pe.bucket,
      segments,
      metadata,
      startTime: pe.startTime,
      durationSec: pe.durationSec,
      cameras: pe.cameras,
    });
  }

  return { events, warnings };
}
