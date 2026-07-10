import { describe, expect, it } from 'vitest'
import { buildArcLUT } from './arcLength'
import {
  cssMotionSystem,
  curveArcEasing,
  enumerateLobes,
  evalEase,
  figureCrossings,
  figureLibrary,
  lissajousEasing,
  MOTION_PRESETS,
  MOTION_TOKENS,
  overshootOf,
  META_PHASE,
  META_SHAPE,
  shapeY,
  springLUT,
  toCssLinear,
  velocityOf,
} from './spring'
import { samplePathShape } from './pathShapes'
import { createDefaultProject } from '@/core/state/defaults'

describe('springLUT', () => {
  it('starts at 0 and lands at 1', () => {
    for (const damping of [0.3, 0.65, 1, 1.5]) {
      const lut = springLUT({ stiffness: 14, damping, initialVelocity: 0 })
      expect(lut[0]).toBe(0)
      expect(lut[lut.length - 1]).toBe(1)
      expect(Math.abs(evalEase(lut, 0.98) - 1)).toBeLessThan(0.05)
    }
  })

  it('is monotone for critical/over-damped springs', () => {
    const lut = springLUT({ stiffness: 14, damping: 1.2, initialVelocity: 0 })
    for (let i = 1; i < lut.length; i++) {
      expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1] - 1e-6)
    }
    expect(overshootOf(lut)).toBeLessThan(0.001)
  })

  it('overshoots when underdamped (springy)', () => {
    const lut = springLUT({ stiffness: 18, damping: 0.32, initialVelocity: 0 })
    expect(overshootOf(lut)).toBeGreaterThan(0.15)
  })

  it('is deterministic', () => {
    const a = springLUT({ stiffness: 12, damping: 0.65, initialVelocity: 0.5 })
    const b = springLUT({ stiffness: 12, damping: 0.65, initialVelocity: 0.5 })
    expect([...a]).toEqual([...b])
  })

  it('motion occupies the full timeline — no dead tail', () => {
    // an ease that finishes early and parks reads as "different speeds"
    // against the time cursor; the trim keeps the object moving
    for (const damping of [0.65, 1, 1.15, 1.5]) {
      const lut = springLUT({ stiffness: 14, damping, initialVelocity: 0 })
      // still away from target at 70% time — settling or ringing, but moving
      expect(Math.abs(evalEase(lut, 0.7) - 1), `damping ${damping}`).toBeGreaterThan(0.008)
    }
  })

  it('linear bypass is the identity', () => {
    const lut = springLUT({ stiffness: 0, damping: 1, initialVelocity: 0 })
    expect(evalEase(lut, 0.25)).toBeCloseTo(0.25, 5)
    expect(evalEase(lut, 0.5)).toBeCloseTo(0.5, 5)
    expect(evalEase(lut, 0.75)).toBeCloseTo(0.75, 5)
  })

  it('velocity profile normalizes to peak 1', () => {
    const v = velocityOf(springLUT({ stiffness: 14, damping: 1.15, initialVelocity: 0 }))
    expect(Math.max(...v)).toBeCloseTo(1, 5)
  })

  it('produces a valid CSS linear() token', () => {
    const css = toCssLinear(springLUT({ stiffness: 14, damping: 1.15, initialVelocity: 0 }))
    expect(css.startsWith('linear(')).toBe(true)
    expect(css.endsWith(')')).toBe(true)
    expect(css).toContain('1 100%')
    expect(css.split(',').length).toBe(24)
  })
})

