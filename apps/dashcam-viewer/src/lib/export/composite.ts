/**
 * Compute composite-canvas tile rectangles for a camera layout, and draw the
 * layout's source elements (videos/canvases) into those rectangles.
 *
 * `computeTileRects` is pure (no DOM) and unit-tested: given a canvas size, a
 * count of tiles and whether the layout has a focus tile, it returns the
 * pixel rectangles for each tile in order (focus first, large).
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Lay out `count` tiles into a `width`x`height` canvas.
 * - Non-focus: a near-square grid (cols = ceil(sqrt(count))).
 * - Focus: tile 0 fills the top area; the rest tile a thumbnail strip below.
 */
export function computeTileRects(
  width: number,
  height: number,
  count: number,
  hasFocus: boolean,
): Rect[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, y: 0, w: width, h: height }];

  if (hasFocus) {
    const stripCount = count - 1;
    const stripH = Math.round(height * 0.24);
    const focusH = height - stripH;
    const rects: Rect[] = [{ x: 0, y: 0, w: width, h: focusH }];
    const tw = width / stripCount;
    for (let i = 0; i < stripCount; i++) {
      rects.push({
        x: Math.round(i * tw),
        y: focusH,
        w: Math.round((i + 1) * tw) - Math.round(i * tw),
        h: stripH,
      });
    }
    return rects;
  }

  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cw = width / cols;
  const ch = height / rows;
  const rects: Rect[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    rects.push({
      x: Math.round(c * cw),
      y: Math.round(r * ch),
      w: Math.round((c + 1) * cw) - Math.round(c * cw),
      h: Math.round((r + 1) * ch) - Math.round(r * ch),
    });
  }
  return rects;
}

/** A source element drawable to a canvas (video or canvas), with a label. */
export interface CompositeSource {
  readonly element: CanvasImageSource & { readonly width?: number };
  readonly label: string;
  /** Intrinsic dimensions, used to letterbox without distortion. */
  readonly srcW: number;
  readonly srcH: number;
}

/** Draw a single source into `rect` with "cover" fit + a corner label. */
function drawTile(
  ctx: CanvasRenderingContext2D,
  src: CompositeSource,
  rect: Rect,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.fillStyle = '#05070a';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const sw = src.srcW || 1;
  const sh = src.srcH || 1;
  if (sw > 0 && sh > 0) {
    // "cover" scaling.
    const scale = Math.max(rect.w / sw, rect.h / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = rect.x + (rect.w - dw) / 2;
    const dy = rect.y + (rect.h - dh) / 2;
    try {
      ctx.drawImage(src.element, dx, dy, dw, dh);
    } catch {
      /* element not ready – leave the dark tile */
    }
  }

  // Label.
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(src.label).width + 14;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(rect.x + 6, rect.y + rect.h - 26, tw, 20);
  ctx.fillStyle = '#fff';
  ctx.fillText(src.label, rect.x + 13, rect.y + rect.h - 15);
  ctx.restore();
}

/**
 * Draw an ordered list of sources into the canvas using the layout rects.
 * Sources beyond the rect count are ignored; missing sources leave dark tiles.
 */
export function drawComposite(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sources: readonly CompositeSource[],
  hasFocus: boolean,
): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  const rects = computeTileRects(width, height, sources.length, hasFocus);
  for (let i = 0; i < rects.length; i++) {
    if (sources[i]) drawTile(ctx, sources[i], rects[i]);
  }
}
