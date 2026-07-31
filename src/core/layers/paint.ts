import type { LayerColor, ProjectState } from '@/core/state/types'
import { BRAND_PALETTE } from '@/core/color/palette'
import { INK, PAPER } from '@/core/state/defaults'
import { renderToCanvas } from '@/render/backgroundGL'

// Layer paint resolution. PAPER/INK are the poster constants; R1..R3 are
// the palette's leading roles (the same three the gradient field leads
// with); SAMPLED reads the field's own color underneath each clone —
// ink printed on the poster, resolved via fieldSampler below.

export function layerBaseColor(color: LayerColor, project: ProjectState): string {
  switch (color) {
    case 'ink':
      return INK
    case 'r0':
    case 'r1':
    case 'r2': {
      const idx = Number(color.slice(1))
      const role = project.background.roles[idx]
      return role ? BRAND_PALETTE.roles[role].base : PAPER
    }
    default:
      return PAPER
  }
}

export type FieldSampler = (x: number, y: number) => string

// One low-res render of the gradient field, read back as pixels. The
// SAME sampler resolution feeds live layers and the PNG export, so
// sampled clone colors are identical in both. Cached on the background
// state — the GL canvas is module-global so only one context ever
// exists for sampling.
const SAMPLER_W = 192

let glCanvas: HTMLCanvasElement | null = null
let cache: { key: string; sampler: FieldSampler } | null = null

const hex2 = (v: number) => v.toString(16).padStart(2, '0')

export function fieldSampler(project: ProjectState): FieldSampler | null {
  if (typeof document === 'undefined') return null
  if (project.background.mode !== 'field') return null
  const W = project.artboard.width
  const H = project.artboard.height
  const w = SAMPLER_W
  const h = Math.max(8, Math.round((H / W) * w))
  const key = JSON.stringify([project.background, W, H])
  if (cache?.key === key) return cache.sampler

  if (!glCanvas) glCanvas = document.createElement('canvas')
  const ok = renderToCanvas(glCanvas, project, w, h, { frozen: true, timeMs: 0 })
  if (!ok) return null
  const read = document.createElement('canvas')
  read.width = w
  read.height = h
  const ctx = read.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(glCanvas, 0, 0, w, h)
  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, w, h).data
  } catch {
    return null
  }

  const sampler: FieldSampler = (x, y) => {
    const px = Math.max(0, Math.min(w - 1, Math.round((x / W) * (w - 1))))
    const py = Math.max(0, Math.min(h - 1, Math.round((y / H) * (h - 1))))
    const i = (py * w + px) * 4
    return `#${hex2(data[i])}${hex2(data[i + 1])}${hex2(data[i + 2])}`
  }
  cache = { key, sampler }
  return sampler
}