describe('curveArcEasing', () => {
  const liss = (frequencyX: number, frequencyY: number, phase = Math.PI / 2) => ({
    frequencyX, frequencyY, phase,
  })

  it('starts at 0 and ends at 1 across ratios', () => {
    for (const [a, b] of [[3, 2], [5, 4], [7, 6], [8, 5], [1, 1], [1, 2]]) {
      const { lut } = curveArcEasing(liss(a, b))
      expect(lut[0], `${a}:${b}`).toBe(0)
      expect(lut[lut.length - 1], `${a}:${b}`).toBe(1)
      for (const v of lut) expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('is visibly non-linear — the arc has real easing character', () => {
    const { lut } = curveArcEasing(liss(3, 2))
    let maxDev = 0
    for (let i = 0; i < lut.length; i++) {
      maxDev = Math.max(maxDev, Math.abs(lut[i] - i / (lut.length - 1)))
    }
    expect(maxDev).toBeGreaterThan(0.05)
  })

  it('the circle yields the circ family — its quarter arc, not a fallback', () => {
    // top half of the 1:1 circle, halved: e(p) = √(1 − (p−1)²) (circ out)
    const { lut } = curveArcEasing(liss(1, 1))
    for (const p of [0.25, 0.5, 0.75]) {
      expect(evalEase(lut, p)).toBeCloseTo(Math.sqrt(1 - (p - 1) * (p - 1)), 2)
    }
    // reversed = circ in: 1 − √(1 − p²)
    const circIn = lissajousEasing({ ratioX: 1, ratioY: 1, phase: Math.PI / 2, read: 'position', reverse: true })
    expect(evalEase(circIn.lut, 0.5)).toBeCloseTo(1 - Math.sqrt(0.75), 2)
  })

  it('falls back to a sine ease only when even quarters degenerate', () => {
    const { lut, frame } = curveArcEasing({ frequencyX: 1, frequencyY: 2, phase: 0 })
    expect(frame).toBeNull() // 1:2 at phase 0: full and quarter windows all return to start
    expect(evalEase(lut, 0.5)).toBeCloseTo(0.5, 2)
    expect(evalEase(lut, 0.25)).toBeCloseTo((1 - Math.cos(Math.PI * 0.25)) / 2, 2)
  })

  it('exposes the graph frame so the source panel matches the easing', () => {
    // position read: x-projected frame spanning the full sweep
    const pos = curveArcEasing(liss(3, 2))
    expect(pos.frame).not.toBeNull()
    expect(pos.frame!.x0).toBe(-1)
    expect(pos.frame!.x1).toBe(1)
    // velocity read: x-projected quarter-window frame
    const vel = lissajousEasing({ ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity' })
    expect(vel.frame).not.toBeNull()
    expect(Math.abs(vel.frame!.x1 - vel.frame!.x0)).toBeCloseTo(1, 3) // quarter sweep
    // rawLut equals lut when no shaping is applied
    expect([...vel.rawLut]).toEqual([...vel.lut])
    // with shaping they differ but raw stays 0→1
    const shaped = lissajousEasing({
      ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity', strength: 0.5,
    })
    expect([...shaped.rawLut]).not.toEqual([...shaped.lut])
    expect(shaped.rawLut[0]).toBe(0)
    expect(shaped.rawLut[shaped.rawLut.length - 1]).toBe(1)
  })

  it('exposes the arc for the figure highlight, synced with time', () => {
    const arc = curveArcEasing(liss(3, 2))
    expect(arc.arcUnit.length).toBeGreaterThan(50)
    expect(arc.tAtP.length).toBe(arc.lut.length)
    for (const u of arc.arcUnit) {
      expect(Math.abs(u.x)).toBeLessThanOrEqual(1.001)
      expect(Math.abs(u.y)).toBeLessThanOrEqual(1.001)
    }
    // time lookup is monotone: the tracer never runs backwards
    for (let i = 1; i < arc.tAtP.length; i++) {
      expect(arc.tAtP[i]).toBeGreaterThanOrEqual(arc.tAtP[i - 1])
    }
  })

  it('is deterministic', () => {
    const a = curveArcEasing(liss(7, 6))
    const b = curveArcEasing(liss(7, 6))
    expect([...a.lut]).toEqual([...b.lut])
  })

  it('lobes are enumerable and individually selectable', () => {
    const params = { frequencyX: 1, frequencyY: 3, phase: (89 * Math.PI) / 180 }
    const lobes = enumerateLobes(params)
    expect(lobes.length).toBeGreaterThanOrEqual(4)
    // every lobe yields a valid 0→1 easing
    const shapes = new Set<string>()
    for (let i = 0; i < lobes.length; i++) {
      const e = lissajousEasing({ ratioX: 1, ratioY: 3, phase: params.phase, read: 'velocity', lobe: i })
      expect(e.lut[0], `lobe ${i}`).toBe(0)
      expect(e.lut[e.lut.length - 1], `lobe ${i}`).toBe(1)
      shapes.add([0.25, 0.5, 0.75].map((t) => evalEase(e.lut, t).toFixed(2)).join(','))
    }
    expect(shapes.size).toBeGreaterThan(1) // different lobes, different eases
    // -1 / undefined = the auto pick
    const auto = lissajousEasing({ ratioX: 1, ratioY: 3, phase: params.phase, read: 'velocity' })
    const minusOne = lissajousEasing({ ratioX: 1, ratioY: 3, phase: params.phase, read: 'velocity', lobe: -1 })
    expect([...minusOne.lut]).toEqual([...auto.lut])
    // out-of-range index falls back to auto rather than crashing
    const oob = lissajousEasing({ ratioX: 1, ratioY: 3, phase: params.phase, read: 'velocity', lobe: 99 })
    expect([...oob.lut]).toEqual([...auto.lut])
  })

  // an arc that wanders across its own baseline gets |·|-folded into a W.
  // The baseline is the arc's CHORD (the line joining its endpoints), which
  // for a level arc is just y = 0. Staying on one side of it is what makes
  // the speed graph the drawing.
  const straysAcrossChord = (arcUnit: { x: number; y: number }[]) => {
    const p0 = arcUnit[0]
    const p1 = arcUnit[arcUnit.length - 1]
    const dx = p1.x - p0.x || 1e-9
    let sawPos = false
    let sawNeg = false
    for (const p of arcUnit) {
      const s = p.y - (p0.y + ((p1.y - p0.y) * (p.x - p0.x)) / dx)
      if (s > 1e-3) sawPos = true
      if (s < -1e-3) sawNeg = true
    }
    return sawPos && sawNeg
  }

  it('harvested lobes never cross their chord — no |·|-flipped cusps in the speed graph', () => {
    // 1:3 near 90° used to pick an S-arc spanning bottom-to-top; |y| turned
    // it into a W. A lobe must stay on one side of its chord so the graph
    // IS the drawing.
    for (const [rx, ry, ph] of [[1, 3, (89 * Math.PI) / 180], [1, 5, 0.9], [2, 3, 1.2], [1, 7, 0.4]]) {
      const e = lissajousEasing({ ratioX: rx, ratioY: ry, phase: ph, read: 'velocity' })
      const s = e.speed!
      // no interior cusp: speed must not return to ~0 between its ends
      let interiorMin = Infinity
      for (let i = Math.floor(s.length * 0.12); i < s.length * 0.88; i++) {
        interiorMin = Math.min(interiorMin, s[i])
      }
      expect(interiorMin, `${rx}:${ry}@${ph}`).toBeGreaterThan(0.05)
      expect(straysAcrossChord(e.arcUnit), `${rx}:${ry}@${ph} crosses its chord`).toBe(false)
    }
  })

  it('lobes are cut at the figure\'s self-intersections', () => {
    // the classic bowtie crosses itself at the origin, t = π/2 and 3π/2
    const classic = figureCrossings({ frequencyX: 1, frequencyY: 2, phase: Math.PI / 2 })
    expect(classic.length).toBe(2)
    for (const t of classic) {
      expect(Math.abs(Math.sin(t + Math.PI / 2))).toBeLessThan(1e-6) // x = 0
      expect(Math.abs(Math.sin(2 * t))).toBeLessThan(1e-6) // y = 0
    }
    // the Meta mark's crossing rides ABOVE y = 0 — the old y-zero cut missed
    // it and left a gap between neighbouring lobes
    const meta = figureCrossings({ frequencyX: 1, frequencyY: 2, phase: META_PHASE, shape: META_SHAPE })
    expect(meta.length).toBe(2)
    for (const t of meta) {
      expect(Math.abs(Math.sin(t + META_PHASE))).toBeLessThan(1e-4) // still x = 0
      expect(shapeY(META_SHAPE, 2 * t)).toBeGreaterThan(0.3) // but well above y = 0
    }
    // every lobe ends ON a cut, and consecutive lobes share it: no gaps
    for (const params of [
      { frequencyX: 1, frequencyY: 2, phase: Math.PI / 2 },
      { frequencyX: 1, frequencyY: 2, phase: META_PHASE, shape: META_SHAPE },
    ]) {
      const lobes = enumerateLobes(params)
      expect(lobes.length).toBe(4)
      const pt = (t: number) => [
        Math.sin(params.frequencyX * t + params.phase),
        shapeY(params.shape, params.frequencyY * t),
      ]
      // walking the lobes left→right, each one's endpoints land on either a
      // crossing or a cap (|x| = 1) — never mid-curve
      const crossings = figureCrossings(params)
      const onCut = (t: number) => {
        const [x] = pt(t)
        if (Math.abs(Math.abs(x) - 1) < 1e-3) return true // a cap
        return crossings.some((c) => {
          const d = Math.abs(((t - c) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
          return d < 1e-3 || Math.abs(d - Math.PI * 2) < 1e-3
        })
      }
      for (const l of lobes) {
        expect(onCut(l.t0), `t0 ${l.t0}`).toBe(true)
        expect(onCut(l.t1), `t1 ${l.t1}`).toBe(true)
      }
    }
  })

  it('a retraced figure has no isolated crossing (and keeps its old lobes)', () => {
    // 1:1 at phase 0 is the line y = x, drawn twice: every point is shared,
    // none is a crossing. Float noise must not manufacture cuts here.
    expect(figureCrossings({ frequencyX: 1, frequencyY: 1, phase: 0 })).toEqual([])
    // so the line's top half still reads as the quadratic ease-in
    const quadIn = lissajousEasing({ ratioX: 1, ratioY: 1, phase: 0, read: 'velocity' })
    for (const p of [0.25, 0.5, 0.75]) expect(evalEase(quadIn.lut, p)).toBeCloseTo(p * p, 2)
  })

  it('ease presets carry no treatment: the arc IS what plays', () => {
    for (const preset of MOTION_PRESETS) {
      if (preset.id === 'bounce' || preset.id === 'spring') {
        // springs are DEFINED by decay (they settle instead of returning);
        // the UI discloses it: dashed raw arc + legend
        expect(preset.decay ?? 0, preset.id).toBeGreaterThan(0)
        expect(preset.strength ?? 0, preset.id).toBe(0)
        continue
      }
      const e = lissajousEasing(preset)
      expect([...e.lut], preset.id).toEqual([...e.rawLut])
      if (e.speed && e.rawSpeed) {
        expect([...e.speed], preset.id).toEqual([...e.rawSpeed])
      }
    }
  })

  it('every motion preset, token, and library card yields a valid 0→1 easing', () => {
    const all = [
      ...MOTION_PRESETS,
      ...MOTION_TOKENS,
      // the figure-derived wall, across a few very different figures
      ...figureLibrary(1, 2, Math.PI / 2).flatMap((row) => row.variants),
      ...figureLibrary(1, 1, Math.PI / 2).flatMap((row) => row.variants),
      ...figureLibrary(1, 3, 0).flatMap((row) => row.variants),
      ...figureLibrary(5, 3, (89 * Math.PI) / 180, 5).flatMap((row) => row.variants),
    ]
    for (const p of all) {
      const { lut } = lissajousEasing(p)
      expect(lut[0], p.id).toBe(0)
      expect(lut[lut.length - 1], p.id).toBe(1)
      for (const v of lut) expect(Number.isFinite(v), p.id).toBe(true)
    }
  })

  it('the library is derived from the figure it shows', () => {
    // 1:2@90: arches dedupe to the two distinct lobes, no VALUE row
    // (its position read is degenerate)
    const bowtie = figureLibrary(1, 2, Math.PI / 2)
    const families = bowtie.map((r) => r.family)
    expect(families).toContain('ARCHES')
    expect(families).toContain('RAMPS')
    expect(families).toContain('PUSH')
    expect(families).not.toContain('VALUE')
    const arches = bowtie.find((r) => r.family === 'ARCHES')!.variants
    expect(arches.length).toBe(2)
    // every card is THIS figure — same ratio and phase throughout
    for (const row of bowtie) {
      for (const v of row.variants) {
        expect(v.ratioX, v.id).toBe(1)
        expect(v.ratioY, v.id).toBe(2)
        expect(v.phase, v.id).toBeCloseTo(Math.PI / 2, 12)
      }
    }

    // the circle: VALUE row present (circ family), no SETTLED (monotone)
    const circle = figureLibrary(1, 1, Math.PI / 2)
    const circleValue = circle.find((r) => r.family === 'VALUE')
    expect(circleValue).toBeDefined()
    expect(circleValue!.variants.some((v) => v.id === 'value-settled')).toBe(false)

    // 1:3: value read swings past the target → SETTLED spring card appears
    const wave = figureLibrary(1, 3, 0)
    const waveValue = wave.find((r) => r.family === 'VALUE')
    expect(waveValue).toBeDefined()
    const settled = waveValue!.variants.find((v) => v.id === 'value-settled')
    expect(settled).toBeDefined()
    expect(settled!.decay ?? 0).toBeGreaterThan(0)
  })

  it('library pushes actually escalate on the picked arch', () => {
    const rows = figureLibrary(1, 2, Math.PI / 2)
    // PUSH cards derive from the picked arch (auto here) — compare to it raw
    const raw = lissajousEasing({ ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity' }).lut
    const pushes = rows.find((r) => r.family === 'PUSH')!.variants.map((v) => lissajousEasing(v).lut)
    const maxDev = (a: Float32Array, b: Float32Array) => {
      let dev = 0
      for (let i = 0; i < a.length; i++) dev = Math.max(dev, Math.abs(a[i] - b[i]))
      return dev
    }
    expect(maxDev(pushes[0], raw)).toBeGreaterThan(0.01)
    expect(maxDev(pushes[1], raw)).toBeGreaterThan(maxDev(pushes[0], raw))
  })

  it('velocity read of the 1:2 arch is an eased speed bump', () => {
    const arch = lissajousEasing({ ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity' })
    // speed graph: near zero at the ends, full peak between — the AE bump
    // (the Lissajous arch is asymmetric; that skew is the family's character)
    expect(arch.speed![0]).toBeLessThan(0.08)
    expect(arch.speed![arch.speed!.length - 1]).toBeLessThan(0.08)
    expect(Math.max(...arch.speed!)).toBeCloseTo(1, 5)
    // position: monotone, slow at both ends
    for (let i = 1; i < arch.lut.length; i++) {
      expect(arch.lut[i]).toBeGreaterThanOrEqual(arch.lut[i - 1] - 1e-6)
    }
    expect(evalEase(arch.lut, 0.1)).toBeLessThan(0.12)
    expect(evalEase(arch.lut, 0.9)).toBeGreaterThan(0.9)
    const mid = evalEase(arch.lut, 0.5)
    expect(mid).toBeGreaterThan(0.2)
    expect(mid).toBeLessThan(0.7)
  })

  it('enter decelerates, exit accelerates, and both land on time', () => {
    const enter = lissajousEasing(MOTION_TOKENS.find((t) => t.id === 'enter')!)
    const exit = lissajousEasing(MOTION_TOKENS.find((t) => t.id === 'exit')!)
    // enter: speed falls over time → position covers most ground early
    expect(evalEase(enter.lut, 0.4)).toBeGreaterThan(0.5)
    // exit: speed rises over time → position covers most ground late
    expect(evalEase(exit.lut, 0.6)).toBeLessThan(0.5)
    // both span the full duration: leave at 0, arrive at 1
    expect(enter.lut[0]).toBe(0)
    expect(exit.lut[0]).toBe(0)
    expect(enter.lut[enter.lut.length - 1]).toBe(1)
    expect(exit.lut[exit.lut.length - 1]).toBe(1)
    // roughly opposite in the interior — no longer an exact time-mirror
    // because the decelerating (enter) end has its frozen tail trimmed so
    // it lands at t=1 instead of arriving early and parking
    expect(Math.abs(evalEase(enter.lut, 0.3) - (1 - evalEase(exit.lut, 0.7)))).toBeLessThan(0.06)
  })

  it('the speed curve IS the lobe as drawn — top-half arcs, no flips', () => {
    // 1:1 at phase 0 harvests the line's top half read left→right:
    // speed = p, so forward is the quadratic ease-in p²
    const quadIn = lissajousEasing({ ratioX: 1, ratioY: 1, phase: 0, read: 'velocity' })
    for (const p of [0.25, 0.5, 0.75]) {
      expect(evalEase(quadIn.lut, p)).toBeCloseTo(p * p, 2)
    }
    const quadOut = lissajousEasing({ ratioX: 1, ratioY: 1, phase: 0, read: 'velocity', reverse: true })
    for (const p of [0.25, 0.5, 0.75]) {
      expect(evalEase(quadOut.lut, p)).toBeCloseTo(2 * p - p * p, 2)
    }

    // the circle's top arch, FALL side: speed(p) = √(1−p²) — high at the
    // left, cliff at the right, exactly the marked arc
    const circleOut = lissajousEasing({ ratioX: 1, ratioY: 1, phase: Math.PI / 2, read: 'velocity', half: 'fall' })
    for (const p of [0.2, 0.5, 0.8]) {
      expect(evalEase(circleOut.speed!, p)).toBeCloseTo(Math.sqrt(1 - p * p), 2)
    }
    // RISE side: the mirror ramp √(2p−p²)
    const circleIn = lissajousEasing({ ratioX: 1, ratioY: 1, phase: Math.PI / 2, read: 'velocity', half: 'rise' })
    for (const p of [0.2, 0.5, 0.8]) {
      expect(evalEase(circleIn.speed!, p)).toBeCloseTo(Math.sqrt(2 * p - p * p), 2)
    }
    // no half: the WHOLE arch — both sides of the semicircle as drawn:
    // speed(p) = √(1−(2p−1)²)
    const semi = lissajousEasing({ ratioX: 1, ratioY: 1, phase: Math.PI / 2, read: 'velocity' })
    for (const p of [0.2, 0.5, 0.8]) {
      expect(evalEase(semi.speed!, p)).toBeCloseTo(Math.sqrt(1 - (2 * p - 1) ** 2), 2)
    }

    // the 1:2 top arch as drawn: speed(p) = 2p√(1−p²), peak right of
    // center at 1/√2 — the lobe's own skew
    const arch = lissajousEasing({ ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity' })
    let peakAt = 0
    let peakV = 0
    for (let i = 0; i < arch.speed!.length; i++) {
      if (arch.speed![i] > peakV) {
        peakV = arch.speed![i]
        peakAt = i / (arch.speed!.length - 1)
      }
    }
    expect(peakAt).toBeGreaterThan(0.6)
    expect(peakAt).toBeLessThan(0.8) // ≈ 1/√2 ≈ 0.71
    for (const p of [0.2, 0.4, 0.6, 0.8]) {
      const analytic = 2 * p * Math.sqrt(1 - p * p)
      expect(evalEase(arch.speed!, p)).toBeCloseTo(analytic, 2)
    }
  })

  it('strength concentrates travel — stronger ease at the ends', () => {
    const raw = lissajousEasing({ ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity' })
    const strong = lissajousEasing({
      ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity', strength: 0.6,
    })
    expect(evalEase(strong.lut, 0.1)).toBeLessThan(evalEase(raw.lut, 0.1))
    expect(evalEase(strong.lut, 0.9)).toBeGreaterThan(evalEase(raw.lut, 0.9))
    expect(strong.lut[0]).toBe(0)
    expect(strong.lut[strong.lut.length - 1]).toBe(1)
  })

  it('strong 1:2@90 velocity read yields crawl-whip-settle footprints', () => {
    const raw = lissajousEasing({ ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity' })
    const strong = lissajousEasing({
      ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity', strength: 0.8,
    })

    const mean = (arr: Float32Array) => arr.reduce((sum, v) => sum + v, 0) / arr.length
    const peakOverMean = (arr: Float32Array) => Math.max(...arr) / Math.max(1e-6, mean(arr))
    expect(peakOverMean(strong.speed!)).toBeGreaterThan(peakOverMean(raw.speed!) * 1.9)

    const markCount = 109
    const marks = Array.from({ length: markCount }, (_, i) => evalEase(strong.lut, i / (markCount - 1)))
    const gaps = marks.slice(1).map((v, i) => v - marks[i])
    const minGap = Math.min(...gaps)
    const maxGap = Math.max(...gaps)
    expect(maxGap / Math.max(minGap, 1e-6)).toBeGreaterThan(10)

    for (let i = 1; i < strong.lut.length; i++) {
      expect(strong.lut[i]).toBeGreaterThanOrEqual(strong.lut[i - 1] - 1e-6)
    }
    expect(strong.lut[strong.lut.length - 1]).toBe(1)
  })

  it('decay makes bounce settle — no full return to the start', () => {
    // raw 1:3 swings all the way back to 0 mid-flight; decayed must not
    const raw = lissajousEasing({ ratioX: 1, ratioY: 3, phase: 0, read: 'position' })
    const bounce = lissajousEasing({ ratioX: 1, ratioY: 3, phase: 0, read: 'position', decay: 0.55 })
    const minAfter = (lut: Float32Array, from: number) => {
      let min = Infinity
      for (let i = Math.floor(from * lut.length); i < lut.length; i++) min = Math.min(min, lut[i])
      return min
    }
    expect(minAfter(raw.lut, 0.4)).toBeLessThan(0.1) // the broken full return
    expect(minAfter(bounce.lut, 0.4)).toBeGreaterThan(0.6) // settles near target
    expect(bounce.lut[bounce.lut.length - 1]).toBe(1)
  })

  it('figure design space: smooth warps, Meta is one point', () => {
    const S = (p: Partial<Parameters<typeof shapeY>[0] & object>) =>
      ({ waist: 0, fullness: 0, bias: 0, lean: 0, cross: 0, morph: 0, ...p })
    // neutral shape IS the sine — the classic figure is a point in the space
    for (const u of [0.3, 1.1, 2.7, 4.4]) {
      expect(shapeY(S({}), u)).toBeCloseTo(Math.sin(u), 12)
    }
    // cross-free, morph-free shapes keep zeros exactly at u = mπ and the
    // caps (u = 2πk) pinned at zero; every shape stays near unit amplitude
    const shapes = [
      S({ waist: 1 }),
      S({ fullness: 1 }),
      S({ waist: 0.4, fullness: 0.7, bias: 0.8 }),
      S({ bias: -0.6, lean: 0.7 }),
      META_SHAPE,
    ]
    for (const s of shapes) {
      if (!(s.morph ?? 0)) {
        expect(Math.abs(shapeY(s, 0))).toBeLessThan(1e-9) // cap
        if (!s.cross) expect(Math.abs(shapeY(s, Math.PI))).toBeLessThan(1e-9)
      }
      let peak = 0
      for (let i = 0; i <= 2000; i++) peak = Math.max(peak, Math.abs(shapeY(s, (i / 2000) * Math.PI * 2)))
      expect(peak).toBeGreaterThan(0.9)
      expect(peak).toBeLessThanOrEqual(1.13)
    }
    // the Meta profile carries the mark's raised crossing, and MORPH blends
    // to it linearly from the sine
    expect(shapeY(META_SHAPE, 0)).toBeGreaterThan(0.15)
    for (const u of [0.4, 1.3, 2.9, 4.1, 5.6]) {
      const mid = (shapeY(S({}), u) + shapeY(META_SHAPE, u)) / 2
      expect(shapeY(S({ morph: 0.5 }), u)).toBeCloseTo(mid, 12)
    }
    // cross lifts the crossing while the caps stay put
    expect(shapeY(S({ cross: -0.98 }), Math.PI)).toBeLessThan(-0.3)
    expect(Math.abs(shapeY(S({ cross: -0.98 }), 0))).toBeLessThan(1e-9)
    // waist narrows the crossover: steeper slope through the zero
    const slope = (s: Parameters<typeof shapeY>[0]) => (shapeY(s, 0.02) - shapeY(s, -0.02)) / 0.04
    expect(slope(S({ waist: 0.8 }))).toBeGreaterThan(slope(S({})) * 1.5)
    // fullness flattens the arcs: more of the lobe near peak height
    const nearPeak = (s: Parameters<typeof shapeY>[0]) => {
      let n = 0
      for (let i = 0; i <= 400; i++) if (shapeY(s, (i / 400) * Math.PI) > 0.9) n++
      return n
    }
    expect(nearPeak(S({ fullness: 0.9 }))).toBeGreaterThan(nearPeak(S({})) * 1.5)

    // the whole machinery works at the META point (its fitted phase):
    // lobes enumerable and selectable, every one a valid 0→1 easing
    const params = { frequencyX: 1, frequencyY: 2, phase: META_PHASE, shape: META_SHAPE }
    const lobes = enumerateLobes(params)
    expect(lobes.length).toBeGreaterThanOrEqual(3)
    const luts = new Set<string>()
    for (let i = 0; i < lobes.length; i++) {
      const e = lissajousEasing({ ratioX: 1, ratioY: 2, phase: params.phase, read: 'velocity', shape: META_SHAPE, lobe: i })
      expect(e.lut[0], `lobe ${i}`).toBe(0)
      expect(e.lut[e.lut.length - 1], `lobe ${i}`).toBe(1)
      luts.add([0.25, 0.5, 0.75].map((t) => evalEase(e.lut, t).toFixed(2)).join(','))
    }
    expect(luts.size).toBeGreaterThan(1)
    // the marked arc stays on one side of its chord — never |·|-flips. (The
    // Meta lobe runs from a crossing ABOVE y = 0 to a cap BELOW it, so raw y
    // does change sign; the chord is the baseline that matters.)
    const auto = lissajousEasing({ ratioX: 1, ratioY: 2, phase: params.phase, read: 'velocity', shape: META_SHAPE })
    expect(straysAcrossChord(auto.arcUnit)).toBe(false)
    let interiorMin = Infinity
    for (let i = Math.floor(auto.speed!.length * 0.12); i < auto.speed!.length * 0.88; i++) {
      interiorMin = Math.min(interiorMin, auto.speed![i])
    }
    expect(interiorMin).toBeGreaterThan(0.05)
    const rise = lissajousEasing({ ratioX: 1, ratioY: 2, phase: params.phase, read: 'velocity', shape: META_SHAPE, half: 'rise' })
    expect(rise.lut[0]).toBe(0)
    expect(rise.lut[rise.lut.length - 1]).toBe(1)

    // parameter continuity: a small shape step moves the speed curve a little
    const a = lissajousEasing({ ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity', shape: S({ waist: 0.5, fullness: 0.3 }) })
    const b2 = lissajousEasing({ ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity', shape: S({ waist: 0.52, fullness: 0.3 }) })
    let maxD = 0
    for (let i = 0; i < a.lut.length; i++) maxD = Math.max(maxD, Math.abs(a.lut[i] - b2.lut[i]))
    expect(maxD).toBeLessThan(0.02)
    // ...including along the morph axis toward the Meta point
    const m1 = lissajousEasing({ ratioX: 1, ratioY: 2, phase: META_PHASE, read: 'velocity', shape: S({ morph: 0.5 }) })
    const m2 = lissajousEasing({ ratioX: 1, ratioY: 2, phase: META_PHASE, read: 'velocity', shape: S({ morph: 0.52 }) })
    let maxM = 0
    for (let i = 0; i < m1.lut.length; i++) maxM = Math.max(maxM, Math.abs(m1.lut[i] - m2.lut[i]))
    expect(maxM).toBeLessThan(0.02)
  })

  it('spring preset oscillates but converges', () => {
    const spring = lissajousEasing(MOTION_PRESETS.find((p) => p.id === 'spring')!)
    let swings = 0
    let dir = 0
    for (let i = 1; i < spring.lut.length; i++) {
      const d = Math.sign(spring.lut[i] - spring.lut[i - 1])
      if (d !== 0 && d !== dir) {
        if (dir !== 0) swings++
        dir = d
      }
    }
    expect(swings).toBeGreaterThanOrEqual(2) // still springy
    // late swings are small — it converges
    let lateDev = 0
    for (let i = Math.floor(spring.lut.length * 0.75); i < spring.lut.length; i++) {
      lateDev = Math.max(lateDev, Math.abs(spring.lut[i] - 1))
    }
    expect(lateDev).toBeLessThan(0.25)
  })

  it('exports a complete CSS motion system', () => {
    const css = cssMotionSystem(1100)
    expect(css).toContain('--ease-standard: linear(')
    expect(css).toContain('--ease-enter: linear(')
    expect(css).toContain('--ease-exit: linear(')
    expect(css).toContain('--ease-emphasis: linear(')
    expect(css).toContain('--duration-base: 1100ms')
    expect(css.startsWith(':root {')).toBe(true)
    expect(css.endsWith('}')).toBe(true)
  })

  it('the preset family spans linear → springy', () => {
    const linear = curveArcEasing({ frequencyX: 1, frequencyY: 1, phase: 0 }).lut
    expect(evalEase(linear, 0.5)).toBeCloseTo(0.5, 2)
    let maxDevLinear = 0
    for (let i = 0; i < linear.length; i++) {
      maxDevLinear = Math.max(maxDevLinear, Math.abs(linear[i] - i / (linear.length - 1)))
    }
    expect(maxDevLinear).toBeLessThan(0.02)

    // elastic member swings past/back before landing
    const elastic = curveArcEasing({ frequencyX: 1, frequencyY: 5, phase: 0 }).lut
    let swings = 0
    let dir = 0
    for (let i = 1; i < elastic.length; i++) {
      const d = Math.sign(elastic[i] - elastic[i - 1])
      if (d !== 0 && d !== dir) {
        if (dir !== 0) swings++
        dir = d
      }
    }
    expect(swings).toBeGreaterThanOrEqual(2)
  })
})

describe('arc length + path shapes', () => {
  it('parameterizes the curve by distance, monotone and closed', () => {
    const project = createDefaultProject()
    const samples = samplePathShape('system', project.lissajous, 1200, 1600)
    const arc = buildArcLUT(samples)
    expect(arc.total).toBeGreaterThan(1000)
    const a = arc.posAt(0)
    const b = arc.posAt(arc.total)
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(20) // closed loop
    // quarter points are distinct
    const q1 = arc.posAt(arc.total * 0.25)
    const q2 = arc.posAt(arc.total * 0.5)
    expect(Math.hypot(q1.x - q2.x, q1.y - q2.y)).toBeGreaterThan(50)
  })

  it('circle shape is actually circular', () => {
    const project = createDefaultProject()
    const samples = samplePathShape('circle', project.lissajous, 1200, 1600)
    const cx = 600
    const cy = 800
    const radii = samples.map((s) => Math.hypot(s.x - cx, s.y - cy))
    const min = Math.min(...radii)
    const max = Math.max(...radii)
    expect((max - min) / max).toBeLessThan(0.01)
  })
})
