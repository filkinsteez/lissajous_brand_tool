import type { ShapeProto } from '@/core/canvas/shapeProtos'
import { INK, PAPER } from '@/core/state/defaults'
import { contourAtLevel } from '@/core/cloner/contours'
import { sampleCurve } from '@/core/lissajous/sampler'
import type { LabState, LabView } from './types'
import type { LabSource } from './sourceCache'
import type { Field, FitRect } from './field'
import { fieldFromMap, fitRect } from './field'
import { buildCurveField, compileTerritory, territoryGrid } from './territory'
import { buildCellMarks, buildCells, curveFlowField, tintFor } from './composition'
import { getPaintRaster, reconcilePaint } from './paintRuntime'
import { sampleRGB } from './analysis'
import { stampProto } from './stamp'

// One painter for preview AND export. The ctx arrives pre-scaled and
// everything draws in output units. Per-render work is lazy: the
// territory Field only evaluates where cells ask, and the two heavy
// lattices (curve distance, curve flow) cache across renders.

let scratch: HTMLCanvasElement | null = null

function mapCanvas(w: number, h: number): CanvasRenderingContext2D {
  if (!scratch) scratch = document.createElement('canvas')
  scratch.width = w
  scratch.height = h
  return scratch.getContext('2d')!
}

// curve lattice caches — keyed by the exact inputs, capped small
const curveFieldCache = new Map<string, Field>()
const flowCache = new Map<string, (x: number, y: number) => number>()

function cached<T>(cache: Map<string, T>, key: string, build: () => T): T {
  let hit = cache.get(key)
  if (!hit) {
    if (cache.size > 8) cache.clear()
    hit = build()
    cache.set(key, hit)
  }
  return hit
}

