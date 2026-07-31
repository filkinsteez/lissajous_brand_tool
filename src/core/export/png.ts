import type { ProjectState } from '@/core/state/types'
import { getDerived } from '@/core/pipeline'
import { columnSpanRect } from '@/core/grid/types'
import { loadImage } from '@/core/images'
import { renderToCanvas as renderBackgroundToCanvas } from '@/render/backgroundGL'
import { buildContourLevels } from '@/core/cloner/contours'
import { cloneTransforms } from '@/core/cloner/effectors'
import { buildLattice } from '@/core/pattern/lattice'
import { buildSheetClones, metaUnitOutline, unitPolygon, type SheetClone } from '@/core/sheet/sheet'
import { buildRepeats } from '@/core/repeater/repeater'
import { buildImageCells, paintImageCells, samplePixels } from '@/core/array/imageArray'
import { BRAND_PALETTE } from '@/core/color/palette'
import { INK, PAPER } from '@/core/state/defaults'
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

// The shape registers, drawn with the SAME engines and effector math as
// the live layers — Path2D accepts the engines' SVG path data directly,
// so the export is the same drawing at target resolution.
function drawClones(
  ctx: CanvasRenderingContext2D,
  project: ProjectState,
  derived: Derived,
  scale: number,
) {
  const cloner = project.cloner
  if (!cloner.enabled) return
  const W = project.artboard.width
  const H = project.artboard.height
  const levels = buildContourLevels(
    derived.samples,
    W,
    H,
    { count: Math.round(cloner.count), spacing: cloner.spacing, growth: cloner.growth },
    {
      scale: project.background.fieldScale ?? 1,
      offsetX: project.background.fieldOffsetX ?? 0,
      offsetY: project.background.fieldOffsetY ?? 0,
    },
  )
  const transforms = cloneTransforms(cloner, levels.length, Math.min(W, H), project.background.seed)
  const stroke = cloner.tone === 'ink' ? INK : PAPER
  for (let i = 0; i < levels.length; i++) {
    const t = transforms[i]
    ctx.save()
    ctx.scale(scale, scale)
    ctx.translate(t.dx, t.dy)
    ctx.translate(W / 2, H / 2)
    ctx.rotate((t.rotateDeg * Math.PI) / 180)
    ctx.scale(t.scale, t.scale)
    ctx.translate(-W / 2, -H / 2)
    ctx.globalAlpha = t.opacity
    ctx.strokeStyle = stroke
    ctx.lineWidth = t.weight
    ctx.lineCap = 'round'
    ctx.stroke(new Path2D(levels[i].d))
    ctx.restore()
  }
}

function drawPattern(
  ctx: CanvasRenderingContext2D,
  project: ProjectState,
  derived: Derived,
  scale: number,
) {
  const pattern = project.pattern
  if (!pattern.enabled) return
  const tiers = buildLattice(
    derived.samples,
    project.artboard.width,
    project.artboard.height,
    { cells: pattern.cells, size: pattern.size, range: pattern.range, mode: pattern.mode },
    {
      scale: project.background.fieldScale ?? 1,
      offsetX: project.background.fieldOffsetX ?? 0,
      offsetY: project.background.fieldOffsetY ?? 0,
    },
  )
  const tone = pattern.tone === 'ink' ? INK : PAPER
  ctx.save()
  ctx.scale(scale, scale)
  const fillTier = (d: string, alpha: number) => {
    if (!d) return
    ctx.globalAlpha = alpha
    ctx.fillStyle = tone
    ctx.fill(new Path2D(d))
  }
  fillTier(tiers.dots, 0.45)
  fillTier(tiers.circles, 0.8)
  if (tiers.rings) {
    ctx.globalAlpha = 0.95
    ctx.strokeStyle = tone
    ctx.lineWidth = 2
    ctx.stroke(new Path2D(tiers.rings))
  }
  fillTier(tiers.squares, 1)
  ctx.restore()
}

