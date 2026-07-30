import type { CurveSample } from '@/core/lissajous/sampler'
import { buildArcLUT } from '@/core/motion/arcLength'
import { packHalf } from '@/core/math/halfFloat'

export type CurveKnot = {
  x: number
  y: number
  arcNorm: number
  t: number
}

export type CurveKnotTexture = {
  width: number
  height: 1
  knots: CurveKnot[]
  floatData: Float32Array
  halfData: Uint16Array
}

// Arc-uniform knots are reused by preview and export renderers to keep
// distance fields stable across frame rates and target resolutions.
export function resampleEqualArcKnots(samples: CurveSample[], knotCount = 256): CurveKnot[] {
  const count = Math.max(2, Math.floor(knotCount))
  const arc = buildArcLUT(samples)
  const out: CurveKnot[] = new Array(count)
  for (let i = 0; i < count; i++) {
    const arcNorm = i / (count - 1)
    const p = arc.posAt(arcNorm * arc.total)
    out[i] = { x: p.x, y: p.y, arcNorm, t: p.t }
  }
  return out
}

export function buildCurveKnotTextureData(samples: CurveSample[], knotCount = 256): CurveKnotTexture {
  const knots = resampleEqualArcKnots(samples, knotCount)
  const width = knots.length
  const floatData = new Float32Array(width * 4)
  for (let i = 0; i < width; i++) {
    const knot = knots[i]
    const o = i * 4
    floatData[o] = knot.x
    floatData[o + 1] = knot.y
    floatData[o + 2] = knot.arcNorm
    floatData[o + 3] = 1
  }
  const halfData = packHalf(floatData)
  return { width, height: 1, knots, floatData, halfData }
}
