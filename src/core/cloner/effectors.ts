import type { ClonerState } from '@/core/state/types'

// Per-clone modulation, shared by the live SVG layer and the PNG export
// so the two renders are the same drawing.
//   STEP   — progressive fade + thinning by clone index
//   RANDOM — seeded drift + tilt per clone (deterministic)
//   DEPTH  — 2.5D stacked planes: growing scale + diagonal drift
export type CloneTransform = {
  dx: number // artboard px
  dy: number
  rotateDeg: number // about the artboard center
  scale: number // about the artboard center
  opacity: number
  weight: number // stroke width, artboard px
}

function jitter(i: number, k: number, seed: number): number {
  const v = Math.sin(i * 127.1 + k * 311.7 + seed * 0.137) * 43758.5453
  return (v - Math.floor(v)) * 2 - 1
}

export function cloneTransforms(
  cloner: ClonerState,
  n: number,
  minDim: number,
  seed: number,
): CloneTransform[] {
  const out: CloneTransform[] = []
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0
    const opacity = Math.max(0.08, 0.9 * (1 - cloner.step * 0.85 * u))
    const weight = Math.max(0.4, cloner.weight * (1 - cloner.step * 0.6 * u))
    const jx = jitter(i, 1, seed) * cloner.random * minDim * 0.03
    const jy = jitter(i, 2, seed) * cloner.random * minDim * 0.03
    const rotateDeg = jitter(i, 3, seed) * cloner.random * 7
    const scale = 1 + cloner.depth * 0.055 * i
    const dx = jx + cloner.depth * i * minDim * 0.012
    const dy = jy + cloner.depth * i * minDim * 0.02
    out.push({ dx, dy, rotateDeg, scale, opacity, weight })
  }
  return out
}