// one painter for every clone-based register (sheet + repeater), so the
// export is the live drawing at target resolution
function paintShapeClones(
  ctx: CanvasRenderingContext2D,
  clones: SheetClone[],
  project: ProjectState,
  scale: number,
  tone: string,
) {
  const strokeW = Math.max(
    1.5,
    Math.min(project.artboard.width, project.artboard.height) * 0.0035,
  )
  const metaPts = metaUnitOutline()
  const metaPath = new Path2D()
  metaPts.forEach((p, i) => (i === 0 ? metaPath.moveTo(p.x, p.y) : metaPath.lineTo(p.x, p.y)))
  metaPath.closePath()

  ctx.save()
  ctx.scale(scale, scale)
  ctx.fillStyle = tone
  ctx.strokeStyle = tone
  for (const c of clones) {
    ctx.save()
    ctx.globalAlpha = c.opacity
    ctx.translate(c.x, c.y)
    ctx.rotate(c.rotate)
    const paint = (path?: Path2D, lw = strokeW) => {
      if (c.stroked) {
        ctx.lineWidth = lw
        if (path) ctx.stroke(path)
        else ctx.stroke()
      } else if (path) ctx.fill(path, 'evenodd')
      else ctx.fill()
    }
    if (c.shape === 'circle') {
      ctx.beginPath()
      ctx.arc(0, 0, c.r, 0, Math.PI * 2)
      paint()
    } else if (c.shape === 'half') {
      ctx.beginPath()
      ctx.arc(0, 0, c.r, Math.PI, Math.PI * 2)
      ctx.closePath()
      paint()
    } else if (c.shape === 'quarter') {
      ctx.beginPath()
      ctx.moveTo(-c.r, -c.r)
      ctx.arc(-c.r, -c.r, c.r * 2, 0, Math.PI / 2)
      ctx.closePath()
      paint()
    } else if (c.shape === 'meta') {
      // the path is unit-scale, so the stroke must be compensated or the
      // ctx.scale multiplies it into a blob
      ctx.scale(c.r, c.r)
      paint(metaPath, strokeW / Math.max(c.r, 0.5))
    } else {
      const pts = unitPolygon(c.shape)
      ctx.beginPath()
      pts.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x * c.r, p.y * c.r) : ctx.lineTo(p.x * c.r, p.y * c.r),
      )
      ctx.closePath()
      paint()
    }
    ctx.restore()
  }
  ctx.restore()
}

function drawRepeater(
  ctx: CanvasRenderingContext2D,
  project: ProjectState,
  scale: number,
) {
  if (!project.repeater.enabled) return
  const clones = buildRepeats(project.repeater, project.artboard.width, project.artboard.height)
  paintShapeClones(ctx, clones, project, scale, PAPER)
}

async function drawImageArray(
  ctx: CanvasRenderingContext2D,
  project: ProjectState,
  scale: number,
) {
  const state = project.imageArray
  if (!state.enabled) return
  const image = project.images.find((im) => im.id === state.imageId) ?? project.images[0]
  if (!image) return
  const el = await loadImage(image.src)
  const W = project.artboard.width
  const H = project.artboard.height
  const cols = Math.max(4, Math.round(state.cells))
  const rows = Math.max(4, Math.round(H / (W / cols)))
  const pixels = samplePixels(el, cols, rows)
  if (!pixels) return
  const roles = project.background.roles.slice(0, 3)
  const palette = roles.map((r) => BRAND_PALETTE.roles[r].base)
  const cells = buildImageCells(state, W, H, pixels, palette)
  ctx.save()
  ctx.scale(scale, scale)
  paintImageCells(ctx, cells)
  ctx.restore()
}

function drawSheet(
  ctx: CanvasRenderingContext2D,
  project: ProjectState,
  derived: Derived,
  scale: number,
) {
  const sheet = project.sheet
  if (!sheet.enabled) return
  // the CURVE effector reads the layout figure under the background's
  // zoom + pan — identical to the live layer
  let curvePts: { x: number; y: number }[] | undefined
  if (sheet.curve > 0) {
    const W = project.artboard.width
    const H = project.artboard.height
    const fScale = project.background.fieldScale ?? 1
    const ox = (project.background.fieldOffsetX ?? 0) * W
    const oy = (project.background.fieldOffsetY ?? 0) * H
    const cx = W * 0.5
    const cy = H * 0.5
    curvePts = []
    const stride = Math.max(1, Math.floor(derived.samples.length / 200))
    for (let i = 0; i < derived.samples.length; i += stride) {
      const s = derived.samples[i]
      curvePts.push({ x: cx + (s.x - cx) * fScale + ox, y: cy + (s.y - cy) * fScale + oy })
    }
    if (curvePts.length > 1) curvePts.push(curvePts[0])
  }
  const clones = buildSheetClones(
    sheet,
    project.artboard.width,
    project.artboard.height,
    project.background.seed,
    curvePts,
  )
  paintShapeClones(ctx, clones, project, scale, sheet.tone === 'ink' ? INK : PAPER)
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

  if (project.background.mode === 'field') {
    const bgCanvas = document.createElement('canvas')
    const rendered = renderBackgroundToCanvas(bgCanvas, project, outW, outH, {
      frozen: true,
      timeMs: 0,
    })
    if (rendered) ctx.drawImage(bgCanvas, 0, 0, outW, outH)
  }

  const derived = getDerived(project)

  // layer order matches the artboard:
  // field -> clones -> pattern -> sheet -> array -> repeater -> images -> type
  drawClones(ctx, project, derived, scale)
  drawPattern(ctx, project, derived, scale)
  drawSheet(ctx, project, derived, scale)
  await drawImageArray(ctx, project, scale)
  drawRepeater(ctx, project, scale)

  const bg = project.images.find((im) => im.id === project.bgImageId)
  if (bg) drawCover(ctx, await loadImage(bg.src), 0, 0, outW, outH)
  const grid = derived.grid
  const rows = grid.rowBoundaries
  const nRows = rows.length - 1
  for (const im of project.images) {
    if (im.id === project.bgImageId) continue
    if (im.id.startsWith('arr-')) continue
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
  // timestamped so successive exports never overwrite each other
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  a.download = `lissajous-${stamp}-${scale}x.png`
  a.click()
  URL.revokeObjectURL(url)
}
