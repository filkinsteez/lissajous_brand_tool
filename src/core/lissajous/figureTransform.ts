import type { ProjectState } from '@/core/state/types'
import type { Derived } from '@/core/pipeline'

// The layout figure under the background's zoom + pan — THE shared
// definition. The sheet effector, the organic engine and the PNG export
// all read this one function; a fork here would silently split live and
// export geometry.
export function transformedCurve(
  project: ProjectState,
  derived: Derived,
): { x: number; y: number }[] {
  const W = project.artboard.width
  const H = project.artboard.height
  const scale = project.background.fieldScale ?? 1
  const ox = (project.background.fieldOffsetX ?? 0) * W
  const oy = (project.background.fieldOffsetY ?? 0) * H
  const cx = W * 0.5
  const cy = H * 0.5
  const pts: { x: number; y: number }[] = []
  const stride = Math.max(1, Math.floor(derived.samples.length / 200))
  for (let i = 0; i < derived.samples.length; i += stride) {
    const s = derived.samples[i]
    pts.push({ x: cx + (s.x - cx) * scale + ox, y: cy + (s.y - cy) * scale + oy })
  }
  if (pts.length > 1) pts.push(pts[0])
  return pts
}
