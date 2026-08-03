import { describe, expect, it } from 'vitest'
import {
  buildContourLevels,
  dealProtoIndex,
  stampsAlongContours,
} from '@/core/cloner/contours'
import { resolveProtos } from '@/core/canvas/shapeProtos'
import type { CurveSample } from '@/core/lissajous/sampler'
import type { ShapeItem } from '@/core/state/types'

function circleSamples(cx: number, cy: number, r: number, n = 256): CurveSample[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2
    return { x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r, t, angle: 0, curvature: 0 }
  })
}

const shapes: ShapeItem[] = [
  { id: 'a', kind: 'rect', x: 0, y: 0, w: 40, h: 20, fill: '#112233', opacity: 0.8, seed: 1 },
  { id: 'b', kind: 'ellipse', x: 10, y: 10, w: 30, h: 30, fill: '#445566', opacity: 1, seed: 2 },
]

describe('clones effector (drawn shapes along contours)', () => {
  it('empty sourceShapeIds resolves no protos and leaves the ring output untouched', () => {
    expect(resolveProtos(shapes, [])).toEqual([])
    expect(resolveProtos(shapes, undefined)).toEqual([])
    const samples = circleSamples(500, 500, 200)
    const levels = buildContourLevels(samples, 1000, 1000, { count: 3, spacing: 0.04, growth: 1 })
    const before = levels.map((l) => l.d)
    stampsAlongContours(levels, 20)
    expect(levels.map((l) => l.d)).toEqual(before)
    expect(
      buildContourLevels(samples, 1000, 1000, { count: 3, spacing: 0.04, growth: 1 }).map(
        (l) => l.d,
      ),
    ).toEqual(before)
  })

  it('stamp placement is deterministic and the proto deal stays in range', () => {
    const samples = circleSamples(500, 500, 200)
    const levels = buildContourLevels(samples, 1000, 1000, { count: 3, spacing: 0.04, growth: 1 })
    const a = stampsAlongContours(levels, 18)
    const b = stampsAlongContours(levels, 18)
    expect(a.length).toBeGreaterThan(0)
    expect(a).toEqual(b)

    const protos = resolveProtos(shapes, ['a', 'b'])
    expect(protos.length).toBe(2)
    for (let j = 0; j < a.length; j++) {
      const pi = dealProtoIndex(a[j].levelIndex, j, protos.length)
      expect(pi).toBeGreaterThanOrEqual(0)
      expect(pi).toBeLessThan(protos.length)
      expect(dealProtoIndex(a[j].levelIndex, j, protos.length)).toBe(pi)
    }
  })

  it('stamps sit on their ring and point along it', () => {
    const samples = circleSamples(500, 500, 200)
    const levels = buildContourLevels(samples, 1000, 1000, { count: 3, spacing: 0.04, growth: 1 })
    const stamps = stampsAlongContours(levels, 24)
    for (const st of stamps) {
      const rx = st.x - 500
      const ry = st.y - 500
      const r = Math.hypot(rx, ry)
      const offset = levels[st.levelIndex].offset
      // the level set of a circle's distance field is the pair of circles
      // at radius 200 ± offset; marching squares lands within a cell
      const err = Math.min(Math.abs(r - (200 - offset)), Math.abs(r - (200 + offset)))
      expect(err).toBeLessThan(8)
      // tangent ⊥ radial on a circular ring
      const dot = (rx / r) * Math.cos(st.angle) + (ry / r) * Math.sin(st.angle)
      expect(Math.abs(dot)).toBeLessThan(0.45)
    }
  })
})
