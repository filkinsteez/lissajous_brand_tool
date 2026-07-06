import type { ProjectState } from '@/core/state/types'
import { getDerived } from '@/core/pipeline'
import { bakeFields } from '@/core/lissajous/fields'
import { getPressureMask } from '@/core/typography/pressureMask'
import { getGlyphLayout } from '@/core/glyph-field/layout'
import { renderGlyphField } from '@/core/glyph-field/renderCanvas'
import { FieldSampler } from '@/core/lissajous/fields'
import { MaterialRenderer } from '@/render/materialRenderer'
import { renderTypeToCanvas } from './svgText'

export const EXPORT_BAKE_RES = 512

// Full compositor: background → material (fresh GL context, 512² bake,
// FBO readback at export res) → glyph field re-render → SVG type. Every
// layer re-renders at target resolution; nothing is upscaled.
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
  const mask = getPressureMask(project, derived.grid)

  if (project.material.enabled) {
    const bake = bakeFields(derived.samples, derived.primary, W, H, EXPORT_BAKE_RES)
    const glCanvas = document.createElement('canvas')
    glCanvas.width = 4
    glCanvas.height = 4
    const renderer = new MaterialRenderer(glCanvas)
    if (renderer.available) {
      renderer.setField(bake)
      renderer.setPressure(mask)
      const px = renderer.renderToPixels(project.material, outW, outH, project.seed)
      if (px) ctx.putImageData(new ImageData(px, outW, outH), 0, 0)
    }
    renderer.dispose()
  }

  if (project.glyphField.enabled) {
    const bake = bakeFields(derived.samples, derived.primary, W, H, 256)
    const glyphs = getGlyphLayout(project, derived.grid, new FieldSampler(bake), mask)
    const glyphCanvas = document.createElement('canvas')
    renderGlyphField(glyphCanvas, glyphs, W, H, {
      ink: project.material.ink,
      overprint: project.glyphField.overprint,
      scale,
    })
    ctx.drawImage(glyphCanvas, 0, 0)
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
