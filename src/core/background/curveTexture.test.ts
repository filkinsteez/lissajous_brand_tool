import { describe, expect, it } from 'vitest'
import { sampleCurve } from '@/core/lissajous/sampler'
import { createDefaultProject } from '@/core/state/defaults'
import { buildCurveKnotTextureData, resampleEqualArcKnots } from './curveTexture'

describe('curve texture prep', () => {
  it('resamples deterministic equal-arc knot count', () => {
    const project = createDefaultProject(11)
    const samples = sampleCurve(project.lissajous, project.artboard.width, project.artboard.height, 1024)
    const knots = resampleEqualArcKnots(samples, 256)
    expect(knots.length).toBe(256)
    expect(knots[0].arcNorm).toBe(0)
    expect(knots[255].arcNorm).toBe(1)
    for (let i = 1; i < knots.length; i++) {
      expect(knots[i].arcNorm).toBeGreaterThan(knots[i - 1].arcNorm)
    }
  })

  it('packs knot payload into RGBA16F-compatible buffers', () => {
    const project = createDefaultProject(19)
    const samples = sampleCurve(project.lissajous, project.artboard.width, project.artboard.height, 512)
    const tex = buildCurveKnotTextureData(samples, 128)
    expect(tex.width).toBe(128)
    expect(tex.height).toBe(1)
    expect(tex.floatData.length).toBe(128 * 4)
    expect(tex.halfData.length).toBe(tex.floatData.length)
    expect(tex.floatData[3]).toBe(1)
  })
})
