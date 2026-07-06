import { describe, expect, it } from 'vitest'
import { createDefaultProject } from '@/core/state/defaults'
import { getDerived } from '@/core/pipeline'
import { layoutTypeBlock } from './textBlocks'
import { shuffleLayout } from './layoutShuffle'

function setup() {
  const project = createDefaultProject()
  const grid = getDerived(project).grid
  return { project, grid }
}

describe('shuffleLayout', () => {
  it('is deterministic per seed', () => {
    const { project, grid } = setup()
    expect(shuffleLayout(project, grid, 5)).toEqual(shuffleLayout(project, grid, 5))
  })

  it('produces different layouts across seeds', () => {
    const { project, grid } = setup()
    const layouts = new Set<string>()
    for (let seed = 1; seed <= 12; seed++) {
      layouts.add(JSON.stringify(shuffleLayout(project, grid, seed).map((b) => b.anchor)))
    }
    expect(layouts.size).toBeGreaterThan(4)
  })

  it('does not stack every block on the same keyline for most seeds', () => {
    const { project, grid } = setup()
    let sameKeyline = 0
    for (let seed = 1; seed <= 20; seed++) {
      const cols = shuffleLayout(project, grid, seed).map((b) => b.anchor.col)
      if (cols.every((c) => c === cols[0])) sameKeyline++
    }
    expect(sameKeyline).toBeLessThan(4)
  })

  it('keeps anchors inside the grid and preserves text/styling', () => {
    const { project, grid } = setup()
    const nCols = grid.columnBoundaries.length - 1
    const nRows = grid.rowBoundaries.length - 1
    for (let seed = 1; seed <= 20; seed++) {
      for (const block of shuffleLayout(project, grid, seed)) {
        expect(block.anchor.col).toBeGreaterThanOrEqual(0)
        expect(block.anchor.col).toBeLessThan(nCols)
        expect(block.anchor.row).toBeGreaterThanOrEqual(0)
        expect(block.anchor.row).toBeLessThanOrEqual(nRows)
        const original = project.typeBlocks.find((b) => b.id === block.id)!
        expect(block.text).toBe(original.text)
        expect(block.size).toBe(original.size)
        expect(block.fontFamily).toBe(original.fontFamily)
      }
    }
  })

  it('headline and caption do not overlap', () => {
    const { project, grid } = setup()
    for (let seed = 1; seed <= 30; seed++) {
      const blocks = shuffleLayout(project, grid, seed)
      const h = layoutTypeBlock(blocks.find((b) => b.role === 'headline')!, grid)
      const c = layoutTypeBlock(blocks.find((b) => b.role === 'caption')!, grid)
      const overlap =
        h.x < c.x + c.w && c.x < h.x + h.w && h.y < c.y + c.estH && c.y < h.y + h.estH
      expect(overlap, `seed ${seed}`).toBe(false)
    }
  })
})
