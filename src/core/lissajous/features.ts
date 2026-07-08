import type { CurveSample } from './sampler'

export type CurveFeature = { x: number; y: number; t: number }

export type CurveFeatures = {
  xExtrema: CurveFeature[]
  yExtrema: CurveFeature[]
}

const EPS = 1e-6

function dedupeByPosition(points: CurveFeature[], eps = 0.75): CurveFeature[] {
  const out: CurveFeature[] = []
  const epsSq = eps * eps
  for (const p of points) {
    let dup = false
    for (const q of out) {
      const dx = p.x - q.x
      const dy = p.y - q.y
      if (dx * dx + dy * dy <= epsSq) {
        dup = true
        break
      }
    }
    if (!dup) out.push(p)
  }
  return out
}

function classifyExtrema(prevDelta: number, nextDelta: number): 'min' | 'max' | null {
  if (prevDelta < -EPS && nextDelta > EPS) return 'min'
  if (prevDelta > EPS && nextDelta < -EPS) return 'max'
  return null
}

// Tangent extrema in screen space from sampled curve points:
// - xExtrema are vertical tangents (local min/max x)
// - yExtrema are horizontal tangents (local min/max y)
export function curveFeatures(samples: CurveSample[]): CurveFeatures {
  const n = samples.length - 1 // closed curve has duplicate endpoint
  if (n < 3) return { xExtrema: [], yExtrema: [] }

  const xExtrema: CurveFeature[] = []
  const yExtrema: CurveFeature[] = []

  for (let i = 0; i < n; i++) {
    const prev = samples[(i - 1 + n) % n]
    const cur = samples[i]
    const next = samples[(i + 1) % n]

    const xType = classifyExtrema(cur.x - prev.x, next.x - cur.x)
    if (xType) xExtrema.push({ x: cur.x, y: cur.y, t: cur.t })

    const yType = classifyExtrema(cur.y - prev.y, next.y - cur.y)
    if (yType) yExtrema.push({ x: cur.x, y: cur.y, t: cur.t })
  }

  return {
    xExtrema: dedupeByPosition(xExtrema),
    yExtrema: dedupeByPosition(yExtrema),
  }
}
