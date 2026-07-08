import type { ProjectState } from '@/core/state/types'
import { getDerived } from '@/core/pipeline'
import { columnSpanRect } from '@/core/grid/types'
import { loadImage } from '@/core/images'
import { renderTypeToCanvas } from './svgText'
import type { Derived } from '@/core/pipeline'

// object-fit: cover, in canvas terms — clipped and centered
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
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

// Compositor: background → images (bg + grid blocks) → SVG type, all
// re-rendered at target resolution.
function drawConstructionOverlay(
  ctx: CanvasRenderingContext2D,
  derived: Derived,
  scale: number,
) {
  const box = derived.grid.contentBox
  const guides = [...derived.grid.columnBoundaries, ...derived.grid.rowBoundaries]
  const stroke = (r: number, g: number, b: number, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`

  ctx.save()
  ctx.scale(scale, scale)

  // content box
  ctx.strokeStyle = stroke(20, 20, 18, 0.12)
  ctx.lineWidth = 1.5
  ctx.strokeRect(box.x, box.y, box.w, box.h)

  // guides
  ctx.strokeStyle = stroke(20, 20, 18, 0.12)
  ctx.lineWidth = 1.5
  for (const g of guides) {
    ctx.beginPath()
    if (g.axis === 'x') {
      ctx.moveTo(g.pos, box.y)
      ctx.lineTo(g.pos, box.y + box.h)
    } else {
      ctx.moveTo(box.x, g.pos)
      ctx.lineTo(box.x + box.w, g.pos)
    }
    ctx.stroke()
  }

  // curve path
  const pts = derived.samples
  const step = Math.max(1, Math.floor((pts.length - 1) / 900))
  ctx.strokeStyle = stroke(20, 20, 18, 0.16)
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = step; i < pts.length; i += step) {
    ctx.lineTo(pts[i].x, pts[i].y)
  }
  ctx.closePath()
  ctx.stroke()

  // tangent-extrema feature markers
  ctx.strokeStyle = stroke(20, 20, 18, 0.4)
  ctx.fillStyle = stroke(20, 20, 18, 0.35)
  ctx.lineWidth = 1
  for (const p of derived.features.xExtrema) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2)
    ctx.stroke()
  }
  for (const p of derived.features.yExtrema) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2)
    ctx.fill()
  }

  // intersection crosses
  for (const n of derived.ranked) {
    const r = 6 + n.score * 10
    ctx.strokeStyle = stroke(20, 20, 18, 0.5)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(n.x - r, n.y)
    ctx.lineTo(n.x + r, n.y)
    ctx.moveTo(n.x, n.y - r)
    ctx.lineTo(n.x, n.y + r)
    ctx.stroke()
  }

  ctx.restore()
}

export async function exportPNG(
  project: ProjectState,
  scale: 1 | 2 | 4,
  opts?: { includeConstruction?: boolean },
): Promise<Blob> {
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
  if (opts?.includeConstruction) {
    drawConstructionOverlay(ctx, derived, scale)
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png')
  })
}

export async function downloadPNG(
  project: ProjectState,
  scale: 1 | 2 | 4,
  opts?: { includeConstruction?: boolean },
): Promise<void> {
  const blob = await exportPNG(project, scale, opts)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lissajous-${project.lissajous.frequencyX}-${project.lissajous.frequencyY}-${project.seed}-${scale}x.png`
  a.click()
  URL.revokeObjectURL(url)
}
