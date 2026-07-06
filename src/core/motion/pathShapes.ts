import type { LissajousState, PathShape } from '@/core/state/types'
import { sampleCurve, type CurveSample } from '@/core/lissajous/sampler'

// Simplified members of the Lissajous family for text-on-path work:
// circle and oval are 1:1 at 90° phase, the figure eight is 2:1 — the
// system curve is whatever the SYSTEM panel currently holds.
export function samplePathShape(
  shape: PathShape,
  liss: LissajousState,
  w: number,
  h: number,
  count = 720,
): CurveSample[] {
  const base: LissajousState = {
    ...liss,
    rotation: 0,
    offsetX: 0,
    offsetY: 0,
    sampleDensity: count,
  }
  switch (shape) {
    case 'circle': {
      const amp = (0.78 * Math.min(w, h)) / Math.max(w, h)
      return sampleCurve(
        { ...base, frequencyX: 1, frequencyY: 1, phase: Math.PI / 2,
          amplitudeX: w < h ? 0.78 : amp, amplitudeY: h < w ? 0.78 : amp },
        w, h, count,
      )
    }
    case 'oval':
      return sampleCurve(
        { ...base, frequencyX: 1, frequencyY: 1, phase: Math.PI / 2, amplitudeX: 0.82, amplitudeY: 0.52 },
        w, h, count,
      )
    case 'eight':
      return sampleCurve(
        { ...base, frequencyX: 2, frequencyY: 1, phase: Math.PI / 2, amplitudeX: 0.82, amplitudeY: 0.6 },
        w, h, count,
      )
    case 'system':
      return sampleCurve({ ...liss, sampleDensity: count }, w, h, count)
  }
}
