import type { ProjectState, ShapeLayer } from '@/core/state/types'
import { getDerived } from '@/core/pipeline'
import { columnSpanRect } from '@/core/grid/types'
import { loadImage } from '@/core/images'
import { renderToCanvas as renderBackgroundToCanvas } from '@/render/backgroundGL'
import { buildContourLevels, dealProtoIndex, stampsAlongContours } from '@/core/cloner/contours'
import { cloneTransforms } from '@/core/cloner/effectors'
import { buildLattice } from '@/core/pattern/lattice'
import { buildSheetClones, metaUnitOutline, unitPolygon, type SheetClone } from '@/core/sheet/sheet'
import { buildCurveClones, buildRepeats } from '@/core/repeater/repeater'
import { buildImageCells, paintImageCells, samplePixels } from '@/core/array/imageArray'
import { buildOrganic } from '@/core/organic/engine'
import { paintOrganic } from '@/core/organic/paint'
import { INK, PAPER } from '@/core/state/defaults'
import { buildTiles } from '@/core/tiles/tiles'
import { BRAND_PALETTE } from '@/core/color/palette'
import { layerBaseColor, fieldSampler, type FieldSampler } from '@/core/layers/paint'
import { textureTile, paintTextureTile, type TextureKind } from '@/core/texture/textures'
import { transformedCurve } from '@/core/lissajous/figureTransform'
import { shapePathD } from '@/core/canvas/shapeItems'
import {
  consumedShapeIds,
  paintTextProto,
  PROTO_SIZE,
  resolveProjectProtos,
  type ShapeProto,
} from '@/core/canvas/shapeProtos'
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

// The shape layers, drawn with the SAME engines and effector math as
// the live components — Path2D accepts the engines' SVG path data
// directly, so the export is the same drawing at target resolution.

type LayerPaint = {
  fill: string | CanvasPattern // texture pattern or flat color
  stroke: string
  colorAt: FieldSampler | null // SAMPLED: per-clone color override
}

// The subtexture as a canvas pattern: the tile is rasterized at export
// resolution, then transformed back to artboard units so it lines up
// with the painters' scaled coordinate space.
function resolveLayerPaint(
  ctx: CanvasRenderingContext2D,
  layer: ShapeLayer,
  project: ProjectState,
  scale: number,
): LayerPaint {
  const base = layerBaseColor(layer.color, project)
  const sampled = layer.color === 'sampled' && layer.texture === 'solid'
  let fill: string | CanvasPattern = base
  if (layer.texture !== 'solid') {
    const tileCanvas = paintTextureTile(
      textureTile(layer.texture as TextureKind, layer.texDensity),
      base,
      scale,
    )
    const pat = ctx.createPattern(tileCanvas, 'repeat')
    if (pat) {
      pat.setTransform(new DOMMatrix([1 / scale, 0, 0, 1 / scale, 0, 0]))
      fill = pat
    }
  }
  return {
    fill,
    stroke: base,
    colorAt: sampled ? fieldSampler(project) : null,
  }
}

function drawClones(
  ctx: CanvasRenderingContext2D,
  layer: Extract<ShapeLayer, { type: 'clones' }>,
  project: ProjectState,
  derived: Derived,
  scale: number,
) {
  const cloner = layer.params
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
  const stroke = layerBaseColor(layer.color, project)
  const protos = resolveProjectProtos(project, cloner.sourceShapeIds)
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
    if (protos.length) {
      // bound drawn shapes: stamp along the ring instead of stroking it,
      // inside the same per-level effector transform as the strokes
      const s = Math.min(Math.max(t.weight * 5, 6), Math.min(W, H) * 0.05)
      const k = s / PROTO_SIZE
      const stamps = stampsAlongContours([levels[i]], s * 2.6)
      for (let j = 0; j < stamps.length; j++) {
        const st = stamps[j]
        const proto = protos[dealProtoIndex(i, j, protos.length)]
        ctx.save()
        ctx.translate(st.x, st.y)
        ctx.rotate(st.angle)
        ctx.scale(k, k)
        ctx.globalAlpha = t.opacity * proto.opacity
        ctx.fillStyle = proto.fill
        if (proto.kind === 'text') paintTextProto(ctx, proto)
        else ctx.fill(protoPath(proto.d), 'evenodd')
        ctx.restore()
      }
    } else {
      ctx.strokeStyle = stroke
      ctx.lineWidth = t.weight
      ctx.lineCap = 'round'
      ctx.stroke(new Path2D(levels[i].d))
    }
    ctx.restore()
  }
}

