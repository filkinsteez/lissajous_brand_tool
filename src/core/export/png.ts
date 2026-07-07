import type { ProjectState } from '@/core/state/types'
import { getDerived } from '@/core/pipeline'
import { renderTypeToCanvas } from './svgText'

// Compositor: background → SVG type, re-rendered at target resolution.
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
