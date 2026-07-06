import { describe, expect, it } from 'vitest'
import { createDefaultProject } from '@/core/state/defaults'
import { getDerived } from '@/core/pipeline'
import { bakeFields, FieldSampler } from '@/core/lissajous/fields'
import { buildPressureMask } from '@/core/typography/pressureMask'
import { columnSpanRect } from '@/core/grid/types'
import { layoutGlyphField } from './layout'
import { INK_TINTS, SIZE_STEPS } from './modes'
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
        expect(g.x).toBeLessThanOrEqual(box.x + box.w + 40) // stream echo can lean past a hair
        expect(g.y).toBeGreaterThanOrEqual(box.y - 1)
        expect(g.y).toBeLessThanOrEqual(box.y + box.h + 1)
      }
    }
  })

  it('emits only quantized ink tints', () => {
    const tints = new Set<number>(INK_TINTS)
    for (const mode of MODES) {
      for (const g of build(mode)) {
        expect(tints.has(g.alpha), `${mode} alpha ${g.alpha}`).toBe(true)
      }
    }
  })

  it('emits only quantized size steps', () => {
    const project = createDefaultProject()
    const scale = project.glyphField.scale
    const allowed = new Set(
      Object.values(SIZE_STEPS).flatMap((s) => [scale * s, scale * s * SIZE_STEPS.small]),
    )
    for (const mode of MODES) {
      for (const g of build(mode)) {
        const ok = [...allowed].some((s) => Math.abs(g.size - s) < 1e-6)
        expect(ok, `${mode} size ${g.size}`).toBe(true)
      }
    }
  })

  it('dense mode typesets inside columns, never in gutters', () => {
    const project = createDefaultProject()
    const grid = getDerived(project).grid
    const nCols = grid.columnBoundaries.length - 1
    const rects = Array.from({ length: nCols }, (_, c) => columnSpanRect(grid, c, 1, true))
    for (const g of build('dense')) {
      const inColumn = rects.some((r) => g.x >= r.x - 0.5 && g.x <= r.x + r.w + 0.5)
      expect(inColumn, `x=${g.x}`).toBe(true)
    }
  })

  it('dense mode y positions sit on the baseline rhythm', () => {
    const project = createDefaultProject()
    const grid = getDerived(project).grid
    for (const g of build('dense')) {
      const steps = (g.y - grid.contentBox.y) / grid.baseline
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6)
    }
  })
})
