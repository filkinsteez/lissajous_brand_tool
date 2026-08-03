import { describe, expect, it } from 'vitest'
import { buildSheetClones } from '@/core/sheet/sheet'
import { buildCurveClones, buildRepeats } from '@/core/repeater/repeater'
import { resolveProtos, shapeProto, PROTO_SIZE } from '@/core/canvas/shapeProtos'
import { DEFAULT_LAYER_PARAMS } from '@/core/state/defaults'
import type { ShapeItem } from '@/core/state/types'

const W = 800
const H = 600
const SEED = 12

// the merged cloner defaults, viewed through each engine's lens: the
// sheet engine reads the grid fields directly; the repeat engine takes
// stampSize as its size and never sees mode 'curve'/'grid' here
const sheetParams = () => ({ ...DEFAULT_LAYER_PARAMS.cloner })
const repParams = () => ({
  ...DEFAULT_LAYER_PARAMS.cloner,
  mode: 'radial' as const,
  size: DEFAULT_LAYER_PARAMS.cloner.stampSize,
})

const item = (id: string, over: Partial<ShapeItem> = {}): ShapeItem => ({
  id,
  kind: 'rect',
  x: 10,
  y: 20,
  w: 200,
  h: 100,
  fill: '#ff0000',
  opacity: 0.8,
  seed: 7,
  ...over,
})

describe('sheet + repeater drawn-proto deal', () => {
  it('empty sourceShapeIds leaves the built-in vocabulary untouched', () => {
    const clones = buildSheetClones(sheetParams(), W, H, SEED)
    expect(clones.length).toBe(8 * 10)
    for (const c of clones) {
      expect(c.drawnIndex).toBeUndefined()
      if (c.shape === 'meta') expect(c.stroked).toBe(true)
    }
    // drawnCount 0 is byte-identical to the legacy signature
    expect(buildSheetClones(sheetParams(), W, H, SEED, undefined, 0)).toEqual(clones)

    const reps = buildRepeats(repParams(), W, H)
    for (const c of reps) expect(c.drawnIndex).toBeUndefined()
    expect(buildRepeats(repParams(), W, H, 0)).toEqual(reps)
  })

  it('drawn deal is deterministic and every index is in range', () => {
    const a = buildSheetClones(sheetParams(), W, H, SEED, undefined, 3)
    const b = buildSheetClones(sheetParams(), W, H, SEED, undefined, 3)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    for (const c of a) {
      expect(c.drawnIndex).toBeGreaterThanOrEqual(0)
      expect(c.drawnIndex).toBeLessThan(3)
      expect(Number.isInteger(c.drawnIndex)).toBe(true)
      expect(c.stroked).toBe(false) // protos carry their own fill
    }

    const ra = buildRepeats(repParams(), W, H, 4)
    const rb = buildRepeats(repParams(), W, H, 4)
    expect(JSON.stringify(ra)).toBe(JSON.stringify(rb))
    for (const c of ra) {
      expect(c.drawnIndex).toBeGreaterThanOrEqual(0)
      expect(c.drawnIndex).toBeLessThan(4)
      expect(c.stroked).toBe(false)
    }
  })

  it('curve mode rides the loop at equal arc spacing, tangent-aligned', () => {
    // a unit square loop, perimeter 400 — count 8 lands every 50px,
    // always ON an edge, and the first copy points along +x
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]
    const clones = buildCurveClones({ ...repParams(), count: 8, rotate: 0, fade: 0 }, W, H, pts)
    expect(clones.length).toBe(8)
    for (const c of clones) {
      const onEdge =
        Math.abs(c.x) < 1e-6 ||
        Math.abs(c.x - 100) < 1e-6 ||
        Math.abs(c.y) < 1e-6 ||
        Math.abs(c.y - 100) < 1e-6
      expect(onEdge).toBe(true)
    }
    expect(clones[0].rotate).toBeCloseTo(0, 6)
    // deterministic, drawn deal cycles in range
    expect(
      JSON.stringify(buildCurveClones({ ...repParams(), count: 8, rotate: 0, fade: 0 }, W, H, pts)),
    ).toBe(JSON.stringify(clones))
    const bound = buildCurveClones({ ...repParams(), count: 8 }, W, H, pts, 3)
    for (let i = 0; i < bound.length; i++) {
      expect(bound[i].drawnIndex).toBe(i % 3)
      expect(bound[i].stroked).toBe(false)
    }
  })

  it('binding protos never moves the sheet population', () => {
    // the deal reads its own hash channel: geometry must match the
    // unbound run exactly, only drawnIndex/stroked may differ
    const plain = buildSheetClones(sheetParams(), W, H, SEED)
    const bound = buildSheetClones(sheetParams(), W, H, SEED, undefined, 5)
    expect(bound.length).toBe(plain.length)
    for (let i = 0; i < plain.length; i++) {
      expect(bound[i].x).toBe(plain[i].x)
      expect(bound[i].y).toBe(plain[i].y)
      expect(bound[i].r).toBe(plain[i].r)
      expect(bound[i].rotate).toBe(plain[i].rotate)
      expect(bound[i].opacity).toBe(plain[i].opacity)
      expect(bound[i].z).toBe(plain[i].z)
    }
  })

  it('repeater deals drawn indices the way MIX cycles', () => {
    // grid mode deals on diagonals (col+row), so columns cannot lock to
    // one proto; the meta-forces-stroked rule does not apply when bound
    const rep = { ...repParams(), mode: 'grid' as const, shape: 'meta' as const, stroked: true }
    const nx = Math.min(12, Math.max(2, Math.round(rep.countX)))
    const clones = buildRepeats(rep, W, H, 3)
    clones.forEach((c, k) => {
      const row = Math.floor(k / nx)
      const col = k % nx
      expect(c.drawnIndex).toBe((col + row) % 3)
      expect(c.stroked).toBe(false)
    })

    // linear mode cycles by copy index
    const lin = buildRepeats({ ...repParams(), mode: 'linear' as const }, W, H, 5)
    lin.forEach((c, i) => expect(c.drawnIndex).toBe(i % 5))
  })

  it('resolveProtos drops deleted ids and normalizes to the proto box', () => {
    const shapes = [item('s1'), item('s2', { w: 100, h: 100 })]
    const protos = resolveProtos(shapes, ['s1', 'gone', 's2'])
    expect(protos.map((p) => p.id)).toEqual(['s1', 's2'])
    expect(resolveProtos(shapes, [])).toEqual([])
    expect(resolveProtos(shapes, undefined)).toEqual([])

    // 200x100 rect -> largest dimension = PROTO_SIZE, centered on origin
    const p = shapeProto(item('s1'))
    expect(p.kind).toBe('path')
    expect(p.kind === 'path' && p.d).toBe(
      `M${(-PROTO_SIZE / 2).toFixed(2)} ${(-PROTO_SIZE / 4).toFixed(2)}` +
        `H${(PROTO_SIZE / 2).toFixed(2)}V${(PROTO_SIZE / 4).toFixed(2)}H${(-PROTO_SIZE / 2).toFixed(2)}Z`,
    )
    expect(p.fill).toBe('#ff0000')
    expect(p.opacity).toBe(0.8)
  })
})
