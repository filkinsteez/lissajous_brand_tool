import { describe, expect, it } from 'vitest'
import { shuffleProject, shuffleRoles } from './shuffle'
import { createDefaultProject } from './defaults'
import { getDerived } from '@/core/pipeline'
import { mulberry32 } from '@/core/math/random'
import { BRAND_ROLE_ORDER, type ColorRole } from '@/core/color/palette'

const project = createDefaultProject(21)
const grid = getDerived(project).grid

describe('shuffleProject', () => {
  it('is deterministic per seed and varies across seeds', () => {
    expect(shuffleProject(project, grid, 3)).toEqual(shuffleProject(project, grid, 3))
    const seen = new Set<string>()
    for (let s = 0; s < 12; s++) {
      const p = shuffleProject(project, grid, s)
      seen.add(JSON.stringify([p.background.seed, p.grid.columnBias, p.grid.rowBias]))
    }
    expect(seen.size).toBeGreaterThan(8)
  })

  it('moves BOTH the grid structure and the shader expression', () => {
    let gridMoved = 0
    let shaderMoved = 0
    for (let s = 0; s < 10; s++) {
      const p = shuffleProject(project, grid, s)
      if (p.grid.columnBias !== project.grid.columnBias || p.grid.rowBias !== project.grid.rowBias) {
        gridMoved++
      }
      if (
        p.background.seed !== project.background.seed &&
        p.background.warp !== project.background.warp
      ) {
        shaderMoved++
      }
    }
    expect(gridMoved).toBeGreaterThan(6)
    expect(shaderMoved).toBe(10)
  })

  it('keeps every shuffled value inside the panel sliders range', () => {
    for (let s = 0; s < 40; s++) {
      const { background: b, grid: g } = shuffleProject(project, grid, s)
      expect(b.width).toBeGreaterThanOrEqual(0.04)
      expect(b.width).toBeLessThanOrEqual(0.5)
      expect(b.fieldScale).toBeGreaterThanOrEqual(0.5)
      expect(b.fieldScale).toBeLessThanOrEqual(4)
      expect(b.form).toBeGreaterThanOrEqual(0)
      expect(b.form).toBeLessThanOrEqual(1)
      expect(b.softness).toBeGreaterThanOrEqual(0)
      expect(b.softness).toBeLessThanOrEqual(1)
      expect(b.layers).toBeGreaterThanOrEqual(1)
      expect(b.layers).toBeLessThanOrEqual(10)
      expect(b.arcSpread).toBeGreaterThanOrEqual(0.3)
      expect(b.arcSpread).toBeLessThanOrEqual(2.5)
      expect(b.warp).toBeGreaterThanOrEqual(0)
      expect(b.warp).toBeLessThanOrEqual(1)
      expect(b.drift).toBeGreaterThanOrEqual(0)
      expect(b.drift).toBeLessThanOrEqual(1)
      expect(b.grain).toBeGreaterThanOrEqual(0)
      expect(b.grain).toBeLessThanOrEqual(0.4)
      expect(b.contrast).toBeGreaterThanOrEqual(0.5)
      expect(b.contrast).toBeLessThanOrEqual(1.6)
      expect(Math.abs(b.fieldOffsetX)).toBeLessThanOrEqual(1)
      expect(Math.abs(b.fieldOffsetY)).toBeLessThanOrEqual(1)
      expect(g.columnBias).toBeGreaterThanOrEqual(2)
      expect(g.columnBias).toBeLessThanOrEqual(8)
      expect(g.rowBias).toBeGreaterThanOrEqual(2)
      expect(g.rowBias).toBeLessThanOrEqual(12)
    }
  })

  it('preserves the palette as a permutation and keeps locked roles in place', () => {
    for (let s = 0; s < 20; s++) {
      const { background } = shuffleProject(project, grid, s)
      expect([...background.roles].sort()).toEqual([...project.background.roles].sort())
      for (const locked of project.background.lockedRoles) {
        const at = project.background.roles.indexOf(locked)
        expect(background.roles[at]).toBe(locked)
      }
    }
  })

  it('shuffleRoles re-deals the unlocked slots', () => {
    const locked: ColorRole[] = ['blue']
    const out = shuffleRoles(BRAND_ROLE_ORDER, locked, mulberry32(9))
    expect(out[BRAND_ROLE_ORDER.indexOf('blue')]).toBe('blue')
    expect([...out].sort()).toEqual([...BRAND_ROLE_ORDER].sort())
    expect(out).not.toEqual(BRAND_ROLE_ORDER)
  })
})
