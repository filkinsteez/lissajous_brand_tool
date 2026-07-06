import type { LissajousState } from '@/core/state/types'
import { TAU, unitAcc, unitPos, unitVel, type CurveParams } from './equation'

export type CurveSample = {
  x: number
  y: number
  t: number
  angle: number // tangent angle in artboard space, radians
  curvature: number // signed, artboard space
}

// Samples the curve directly in artboard pixel coordinates so every
// downstream consumer (intersections, grid, fields, overlay) shares one
// coordinate space. Closed curve: samples[count] === samples[0] position.
export function sampleCurve(
  liss: LissajousState,
  artW: number,
  artH: number,
  count?: number,
): CurveSample[] {
  const n = Math.max(64, Math.floor(count ?? liss.sampleDensity))
  const p: CurveParams = { a: liss.frequencyX, b: liss.frequencyY, phase: liss.phase }

  const cx = artW / 2 + (liss.offsetX * artW) / 2
  const cy = artH / 2 + (liss.offsetY * artH) / 2
  const rx = (liss.amplitudeX * artW) / 2
  const ry = (liss.amplitudeY * artH) / 2
  const cos = Math.cos(liss.rotation)
  const sin = Math.sin(liss.rotation)

  const out: CurveSample[] = new Array(n + 1)
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * TAU
    const [u, v] = unitPos(p, t)
    const [du, dv] = unitVel(p, t)
    const [ddu, ddv] = unitAcc(p, t)

    // scale then rotate; rotation preserves curvature, scale does not,
    // so derivatives are transformed before computing kappa
    const sx = u * rx
    const sy = v * ry
    const dx = du * rx
    const dy = dv * ry
    const ddx = ddu * rx
    const ddy = ddv * ry

    const x = cx + sx * cos - sy * sin
    const y = cy + sx * sin + sy * cos
    const angle = Math.atan2(dx * sin + dy * cos, dx * cos - dy * sin)
    const speedSq = dx * dx + dy * dy
    const curvature = speedSq > 1e-9 ? (dx * ddy - dy * ddx) / Math.pow(speedSq, 1.5) : 0

    out[i] = { x, y, t, angle, curvature }
  }
  return out
}

// Tangent angle at an arbitrary curve parameter, from the nearest sample.
export function angleAt(samples: CurveSample[], t: number): number {
  const n = samples.length - 1
  const i = Math.round(((t % TAU) / TAU) * n)
  return samples[Math.max(0, Math.min(n, i))].angle
}
