// Subtexture: filled shapes carry micro-texture instead of flat paint —
// the Dither Boy move. One tile SPEC (primitive lists in tile space)
// feeds both renderers: the live SVG <pattern> and the export's canvas
// createPattern tile. Same geometry in, same weave out.
//
//   DITHER — ordered Bayer 4x4 weave: cells switch on as density rises,
//            in the matrix's characteristic scatter
//   HATCH  — 45-degree line screen; density drives line weight
//   DOTS   — offset dot screen (the halftone read); density drives dot size
//
// Tiles are sized in ARTBOARD pixels, so the weave has a fixed physical
// scale on the poster — print texture, not screen texture.

export type TextureKind = 'dither' | 'hatch' | 'dots'

export type TextureTile = {
  size: number // square tile edge, artboard px
  rects: { x: number; y: number; w: number; h: number }[]
  dots: { x: number; y: number; r: number }[]
  lines: { x1: number; y1: number; x2: number; y2: number; w: number }[]
}

// the classic 4x4 Bayer matrix, thresholds 0..15
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export function textureTile(kind: TextureKind, density: number): TextureTile {
  const d = clamp01(density)
  const tile: TextureTile = { size: 12, rects: [], dots: [], lines: [] }

  if (kind === 'dither') {
    // 4x4 cells of 3px; a cell is on when its Bayer threshold clears the
    // density. Marks stay smaller than the cell so d=1 is a dense weave,
    // never a solid fill.
    const cell = 3
    tile.size = cell * 4
    const on = 0.15 + d * 0.8 // some texture even at the low end
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if ((BAYER4[row][col] + 0.5) / 16 > on) continue
        const w = cell * 0.72
        tile.rects.push({
          x: col * cell + (cell - w) / 2,
          y: row * cell + (cell - w) / 2,
          w,
          h: w,
        })
      }
    }
    return tile
  }

  if (kind === 'dots') {
    // two dots per tile on offset half-rows — the halftone screen
    tile.size = 10
    const r = 0.8 + d * 2.2
    tile.dots.push({ x: 2.5, y: 2.5, r }, { x: 7.5, y: 7.5, r })
    return tile
  }

  // hatch: one 45-degree line per tile plus corner continuations so the
  // screen tiles seamlessly
  tile.size = 8
  const w = 0.6 + d * 2.2
  tile.lines.push(
    { x1: -2, y1: 2, x2: 2, y2: -2, w },
    { x1: 0, y1: 8, x2: 8, y2: 0, w },
    { x1: 6, y1: 10, x2: 10, y2: 6, w },
  )
  return tile
}

// The export side: draw the tile spec onto a canvas at `resolution`
// pixels per artboard px, ready for ctx.createPattern.
export function paintTextureTile(
  tile: TextureTile,
  color: string,
  resolution = 1,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const px = Math.max(1, Math.round(tile.size * resolution))
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas
  ctx.scale(px / tile.size, px / tile.size)
  ctx.fillStyle = color
  ctx.strokeStyle = color
  for (const r of tile.rects) ctx.fillRect(r.x, r.y, r.w, r.h)
  for (const dot of tile.dots) {
    ctx.beginPath()
    ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.lineCap = 'butt'
  for (const line of tile.lines) {
    ctx.lineWidth = line.w
    ctx.beginPath()
    ctx.moveTo(line.x1, line.y1)
    ctx.lineTo(line.x2, line.y2)
    ctx.stroke()
  }
  return canvas
}
