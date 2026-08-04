import type { ShapeProto } from '@/core/canvas/shapeProtos'
import { INK, PAPER } from '@/core/state/defaults'
import type { LabState, LabView } from './types'
import type { LabSource } from './sourceCache'
import { fitRect, coherenceField } from './field'
import { buildMarkStamps, tintFor } from './markTranslation'
import { sampleRGB } from './analysis'
import { stampProto } from './stamp'

// One painter for preview AND export — the parity the editor has to
// maintain across two painters per layer, the lab gets by construction.
// The ctx arrives pre-scaled (ctx.scale(renderScale)) and everything
// here draws in output units.

let scratch: HTMLCanvasElement | null = null

function mapCanvas(w: number, h: number): CanvasRenderingContext2D {
  if (!scratch) scratch = document.createElement('canvas')
  scratch.width = w
  scratch.height = h
  return scratch.getContext('2d')!
}

export function renderLab(
  ctx: CanvasRenderingContext2D,
  lab: LabState,
  source: LabSource | null,
  protos: ShapeProto[],
  view: LabView,
): void {
  const { width: outW, height: outH, transparent } = lab.output
  ctx.clearRect(0, 0, outW, outH)
  const opaque = !(transparent && (view === 'composite' || view === 'marks'))
  if (opaque && view !== 'marks') {
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, outW, outH)
  }
  if (!source) return

  const rect = fitRect(source.fullW, source.fullH, outW, outH, lab.source?.fit ?? 'contain')
  const maps = source.maps

  if (view === 'source' || (view === 'composite' && lab.mark.sourceVisibility > 0)) {
    ctx.save()
    ctx.globalAlpha = view === 'source' ? 1 : lab.mark.sourceVisibility
    ctx.drawImage(source.image, rect.x, rect.y, rect.w, rect.h)
    ctx.restore()
    if (view === 'source') return
  }

  if (view === 'lum' || view === 'edge') {
    const data = view === 'lum' ? maps.lum : maps.edge
    const img = new ImageData(maps.w, maps.h)
    for (let i = 0; i < data.length; i++) {
      const v = Math.round(Math.max(0, Math.min(1, data[i])) * 255)
      const o = i * 4
      img.data[o] = img.data[o + 1] = img.data[o + 2] = view === 'edge' ? 255 - v : v
      img.data[o + 3] = 255
    }
    blitMap(ctx, img, rect)
    return
  }

  if (view === 'orient') {
    // direction as hue, confidence as saturation — flat areas read gray
    const img = new ImageData(maps.w, maps.h)
    for (let i = 0; i < maps.orientX.length; i++) {
      const ox = maps.orientX[i]
      const oy = maps.orientY[i]
      const conf = Math.min(1, Math.hypot(ox, oy) * 6)
      const hue = ((0.5 * Math.atan2(oy, ox) + Math.PI / 2) / Math.PI) * 360
      const [r, g, b] = hslToRgb(hue, 0.75 * conf, 0.52)
      const o = i * 4
      img.data[o] = r
      img.data[o + 1] = g
      img.data[o + 2] = b
      img.data[o + 3] = 255
    }
    blitMap(ctx, img, rect)
    return
  }

  if (view === 'region') {
    const latticeCells = Math.round(3 + (1 - lab.mark.coherenceScale) * 17)
    const region = coherenceField(lab.seed, rect, latticeCells, 'lab.region')
    const rw = 180
    const rh = Math.max(2, Math.round((rw * outH) / outW))
    const img = new ImageData(rw, rh)
    for (let y = 0; y < rh; y++) {
      for (let x = 0; x < rw; x++) {
        const v = Math.round(region(((x + 0.5) / rw) * outW, ((y + 0.5) / rh) * outH) * 255)
        const o = (y * rw + x) * 4
        img.data[o] = img.data[o + 1] = img.data[o + 2] = v
        img.data[o + 3] = 255
      }
    }
    blitMap(ctx, img, { x: 0, y: 0, w: outW, h: outH })
    return
  }

  // composite / marks
  const stamps = buildMarkStamps({
    params: lab.mark,
    maps,
    rect,
    outW,
    outH,
    seed: lab.seed,
    bankSize: Math.max(1, protos.length),
  })
  const mode = lab.mark.colorMode
  for (const s of stamps) {
    const proto = protos[Math.min(s.protoIndex, protos.length - 1)]
    if (!proto) continue
    let fill = INK
    let alpha = 1
    if (mode === 'tint') alpha = tintFor(s.tone)
    else if (mode === 'source') {
      const [r, g, b] = sampleRGB(maps, s.mx, s.my)
      fill = `rgb(${r} ${g} ${b})`
    }
    stampProto(ctx, proto, s.x, s.y, s.rot, s.size, fill, alpha)
  }
}

function blitMap(
  ctx: CanvasRenderingContext2D,
  img: ImageData,
  rect: { x: number; y: number; w: number; h: number },
): void {
  const m = mapCanvas(img.width, img.height)
  m.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(m.canvas, rect.x, rect.y, rect.w, rect.h)
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

// Export renders the SAME painter at full output dimensions on a fresh
// canvas — never a scaled screenshot of the preview. Transparent PNG
// falls out of the transparent flag + marks-over-nothing path.
export async function exportLabPng(
  lab: LabState,
  source: LabSource | null,
  protos: ShapeProto[],
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = lab.output.width
  canvas.height = lab.output.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')
  renderLab(ctx, lab, source, protos, 'composite')
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
  })
}
