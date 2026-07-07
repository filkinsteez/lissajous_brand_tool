import type { CurveSample } from './sampler'

// Sampled curve → SVG path data, decimated to keep the DOM light.
export function samplesToPathD(samples: CurveSample[], maxPoints = 900, close = true): string {
  const step = Math.max(1, Math.floor((samples.length - 1) / maxPoints))
  let d = `M ${samples[0].x.toFixed(1)} ${samples[0].y.toFixed(1)}`
  for (let i = step; i < samples.length; i += step) {
    d += ` L ${samples[i].x.toFixed(1)} ${samples[i].y.toFixed(1)}`
  }
  return close ? d + ' Z' : d
}

// The loop traced TWICE as one open path. textPath can't take a negative
// startOffset (Chrome clamps to 0), so a marquee over a closed loop needs
// the path itself to carry a second revolution for text to run into.
export function samplesToDoubledPathD(samples: CurveSample[], maxPoints = 900): string {
  const step = Math.max(1, Math.floor((samples.length - 1) / maxPoints))
  let d = `M ${samples[0].x.toFixed(1)} ${samples[0].y.toFixed(1)}`
  for (let rev = 0; rev < 2; rev++) {
    for (let i = step; i < samples.length; i += step) {
      d += ` L ${samples[i].x.toFixed(1)} ${samples[i].y.toFixed(1)}`
    }
  }
  return d
}

// The doubled loop as smooth cubic Béziers (Catmull-Rom through the
// samples). On a polyline track, textPath glyphs snap their rotation at
// every vertex — a visible jiggle where curvature is high. A C¹ track
// turns them continuously.
export function samplesToSmoothDoubledPathD(samples: CurveSample[], knots = 512): string {
  const ring: { x: number; y: number }[] = []
  const last = samples.length - 1 // samples[last] duplicates samples[0]
  const step = Math.max(1, Math.floor(last / knots))
  for (let i = 0; i < last; i += step) ring.push(samples[i])
  const n = ring.length
  const at = (i: number) => ring[((i % n) + n) % n]
  let d = `M ${at(0).x.toFixed(2)} ${at(0).y.toFixed(2)}`
  for (let rev = 0; rev < 2; rev++) {
    for (let i = 0; i < n; i++) {
      const p0 = at(i - 1)
      const p1 = at(i)
      const p2 = at(i + 1)
      const p3 = at(i + 2)
      const c1x = p1.x + (p2.x - p0.x) / 6
      const c1y = p1.y + (p2.y - p0.y) / 6
      const c2x = p2.x - (p3.x - p1.x) / 6
      const c2y = p2.y - (p3.y - p1.y) / 6
      d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
    }
  }
  return d
}
