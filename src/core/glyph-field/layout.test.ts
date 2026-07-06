import { describe, expect, it } from 'vitest'
import { createDefaultProject } from '@/core/state/defaults'
import { getDerived } from '@/core/pipeline'
import { bakeFields, FieldSampler } from '@/core/lissajous/fields'
import { buildPressureMask } from '@/core/typography/pressureMask'
import { layoutGlyphField } from './layout'
import type { GlyphFieldMode } from '@/core/state/types'

function build(mode: GlyphFieldMode, seedOffset = 0) {
  const project = createDefaultProject()
  project.glyphField = { ...project.glyphField, enabled: true, mode, seedOffset, density: 0.6 }
  const derived = getDerived(project)
  const W = project.artboard.width
  const H = project.artboard.height
  const bake = bakeFields(derived.samples, derived.primary, W, H, 128)
  const sampler = new FieldSampler(bake)
  const mask = buildPressureMask(project, derived.grid)
  return layoutGlyphField(project, derived.grid, sampler, mask)
}

const MODES: GlyphFieldMode[] = ['sparse', 'dense', 'verticalStream', 'fieldContour']

describe('glyph field layout', () => {
  it('produces glyphs in every mode', () => {
    for (const mode of MODES) {
      const glyphs = build(mode)
      expect(glyphs.length, mode).toBeGreaterThan(20)
      expect(glyphs.length, mode).toBeLessThan(6000)
    }
  })

  it('is deterministic for the same seed', () => {
    for (const mode of MODES) {
      expect(build(mode), mode).toEqual(build(mode))
    }
  })

  it('changes with the seed offset', () => {
    const a = build('sparse', 0)
    const b = build('sparse', 1)
    expect(a).not.toEqual(b)
  })

  it('draws characters from the source text only', () => {
    const glyphs = build('dense')
    const allowed = new Set([...'LISSAJOUS'])
    for (const g of glyphs) expect(allowed.has(g.char)).toBe(true)
  })

  it('keeps glyphs inside the content box', () => {
    const project = createDefaultProject()
    const derived = getDerived(project)
    const box = derived.grid.contentBox
    for (const mode of MODES) {
      for (const g of build(mode)) {
        expect(g.x).toBeGreaterThanOrEqual(box.x - 1)
        expect(g.x).toBeLessThanOrEqual(box.x + box.w + 1)
        expect(g.y).toBeGreaterThanOrEqual(box.y - 1)
        expect(g.y).toBeLessThanOrEqual(box.y + box.h + 1)
      }
    }
  })
})
