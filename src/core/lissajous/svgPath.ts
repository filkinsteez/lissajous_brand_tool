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
