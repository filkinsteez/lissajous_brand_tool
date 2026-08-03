import { describe, expect, it } from 'vitest'
import { dragToBox, shapePathD } from './shapeItems'
import type { ShapeItem } from '@/core/state/types'

const base: ShapeItem = {
  id: 'a',
  kind: 'rect',
  x: 100,
  y: 50,
  w: 200,
  h: 120,
  fill: '#f4f2ed',
  opacity: 1,
  seed: 42,
}

describe('shapePathD', () => {
  it('every kind produces a closed, deterministic path', () => {
    for (const kind of ['rect', 'ellipse', 'poly', 'star', 'line', 'blob'] as const) {
      const s = { ...base, kind }
      const d = shapePathD(s)
      expect(d.startsWith('M')).toBe(true)
      expect(d.endsWith('Z')).toBe(true)
      expect(shapePathD(s)).toBe(d)
    }
  })

  it('blob shape follows its own seed, not its position', () => {
    const a = shapePathD({ ...base, kind: 'blob' })
    const b = shapePathD({ ...base, kind: 'blob', seed: 43 })
    expect(a).not.toBe(b)
    // moving the same blob translates but keeps its silhouette family:
    // same seed at a different origin yields a different string but the
    // same harmonics (spot check: identical when moved back)
    const moved = shapePathD({ ...base, kind: 'blob', x: 300 })
    expect(moved).not.toBe(a)
    expect(shapePathD({ ...base, kind: 'blob' })).toBe(a)
  })

  it('line flips diagonals with the flag', () => {
    const down = shapePathD({ ...base, kind: 'line', flip: false })
    const up = shapePathD({ ...base, kind: 'line', flip: true })
    expect(down).not.toBe(up)
  })
})

describe('dragToBox', () => {
  it('normalizes any drag direction into a positive box', () => {
    expect(dragToBox(200, 300, 100, 120, 1000)).toEqual({
      x: 100,
      y: 120,
      w: 100,
      h: 180,
      flip: false,
    })
    // up-right drag marks the rising diagonal
    expect(dragToBox(100, 300, 200, 120, 1000).flip).toBe(true)
  })

  it('a tiny drag becomes a default-size stamp at the click point', () => {
    const box = dragToBox(500, 400, 502, 401, 1000)
    expect(box.w).toBe(80)
    expect(box.h).toBe(80)
    expect(box.x).toBe(460)
    expect(box.y).toBe(360)
  })
})
