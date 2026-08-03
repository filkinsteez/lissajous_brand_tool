import type { OrganicState, OrganicProto } from '@/core/state/types'
import { chan, chanGauss } from './random'
import { fbm } from './noise'

// The organic composition engine — the raster-first spec's pipeline as
// pure data: distribute points, evaluate fields, cull, map per-point
// attributes through named random channels. No canvas here; painting
// lives in paint.ts so this whole stage is testable and shared by the
// live layer and the export.

export type OrganicPoint = {
  id: number // stable across culling and re-mapping
  x: number
  y: number
  angle: number
  scale: number // half-size in artboard px
  stretch: number // 1 = round; >1 elongates along angle (ribbons/capsules)
  proto: OrganicProto
  drawnIndex?: number // index into the layer's bound drawn protos; set only when bound
  paletteIndex: number
  opacity: number
  field: number // the density field at this point, for downstream use
}

export type OrganicBuild = {
  points: OrganicPoint[]
  params: OrganicState
}

type Curve = { x: number; y: number }[]

const TAU = Math.PI * 2

// -- fields -----------------------------------------------------------------

// ONE scan gives everything the pipeline needs from the curve: nearest
// distance AND the tangent there. Density, rotation and flow all read
// this — three separate polyline walks per point was the review's
// biggest engine cost.
export function nearestOnCurve(curve: Curve, x: number, y: number): { d: number; angle: number } {
  let best = Infinity
  let angle = 0
  for (let i = 1; i < curve.length; i++) {
    const ax = curve[i - 1].x
    const ay = curve[i - 1].y
    const bx = curve[i].x
    const by = curve[i].y
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy || 1e-9
    let t = ((x - ax) * dx + (y - ay) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    const px = ax + dx * t
    const py = ay + dy * t
    const d = (x - px) * (x - px) + (y - py) * (y - py)
    if (d < best) {
      best = d
      angle = Math.atan2(dy, dx)
    }
  }
  return { d: Math.sqrt(best), angle }
}

// the shared field math, taking a precomputed curve distance so the
// point loop pays for one polyline scan, not three
function evalDensity(
  p: OrganicState,
  W: number,
  H: number,
  x: number,
  y: number,
  dCurve: number | null,
): number {
  const minDim = Math.min(W, H)
  const reach = minDim * 0.38
  let f = 0.3
  if (dCurve !== null && p.curvePull > 0) {
    f += p.curvePull * Math.exp(-(dCurve * dCurve) / (2 * reach * reach * 0.22)) * 1.1
  }
  if (p.focalStrength > 0) {
    const fx = p.focalX * W
    const fy = p.focalY * H
    const d = Math.hypot(x - fx, y - fy)
    f += p.focalStrength * Math.exp(-(d * d) / (2 * reach * reach * 0.5))
  }
  if (p.noiseAmount > 0) {
    const n = fbm(p.seed ^ 0x51f7, (x / minDim) * p.noiseScale, (y / minDim) * p.noiseScale)
    f += p.noiseAmount * (n - 0.5) * 1.6
  }
  return Math.max(0, Math.min(1, f))
}

// the recipe's one scalar field: curve pull + focal falloff + coherent
// noise over a quiet base, normalized to [0, 1]. Everything downstream
// (cull, size, color, opacity) can read it — the spec's map-driven model.
export function densityField(
  p: OrganicState,
  W: number,
  H: number,
  curve: Curve | null,
): (x: number, y: number) => number {
  return (x, y) =>
    evalDensity(p, W, H, x, y, curve ? nearestOnCurve(curve, x, y).d : null)
}

// flow direction: curve tangent where the curve matters, noise flow
// elsewhere — blended by proximity so orientation stays coherent
function flowFrom(
  p: OrganicState,
  minDim: number,
  near: { d: number; angle: number } | null,
  x: number,
  y: number,
): number {
  const nAng =
    fbm(p.seed ^ 0x77a1, (x / minDim) * p.noiseScale * 0.8, (y / minDim) * p.noiseScale * 0.8) *
    TAU *
    2
  if (!near || p.curvePull <= 0.01) return nAng
  const w = Math.exp(-near.d / (minDim * 0.18))
  // blend angles through vectors to dodge the wraparound
  const vx = Math.cos(near.angle) * w + Math.cos(nAng) * (1 - w)
  const vy = Math.sin(near.angle) * w + Math.sin(nAng) * (1 - w)
  return Math.atan2(vy, vx)
}

// -- distributions ----------------------------------------------------------

type RawPoint = { id: number; x: number; y: number }

// Bridson poisson-disk: blue-noise spacing, the workhorse organic spread
function poisson(p: OrganicState, W: number, H: number): RawPoint[] {
  if (p.count <= 0) return []
  const r = Math.max(4, p.spacing * Math.min(W, H))
  const cell = r / Math.SQRT2
  const gw = Math.ceil(W / cell)
  const gh = Math.ceil(H / cell)
  const grid = new Int32Array(gw * gh).fill(-1)
  const pts: RawPoint[] = []
  const active: number[] = []
  const put = (x: number, y: number) => {
    const id = pts.length
    pts.push({ id, x, y })
    grid[Math.floor(y / cell) * gw + Math.floor(x / cell)] = id
    active.push(id)
  }
  put(
    W * (0.2 + 0.6 * chan(p.seed, 0, 'poisson.x0')),
    H * (0.2 + 0.6 * chan(p.seed, 0, 'poisson.y0')),
  )
  let guard = 0
  while (active.length && pts.length < p.count && guard++ < 200000) {
    const ai = Math.floor(chan(p.seed, guard, 'poisson.pick') * active.length)
    const a = pts[active[ai]]
    let placed = false
    for (let k = 0; k < 24; k++) {
      const ang = chan(p.seed, guard * 31 + k, 'poisson.ang') * TAU
      const rad = r * (1 + chan(p.seed, guard * 31 + k, 'poisson.rad'))
      const x = a.x + Math.cos(ang) * rad
      const y = a.y + Math.sin(ang) * rad
      if (x < 0 || y < 0 || x >= W || y >= H) continue
      const gx = Math.floor(x / cell)
      const gy = Math.floor(y / cell)
      let ok = true
      for (let oy = -2; oy <= 2 && ok; oy++) {
        for (let ox = -2; ox <= 2 && ok; ox++) {
          const cx = gx + ox
          const cy = gy + oy
          if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue
          const other = grid[cy * gw + cx]
          if (other >= 0 && Math.hypot(pts[other].x - x, pts[other].y - y) < r) ok = false
        }
      }
      if (!ok) continue
      put(x, y)
      placed = true
      break
    }
    if (!placed) active.splice(ai, 1)
  }
  return pts
}

// golden-angle phyllotaxis growing from the focal point
function phyllo(p: OrganicState, W: number, H: number): RawPoint[] {
  const cx = p.focalX * W
  const cy = p.focalY * H
  const golden = Math.PI * (3 - Math.sqrt(5))
  const c = Math.max(2, p.spacing * Math.min(W, H) * 0.55)
  const pts: RawPoint[] = []
  for (let i = 0; i < p.count; i++) {
    const ang = i * golden
    const rad = c * Math.sqrt(i)
    const x = cx + Math.cos(ang) * rad
    const y = cy + Math.sin(ang) * rad
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue
    pts.push({ id: i, x, y })
  }
  return pts
}

// jittered hex lattice — regular bones under organic flesh
function hex(p: OrganicState, W: number, H: number): RawPoint[] {
  const pitch = Math.max(6, p.spacing * Math.min(W, H) * 1.6)
  const rowH = pitch * 0.866
  const pts: RawPoint[] = []
  let id = 0
  for (let row = 0; row * rowH < H + pitch; row++) {
    for (let col = 0; col * pitch < W + pitch; col++) {
      if (pts.length >= p.count) return pts
      const x = col * pitch + (row % 2 ? pitch / 2 : 0) + chanGauss(p.seed, id, 'hex.jx') * pitch * 0.18
      const y = row * rowH + chanGauss(p.seed, id, 'hex.jy') * pitch * 0.18
      pts.push({ id, x, y })
      id++
    }
  }
  return pts
}

// riding the figure: arc-even placement with gaussian spread off the path
function curveDist(p: OrganicState, W: number, H: number, curve: Curve | null): RawPoint[] {
  if (!curve || curve.length < 2) return poisson(p, W, H)
  const spread = p.spacing * Math.min(W, H) * 3
  // cumulative lengths for arc-even sampling
  const cum: number[] = [0]
  for (let i = 1; i < curve.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(curve[i].x - curve[i - 1].x, curve[i].y - curve[i - 1].y))
  }
  const total = cum[cum.length - 1] || 1
  const pts: RawPoint[] = []
  for (let i = 0; i < p.count; i++) {
    const target = (i / p.count) * total
    let lo = 0
    let hi = cum.length - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (cum[mid] < target) lo = mid + 1
      else hi = mid
    }
    const seg = Math.max(1, lo)
    const t =
      (target - cum[seg - 1]) / Math.max(1e-9, cum[seg] - cum[seg - 1])
    const bx = curve[seg - 1].x + (curve[seg].x - curve[seg - 1].x) * t
    const by = curve[seg - 1].y + (curve[seg].y - curve[seg - 1].y) * t
    const x = bx + chanGauss(p.seed, i, 'curve.ox') * spread
    const y = by + chanGauss(p.seed, i, 'curve.oy') * spread
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue
    pts.push({ id: i, x, y })
  }
  return pts
}

