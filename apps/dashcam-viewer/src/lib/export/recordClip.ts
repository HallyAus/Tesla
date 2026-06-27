/**
 * Multi-camera WebM export.
 *
 * Composites the currently-visible camera layout onto a single canvas and
 * records it to a WebM blob via `canvas.captureStream()` + `MediaRecorder`,
 * then triggers a download. Gracefully feature-detects MediaRecorder and the
 * WebM codecs; when unavailable, callers should hide the button.
 *
 * The actual per-frame compositing is supplied by the caller as a `drawFrame`
 * callback so this module stays agnostic of video vs. procedural tiles. It
 * advances a virtual clock from `startSec` to `endSec` at real time, scaled by
 * the recorder's frame rate, reporting progress along the way.
 */

import { pickRecorderMimeType, WEBM_MIME_CANDIDATES } from './filename';

export function isRecordingSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    pickRecorderMimeType(WEBM_MIME_CANDIDATES, (t) =>
      MediaRecorder.isTypeSupported(t),
    ) !== null
  );
}

export interface RecordOptions {
  /** Target canvas already sized to the composite layout. */
  readonly canvas: HTMLCanvasElement;
  /** Start / end of the recorded range, seconds from event start. */
  readonly startSec: number;
  readonly endSec: number;
  /** Capture frame rate. */
  readonly fps?: number;
  /** Playback speed multiplier for recording (1 = real time). */
  readonly speed?: number;
  /**
   * Paint the composite for the given event time onto the canvas. Returning a
   * promise lets the caller wait for video tiles to seek before capturing.
   */
  readonly drawFrame: (eventTimeSec: number) => void | Promise<void>;
  /** 0..1 progress reporter. */
  readonly onProgress?: (fraction: number) => void;
  /** Abort signal to cancel an in-flight recording. */
  readonly signal?: AbortSignal;
}

export interface RecordResult {
  readonly blob: Blob;
  readonly mimeType: string;
  readonly durationSec: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Record the canvas to a WebM blob. Resolves with the encoded blob; rejects on
 * abort or when recording is unsupported.
 */
export async function recordCompositeClip(
  opts: RecordOptions,
): Promise<RecordResult> {
  const fps = opts.fps ?? 30;
  const speed = opts.speed && opts.speed > 0 ? opts.speed : 1;

  const mimeType = pickRecorderMimeType(WEBM_MIME_CANDIDATES, (t) =>
    MediaRecorder.isTypeSupported(t),
  );
  if (typeof MediaRecorder === 'undefined' || mimeType == null) {
    throw new Error('Video recording is not supported in this browser.');
  }
  if (typeof opts.canvas.captureStream !== 'function') {
    throw new Error('canvas.captureStream() is not supported in this browser.');
  }

  const start = Math.min(opts.startSec, opts.endSec);
  const end = Math.max(opts.startSec, opts.endSec);
  const rangeSec = Math.max(0.001, end - start);

  const stream = opts.canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const finished = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  recorder.start();

  // Render the range frame-by-frame in real(ish) time so captureStream samples
  // an evolving canvas. We pace to `fps` scaled by `speed`.
  const frameDurationMs = 1000 / fps;
  const totalFrames = Math.ceil((rangeSec / speed) * fps);

  try {
    for (let i = 0; i <= totalFrames; i++) {
      if (opts.signal?.aborted) {
        throw new DOMException('Recording aborted', 'AbortError');
      }
      const eventTime = start + (i / totalFrames) * rangeSec;
      await opts.drawFrame(eventTime);
      opts.onProgress?.(i / totalFrames);
      await sleep(frameDurationMs);
    }
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    stream.getTracks().forEach((t) => t.stop());
  }

  await finished;
  opts.onProgress?.(1);

  const blob = new Blob(chunks, { type: mimeType });
  if (blob.size === 0) {
    throw new Error('Recording produced no data.');
  }
  return { blob, mimeType, durationSec: rangeSec / speed };
}

/** Trigger a browser download of a blob. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
