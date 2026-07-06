// The motion system's easing family is a damped harmonic oscillator:
//   x'' = -ω²(x - 1) - 2ζω x'
// The Lissajous curve is an undamped 2D oscillator; this is its damped 1D
// sibling — one sine family drives both the structure and the motion.
// ζ ≥ 1 gives smooth eases, ζ < 1 overshoots into spring/bounce territory.

export type SpringParams = {
  stiffness: number // ω (rad/s)
  damping: number // ζ
  initialVelocity: number // in target-distances per second, normalized
}

export type MotionPreset = { id: string; label: string; params: SpringParams }

export const MOTION_PRESETS: MotionPreset[] = [
  { id: 'linear', label: 'LINEAR', params: { stiffness: 0, damping: 1, initialVelocity: 0 } },
  { id: 'ease', label: 'EASE', params: { stiffness: 14, damping: 1.15, initialVelocity: 0 } },
  { id: 'soft', label: 'SOFT SPRING', params: { stiffness: 12, damping: 0.65, initialVelocity: 0 } },
  { id: 'bounce', label: 'BOUNCE', params: { stiffness: 18, damping: 0.32, initialVelocity: 0 } },
  { id: 'snap', label: 'SNAP', params: { stiffness: 34, damping: 0.9, initialVelocity: 0.5 } },
]

export const LUT_SIZE = 240

// Simulate to settle, then resample onto a fixed-size LUT over
// normalized time [0, 1]. stiffness <= 0 is the LINEAR bypass.
export function springLUT(params: SpringParams, size = LUT_SIZE): Float32Array {
  const lut = new Float32Array(size)
  const omega = params.stiffness

  if (omega <= 0) {
    for (let i = 0; i < size; i++) lut[i] = i / (size - 1)
    return lut
  }

  const zeta = Math.max(0.05, params.damping)
  // settle time from the SLOWEST decay rate: ζω when underdamped, the slow
  // pole ω(ζ − √(ζ²−1)) when overdamped. 7 ≈ ln(100) plus headroom for the
  // (1 + ωt) polynomial factor at critical damping.
  const slowRate = omega * (zeta - Math.sqrt(Math.max(0, zeta * zeta - 1)))
  const settleT = Math.min(10, Math.max(0.15, 7 / Math.max(0.01, slowRate)))

  const steps = 4096
  const dt = settleT / steps
  const xs = new Float64Array(steps + 1)
  let x = 0
  let v = params.initialVelocity * omega // scale velocity to the system
  xs[0] = 0
  for (let i = 1; i <= steps; i++) {
    // semi-implicit Euler — stable for stiff springs at this dt
    const a = -omega * omega * (x - 1) - 2 * zeta * omega * v
    v += a * dt
    x += v * dt
    xs[i] = x
  }

  for (let i = 0; i < size; i++) {
    const f = (i / (size - 1)) * steps
    const i0 = Math.floor(f)
    const t = f - i0
    lut[i] = xs[i0] * (1 - t) + xs[Math.min(steps, i0 + 1)] * t
  }
  lut[size - 1] = 1 // land exactly
  return lut
}

export function evalEase(lut: Float32Array, t: number): number {
  const clamped = Math.max(0, Math.min(1, t))
  const f = clamped * (lut.length - 1)
  const i = Math.floor(f)
  const frac = f - i
  return lut[i] * (1 - frac) + lut[Math.min(lut.length - 1, i + 1)] * frac
}

// Normalized velocity profile (peak = 1) for the plot's ghost fill.
export function velocityOf(lut: Float32Array): Float32Array {
  const out = new Float32Array(lut.length)
  let peak = 1e-6
  for (let i = 1; i < lut.length; i++) {
    out[i] = lut[i] - lut[i - 1]
    if (Math.abs(out[i]) > peak) peak = Math.abs(out[i])
  }
  out[0] = out[1]
  for (let i = 0; i < out.length; i++) out[i] /= peak
  return out
}

export function overshootOf(lut: Float32Array): number {
  let max = 0
  for (let i = 0; i < lut.length; i++) if (lut[i] > max) max = lut[i]
  return Math.max(0, max - 1)
}

// CSS `linear()` easing token — the LUT verbatim, usable anywhere.
export function toCssLinear(lut: Float32Array, stops = 24): string {
  const parts: string[] = []
  for (let i = 0; i < stops; i++) {
    const t = i / (stops - 1)
    parts.push(`${+evalEase(lut, t).toFixed(4)} ${Math.round(t * 100)}%`)
  }
  return `linear(${parts.join(', ')})`
}