function drawPattern(
  ctx: CanvasRenderingContext2D,
  layer: Extract<ShapeLayer, { type: 'pattern' }>,
  project: ProjectState,
  derived: Derived,
  scale: number,
) {
  const pattern = layer.params
  const protos = resolveProjectProtos(project, pattern.sourceShapeIds)
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
    protos.length,
  )
  const tone = layerBaseColor(layer.color, project)
  ctx.save()
  ctx.scale(scale, scale)
  if (tiers.stamps.length) {
    for (const s of tiers.stamps) {
      const proto = protos[s.protoIndex]
      const k = (s.r * 2) / PROTO_SIZE
      ctx.save()
      ctx.translate(s.x, s.y)
      ctx.scale(k, k)
      ctx.globalAlpha = proto.opacity
      ctx.fillStyle = proto.fill
      if (proto.kind === 'text') paintTextProto(ctx, proto)
      else ctx.fill(protoPath(proto.d), 'evenodd')
      ctx.restore()
    }
    ctx.restore()
    return
  }
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

// drawn-proto Path2D cache shared by every effector's export painter,
// keyed by the full d string — source shapes change geometry when
// resized, so an id alone can never key it. Cleared past 128 entries.
const protoPathCache = new Map<string, Path2D>()
function protoPath(d: string): Path2D {
  let p = protoPathCache.get(d)
  if (!p) {
    if (protoPathCache.size >= 128) protoPathCache.clear()
    p = new Path2D(d)
    protoPathCache.set(d, p)
  }
  return p
}

// one painter for every clone-based register (sheet + repeater), so the
// export is the live drawing at target resolution
function paintShapeClones(
  ctx: CanvasRenderingContext2D,
  clones: SheetClone[],
  project: ProjectState,
  scale: number,
  paint: LayerPaint,
  protos?: ShapeProto[],
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
  for (const c of clones) {
    ctx.save()
    ctx.globalAlpha = c.opacity
    const sampledHex = paint.colorAt ? paint.colorAt(c.x, c.y) : null
    ctx.fillStyle = sampledHex ?? paint.fill
    ctx.strokeStyle = sampledHex ?? paint.stroke
    ctx.translate(c.x, c.y)
    ctx.rotate(c.rotate)
    // drawn protos stamp with their OWN fill and skip the layer paint —
    // proto box is PROTO_SIZE, so scale = diameter/box
    if (c.drawnIndex !== undefined && protos && protos.length > 0) {
      const p = protos[Math.min(c.drawnIndex, protos.length - 1)]
      const k = (c.r * 2) / PROTO_SIZE
      ctx.scale(k, k)
      ctx.globalAlpha = c.opacity * p.opacity
      ctx.fillStyle = p.fill
      if (p.kind === 'text') paintTextProto(ctx, p)
      else ctx.fill(protoPath(p.d), 'evenodd')
      ctx.restore()
      continue
    }
    const draw = (path?: Path2D, lw = strokeW) => {
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
      draw()
    } else if (c.shape === 'half') {
      ctx.beginPath()
      ctx.arc(0, 0, c.r, Math.PI, Math.PI * 2)
      ctx.closePath()
      draw()
    } else if (c.shape === 'quarter') {
      ctx.beginPath()
      ctx.moveTo(-c.r, -c.r)
      ctx.arc(-c.r, -c.r, c.r * 2, 0, Math.PI / 2)
      ctx.closePath()
      draw()
    } else if (c.shape === 'meta') {
      // the path is unit-scale, so the stroke must be compensated or the
      // ctx.scale multiplies it into a blob
      ctx.scale(c.r, c.r)
      draw(metaPath, strokeW / Math.max(c.r, 0.5))
    } else {
      const pts = unitPolygon(c.shape)
      ctx.beginPath()
      pts.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x * c.r, p.y * c.r) : ctx.lineTo(p.x * c.r, p.y * c.r),
      )
      ctx.closePath()
      draw()
    }
    ctx.restore()
  }
  ctx.restore()
}

