import type { OrganicBuild } from './engine'
import { chan } from './random'
import { metaUnitOutline } from '@/core/sheet/sheet'
import { PROTO_SIZE, paintTextProto, type ShapeProto } from '@/core/canvas/shapeProtos'

// Stamping + raster finish for the organic engine. Prototypes are unit
// paths (half-size 1) stamped per point; the finish is the raster move
// the spec centers on: blur -> alpha threshold (the metaball merge),
// feathered by SOFT, textured by GRAIN. Same code paints the live layer
// and the export — only the resolution differs.

export type PaintOpts = {
  scale: number // device px per artboard px
  palette: string[] // hex fills, indexed by paletteIndex
  full: boolean // false = fast preview (skip threshold + grain)
  drawnProtos?: ShapeProto[] // bound drawn shapes, indexed by pt.drawnIndex
}

const TAU = Math.PI * 2

// per-id prototype paths are pure functions of (seed, id) — cache them
// so slider drags do not rebuild thousands of Path2Ds per tick. The
// cache resets when the seed changes.
let cacheSeed = Number.NaN
const pathCache = new Map<string, Path2D>()

function cached(seed: number, key: string, make: () => Path2D): Path2D {
  if (seed !== cacheSeed) {
    pathCache.clear()
    cacheSeed = seed
  }
  let p = pathCache.get(key)
  if (!p) {
    p = make()
    pathCache.set(key, p)
  }
  return p
}

// -- unit prototypes --------------------------------------------------------

function blobPath(seed: number, id: number): Path2D {
  // every blob is its own creature: 3 low harmonics from stable channels
  const a2 = chan(seed, id, 'blob.a2') * 0.28
  const a3 = chan(seed, id, 'blob.a3') * 0.22
  const a5 = chan(seed, id, 'blob.a5') * 0.12
  const p2 = chan(seed, id, 'blob.p2') * TAU
  const p3 = chan(seed, id, 'blob.p3') * TAU
  const p5 = chan(seed, id, 'blob.p5') * TAU
  const path = new Path2D()
  const N = 44
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * TAU
    const r =
      1 + a2 * Math.sin(2 * t + p2) + a3 * Math.sin(3 * t + p3) + a5 * Math.sin(5 * t + p5)
    const x = Math.cos(t) * r
    const y = Math.sin(t) * r
    if (i === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  }
  path.closePath()
  return path
}

function superPath(seed: number, id: number): Path2D {
  // superellipse |x|^n + |y|^n = 1, n from squarish to pillowy
  const n = 2.6 + chan(seed, id, 'super.n') * 2.6
  const path = new Path2D()
  const N = 40
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * TAU
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / n)
    const y = Math.sign(s) * Math.pow(Math.abs(s), 2 / n)
    if (i === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  }
  path.closePath()
  return path
}

function starPath(seed: number, id: number): Path2D {
  const spikes = 4 + Math.floor(chan(seed, id, 'star.k') * 3)
  const inner = 0.38 + chan(seed, id, 'star.inner') * 0.25
  const path = new Path2D()
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 1 : inner
    const t = (i / (spikes * 2)) * TAU - Math.PI / 2
    const x = Math.cos(t) * r
    const y = Math.sin(t) * r
    if (i === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  }
  path.closePath()
  return path
}

let capsulePath: Path2D | null = null
function capsule(): Path2D {
  if (capsulePath) return capsulePath
  const p = new Path2D()
  // unit-height capsule along x, half-length 1: stretched via ctx scale
  p.arc(-0.6, 0, 0.4, Math.PI / 2, (3 * Math.PI) / 2)
  p.arc(0.6, 0, 0.4, (3 * Math.PI) / 2, Math.PI / 2)
  p.closePath()
  capsulePath = p
  return p
}

let ribbonPath: Path2D | null = null
function ribbon(): Path2D {
  if (ribbonPath) return ribbonPath
  // tapered stroke: fat middle, pointed ends — the flow-line mark
  const p = new Path2D()
  p.moveTo(-1, 0)
  p.quadraticCurveTo(-0.3, -0.3, 0.35, -0.16)
  p.quadraticCurveTo(0.8, -0.06, 1, 0)
  p.quadraticCurveTo(0.8, 0.06, 0.35, 0.16)
  p.quadraticCurveTo(-0.3, 0.3, -1, 0)
  p.closePath()
  ribbonPath = p
  return p
}

let metaPath: Path2D | null = null
function meta(): Path2D {
  if (metaPath) return metaPath
  const pts = metaUnitOutline()
  const p = new Path2D()
  pts.forEach((pt, i) => (i === 0 ? p.moveTo(pt.x, pt.y) : p.lineTo(pt.x, pt.y)))
  p.closePath()
  metaPath = p
  return p
}

let circlePath: Path2D | null = null
function circle(): Path2D {
  if (circlePath) return circlePath
  const p = new Path2D()
  p.arc(0, 0, 1, 0, TAU)
  circlePath = p
  return p
}

// drawn-proto paths keyed by the FULL d string — a source shape's d
// changes when it is resized, so an id key would serve stale geometry.
// Clear-on-overflow beats LRU bookkeeping at this size.
const drawnCache = new Map<string, Path2D>()

function drawnPath(d: string): Path2D {
  let p = drawnCache.get(d)
  if (!p) {
    if (drawnCache.size >= 128) drawnCache.clear()
    p = new Path2D(d)
    drawnCache.set(d, p)
  }
  return p
}

// -- stamping + finish ------------------------------------------------------