export function renderLab(
  ctx: CanvasRenderingContext2D,
  lab: LabState,
  source: LabSource | null,
  protos: ShapeProto[],
  view: LabView,
): void {
  const { width: outW, height: outH, transparent } = lab.output
  // defensive: a live HMR session may hold pre-`colors` state until the
  // next apply/restore heals it
  const ink = lab.colors?.ink ?? INK
  const paper = lab.colors?.paper ?? PAPER
  ctx.clearRect(0, 0, outW, outH)
  if (!transparent || view !== 'composite') {
    ctx.fillStyle = paper
    ctx.fillRect(0, 0, outW, outH)
  }

  const maps = source?.maps ?? null
  const rect: FitRect = source
    ? fitRect(source.fullW, source.fullH, outW, outH, lab.source?.fit ?? 'contain')
    : { x: 0, y: 0, w: outW, h: outH }

  if (view === 'source') {
    if (source) ctx.drawImage(source.image, rect.x, rect.y, rect.w, rect.h)
    return
  }
  if (view === 'lum' || view === 'edge' || view === 'orient') {
    if (maps) drawAnalysisView(ctx, maps, rect, view)
    return
  }

  // territory — curve lattices arrive as cached field overrides
  reconcilePaint(lab.paint)
  const paint = getPaintRaster()
  // the mask is SIGNED around its neutral midpoint: brush strokes read
  // negative (carve into the glitch), erase reads positive (override up
  // to photo), untouched reads ~0 — folded in with plain 'add'
  const paintField: Field | null = paint
    ? (() => {
        const raw = fieldFromMap(
          Float32Array.from(paint.bytes, (b) => b / 255),
          paint.w,
          paint.h,
          { x: 0, y: 0, w: outW, h: outH },
        )
        return (x: number, y: number) =>
          Math.max(-1, Math.min(1, (raw(x, y) * 255 - 128) / 127))
      })()
    : null
  // the positive (erase) side of the mask protects the photo outright
  const restore: Field | null = paintField
    ? (x: number, y: number) => Math.max(0, paintField(x, y))
    : null
  const T = compileTerritoryCached(lab, rect, outW, outH, maps, paintField)

  if (view === 'territory') {
    drawFieldView(ctx, T, outW, outH)
    return
  }

  const cells = buildCells({
    T,
    territory: lab.territory,
    structure: lab.structure,
    maps,
    rect,
    outW,
    outH,
    seed: lab.seed,
    restore,
  })

  if (view === 'bands') {
    const n = Math.max(1, lab.territory.bands.length - 1)
    for (const c of cells) {
      const v = Math.round((c.band / n) * 230)
      ctx.fillStyle = `rgb(${v} ${v} ${v})`
      ctx.fillRect(c.x, c.y, c.size + 0.5, c.size + 0.5)
    }
    return
  }
  if (view === 'cells') {
    ctx.strokeStyle = ink
    for (const c of cells) {
      ctx.globalAlpha = 0.25 + c.level * 0.35
      ctx.lineWidth = 0.75
      ctx.strokeRect(c.x + 0.5, c.y + 0.5, c.size - 1, c.size - 1)
    }
    ctx.globalAlpha = 1
    return
  }

  // ---- composite ----
  if (source && lab.sourceVisibility > 0) {
    ctx.save()
    ctx.globalAlpha = lab.sourceVisibility
    ctx.drawImage(source.image, rect.x, rect.y, rect.w, rect.h)
    ctx.restore()
  }

  // photo: the source revealed cell-by-cell — one clip, one draw
  const photoCells = cells.filter((c) => c.treatment === 'photo')
  if (source && photoCells.length) {
    ctx.save()
    const clip = new Path2D()
    for (const c of photoCells) clip.rect(c.x, c.y, c.size + 0.35, c.size + 0.35)
    ctx.clip(clip)
    ctx.drawImage(source.image, rect.x, rect.y, rect.w, rect.h)
    ctx.restore()
  }

  // mosaic: the source quantized to the cell grid — the same image one
  // representation coarser
  if (maps) {
    for (const c of cells) {
      if (c.treatment !== 'mosaic') continue
      const u = (c.x + c.size / 2 - rect.x) / rect.w
      const v = (c.y + c.size / 2 - rect.y) / rect.h
      if (u < 0 || u > 1 || v < 0 || v > 1) continue
      const [r, g, b] = sampleRGB(maps, u * maps.w - 0.5, v * maps.h - 0.5)
      ctx.fillStyle = `rgb(${r} ${g} ${b})`
      ctx.fillRect(c.x, c.y, c.size + 0.35, c.size + 0.35)
    }
  }

  // flat ink masses
  ctx.fillStyle = ink
  for (const c of cells) {
    if (c.treatment === 'flat') ctx.fillRect(c.x, c.y, c.size + 0.35, c.size + 0.35)
  }

  // contours: topographic hairlines of the territory itself, clipped to
  // the cells that own them
  const contourCells = cells.filter((c) => c.treatment === 'contours')
  if (contourCells.length) {
    const bandIdx = new Set(contourCells.map((c) => c.band))
    const grid = territoryGrid(T, outW, outH)
    const n = lab.territory.bands.length
    ctx.save()
    const clip = new Path2D()
    for (const c of contourCells) clip.rect(c.x, c.y, c.size + 0.35, c.size + 0.35)
    ctx.clip(clip)
    ctx.strokeStyle = ink
    ctx.lineWidth = 1.1
    for (const b of bandIdx) {
      for (let k = 0; k < 5; k++) {
        const level = (b + (k + 0.5) / 5) / n
        const d = contourAtLevel(grid, level)
        if (d) ctx.stroke(new Path2D(d))
      }
    }
    ctx.restore()
  }

  // marks — with or without a source; territory alone can carry them
  if (cells.some((c) => c.treatment === 'marks')) {
    const stamps = buildCellMarks({
      cells,
      params: lab.mark,
      maps,
      rect,
      seed: lab.seed,
      bankSize: Math.max(1, protos.length),
      flowField: flowFieldFor(lab, outW, outH),
    })
    const mode = lab.mark.colorMode
    for (const s of stamps) {
      const proto = protos[Math.min(s.protoIndex, protos.length - 1)]
      if (!proto) continue
      let fill = ink
      let alpha = 1
      if (mode === 'tint') alpha = tintFor(s.tone)
      else if (mode === 'source' && maps) {
        const [r, g, b] = sampleRGB(maps, s.mx, s.my)
        fill = `rgb(${r} ${g} ${b})`
      }
      stampProto(ctx, proto, s.x, s.y, s.rot, s.size, fill, alpha)
    }
  }
}

