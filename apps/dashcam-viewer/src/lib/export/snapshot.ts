/**
 * Snapshot export. Draws an element (`<video>` or `<canvas>`) into a PNG
 * download. The player passes a pre-composited canvas of the active multi-
 * camera layout here, so a single snapshot captures the whole grid. (Full
 * multi-camera *video* export lives in `recordClip.ts`.)
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
