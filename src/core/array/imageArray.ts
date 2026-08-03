import type { ImageArrayState } from '@/core/state/types'
import { PROTO_SIZE, paintTextProto, type ShapeProto } from '@/core/canvas/shapeProtos'

// The array register's engine: an image re-drawn as a glyph array, the
// Nexus-style move. Per cell:
//   - luminance picks a TIER: darkest cells carry heavy marks (square /
//     cross), mids carry circles / rings, near-threshold carries small
//     dots, and everything lighter falls back to the faint base lattice
//   - color deals from a small palette (the caller passes 2-3 brand
//     hexes) by deterministic hash — the reference's "slots"
//   - BLEND pulls the dealt color toward the image's own sampled color:
//     0 = pure graphic array, 1 = the image mosaicked through the glyphs
//   - a bound drawn vocabulary (protoFills/protos) replaces the glyph
//     tiers: each cell deals a proto whose own fill is the color base;
//     luminance still drives size/alpha so the image reads through
// Pure data + a canvas painter shared by the live layer and the export.

export type ArrayGlyph = 'square' | 'cross' | 'circle' | 'ring' | 'dot' | 'lattice'

export type ArrayCell = {
  x: number // center, artboard px
  y: number
  r: number // half-size, artboard px
  glyph: ArrayGlyph
  color: string
  alpha: number
  protoIndex?: number // deal into the drawn vocabulary; when set the painter ignores glyph
}

export type PixelGrid = {
  w: number
  h: number
  data: Uint8ClampedArray // RGBA
}

function hash(ix: number, iy: number, k: number): number {
  const v = Math.sin(ix * 127.1 + iy * 311.7 + k * 269.5) * 43758.5453
  return v - Math.floor(v)
}

function mixHex(hex: string, rgb: [number, number, number], t: number): string {
  const r0 = Number.parseInt(hex.slice(1, 3), 16)
  const g0 = Number.parseInt(hex.slice(3, 5), 16)
  const b0 = Number.parseInt(hex.slice(5, 7), 16)
  const r = Math.round(r0 + (rgb[0] - r0) * t)
  const g = Math.round(g0 + (rgb[1] - g0) * t)
  const b = Math.round(b0 + (rgb[2] - b0) * t)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

// draw an image element into a cells-resolution grid and read it back —
// browser-side sampling used by the layer and the export
export function samplePixels(
  img: CanvasImageSource & { width?: number; height?: number },
  cols: number,
  rows: number,
): PixelGrid | null {
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, cols, rows)
  try {
    return { w: cols, h: rows, data: ctx.getImageData(0, 0, cols, rows).data }
  } catch {
    return null // tainted canvas etc.
  }
}

