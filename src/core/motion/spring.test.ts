import { describe, expect, it } from 'vitest'
import { buildArcLUT } from './arcLength'
import { evalEase, overshootOf, springLUT, toCssLinear, velocityOf } from './spring'
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
