import type { ProjectState } from '@/core/state/types'
import { getDerived } from '@/core/pipeline'
import { columnSpanRect } from '@/core/grid/types'
import { loadImage } from '@/core/images'
import { renderTypeToCanvas } from './svgText'

// object-fit: cover, in canvas terms — clipped, centered, grayscale like
// the live layer
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * s
  const dh = img.naturalHeight * s
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.filter = 'grayscale(1)'
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

// Compositor: background → images (bg + grid blocks) → SVG type, all
// re-rendered at target resolution.
export async function exportPNG(project: ProjectState, scale: 1 | 2 | 4): Promise<Blob> {
  const { width: W, height: H } = project.artboard
  const outW = W * scale
  const outH = H * scale

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')

  ctx.fillStyle = project.artboard.background
  ctx.fillRect(0, 0, outW, outH)

  const derived = getDerived(project)

  const bg = project.images.find((im) => im.id === project.bgImageId)
  if (bg) drawCover(ctx, await loadImage(bg.src), 0, 0, outW, outH)
  const grid = derived.grid
  const rows = grid.rowBoundaries
  const nRows = rows.length - 1
  for (const im of project.images) {
    if (im.id === project.bgImageId) continue
    const { x, w } = columnSpanRect(grid, im.anchor.col, im.anchor.colSpan)
    const r0 = Math.max(0, Math.min(nRows - 1, im.anchor.row))
    const r1 = Math.max(r0 + 1, Math.min(nRows, r0 + im.anchor.rowSpan))
    const y = rows[r0].pos
    const h = rows[r1].pos - y
    drawCover(ctx, await loadImage(im.src), x * scale, y * scale, w * scale, h * scale)
  }

  await renderTypeToCanvas(ctx, project, derived.grid, scale)

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png')
  })
}

export async function downloadPNG(project: ProjectState, scale: 1 | 2 | 4): Promise<void> {
  const blob = await exportPNG(project, scale)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lissajous-${project.lissajous.frequencyX}-${project.lissajous.frequencyY}-${project.seed}-${scale}x.png`
  a.click()
  URL.revokeObjectURL(url)
}