function drawRepeater(
  ctx: CanvasRenderingContext2D,
  layer: Extract<ShapeLayer, { type: 'cloner' }>,
  project: ProjectState,
  derived: Derived,
  scale: number,
) {
  const p = layer.params
  // the repeat engine's view of the merged params (see RepeaterLayer)
  const rep = { ...p, mode: p.mode === 'linear' ? ('linear' as const) : ('radial' as const), size: p.stampSize }
  const protos = resolveProjectProtos(project, p.sourceShapeIds)
  const clones =
    p.mode === 'curve'
      ? buildCurveClones(
          rep,
          project.artboard.width,
          project.artboard.height,
          transformedCurve(project, derived),
          protos.length,
        )
      : buildRepeats(rep, project.artboard.width, project.artboard.height, protos.length)
  paintShapeClones(ctx, clones, project, scale, resolveLayerPaint(ctx, layer, project, scale), protos)
}

async function drawImageArray(
  ctx: CanvasRenderingContext2D,
  layer: Extract<ShapeLayer, { type: 'array' }>,
  project: ProjectState,
  scale: number,
) {
  const state = layer.params
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
  const protos = resolveProjectProtos(project, state.sourceShapeIds)
  const cells = buildImageCells(state, W, H, pixels, palette, protos.map((p) => p.fill))
  ctx.save()
  ctx.scale(scale, scale)
  paintImageCells(ctx, cells, protos)
  ctx.restore()
}

function drawSheet(
  ctx: CanvasRenderingContext2D,
  layer: Extract<ShapeLayer, { type: 'cloner' }>,
  project: ProjectState,
  derived: Derived,
  scale: number,
) {
  const sheet = layer.params
  const protos = resolveProjectProtos(project, sheet.sourceShapeIds)
  const curvePts = sheet.curve > 0 ? transformedCurve(project, derived) : undefined
  const clones = buildSheetClones(
    sheet,
    project.artboard.width,
    project.artboard.height,
    project.background.seed,
    curvePts,
    protos.length,
  )
  paintShapeClones(ctx, clones, project, scale, resolveLayerPaint(ctx, layer, project, scale), protos)
}

function drawTiles(
  ctx: CanvasRenderingContext2D,
  layer: Extract<ShapeLayer, { type: 'tiles' }>,
  project: ProjectState,
  derived: Derived,
  scale: number,
) {
  const t = layer.params
  const protos = resolveProjectProtos(project, t.sourceShapeIds)
  const built = buildTiles(
    t,
    project.artboard.width,
    project.artboard.height,
    t.curve > 0 ? transformedCurve(project, derived) : null,
    protos.length,
  )
  const colorA = layerBaseColor(layer.color, project)
  const colorB = layerBaseColor(t.colorB ?? 'ink', project)
  ctx.save()
  ctx.scale(scale, scale)
  if (built.fillB) {
    ctx.fillStyle = colorB
    ctx.fill(new Path2D(built.fillB))
  }
  if (built.fillA) {
    ctx.fillStyle = colorA
    ctx.fill(new Path2D(built.fillA))
  }
  for (const s of built.stamps) {
    const p = protos[s.proto]
    if (!p) continue
    const k = Math.min(s.w, s.h) / PROTO_SIZE
    ctx.save()
    ctx.translate(s.x + s.w / 2, s.y + s.h / 2)
    ctx.scale(k, k)
    ctx.globalAlpha = p.opacity
    ctx.fillStyle = s.color === 1 ? colorB : p.fill
    if (p.kind === 'text') paintTextProto(ctx, p)
    else ctx.fill(protoPath(p.d), 'evenodd')
    ctx.restore()
  }
  ctx.globalAlpha = 1
  if (built.stroke) {
    ctx.strokeStyle = colorA
    ctx.lineWidth = built.strokeWidth
    ctx.stroke(new Path2D(built.stroke))
  }
  ctx.restore()
}

