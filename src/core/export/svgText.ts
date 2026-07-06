import type { ProjectState } from '@/core/state/types'
import type { EditorialGrid } from '@/core/grid/types'
import { layoutTypeBlock } from '@/core/typography/textBlocks'
import { applyCase, variationSettings } from '@/core/typography/fonts'
import { INK } from '@/core/state/defaults'

// Rasterizes the type layer through an SVG <foreignObject>: the browser's
// own text engine wraps lines exactly like the editor DOM, and fonts are
// embedded as data URIs so the drawn canvas is never tainted.

const EXPORT_FAMILIES: Record<string, { match: RegExp; exportName: string }> = {
  flex: { match: /Roboto Flex/i, exportName: 'LBS Flex' },
  fraunces: { match: /Fraunces/i, exportName: 'LBS Fraunces' },
  mono: { match: /IBM Plex Mono/i, exportName: 'LBS Mono' },
}

let fontFacesCache: string | null = null

// Find next/font's injected @font-face rules, fetch the woff2 payloads,
// and rebuild the faces under stable export names with full axis ranges.
async function collectFontFaces(): Promise<string> {
  if (fontFacesCache) return fontFacesCache
  const jobs: Promise<string>[] = []

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin sheet
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const family = rule.style.getPropertyValue('font-family')
      const src = rule.style.getPropertyValue('src')
      const urlMatch = src.match(/url\(["']?([^"')]+)["']?\)/)
      if (!urlMatch) continue
      const def = Object.values(EXPORT_FAMILIES).find((d) => d.match.test(family))
      if (!def) continue
      // src urls are relative to the stylesheet, not the page
      const url = new URL(urlMatch[1], sheet.href ?? location.href).href
      const weight = rule.style.getPropertyValue('font-weight') || '100 1000'
      // subset faces carry unicode-range; without it the last face wins
      const range = rule.style.getPropertyValue('unicode-range')
      jobs.push(
        fetch(url)
          .then((r) => r.arrayBuffer())
          .then((buf) => {
            let bin = ''
            const bytes = new Uint8Array(buf)
            for (let i = 0; i < bytes.length; i += 0x8000) {
              bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
            }
            return `@font-face{font-family:'${def.exportName}';src:url(data:font/woff2;base64,${btoa(bin)}) format('woff2');font-weight:${weight};font-stretch:25% 151%;${range ? `unicode-range:${range};` : ''}}`
          })
          .catch(() => ''),
      )
    }
  }

  const faces = (await Promise.all(jobs)).filter(Boolean).join('\n')
  if (faces) fontFacesCache = faces
  return faces
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function renderTypeToCanvas(
  ctx: CanvasRenderingContext2D,
  project: ProjectState,
  grid: EditorialGrid,
  scale: number,
): Promise<void> {
  const { width: W, height: H } = project.artboard
  const faces = await collectFontFaces()

  const blocksHtml = project.typeBlocks
    .filter((b) => b.text)
    .map((b) => {
      const box = layoutTypeBlock(b, grid)
      const family = EXPORT_FAMILIES[b.fontFamily]?.exportName ?? 'LBS Flex'
      const style = [
        `position:absolute`,
        `left:${box.x}px`,
        `top:${box.y}px`,
        `width:${box.w}px`,
        `font-family:'${family}'`,
        `font-size:${b.size}px`,
        `font-weight:${Math.round(b.weight)}`,
        `font-variation-settings:${variationSettings(b)}`,
        `line-height:${b.lineHeight}`,
        `letter-spacing:${b.tracking}em`,
        `text-align:${b.align}`,
        `color:${INK}`,
        `white-space:pre-wrap`,
        `margin:0`,
      ].join(';')
      return `<div style="${style}">${escapeHtml(applyCase(b.text, b.textCase))}</div>`
    })
    .join('')

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W * scale}" height="${H * scale}" viewBox="0 0 ${W} ${H}">` +
    `<style>${faces}</style>` +
    `<foreignObject x="0" y="0" width="${W}" height="${H}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="position:relative;width:${W}px;height:${H}px;">${blocksHtml}</div>` +
    `</foreignObject></svg>`

  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  ctx.drawImage(img, 0, 0, W * scale, H * scale)
}
