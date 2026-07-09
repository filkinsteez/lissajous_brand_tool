import { describe, expect, it } from 'vitest'
import { buildArcLUT } from './arcLength'
import {
  cssMotionSystem,
  curveArcEasing,
  enumerateLobes,
  evalEase,
  figureLibrary,
  lissajousEasing,
  MOTION_PRESETS,
  MOTION_TOKENS,
  overshootOf,
  springLUT,
  toCssLinear,
  velocityOf,
  waveY,
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

  it('harvested lobes never cross zero — no |·|-flipped cusps in the speed graph', () => {
    // 1:3 near 90° used to pick an S-arc spanning bottom-to-top; |y| turned
    // it into a W. Lobes must keep one sign so the graph IS the drawing.
    for (const [rx, ry, ph] of [[1, 3, (89 * Math.PI) / 180], [1, 5, 0.9], [2, 3, 1.2], [1, 7, 0.4]]) {
      const e = lissajousEasing({ ratioX: rx, ratioY: ry, phase: ph, read: 'velocity' })
      const s = e.speed!
      // no interior cusp: speed must not return to ~0 between its ends
      let interiorMin = Infinity
      for (let i = Math.floor(s.length * 0.12); i < s.length * 0.88; i++) {
        interiorMin = Math.min(interiorMin, s[i])
      }
      expect(interiorMin, `${rx}:${ry}@${ph}`).toBeGreaterThan(0.05)
      // and the signed y over the chosen window keeps one sign
      let sawPos = false
      let sawNeg = false
      for (let i = 0; i < e.tAtP.length; i++) {
        const y = Math.sin(ry * e.tAtP[i])
        if (y > 1e-3) sawPos = true
        if (y < -1e-3) sawNeg = true
      }
      expect(sawPos && sawNeg, `${rx}:${ry}@${ph} crosses zero`).toBe(false)
    }
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

  it('meta wave: the Meta infinity is a first-class figure', () => {
    // shape invariants (reference: public/icon-fill.svg) — lobe tops at +1,
    // bottoms at −1, crossing dropped to −0.4 (the M notch)
    expect(waveY('meta', Math.PI / 2)).toBeCloseTo(1, 6)
    expect(waveY('meta', (3 * Math.PI) / 2)).toBeCloseTo(-1, 6)
    expect(waveY('meta', 0)).toBeCloseTo(-0.4, 6)
    expect(waveY('meta', Math.PI)).toBeCloseTo(-0.4, 6)
    // sine untouched
    expect(waveY('sine', Math.PI / 2)).toBeCloseTo(1, 12)

    // same machinery as the classic figure: lobes enumerable, selectable,
    // every one a valid 0→1 easing, and cuts land on true zero crossings
    const params = { frequencyX: 1, frequencyY: 2, phase: Math.PI / 2, wave: 'meta' as const }
    const lobes = enumerateLobes(params)
    expect(lobes.length).toBeGreaterThanOrEqual(4)
    const shapes = new Set<string>()
    for (let i = 0; i < lobes.length; i++) {
      const e = lissajousEasing({ ratioX: 1, ratioY: 2, phase: params.phase, read: 'velocity', wave: 'meta', lobe: i })
      expect(e.lut[0], `lobe ${i}`).toBe(0)
      expect(e.lut[e.lut.length - 1], `lobe ${i}`).toBe(1)
      shapes.add([0.25, 0.5, 0.75].map((t) => evalEase(e.lut, t).toFixed(2)).join(','))
    }
    expect(shapes.size).toBeGreaterThan(1)
    // interior cuts sit on genuine zeros of the meta wave
    for (const { t0, t1 } of lobes) {
      for (const edge of [t0, t1]) {
        const y = waveY('meta', 2 * edge)
        const x = Math.sin(edge + Math.PI / 2)
        // an edge is either a wave zero or the window's x-extreme
        expect(Math.abs(y) < 1e-6 || Math.abs(Math.abs(x) - 1) < 1e-6, `edge ${edge}`).toBe(true)
      }
    }
    // lobes keep one sign — the marked arc never |·|-flips
    const auto = lissajousEasing({ ratioX: 1, ratioY: 2, phase: params.phase, read: 'velocity', wave: 'meta' })
    let sawPos = false
    let sawNeg = false
    for (let i = 0; i < auto.tAtP.length; i++) {
      const y = waveY('meta', 2 * auto.tAtP[i])
      if (y > 1e-3) sawPos = true
      if (y < -1e-3) sawNeg = true
    }
    expect(sawPos && sawNeg).toBe(false)
    // strength and half still apply on the meta figure
    const strong = lissajousEasing({ ratioX: 1, ratioY: 2, phase: params.phase, read: 'velocity', wave: 'meta', strength: 0.6 })
    expect([...strong.lut]).not.toEqual([...auto.lut])
    const rise = lissajousEasing({ ratioX: 1, ratioY: 2, phase: params.phase, read: 'velocity', wave: 'meta', half: 'rise' })
    expect(rise.lut[0]).toBe(0)
    expect(rise.lut[rise.lut.length - 1]).toBe(1)
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
