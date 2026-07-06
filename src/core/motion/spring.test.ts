import { describe, expect, it } from 'vitest'
import { buildArcLUT } from './arcLength'
import { curveArcEasing, evalEase, overshootOf, springLUT, toCssLinear, velocityOf } from './spring'
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

  it('falls back to a sine ease for degenerate symmetric figures', () => {
    const { lut } = curveArcEasing(liss(1, 1)) // circle: every x-window is symmetric
    expect(evalEase(lut, 0.5)).toBeCloseTo(0.5, 2)
    expect(evalEase(lut, 0.25)).toBeCloseTo((1 - Math.cos(Math.PI * 0.25)) / 2, 2)
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
