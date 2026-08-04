import type { PaintState } from './types'

// The painted mask's working raster. State (LabState.paint) holds the
// serialized base64 form for recipes/undo; THIS module holds the live
// bytes that strokes mutate at pointer speed — re-encoding 12KB of
// base64 per mousemove into the store would put every stroke sample on
// the undo path. Strokes commit once on pointer-up.

export const PAINT_W = 128

export type PaintRaster = { w: number; h: number; bytes: Uint8Array }

let raster: PaintRaster | null = null
let lastSerialized: string | null = null

export function getPaintRaster(): PaintRaster | null {
  return raster
}

export function ensurePaintRaster(outW: number, outH: number): PaintRaster {
  const h = Math.max(8, Math.round((PAINT_W * outH) / Math.max(1, outW)))
  if (!raster) {
    raster = { w: PAINT_W, h, bytes: new Uint8Array(PAINT_W * h).fill(PAINT_NEUTRAL) }
  } else if (raster.w !== PAINT_W || raster.h !== h) {
    // output aspect changed since the mask was painted: RESAMPLE the
    // authored mask into the new grid — discarding it here silently
    // destroyed the user's painting on the first brush touch after an
    // image import changed the output dims
    raster = resample(raster, PAINT_W, h)
  }
  return raster
}

function resample(src: PaintRaster, w: number, h: number): PaintRaster {
  const bytes = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.h - 1, Math.round(((y + 0.5) / h) * src.h - 0.5))
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.w - 1, Math.round(((x + 0.5) / w) * src.w - 0.5))
      bytes[y * w + x] = src.bytes[sy * src.w + sx]
    }
  }
  return { w, h, bytes }
}

// keep the runtime in step with state (recipe load, undo/redo, clear).
// Called before every render — cheap identity check, decode only when
// the serialized form actually changed under us.
export function reconcilePaint(paint: PaintState | null): void {
  if (!paint) {
    if (lastSerialized !== null) {
      raster = null
      lastSerialized = null
    }
    return
  }
  if (paint.data === lastSerialized) return
  const w = Math.max(1, Math.round(paint.w))
  const h = Math.max(1, Math.round(paint.h))
  const decoded = fromBase64(paint.data)
  // a truncated or hand-edited recipe must not leak out-of-bounds reads
  // (undefined -> NaN poisons the whole territory into blank paper)
  let bytes = decoded
  if (decoded.length !== w * h) {
    bytes = new Uint8Array(w * h).fill(PAINT_NEUTRAL)
    bytes.set(decoded.subarray(0, Math.min(decoded.length, bytes.length)))
  }
  raster = { w, h, bytes }
  lastSerialized = paint.data
}

// The mask is a SIGNED field around a neutral midpoint (128): the
// brush pushes territory DOWN into the treatment bands — it paints the
// glitch — and the eraser pushes territory UP past every band to the
// photo, restoring the image wherever it touches, painted or not.
// Two earlier semantics both failed the same way: erase-undoes-brush
// "did nothing" on unpainted photo, and erase-to-blank-paper read as
// ADDING white blobs. Erase means "give me the picture back".
export const PAINT_NEUTRAL = 128
export const BRUSH_LEVEL = 71 // ≈ −0.45 — carves into the treatment bands
export const ERASE_LEVEL = 255 // +1 — overrides everything up to photo

// soft round dab that converges toward `target`: painting over an
// erased area pulls it back DOWN to glitch depth, erasing over a
// brushed area pushes it on to paper — either tool always wins where
// it is applied
export function applyStroke(
  r: PaintRaster,
  x: number, // paint-raster coords
  y: number,
  radius: number,
  target: number,
): void {
  const rad = Math.max(1, radius)
  const x0 = Math.max(0, Math.floor(x - rad))
  const x1 = Math.min(r.w - 1, Math.ceil(x + rad))
  const y0 = Math.max(0, Math.floor(y - rad))
  const y1 = Math.min(r.h - 1, Math.ceil(y + rad))
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const d = Math.hypot(px - x, py - y)
      if (d > rad) continue
      const fall = 1 - (d / rad) * (d / rad)
      const i = py * r.w + px
      r.bytes[i] = Math.round(r.bytes[i] + (target - r.bytes[i]) * fall)
    }
  }
}

export function serializePaint(r: PaintRaster): PaintState {
  const data = toBase64(r.bytes)
  lastSerialized = data
  return { w: r.w, h: r.h, data }
}

export function clearPaintRuntime(): void {
  raster = null
  lastSerialized = null
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x4000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x4000))
  }
  return btoa(bin)
}

function fromBase64(data: string): Uint8Array {
  try {
    const bin = atob(data)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return new Uint8Array(0)
  }
}