export function buildImageCells(
  state: ImageArrayState,
  width: number,
  height: number,
  pixels: PixelGrid,
  palette: string[],
  protoFills?: string[],
): ArrayCell[] {
  const cols = Math.max(4, Math.round(state.cells))
  const cellW = width / cols
  const rows = Math.max(4, Math.round(height / cellW))
  const cellH = height / rows
  const r = (Math.min(cellW, cellH) * state.size) / 2
  const drawn = !!protoFills?.length
  const out: ArrayCell[] = []

  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      // sample the pixel grid at this cell (grid may differ from cols/rows)
      const px = Math.min(pixels.w - 1, Math.floor((ix / cols) * pixels.w))
      const py = Math.min(pixels.h - 1, Math.floor((iy / rows) * pixels.h))
      const o = (py * pixels.w + px) * 4
      const rr = pixels.data[o]
      const gg = pixels.data[o + 1]
      const bb = pixels.data[o + 2]
      const aa = pixels.data[o + 3] / 255
      let lum = (0.2126 * rr + 0.7152 * gg + 0.0722 * bb) / 255
      if (state.invert) lum = 1 - lum
      // transparent pixels read as background
      lum = lum * aa + (1 - aa)

      const x = (ix + 0.5) * cellW
      const y = (iy + 0.5) * cellH

      // drawn vocabulary: proto deal on its own hash channel so the
      // built-in glyph/color deals stay untouched when a binding toggles
      const pi = drawn ? Math.floor(hash(ix, iy, 3) * protoFills!.length) % protoFills!.length : 0

      if (lum >= state.threshold) {
        // outside the image body: the faint base lattice keeps running
        if (drawn) {
          out.push({ x, y, r: r * 0.16, glyph: 'lattice', color: protoFills![pi], alpha: 0.35, protoIndex: pi })
        } else {
          out.push({ x, y, r: r * 0.16, glyph: 'lattice', color: palette[0], alpha: 0.35 })
        }
        continue
      }

      // tier by darkness within the threshold window
      const t = lum / Math.max(state.threshold, 1e-6) // 0 = darkest

      if (drawn) {
        // the tier pick collapses to its size read — only the dot tier
        // shrinks, so darks stay heavy and lights stay small
        const base = protoFills![pi]
        out.push({
          x,
          y,
          r: t < 0.72 ? r : r * 0.45,
          glyph: 'dot',
          color: state.blend > 0 ? mixHex(base, [rr, gg, bb], state.blend) : base,
          alpha: 1,
          protoIndex: pi,
        })
        continue
      }

      const deal = hash(ix, iy, 1)
      let glyph: ArrayGlyph
      if (t < 0.38) glyph = deal < 0.6 ? 'square' : 'cross'
      else if (t < 0.72) glyph = deal < 0.55 ? 'circle' : 'ring'
      else glyph = 'dot'

      const color = palette[Math.floor(hash(ix, iy, 2) * palette.length) % palette.length]
      out.push({
        x,
        y,
        r: glyph === 'dot' ? r * 0.45 : r,
        glyph,
        color: state.blend > 0 ? mixHex(color, [rr, gg, bb], state.blend) : color,
        alpha: 1,
      })
    }
  }
  return out
}

// Path2D per proto path — keyed by the full d string, not the proto id:
// resizing a source shape regenerates its geometry under the same id.
// Capped so churning source edits can't grow it unbounded.
const protoPathCache = new Map<string, Path2D>()

function protoPath(d: string): Path2D {
  let p = protoPathCache.get(d)
  if (!p) {
    if (protoPathCache.size >= 128) protoPathCache.clear()
    p = new Path2D(d)
    protoPathCache.set(d, p)
  }
  return p
}

// canvas painter — coordinates in artboard units; caller sets the scale
export function paintImageCells(
  ctx: CanvasRenderingContext2D,
  cells: ArrayCell[],
  protos?: ShapeProto[],
): void {
  for (const c of cells) {
    const proto =
      protos?.length && c.protoIndex !== undefined ? protos[c.protoIndex % protos.length] : undefined
    if (proto) {
      ctx.save()
      ctx.translate(c.x, c.y)
      const k = (c.r * 2) / PROTO_SIZE
      ctx.scale(k, k)
      ctx.fillStyle = c.color
      ctx.globalAlpha = c.alpha * proto.opacity
      if (proto.kind === 'text') paintTextProto(ctx, proto)
      else ctx.fill(protoPath(proto.d), 'evenodd')
      ctx.restore()
      continue
    }
    ctx.globalAlpha = c.alpha
    ctx.fillStyle = c.color
    ctx.strokeStyle = c.color
    switch (c.glyph) {
      case 'square':
        ctx.fillRect(c.x - c.r, c.y - c.r, c.r * 2, c.r * 2)
        break
      case 'cross': {
        const a = c.r * 0.34
        ctx.fillRect(c.x - a, c.y - c.r, a * 2, c.r * 2)
        ctx.fillRect(c.x - c.r, c.y - a, c.r * 2, a * 2)
        break
      }
      case 'circle':
      case 'dot':
      case 'lattice':
        ctx.beginPath()
        ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'ring':
        ctx.beginPath()
        ctx.arc(c.x, c.y, c.r * 0.8, 0, Math.PI * 2)
        ctx.lineWidth = Math.max(1, c.r * 0.35)
        ctx.stroke()
        break
    }
  }
  ctx.globalAlpha = 1
}
