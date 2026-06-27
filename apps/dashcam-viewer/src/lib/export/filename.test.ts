import { describe, expect, it } from 'vitest';
import {
  clipFileName,
  pickRecorderMimeType,
  slugify,
  snapshotFileName,
  WEBM_MIME_CANDIDATES,
} from './filename';

describe('slugify', () => {
  it('lowercases and replaces unsafe chars', () => {
    expect(slugify('Sentry · San Francisco, CA')).toBe('sentry-san-francisco-ca');
    expect(slugify('  Trim Me  ')).toBe('trim-me');
  });
  it('falls back to "event" for empty input', () => {
    expect(slugify('---')).toBe('event');
    expect(slugify('')).toBe('event');
  });
});

describe('snapshotFileName', () => {
  it('builds a png name with ms', () => {
    expect(snapshotFileName('demo-1', 'front', 1.234)).toBe('demo-1-front-1234ms.png');
  });
  it('clamps negative time', () => {
    expect(snapshotFileName('e', 'back', -2)).toBe('e-back-0ms.png');
  });
});

describe('clipFileName', () => {
  it('builds a webm name with second range', () => {
    expect(clipFileName('demo-1', 'focus', 5.4, 12.6)).toBe('demo-1-focus-5s-13s.webm');
  });
  it('keeps end >= start', () => {
    expect(clipFileName('e', 'quad', 10, 4)).toBe('e-quad-10s-10s.webm');
  });
});

describe('pickRecorderMimeType', () => {
  it('returns the first supported candidate', () => {
    const supported = (t: string) => t === 'video/webm;codecs=vp8' || t === 'video/webm';
    expect(pickRecorderMimeType(WEBM_MIME_CANDIDATES, supported)).toBe('video/webm;codecs=vp8');
  });
  it('returns null when none supported', () => {
    expect(pickRecorderMimeType(WEBM_MIME_CANDIDATES, () => false)).toBeNull();
  });
});