function drawOrganic(
  ctx: CanvasRenderingContext2D,
  layer: Extract<ShapeLayer, { type: 'organic' }>,
  project: ProjectState,
  derived: Derived,
  scale: number,
) {
  const p = layer.params
  const needsCurve =
    p.curvePull > 0 || p.distribution === 'curve' || p.rotation === 'tangent' || p.rotation === 'flow'
  const curve = needsCurve ? transformedCurve(project, derived) : null
  const roles = project.background.roles.slice(0, 4)
  const palette = [PAPER, ...roles.map((r) => BRAND_PALETTE.roles[r].base)]
  const drawnProtos = resolveProjectProtos(project, p.sourceShapeIds)
  const build = buildOrganic(
    p,
    project.artboard.width,
    project.artboard.height,
    curve,
    palette.length,
    drawnProtos.map((d) => d.id),
  )
  paintOrganic(ctx, build, project.artboard.width, project.artboard.height, {
    scale,
    palette,
    full: true,
    drawnProtos: drawnProtos.length ? drawnProtos : undefined,
  })
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

  // the shape layer stack, in project order (index 0 = bottom). Each
  // layer flattens onto a scratch canvas, then composites with its
  // opacity + blend — the same semantics as CSS mix-blend-mode on the
  // live elements (opacity applies to the flattened layer, not per
  // shape, so self-overlaps stay clean).
  const visibleLayers = project.layers.filter((l) => l.visible)
  if (visibleLayers.length) {
    const scratch = document.createElement('canvas')
    scratch.width = outW
    scratch.height = outH
    const sctx = scratch.getContext('2d')
    if (!sctx) throw new Error('2d context unavailable')
    for (const layer of visibleLayers) {
      sctx.clearRect(0, 0, outW, outH)
      if (layer.type === 'clones') drawClones(sctx, layer, project, derived, scale)
      else if (layer.type === 'pattern') drawPattern(sctx, layer, project, derived, scale)
      else if (layer.type === 'array') await drawImageArray(sctx, layer, project, scale)
      else if (layer.type === 'organic') drawOrganic(sctx, layer, project, derived, scale)
      else if (layer.type === 'tiles') drawTiles(sctx, layer, project, derived, scale)
      else if (layer.params.mode === 'grid') drawSheet(sctx, layer, project, derived, scale)
      else drawRepeater(sctx, layer, project, derived, scale)
      ctx.save()
      ctx.globalAlpha = layer.opacity
      ctx.globalCompositeOperation = layer.blend === 'normal' ? 'source-over' : layer.blend
      ctx.drawImage(scratch, 0, 0)
      ctx.restore()
    }
  }

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

  // drawn primitives sit above the images, below the type — the same
  // order the artboard renders them; the SAME path generator feeds both.
  // Consumed masters are skipped: their effectors already render them.
  const consumed = consumedShapeIds(project.layers)
  ctx.save()
  ctx.scale(scale, scale)
  for (const s of project.shapes) {
    if (consumed.has(s.id)) continue
    ctx.globalAlpha = s.opacity
    ctx.fillStyle = s.fill
    const path = new Path2D(shapePathD(s))
    ctx.fill(path, 'evenodd')
    if (s.stroke && s.strokeWidth) {
      ctx.strokeStyle = s.stroke
      ctx.lineWidth = s.strokeWidth
      ctx.stroke(path)
    }
  }
  ctx.restore()

  // consumed text masters render through their effectors, not as type
  await renderTypeToCanvas(
    ctx,
    { ...project, typeBlocks: project.typeBlocks.filter((b) => !consumed.has(b.id)) },
    derived.grid,
    scale,
  )
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
