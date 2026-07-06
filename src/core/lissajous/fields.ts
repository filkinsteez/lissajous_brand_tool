import type { CurveSample } from './sampler'
import type { RankedNode } from './ranking'
import { SpatialHash } from '@/core/math/spatialHash'

// CPU-baked field derived from the curve. One RGBA texel per point:
//   R: distance to curve, normalized by 0.35·diag, clamped 0..1
//   G: tangent.x of nearest curve point   B: tangent.y
//   A: intersection density (gaussian splats of ranked nodes)
// The Float32Array stays alive behind FieldSampler so glyph layout reads
// the exact same field the material shader gets uploaded as a texture.
export type FieldBake = {
  resX: number
  resY: number
  artW: number
  artH: number
  distNorm: number // px that maps to dist = 1
  data: Float32Array // resX * resY * 4
}

export function bakeFields(
  samples: CurveSample[],
  nodes: RankedNode[],
  artW: number,
  artH: number,
  resX = 256,
): FieldBake {
  const resY = Math.max(16, Math.round((resX * artH) / artW))
  const diag = Math.hypot(artW, artH)
  const distNorm = 0.35 * diag
  const data = new Float32Array(resX * resY * 4)

  // hash curve sample points for nearest-point queries
  const cell = diag * 0.02
  const hash = new SpatialHash<number>(cell)
  const n = samples.length - 1
  for (let i = 0; i < n; i++) hash.insertPoint(samples[i].x, samples[i].y, i)

  const sx = artW / resX
  const sy = artH / resY

  for (let ty = 0; ty < resY; ty++) {
    for (let tx = 0; tx < resX; tx++) {
      const px = (tx + 0.5) * sx
      const py = (ty + 0.5) * sy

      // expanding ring query until a sample is found
      let bestD = Infinity
      let bestI = 0
      for (let radius = cell; radius <= diag; radius *= 2) {
        const found = hash.queryPoint(px, py, radius)
        for (const i of found) {
          const dx = samples[i].x - px
          const dy = samples[i].y - py
          const d = dx * dx + dy * dy
          if (d < bestD) {
            bestD = d
            bestI = i
          }
        }
        if (found.length > 0 && Math.sqrt(bestD) <= radius) break
      }

      const o = (ty * resX + tx) * 4
      data[o] = Math.min(1, Math.sqrt(bestD) / distNorm)
      data[o + 1] = Math.cos(samples[bestI].angle)
      data[o + 2] = Math.sin(samples[bestI].angle)
    }
  }

  // density: gaussian splat per ranked node, weighted by score
  const sigma = diag * 0.06
  const twoSigmaSq = 2 * sigma * sigma
  const reach = sigma * 3
  let maxDensity = 0
  for (const node of nodes) {
    const tx0 = Math.max(0, Math.floor((node.x - reach) / sx))
    const tx1 = Math.min(resX - 1, Math.ceil((node.x + reach) / sx))
    const ty0 = Math.max(0, Math.floor((node.y - reach) / sy))
    const ty1 = Math.min(resY - 1, Math.ceil((node.y + reach) / sy))
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const dx = (tx + 0.5) * sx - node.x
        const dy = (ty + 0.5) * sy - node.y
        const o = (ty * resX + tx) * 4 + 3
        data[o] += node.score * Math.exp(-(dx * dx + dy * dy) / twoSigmaSq)
        if (data[o] > maxDensity) maxDensity = data[o]
      }
    }
  }
  if (maxDensity > 0) {
    for (let i = 3; i < data.length; i += 4) data[i] /= maxDensity
  }

  return { resX, resY, artW, artH, distNorm, data }
}

export type FieldSample = { dist: number; tanX: number; tanY: number; density: number }

export class FieldSampler {
  constructor(private bake: FieldBake) {}

  // bilinear sample in artboard coordinates
  sample(x: number, y: number): FieldSample {
    const b = this.bake
    const fx = Math.max(0, Math.min(b.resX - 1.001, (x / b.artW) * b.resX - 0.5))
    const fy = Math.max(0, Math.min(b.resY - 1.001, (y / b.artH) * b.resY - 0.5))
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const out: number[] = [0, 0, 0, 0]
    for (let c = 0; c < 4; c++) {
      const i00 = (y0 * b.resX + x0) * 4 + c
      const i10 = i00 + 4
      const i01 = i00 + b.resX * 4
      const i11 = i01 + 4
      out[c] =
        (b.data[i00] * (1 - tx) + b.data[i10] * tx) * (1 - ty) +
        (b.data[i01] * (1 - tx) + b.data[i11] * tx) * ty
    }
    return { dist: out[0], tanX: out[1], tanY: out[2], density: out[3] }
  }

  tangentAngle(x: number, y: number): number {
    const s = this.sample(x, y)
    return Math.atan2(s.tanY, s.tanX)
  }
}

let cacheKey = ''
let cacheVal: { bake: FieldBake; sampler: FieldSampler } | null = null

export function getFieldBake(
  samples: CurveSample[],
  nodes: RankedNode[],
  artW: number,
  artH: number,
  resX = 256,
): { bake: FieldBake; sampler: FieldSampler } {
  const key = `${samples.length}:${nodes.length}:${artW}:${artH}:${resX}:${samples[0]?.x}:${samples[1]?.y}:${nodes[0]?.x ?? 0}:${nodes[0]?.y ?? 0}`
  if (cacheVal && key === cacheKey) return cacheVal
  const bake = bakeFields(samples, nodes, artW, artH, resX)
  cacheVal = { bake, sampler: new FieldSampler(bake) }
  cacheKey = key
  return cacheVal
}
