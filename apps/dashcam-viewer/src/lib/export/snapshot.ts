/**
 * Snapshot export. Captures the current frame of a single camera tile
 * (`<video>` or `<canvas>`) into a PNG download. Multi-camera mux is a
 * documented follow-up (see README).
 */

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Draw `el` (video or canvas) to an offscreen canvas and download as PNG. */
export async function snapshotElement(
  el: HTMLVideoElement | HTMLCanvasElement,
  fileName: string,
): Promise<void> {
  const width =
    el instanceof HTMLVideoElement ? el.videoWidth || el.clientWidth : el.width;
  const height =
    el instanceof HTMLVideoElement
      ? el.videoHeight || el.clientHeight
      : el.height;
  if (!width || !height) throw new Error('Camera frame not ready for snapshot.');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');
  ctx.drawImage(el, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/png'),
  );
  if (!blob) throw new Error('Failed to encode PNG.');
  triggerDownload(blob, fileName);
}
