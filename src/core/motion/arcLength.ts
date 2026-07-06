import type { CurveSample } from '@/core/lissajous/sampler'

export type ArcLUT = {
  total: number
  posAt: (s: number) => { x: number; y: number; angle: number }
}

// Cumulative arc-length parameterization of a sampled curve, so traversal
// speed is uniform in space (the raw parameter t is not).
export function buildArcLUT(samples: CurveSample[]): ArcLUT {
  const n = samples.length
  const cum = new Float64Array(n)
  for (let i = 1; i < n; i++) {
    const dx = samples[i].x - samples[i - 1].x
    const dy = samples[i].y - samples[i - 1].y
    cum[i] = cum[i - 1] + Math.hypot(dx, dy)
  }
  const total = cum[n - 1] || 1

  const posAt = (s: number) => {
    let target = s % total
    if (target < 0) target += total
    // binary search for the segment containing target
    let lo = 0
    let hi = n - 1
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1
      if (cum[mid] <= target) lo = mid
      else hi = mid
    }
    const span = cum[hi] - cum[lo] || 1
    const t = (target - cum[lo]) / span
    const a = samples[lo]
    const b = samples[hi]
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      angle: a.angle,
    }
  }

  return { total, posAt }
}
