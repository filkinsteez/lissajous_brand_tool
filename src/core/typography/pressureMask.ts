import type { ProjectState } from '@/core/state/types'
import type { EditorialGrid } from '@/core/grid/types'
import { layoutTypeBlock } from './textBlocks'
import { boxBlur } from '@/core/math/blur'

export const MASK_RES = 256

export type PressureMask = {
  width: number
  height: number
  data: Float32Array // 0..1, 1 = maximum type pressure
}

// Type exerts "pressure" on the material and glyph layers: grain clears and
// glyphs step aside around it. Footprint rects (weighted by
// materialInfluence) are splatted at low res and box-blurred — deterministic,
// no canvas filter, CPU copy shared by glyph layout and the GPU texture.
export function buildPressureMask(
  project: ProjectState,
  grid: EditorialGrid,
): PressureMask {
  const { width: W, height: H } = project.artboard
  const w = MASK_RES
  const h = Math.round((MASK_RES * H) / W)
  const data = new Float32Array(w * h)

  for (const block of project.typeBlocks) {
    if (!block.text || block.materialInfluence <= 0) continue
    const box = layoutTypeBlock(block, grid)
    const x0 = Math.max(0, Math.floor((box.x / W) * w))
    const x1 = Math.min(w - 1, Math.ceil(((box.x + box.w) / W) * w))
    const y0 = Math.max(0, Math.floor((box.y / H) * h))
    const y1 = Math.min(h - 1, Math.ceil(((box.y + box.estH) / H) * h))
    const v = Math.min(1, block.materialInfluence)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x
        if (data[i] < v) data[i] = v
      }
    }
  }

  const blurred = boxBlur(data, w, h, Math.max(3, Math.round(w * 0.035)))
  return { width: w, height: h, data: blurred }
}

let cacheKey = ''
let cacheVal: PressureMask | null = null

export function getPressureMask(project: ProjectState, grid: EditorialGrid): PressureMask {
  const key = JSON.stringify([
    project.typeBlocks, project.artboard.width, project.artboard.height,
    grid.columnBoundaries.map((g) => g.pos), grid.rowBoundaries.map((g) => g.pos), grid.gutter,
  ])
  if (cacheVal && key === cacheKey) return cacheVal
  cacheVal = buildPressureMask(project, grid)
  cacheKey = key
  return cacheVal
}

// Bilinear CPU sample in artboard coordinates, 0..1.
export function samplePressure(mask: PressureMask, x: number, y: number, artW: number, artH: number): number {
  const fx = Math.max(0, Math.min(mask.width - 1.001, (x / artW) * mask.width))
  const fy = Math.max(0, Math.min(mask.height - 1.001, (y / artH) * mask.height))
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const tx = fx - x0
  const ty = fy - y0
  const i = y0 * mask.width + x0
  const a = mask.data[i]
  const b = mask.data[i + 1]
  const c = mask.data[i + mask.width]
  const d = mask.data[i + mask.width + 1]
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty
}