// a few gaussian clusters: focal masses with quiet space between
function cluster(p: OrganicState, W: number, H: number): RawPoint[] {
  const nClusters = 3 + Math.floor(chan(p.seed, 0, 'cluster.n') * 3)
  const centers: { x: number; y: number; s: number }[] = []
  for (let c = 0; c < nClusters; c++) {
    centers.push({
      x: W * (0.15 + 0.7 * chan(p.seed, c, 'cluster.cx')),
      y: H * (0.15 + 0.7 * chan(p.seed, c, 'cluster.cy')),
      s: Math.min(W, H) * (0.08 + 0.14 * chan(p.seed, c, 'cluster.cs')),
    })
  }
  const pts: RawPoint[] = []
  for (let i = 0; i < p.count; i++) {
    const c = centers[i % nClusters]
    const x = c.x + chanGauss(p.seed, i, 'cluster.ox') * c.s * 1.6
    const y = c.y + chanGauss(p.seed, i, 'cluster.oy') * c.s * 1.6
    if (x < 0 || y < 0 || x > W || y > H) continue
    pts.push({ id: i, x, y })
  }
  return pts
}

// -- the build --------------------------------------------------------------

export function buildOrganic(
  p: OrganicState,
  W: number,
  H: number,
  curve: Curve | null,
  paletteSize: number,
  drawnIds?: string[],
): OrganicBuild {
  const raw =
    p.distribution === 'poisson'
      ? poisson(p, W, H)
      : p.distribution === 'phyllo'
        ? phyllo(p, W, H)
        : p.distribution === 'hex'
          ? hex(p, W, H)
          : p.distribution === 'curve'
            ? curveDist(p, W, H, curve)
            : cluster(p, W, H)

  const minDim = Math.min(W, H)
  const protos = p.protos.length ? p.protos : (['blob'] as OrganicProto[])
  const fieldShapesDensity = p.curvePull > 0 || p.focalStrength > 0 || p.noiseAmount > 0
  const needsCurve = curve && (p.curvePull > 0 || p.rotation === 'tangent' || p.rotation === 'flow')

  const points: OrganicPoint[] = []
  for (const r of raw) {
    // one curve scan per point, shared by density, tangent and flow
    const near = needsCurve ? nearestOnCurve(curve, r.x, r.y) : null
    const f = evalDensity(p, W, H, r.x, r.y, near?.d ?? null)
    // probabilistic cull against the field: survival tracks density but
    // never fully silences the quiet regions (negative space stays alive)
    if (fieldShapesDensity) {
      const survive = 0.08 + 0.92 * Math.pow(f, 1.4)
      if (chan(p.seed, r.id, 'cull') > survive) continue
    }

    const sizeJit = 1 + chanGauss(p.seed, r.id, 'size') * p.sizeRange * 0.75
    // one continuous response: positive = dense grows, negative = dense
    // shrinks — the sign genuinely flips direction, no kink at zero
    const fieldSize = 1 + p.sizeField * (f - 0.5) * 2.2
    const scale = Math.max(0.8, p.size * minDim * sizeJit * Math.max(0.15, fieldSize))

    // order-free proto deal: each candidate rolls its own channel and
    // the highest roll wins — toggling one off and on can never
    // reshuffle the others (array order carries no meaning). Bound drawn
    // shapes replace the built-in vocabulary outright: the deal keys on
    // shape id, and proto stays protos[0] (unused downstream).
    let proto = protos[0]
    let drawnIndex: number | undefined
    let bestRoll = -1
    if (drawnIds?.length) {
      for (let di = 0; di < drawnIds.length; di++) {
        const roll = chan(p.seed, r.id, 'drawn:' + drawnIds[di])
        if (roll > bestRoll) {
          bestRoll = roll
          drawnIndex = di
        }
      }
    } else {
      for (const pr of protos) {
        const roll = chan(p.seed, r.id, 'proto.' + pr)
        if (roll > bestRoll) {
          bestRoll = roll
          proto = pr
        }
      }
    }

    let angle: number
    if (p.rotation === 'fixed') angle = 0
    else if (p.rotation === 'random') angle = chan(p.seed, r.id, 'rot') * TAU
    else if (p.rotation === 'tangent') angle = near ? near.angle : 0
    else angle = flowFrom(p, minDim, near, r.x, r.y)
    angle += chanGauss(p.seed, r.id, 'rotjit') * p.rotationJitter * 0.9

    const dealIndex = Math.floor(chan(p.seed, r.id, 'palette') * paletteSize) % paletteSize
    const fieldIndex = Math.min(
      paletteSize - 1,
      Math.floor((1 - f) * paletteSize * 0.999),
    )
    const paletteIndex =
      chan(p.seed, r.id, 'palette.mode') < p.colorField ? fieldIndex : dealIndex

    const opacity = Math.max(
      0.15,
      Math.min(1, 1 - chan(p.seed, r.id, 'opacity') * p.opacityRange * 0.85),
    )

    const stretch =
      proto === 'ribbon'
        ? 2.6 + chan(p.seed, r.id, 'stretch') * 2.4
        : proto === 'capsule'
          ? 1.7 + chan(p.seed, r.id, 'stretch') * 1.1
          : 1

    points.push({
      id: r.id,
      x: r.x,
      y: r.y,
      angle,
      scale,
      stretch,
      proto,
      drawnIndex,
      paletteIndex,
      opacity,
      field: f,
    })
  }

  return { points, params: p }
}
