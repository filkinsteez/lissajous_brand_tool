import type { PlacedGlyph } from './layout'

export type GlyphRenderOptions = {
  ink: string
  overprint: boolean
  scale?: number // resolution multiplier for export
}

// Canvas render path for the glyph field. Overprint draws a second,
// slightly offset multiply pass — two inks misregistered on press.
export function renderGlyphField(
  canvas: HTMLCanvasElement,
  glyphs: PlacedGlyph[],
  artW: number,
  artH: number,
  opts: GlyphRenderOptions,
): void {
  const scale = opts.scale ?? 1
  const w = Math.round(artW * scale)
  const h = Math.round(artH * scale)
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h

  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, w, h)
  ctx.save()
  ctx.scale(scale, scale)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const passes: { dx: number; dy: number; alphaMul: number; comp: GlobalCompositeOperation }[] =
    opts.overprint
      ? [
          { dx: 0, dy: 0, alphaMul: 1, comp: 'source-over' },
          { dx: 0.14, dy: -0.09, alphaMul: 0.55, comp: 'multiply' },
        ]
      : [{ dx: 0, dy: 0, alphaMul: 1, comp: 'source-over' }]

  for (const pass of passes) {
    ctx.globalCompositeOperation = pass.comp
    for (const g of glyphs) {
      ctx.globalAlpha = Math.max(0, Math.min(1, g.alpha * pass.alphaMul))
      ctx.font = `500 ${g.size}px 'Roboto Flex', sans-serif`
      ctx.fillStyle = opts.ink
      ctx.save()
      ctx.translate(g.x + pass.dx * g.size, g.y + pass.dy * g.size)
      if (g.angle !== 0) ctx.rotate(g.angle)
      ctx.fillText(g.char, 0, 0)
      ctx.restore()
    }
  }
  ctx.restore()
}
