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

// The easing presets are members of the Lissajous family itself — the
// MathWorld n:1 / 1:n chart read as easing curves. 1:1 is the diagonal
// (linear); 2:1's top arc is the classic ease; adding lobes goes elastic.
export type MotionPreset = {
  id: string
  label: string
  ratioX: number
  ratioY: number
  phase: number
}

export const MOTION_PRESETS: MotionPreset[] = [
  { id: 'linear', label: 'LINEAR', ratioX: 1, ratioY: 1, phase: 0 },
  { id: 'soft', label: 'SOFT', ratioX: 3, ratioY: 1, phase: 0 },
  { id: 'ease', label: 'EASE', ratioX: 2, ratioY: 1, phase: 0 },
  { id: 'ease-out', label: 'EASE OUT', ratioX: 2, ratioY: 1, phase: Math.PI / 2 },
  { id: 'bounce', label: 'BOUNCE', ratioX: 1, ratioY: 3, phase: 0 },
  { id: 'elastic', label: 'ELASTIC', ratioX: 1, ratioY: 5, phase: 0 },
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

  // Trim the dead tail: normalize the timeline to where motion actually
  // ends (last time the spring is >1% away from target). Without this an
  // ease finishes ~40% in and the object parks while the clock runs on —
  // an eased move should occupy its full duration, like an AE keyframe pair.
  let lastActive = steps
  for (let i = steps; i >= 1; i--) {
    if (Math.abs(xs[i] - 1) > 0.01) {
      lastActive = i
      break
    }
  }
  const end = Math.min(steps, Math.ceil(lastActive * 1.08)) // soft landing margin

  for (let i = 0; i < size; i++) {
    const f = (i / (size - 1)) * end
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

// Easing taken directly FROM the figure: pick the arc of the Lissajous
// where the x-oscillation rises through its full sweep (x is the time
// axis), and read the y-oscillation over that window as position. The
// easing curve IS a lobe of the figure — same arc, drawn as a graph.
// Different ratios and phases give the arc a different character.
export type CurveArcEasing = {
  lut: Float32Array
  // the chosen arc in unit space [-1,1]², for highlighting on the figure
  arcUnit: { x: number; y: number }[]
  // curve parameter per normalized-time step, for the synced tracer
  tAtP: Float32Array
}

export function curveArcEasing(
  params: { frequencyX: number; frequencyY: number; phase: number },
  size = LUT_SIZE,
): CurveArcEasing {
  const a = Math.max(1, Math.round(params.frequencyX))
  const b = Math.max(1, Math.round(params.frequencyY))
  const phase = params.phase
  const TAU = Math.PI * 2

  // candidate windows: x = sin(a·t + φ) rises −1 → +1 on each of these
  let bestT0 = 0
  let bestDy = 0
  for (let k = 0; k < a; k++) {
    const t0 = (-Math.PI / 2 - phase + TAU * k) / a
    const t1 = t0 + Math.PI / a
    const dy = Math.sin(b * t1) - Math.sin(b * t0)
    if (Math.abs(dy) > Math.abs(bestDy)) {
      bestDy = dy
      bestT0 = t0
    }
  }

  const lut = new Float32Array(size)
  const tAtP = new Float32Array(size)
  const arcUnit: { x: number; y: number }[] = []

  if (Math.abs(bestDy) < 0.2) {
    // symmetric figure (e.g. 1:1 circle, 1:2 parabola) — every x-window's
    // y returns to its start. Fall back to the y-oscillation's rising
    // half-period: the projection of the oscillation itself, a sine ease.
    const t0 = -Math.PI / (2 * b)
    const t1 = Math.PI / (2 * b)
    for (let i = 0; i < size; i++) {
      const p = i / (size - 1)
      const t = t0 + p * (t1 - t0)
      lut[i] = (1 - Math.cos(Math.PI * p)) / 2
      tAtP[i] = t
      arcUnit.push({ x: Math.sin(a * t + phase), y: Math.sin(b * t) })
    }
    lut[size - 1] = 1
    return { lut, arcUnit, tAtP }
  }

  // time axis = normalized x; sample the window finely, then resample the
  // (x, y) pairs onto a uniform time grid
  const t0 = bestT0
  const t1 = bestT0 + Math.PI / a
  const fine = 1024
  const xs = new Float64Array(fine + 1)
  const ys = new Float64Array(fine + 1)
  const ts = new Float64Array(fine + 1)
  for (let i = 0; i <= fine; i++) {
    const t = t0 + (i / fine) * (t1 - t0)
    ts[i] = t
    xs[i] = (Math.sin(a * t + phase) + 1) / 2 // 0..1, monotone
    ys[i] = Math.sin(b * t)
  }
  const y0 = ys[0]
  const yScale = bestDy

  let j = 0
  for (let i = 0; i < size; i++) {
    const p = i / (size - 1)
    while (j < fine - 1 && xs[j + 1] < p) j++
    const span = xs[j + 1] - xs[j] || 1e-9
    const f = Math.max(0, Math.min(1, (p - xs[j]) / span))
    lut[i] = (ys[j] * (1 - f) + ys[j + 1] * f - y0) / yScale
    tAtP[i] = ts[j] * (1 - f) + ts[j + 1] * f
  }
  lut[0] = 0
  lut[size - 1] = 1

  const arcStep = Math.max(1, Math.floor(fine / 160))
  for (let i = 0; i <= fine; i += arcStep) {
    arcUnit.push({ x: Math.sin(a * ts[i] + phase), y: Math.sin(b * ts[i]) })
  }

  return { lut, arcUnit, tAtP }
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
