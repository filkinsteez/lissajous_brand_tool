import { describe, expect, it } from 'vitest'
import { buildOrganic, type OrganicPoint } from '@/core/organic/engine'
import { resolveProtos } from '@/core/canvas/shapeProtos'
import { DEFAULT_LAYER_PARAMS } from '@/core/state/defaults'
import type { OrganicState, ShapeItem } from '@/core/state/types'

// The organic effector: bound drawn shapes replace the built-in proto
// vocabulary via a per-point drawn deal. The deal must ride ON TOP of
// the engine — never move, cull or restyle a point — and must be
// order-free over the bound id array, like the built-in proto deal.

const W = 900
const H = 1200
const PALETTE = 5
const IDS = ['sh-a', 'sh-b', 'sh-c']

const base: OrganicState = { ...DEFAULT_LAYER_PARAMS.organic, count: 400 }

// the fields the deal must never touch
const geometry = (pt: OrganicPoint) => ({
  id: pt.id,
  x: pt.x,
  y: pt.y,
  angle: pt.angle,
  scale: pt.scale,
  stretch: pt.stretch,
  paletteIndex: pt.paletteIndex,
  opacity: pt.opacity,
  field: pt.field,
})

const shape = (id: string, over: Partial<ShapeItem> = {}): ShapeItem => ({
  id,
  kind: 'rect',
  x: 10,
  y: 10,
  w: 120,
  h: 60,
  fill: '#123456',
  opacity: 0.8,
  seed: 7,
  ...over,
})

describe('organic drawn-shape effector', () => {
  it('empty binding is byte-identical to the legacy build', () => {
    const legacy = buildOrganic(base, W, H, null, PALETTE)
    const explicit = buildOrganic(base, W, H, null, PALETTE, [])
    expect(explicit).toEqual(legacy)
    expect(legacy.points.length).toBeGreaterThan(0)
    for (const pt of legacy.points) {
      expect(pt.drawnIndex).toBeUndefined()
      expect(base.protos).toContain(pt.proto)
    }
  })

  it('drawn deal is deterministic and every index is in range', () => {
    const a = buildOrganic(base, W, H, null, PALETTE, IDS)
    const b = buildOrganic(base, W, H, null, PALETTE, IDS)
    expect(a.points.map((pt) => pt.drawnIndex)).toEqual(b.points.map((pt) => pt.drawnIndex))
    expect(a.points.length).toBeGreaterThan(0)
    for (const pt of a.points) {
      expect(pt.drawnIndex).toBeGreaterThanOrEqual(0)
      expect(pt.drawnIndex).toBeLessThan(IDS.length)
    }
    // at this point count every bound shape should win somewhere
    expect(new Set(a.points.map((pt) => pt.drawnIndex)).size).toBe(IDS.length)
  })

  it('binding never moves a point, and the deal is order-free', () => {
    const unbound = buildOrganic(base, W, H, null, PALETTE)
    const bound = buildOrganic(base, W, H, null, PALETTE, IDS)
    // same survivors, same per-point attributes — the deal only adds an index
    expect(bound.points.map(geometry)).toEqual(unbound.points.map(geometry))
    // order-free: reordering the id array re-numbers, never re-deals
    const rev = [...IDS].reverse()
    const reordered = buildOrganic(base, W, H, null, PALETTE, rev)
    bound.points.forEach((pt, i) => {
      expect(rev[reordered.points[i].drawnIndex!]).toBe(IDS[pt.drawnIndex!])
    })
  })

  it('resolveProtos drops deleted ids and keeps binding order', () => {
    const shapes = [shape('sh-a'), shape('sh-c', { fill: '#abcdef', opacity: 0.5 })]
    const protos = resolveProtos(shapes, ['sh-a', 'sh-gone', 'sh-c'])
    expect(protos.map((p) => p.id)).toEqual(['sh-a', 'sh-c'])
    expect(protos[1].fill).toBe('#abcdef')
    expect(protos[1].opacity).toBe(0.5)
    expect(resolveProtos(shapes, [])).toEqual([])
  })
})
