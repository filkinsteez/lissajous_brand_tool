import type { CurveNode } from './intersections'
import { angleAt, type CurveSample } from './sampler'

export type RankedNode = CurveNode & {
  score: number
  centrality: number
  density: number
  angleContrast: number
  stability: number
}

export type RankingContext = {
  samples: CurveSample[]
  artW: number
  artH: number
  margin: number // px band treated as layout-hostile
  // intersections recomputed at phase ± ~0.5°; a node that survives both
  // perturbations with little displacement is stable and layout-worthy
  perturbedA: CurveNode[]
  perturbedB: CurveNode[]
}

function survival(node: CurveNode, others: CurveNode[], eps: number): number {
  let best = Infinity
  for (const o of others) {
    const dx = o.x - node.x
    const dy = o.y - node.y
    const d = dx * dx + dy * dy
    if (d < best) best = d
  }
  if (!isFinite(best)) return 0
  return Math.max(0, 1 - Math.sqrt(best) / eps)
}

// PRD §8: centrality, local density, angle contrast, stability under small
// phase changes, distance to margins.
export function rankNodes(nodes: CurveNode[], ctx: RankingContext): RankedNode[] {
  const { artW, artH } = ctx
  const cx = artW / 2
  const cy = artH / 2
  const halfDiag = Math.hypot(cx, cy)
  const densityR = 0.15 * Math.hypot(artW, artH)
  const densityRSq = densityR * densityR
  const stabEps = 0.05 * Math.min(artW, artH)

  let maxDensity = 1
  const rawDensity = nodes.map((n) => {
    let c = 0
    for (const o of nodes) {
      if (o.id === n.id) continue
      const dx = o.x - n.x
      const dy = o.y - n.y
      if (dx * dx + dy * dy < densityRSq) c++
    }
    if (c > maxDensity) maxDensity = c
    return c
  })

  const ranked: RankedNode[] = nodes.map((n, idx) => {
    const centrality = 1 - Math.hypot(n.x - cx, n.y - cy) / halfDiag
    const density = rawDensity[idx] / maxDensity
    const angleContrast = Math.abs(
      Math.sin(angleAt(ctx.samples, n.ti) - angleAt(ctx.samples, n.tj)),
    )
    const stability = Math.min(
      survival(n, ctx.perturbedA, stabEps),
      survival(n, ctx.perturbedB, stabEps),
    )
    const inMarginX = Math.min(n.x, artW - n.x) < ctx.margin
    const inMarginY = Math.min(n.y, artH - n.y) < ctx.margin
    const marginPenalty = inMarginX || inMarginY ? 0 : 1

    const score =
      0.25 * centrality +
      0.2 * density +
      0.2 * angleContrast +
      0.25 * stability +
      0.1 * marginPenalty

    return { ...n, score, centrality, density, angleContrast, stability }
  })

  return ranked.sort((a, b) => b.score - a.score)
}

export function topNodes(ranked: RankedNode[], max = 24, minScore = 0.25): RankedNode[] {
  const kept = ranked.filter((n) => n.score >= minScore)
  return (kept.length >= 4 ? kept : ranked.slice(0, 4)).slice(0, max)
}