function compileTerritoryCached(
  lab: LabState,
  rect: FitRect,
  outW: number,
  outH: number,
  maps: LabSource['maps'] | null,
  paintField: Field | null,
): Field {
  // curve distance lattices are the one expensive compile step — build
  // them through the cache and hand them to compileTerritory as
  // OVERRIDES, so each source keeps its exact place in the fold and its
  // weight/invert/combine semantics (an earlier version re-added curve
  // fields with forced 'add' and silently contradicted the engine)
  const fieldOverrides = new Map<string, Field>()
  for (const src of lab.territory.sources) {
    if (src.kind !== 'curve' || !src.enabled || !src.curve) continue
    const key = `${JSON.stringify(src.curve)}|${outW}x${outH}|${src.softness.toFixed(3)}`
    fieldOverrides.set(
      src.id,
      cached(curveFieldCache, key, () => buildCurveField(src.curve!, outW, outH, src.softness)),
    )
  }
  return compileTerritory(lab.territory, { rect, outW, outH, maps, paintField, fieldOverrides })
}

function flowFieldFor(lab: LabState, outW: number, outH: number) {
  const src = lab.territory.sources.find((s) => s.kind === 'curve' && s.enabled && s.curve)
  if (!src?.curve || lab.mark.flow <= 0) return null
  const key = `${JSON.stringify(src.curve)}|${outW}x${outH}`
  return cached(flowCache, key, () => {
    const samples = sampleCurve({ ...src.curve!, sampleDensity: 96, curve: src.curve!.curve }, outW, outH, 200)
    return curveFlowField(samples, outW, outH)
  })
}

function drawFieldView(ctx: CanvasRenderingContext2D, f: Field, outW: number, outH: number) {
  // budget the long side — a 64x8192 output must not rasterize 4M samples
  const rw = Math.max(8, Math.round((180 * outW) / Math.max(outW, outH)))
  const rh = Math.max(8, Math.round((rw * outH) / outW))
  const img = new ImageData(rw, rh)
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const v = Math.round(f(((x + 0.5) / rw) * outW, ((y + 0.5) / rh) * outH) * 255)
      const o = (y * rw + x) * 4
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v
      img.data[o + 3] = 255
    }
  }
  blitMap(ctx, img, { x: 0, y: 0, w: outW, h: outH })
}

function drawAnalysisView(
  ctx: CanvasRenderingContext2D,
  maps: NonNullable<LabSource['maps']>,
  rect: FitRect,
  view: 'lum' | 'edge' | 'orient',
) {
  const img = new ImageData(maps.w, maps.h)
  if (view === 'orient') {
    for (let i = 0; i < maps.orientX.length; i++) {
      const conf = Math.min(1, Math.hypot(maps.orientX[i], maps.orientY[i]) * 6)
      const hue = ((0.5 * Math.atan2(maps.orientY[i], maps.orientX[i]) + Math.PI / 2) / Math.PI) * 360
      const [r, g, b] = hslToRgb(hue, 0.75 * conf, 0.52)
      const o = i * 4
      img.data[o] = r
      img.data[o + 1] = g
      img.data[o + 2] = b
      img.data[o + 3] = 255
    }
  } else {
    const data = view === 'lum' ? maps.lum : maps.edge
    for (let i = 0; i < data.length; i++) {
      const v = Math.round(Math.max(0, Math.min(1, data[i])) * 255)
      const o = i * 4
      img.data[o] = img.data[o + 1] = img.data[o + 2] = view === 'edge' ? 255 - v : v
      img.data[o + 3] = 255
    }
  }
  blitMap(ctx, img, rect)
}

function blitMap(
  ctx: CanvasRenderingContext2D,
  img: ImageData,
  rect: { x: number; y: number; w: number; h: number },
): void {
  const m = mapCanvas(img.width, img.height)
  m.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(m.canvas, rect.x, rect.y, rect.w, rect.h)
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

// Export renders the SAME painter at full output dimensions on a fresh
// canvas — never a scaled screenshot of the preview.
export async function exportLabPng(
  lab: LabState,
  source: LabSource | null,
  protos: ShapeProto[],
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = lab.output.width
  canvas.height = lab.output.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')
  renderLab(ctx, lab, source, protos, 'composite')
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  })
}
