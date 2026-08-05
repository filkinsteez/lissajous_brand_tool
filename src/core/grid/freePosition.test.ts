import { describe, expect, it } from 'vitest'
import { columnSpanRect, imageRect, rowSpanRect, type EditorialGrid } from './types'
import { layoutTypeBlock } from '@/core/typography/textBlocks'
import { createDefaultProject } from '@/core/state/defaults'
import { serializeProject, deserializeProject } from '@/core/state/serialize'
import type { ImageItem, TypeBlockState } from '@/core/state/types'

// The magnet contract's data side: `free` wins outright when present,
// the anchor path is untouched when it is absent, and free rects
// survive an autosave round trip.

function stubGrid(): EditorialGrid {
  const cols = [0, 480, 960, 1440, 1920]
  const rows = [0, 270, 540, 810, 1080]
  return {
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    contentBox: { x: 0, y: 0, w: 1920, h: 1080 },
    columnBoundaries: cols.map((pos, i) => ({ id: `x${i}`, axis: 'x', pos, sources: [] })),
    rowBoundaries: rows.map((pos, i) => ({ id: `y${i}`, axis: 'y', pos, sources: [] })),
    gutter: 16,
    padding: 0,
    baseline: 24,
    anchors: [],
    headlineBand: { y: 540, h: 270 },
    captionCell: { x: 0, y: 0, w: 480, h: 270 },
  }
}

const anchor = { col: 1, row: 1, colSpan: 2, rowSpan: 2 }

describe('imageRect', () => {
  it('returns the anchor-derived cell rect (gutter inset) without free', () => {
    const g = stubGrid()
    const r = imageRect(g, anchor)
    const { x, w } = columnSpanRect(g, anchor.col, anchor.colSpan, true)
    const { y, h } = rowSpanRect(g, anchor.row, anchor.rowSpan, true)
    expect(r).toEqual({ x, y, w, h })
  })

  it('returns the free rect verbatim when present', () => {
    const free = { x: 123.4, y: 56.7, w: 300, h: 200 }
    expect(imageRect(stubGrid(), anchor, free)).toEqual(free)
  })
})

describe('layoutTypeBlock with free', () => {
  const block = (): TypeBlockState => ({
    ...createDefaultProject().typeBlocks[0],
    anchor: { col: 0, row: 0, colSpan: 2, baselineOffset: 0 },
  })

  it('anchored blocks lay out on the grid', () => {
    const g = stubGrid()
    const box = layoutTypeBlock(block(), g)
    expect(box.x).toBe(0)
    expect(box.y).toBe(0)
    expect(box.w).toBeCloseTo(columnSpanRect(g, 0, 2).w)
  })

  it('a free block sits exactly at its free rect, grid ignored', () => {
    const b = { ...block(), free: { x: 77.5, y: 431.25, w: 512 } }
    const box = layoutTypeBlock(b, stubGrid())
    expect(box.x).toBe(77.5)
    expect(box.y).toBe(431.25)
    expect(box.w).toBe(512)
  })
})

describe('free rects survive the autosave round trip', () => {
  it('serialize -> deserialize preserves image and text free rects', () => {
    const project = createDefaultProject()
    const img: ImageItem = {
      id: 'img-free',
      src: 'data:image/png;base64,AAAA',
      anchor: { col: 0, row: 0, colSpan: 1, rowSpan: 1 },
      free: { x: 10.5, y: 20.5, w: 333, h: 222 },
    }
    project.images = [img]
    project.typeBlocks = [
      { ...project.typeBlocks[0], free: { x: 1, y: 2, w: 400 } },
      ...project.typeBlocks.slice(1),
    ]
    const back = deserializeProject(serializeProject(project))
    expect(back).not.toBeNull()
    expect(back!.images[0].free).toEqual(img.free)
    expect(back!.typeBlocks[0].free).toEqual({ x: 1, y: 2, w: 400 })
  })

  it('objects without free stay without it (old saves untouched)', () => {
    const project = createDefaultProject()
    const back = deserializeProject(serializeProject(project))
    expect(back!.typeBlocks[0].free).toBeUndefined()
  })
})