export function paintOrganic(
  target: CanvasRenderingContext2D,
  build: OrganicBuild,
  W: number,
  H: number,
  opts: PaintOpts,
): void {
  const p = build.params
  const scale = opts.scale
  const outW = Math.max(1, Math.round(W * scale))
  const outH = Math.max(1, Math.round(H * scale))

  const stamp = document.createElement('canvas')
  stamp.width = outW
  stamp.height = outH
  const ctx = stamp.getContext('2d')
  if (!ctx) return
  ctx.scale(scale, scale)

  for (const pt of build.points) {
    ctx.save()
    ctx.translate(pt.x, pt.y)
    ctx.rotate(pt.angle)
    // bound drawn shape: the proto lives in a PROTO_SIZE box and carries
    // its own fill/opacity — pt.scale is a half-size, hence 2 / PROTO_SIZE.
    // The raster finish below reads only the stamped alpha, so goo/soft/
    // grain work over drawn stamps unchanged.
    const drawn = opts.drawnProtos && pt.drawnIndex != null ? opts.drawnProtos[pt.drawnIndex] : null
    if (drawn) {
      const k = 2 / PROTO_SIZE
      ctx.scale(pt.scale * pt.stretch * k, pt.scale * k)
      ctx.globalAlpha = pt.opacity * drawn.opacity
      ctx.fillStyle = drawn.fill
      if (drawn.kind === 'text') paintTextProto(ctx, drawn)
      else ctx.fill(drawnPath(drawn.d), 'evenodd')
      ctx.restore()
      continue
    }
    ctx.scale(pt.scale * pt.stretch, pt.scale)
    ctx.globalAlpha = pt.opacity
    ctx.fillStyle = opts.palette[pt.paletteIndex % opts.palette.length] ?? '#f4f2ed'
    const path =
      pt.proto === 'blob'
        ? cached(p.seed, `b${pt.id}`, () => blobPath(p.seed, pt.id))
        : pt.proto === 'super'
          ? cached(p.seed, `s${pt.id}`, () => superPath(p.seed, pt.id))
          : pt.proto === 'star'
            ? cached(p.seed, `t${pt.id}`, () => starPath(p.seed, pt.id))
            : pt.proto === 'capsule'
              ? capsule()
              : pt.proto === 'ribbon'
                ? ribbon()
                : pt.proto === 'meta'
                  ? meta()
                  : circle()
    ctx.fill(path, 'evenodd')
    ctx.restore()
  }

  // artboard-space radii so live and export take the SAME branches and
  // read identically — only the device resolution differs
  const gooArt = p.goo * p.size * Math.min(W, H) * 0.9
  const softArt = p.soft * 2.5
  const needsRasterPass = opts.full && (p.goo > 0.01 || p.grain > 0.01)

  if (!needsRasterPass) {
    // fast path: optional gentle feather only. Blit in device pixels —
    // the target canvas matches the stamp resolution by construction.
    if (p.soft > 0.01) target.filter = `blur(${(p.soft * 2.5 * scale).toFixed(2)}px)`
    target.drawImage(stamp, 0, 0)
    target.filter = 'none'
    return
  }

  // GOO: blur the stamped layer, then pull the alpha back through a
  // threshold — nearby shapes fuse into one body (the metaball read).
  // SOFT folds into the pre-blur too, so a grain-only recipe keeps its
  // feather instead of dropping it on release.
  const work = document.createElement('canvas')
  work.width = outW
  work.height = outH
  const wctx = work.getContext('2d')
  if (!wctx) return
  const preBlurArt = Math.max(p.goo > 0.01 ? gooArt : 0, p.soft > 0.01 ? softArt : 0)
  if (preBlurArt > 0.4) wctx.filter = `blur(${(preBlurArt * scale).toFixed(2)}px)`
  wctx.drawImage(stamp, 0, 0)
  wctx.filter = 'none'

  const img = wctx.getImageData(0, 0, outW, outH)
  const data = img.data
  const t0 = 0.5 - 0.04 - p.soft * 0.3
  const t1 = 0.5 + 0.04 + p.soft * 0.12
  const inv = 1 / Math.max(1e-4, t1 - t0)
  const grainAmt = p.grain * 0.5
  const gseed = (p.seed ^ 0x3d91) >>> 0
  // grain hashes ARTBOARD-space cells, so an export is the live pattern
  // at higher resolution rather than an unrelated (and visually weaker)
  // re-roll of per-device-pixel noise
  const cell = Math.max(1, Math.round(scale))
  for (let i = 0; i < data.length; i += 4) {
    let a = data[i + 3] / 255
    if (p.goo > 0.01) {
      // smoothstep threshold
      let t = (a - t0) * inv
      t = t < 0 ? 0 : t > 1 ? 1 : t
      a = t * t * (3 - 2 * t)
    }
    if (grainAmt > 0 && a > 0.003) {
      const px = i >> 2
      const x = px % outW
      const y = (px - x) / outW
      const ax = (x / cell) | 0
      const ay = (y / cell) | 0
      let h = (gseed ^ Math.imul(ax, 0x9e3779b1) ^ Math.imul(ay, 0x85ebca6b)) >>> 0
      h = (h ^ (h >>> 13)) >>> 0
      h = Math.imul(h, 0x27d4eb2d) >>> 0
      h = (h ^ (h >>> 16)) >>> 0
      const n = h / 0x100000000
      a *= 1 - grainAmt * n
    }
    data[i + 3] = Math.max(0, Math.min(255, Math.round(a * 255)))
  }
  wctx.putImageData(img, 0, 0)
  target.drawImage(work, 0, 0)
}
