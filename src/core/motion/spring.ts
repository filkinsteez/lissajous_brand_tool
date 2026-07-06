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

// An arc of a Lissajous figure can be read two ways, matching AE's two
// graph editors:
//   position — the arc IS the value graph (y over the x-sweep)
//   velocity — the arc IS the speed graph (an arch = ease speed bump);
//              integrating it gives the position curve
export type EasingRead = 'position' | 'velocity'

export type MotionRecipe = {
  ratioX: number
  ratioY: number
  phase: number
  read: EasingRead
  reverse?: boolean // time-mirror: enter/decelerate is the reversed exit
}

export type MotionPreset = MotionRecipe & { id: string; label: string }

// Family members read as easings — the MathWorld chart, both readings.
// EASE is the user's rotated 2:1 arch: ratio 1:2 at 90°, read as speed.
export const MOTION_PRESETS: MotionPreset[] = [
  { id: 'linear', label: 'LINEAR', ratioX: 1, ratioY: 1, phase: 0, read: 'position' },
  { id: 'soft', label: 'SOFT', ratioX: 3, ratioY: 1, phase: 0, read: 'position' },
  { id: 'ease', label: 'EASE', ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity' },
  { id: 'ease-out', label: 'EASE OUT', ratioX: 2, ratioY: 1, phase: Math.PI / 2, read: 'position' },
  { id: 'bounce', label: 'BOUNCE', ratioX: 1, ratioY: 3, phase: 0, read: 'position' },
  { id: 'elastic', label: 'ELASTIC', ratioX: 1, ratioY: 5, phase: 0, read: 'position' },
]

// The derived motion system: named roles a brand actually uses, each a
// family member. One figure family → grid, texture, type, and motion.
//   standard — the arch: speed rises and falls, the symmetric move
//   enter    — decelerate into place (speed ramp down)
//   exit     — accelerate away (speed ramp up)
//   emphasis — the 1:3 swing, for attention
export const MOTION_TOKENS: MotionPreset[] = [
  { id: 'standard', label: 'STANDARD', ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity' },
  { id: 'enter', label: 'ENTER', ratioX: 1, ratioY: 1, phase: 0, read: 'velocity' },
  { id: 'exit', label: 'EXIT', ratioX: 1, ratioY: 1, phase: 0, read: 'velocity', reverse: true },
  { id: 'emphasis', label: 'EMPHASIS', ratioX: 1, ratioY: 3, phase: 0, read: 'position' },
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

// Velocity read: the arc IS the speed graph (AE's default editor view).
// Candidate windows are the rising QUARTERS of the x-oscillation; |y| over
// the window is speed. Scoring prefers arch-shaped speed (zero at both
// ends) — the traditional eased-keyframe speed bump. Position is the
// normalized integral, monotone by construction.
function arcVelocityEasing(
  params: { frequencyX: number; frequencyY: number; phase: number },
  size = LUT_SIZE,
): CurveArcEasing & { speed: Float32Array } {
  const a = Math.max(1, Math.round(params.frequencyX))
  const b = Math.max(1, Math.round(params.frequencyY))
  const phase = params.phase
  const TAU = Math.PI * 2
  const fine = 1024

  // quarters of the x-oscillation where x rises: [-90°..0°] and [0..90°]
  // in (a·t + phase) space, per period
  let bestScore = -Infinity
  let bestT0 = 0
  let bestT1 = Math.PI / (2 * a)
  for (let k = 0; k < a; k++) {
    for (const [u0, u1] of [
      [-Math.PI / 2 + TAU * k, TAU * k],
      [TAU * k, Math.PI / 2 + TAU * k],
    ]) {
      const t0 = (u0 - phase) / a
      const t1 = (u1 - phase) / a
      let sum = 0
      const probes = 64
      for (let i = 0; i <= probes; i++) {
        sum += Math.abs(Math.sin(b * (t0 + (i / probes) * (t1 - t0))))
      }
      const mean = sum / (probes + 1)
      const endPenalty = Math.abs(Math.sin(b * t0)) + Math.abs(Math.sin(b * t1))
      const score = mean - 0.75 * endPenalty
      // epsilon: symmetric windows tie mathematically — keep the first
      // rather than letting float noise pick
      if (score > bestScore + 1e-9) {
        bestScore = score
        bestT0 = t0
        bestT1 = t1
      }
    }
  }

  // sample the window; time axis = normalized x (monotone within a quarter)
  const ts = new Float64Array(fine + 1)
  const xs = new Float64Array(fine + 1)
  const sp = new Float64Array(fine + 1)
  for (let i = 0; i <= fine; i++) {
    const t = bestT0 + (i / fine) * (bestT1 - bestT0)
    ts[i] = t
    xs[i] = Math.sin(a * t + phase)
    sp[i] = Math.abs(Math.sin(b * t))
  }
  const x0 = xs[0]
  const xSpan = xs[fine] - x0 || 1e-9

  const speed = new Float32Array(size)
  const tAtP = new Float32Array(size)
  let j = 0
  for (let i = 0; i < size; i++) {
    const p = i / (size - 1)
    const targetX = x0 + p * xSpan
    while (j < fine - 1 && (xs[j + 1] - targetX) * Math.sign(xSpan) < 0) j++
    const span = xs[j + 1] - xs[j] || 1e-9
    const f = Math.max(0, Math.min(1, (targetX - xs[j]) / span))
    speed[i] = sp[j] * (1 - f) + sp[j + 1] * f
    tAtP[i] = ts[j] * (1 - f) + ts[j + 1] * f
  }

  // integrate speed → position, normalize to land at 1
  const lut = new Float32Array(size)
  for (let i = 1; i < size; i++) lut[i] = lut[i - 1] + (speed[i] + speed[i - 1]) / 2
  const total = lut[size - 1]
  if (total < 1e-3) {
    // degenerate (speed ~0 everywhere): smooth bell fallback
    for (let i = 0; i < size; i++) {
      const p = i / (size - 1)
      lut[i] = (1 - Math.cos(Math.PI * p)) / 2
      speed[i] = Math.sin(Math.PI * p)
    }
  } else {
    for (let i = 0; i < size; i++) lut[i] /= total
  }
  lut[0] = 0
  lut[size - 1] = 1

  // normalize speed display to peak 1
  let peak = 1e-6
  for (const v of speed) if (v > peak) peak = v
  for (let i = 0; i < size; i++) speed[i] /= peak

  const arcUnit: { x: number; y: number }[] = []
  const arcStep = Math.max(1, Math.floor(fine / 160))
  for (let i = 0; i <= fine; i += arcStep) {
    arcUnit.push({ x: Math.sin(a * ts[i] + phase), y: Math.sin(b * ts[i]) })
  }

  return { lut, arcUnit, tAtP, speed }
}

// One entry point for both readings of a figure, plus optional time-mirror.
export function lissajousEasing(
  recipe: MotionRecipe,
  size = LUT_SIZE,
): CurveArcEasing & { speed?: Float32Array } {
  const params = { frequencyX: recipe.ratioX, frequencyY: recipe.ratioY, phase: recipe.phase }
  const out: CurveArcEasing & { speed?: Float32Array } =
    recipe.read === 'velocity' ? arcVelocityEasing(params, size) : curveArcEasing(params, size)
  if (!recipe.reverse) return out

  const n = out.lut.length
  const lut = new Float32Array(n)
  const tAtP = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    lut[i] = 1 - out.lut[n - 1 - i]
    tAtP[i] = out.tAtP[n - 1 - i] // tracer runs the same arc backwards
  }
  const speed = out.speed ? new Float32Array(n) : undefined
  if (speed && out.speed) {
    for (let i = 0; i < n; i++) speed[i] = out.speed[n - 1 - i]
  }
  return { lut, tAtP, arcUnit: out.arcUnit, speed }
}

// Full motion-system export: the four role tokens + a duration scale,
// as CSS custom properties ready to paste into a stylesheet.
export function cssMotionSystem(baseDurationMs: number): string {
  const lines = [':root {']
  for (const token of MOTION_TOKENS) {
    lines.push(`  --ease-${token.id}: ${toCssLinear(lissajousEasing(token).lut)};`)
  }
  lines.push(`  --duration-quick: ${Math.round(baseDurationMs * 0.45)}ms;`)
  lines.push(`  --duration-base: ${Math.round(baseDurationMs)}ms;`)
  lines.push(`  --duration-slow: ${Math.round(baseDurationMs * 1.8)}ms;`)
  lines.push('}')
  return lines.join('\n')
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
