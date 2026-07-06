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
  reverse?: boolean // time-mirror: turns an ease-out ramp into an ease-in
  strength?: number // 0..1 — AE-style influence: powers the speed profile
  decay?: number // 0..1 — damping envelope: oscillations settle into the
  // target instead of swinging all the way back (fixes bounce/spring)
}

export type MotionPreset = MotionRecipe & { id: string; label: string }

// Family members read as easings — the traditional AE set, all from the
// figure family. The in-out arch is the rotated 2:1; the ramps are 1:1
// quarters (mirrored for ease-in); bounce/spring are lobed figures with
// a damping envelope so they settle instead of swinging fully back.
export const MOTION_PRESETS: MotionPreset[] = [
  { id: 'linear', label: 'LINEAR', ratioX: 1, ratioY: 1, phase: 0, read: 'position' },
  { id: 'ease-in', label: 'EASE IN', ratioX: 1, ratioY: 1, phase: 0, read: 'velocity', reverse: true, strength: 0.3 },
  { id: 'ease-out', label: 'EASE OUT', ratioX: 1, ratioY: 1, phase: 0, read: 'velocity', strength: 0.3 },
  { id: 'ease-in-out', label: 'EASE IN-OUT', ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity', strength: 0.35 },
  { id: 'bounce', label: 'BOUNCE', ratioX: 1, ratioY: 3, phase: 0, read: 'position', decay: 0.55 },
  { id: 'spring', label: 'SPRING', ratioX: 1, ratioY: 5, phase: 0, read: 'position', decay: 0.5 },
]

// The derived motion system: named roles a brand actually uses, each a
// family member. One figure family → grid, texture, type, and motion.
//   standard — the arch: speed rises and falls, the symmetric move
//   enter    — decelerate into place (speed ramp down)
//   exit     — accelerate away (speed ramp up)
//   emphasis — the 1:3 swing, for attention
// The easing library: the family enumerated as a wall of position-vs-time
// charts (easings.net style), ordered by increasing intensity within each
// row. Every path is a Lissajous arc — the figure IS the path.
export const MOTION_LIBRARY: { family: string; variants: MotionPreset[] }[] = [
  {
    family: 'OUT',
    variants: [
      { id: 'out-1', label: 'OUT I', ratioX: 1, ratioY: 1, phase: 0, read: 'velocity' },
      { id: 'out-2', label: 'OUT II', ratioX: 1, ratioY: 1, phase: 0, read: 'velocity', strength: 0.35 },
      { id: 'out-3', label: 'OUT III', ratioX: 1, ratioY: 1, phase: 0, read: 'velocity', strength: 0.7 },
    ],
  },
  {
    family: 'IN',
    variants: [
      { id: 'in-1', label: 'IN I', ratioX: 1, ratioY: 1, phase: 0, read: 'velocity', reverse: true },
      { id: 'in-2', label: 'IN II', ratioX: 1, ratioY: 1, phase: 0, read: 'velocity', reverse: true, strength: 0.35 },
      { id: 'in-3', label: 'IN III', ratioX: 1, ratioY: 1, phase: 0, read: 'velocity', reverse: true, strength: 0.7 },
    ],
  },
  {
    family: 'IN-OUT',
    variants: [
      { id: 'inout-1', label: 'IN-OUT I', ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity' },
      { id: 'inout-2', label: 'IN-OUT II', ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity', strength: 0.35 },
      { id: 'inout-3', label: 'IN-OUT III', ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity', strength: 0.7 },
    ],
  },
  {
    family: 'SPRING',
    variants: [
      { id: 'spring-1', label: 'SPRING I', ratioX: 1, ratioY: 3, phase: 0, read: 'position', decay: 0.6 },
      { id: 'spring-2', label: 'SPRING II', ratioX: 1, ratioY: 5, phase: 0, read: 'position', decay: 0.5 },
      { id: 'spring-3', label: 'SPRING III', ratioX: 1, ratioY: 7, phase: 0, read: 'position', decay: 0.45 },
    ],
  },
]

export const MOTION_TOKENS: MotionPreset[] = [
  { id: 'standard', label: 'STANDARD', ratioX: 1, ratioY: 2, phase: Math.PI / 2, read: 'velocity', strength: 0.35 },
  { id: 'enter', label: 'ENTER', ratioX: 1, ratioY: 1, phase: 0, read: 'velocity', strength: 0.3 },
  { id: 'exit', label: 'EXIT', ratioX: 1, ratioY: 1, phase: 0, read: 'velocity', reverse: true, strength: 0.3 },
  { id: 'emphasis', label: 'EMPHASIS', ratioX: 1, ratioY: 3, phase: 0, read: 'position', decay: 0.55 },
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
// Maps figure space into the arc's graph frame so the source panel can
// ghost the rest of the figure behind the arc.
//   'x' — position read: time is the projected x-coordinate (the figure
//         literally read as a graph; keeps 1:1 exactly linear)
//   't' — velocity read: time is the curve's own parameter (constant
//         trace rate — the oscilloscope reading; keeps speed bumps
//         symmetric, matching AE's standard curves)
export type ArcFrame =
  | { kind: 'x'; x0: number; x1: number; y0: number; yScale: number }
  | { kind: 't'; t0: number; t1: number; yScale: number }

export type CurveArcEasing = {
  lut: Float32Array
  // the chosen arc in unit space [-1,1]², for highlighting on the figure
  arcUnit: { x: number; y: number }[]
  // curve parameter per normalized-time step, for the synced tracer
  tAtP: Float32Array
  frame: ArcFrame | null // null for degenerate fallbacks
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
    return { lut, arcUnit, tAtP, frame: null }
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

  return { lut, arcUnit, tAtP, frame: { kind: 'x', x0: -1, x1: 1, y0, yScale } }
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

  // time axis = the curve's own parameter at constant rate (the
  // oscilloscope reading). This keeps speed lobes symmetric: the 1:2 arch
  // becomes exactly sin(πp) — the classic eased-move speed bump — instead
  // of the skewed shape the projected-x axis produced.
  const speed = new Float32Array(size)
  const tAtP = new Float32Array(size)
  for (let i = 0; i < size; i++) {
    const t = bestT0 + (i / (size - 1)) * (bestT1 - bestT0)
    speed[i] = Math.abs(Math.sin(b * t))
    tAtP[i] = t
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
  for (let i = 0; i <= 160; i++) {
    const t = bestT0 + (i / 160) * (bestT1 - bestT0)
    arcUnit.push({ x: Math.sin(a * t + phase), y: Math.sin(b * t) })
  }

  return {
    lut, arcUnit, tAtP, speed,
    frame: { kind: 't', t0: bestT0, t1: bestT1, yScale: peak },
  }
}

// AE-style influence: raise the (signed) speed profile to a power and
// re-integrate. >1 concentrates travel into the fast section — stronger
// ease. Endpoints re-normalized to land exactly 0→1.
export function applyStrength(lut: Float32Array, strength: number): Float32Array {
  if (strength <= 0.001) return lut
  const power = 1 + strength * 2.5
  const n = lut.length
  const out = new Float32Array(n)
  for (let i = 1; i < n; i++) {
    const v = (lut[i] - lut[i - 1]) * (n - 1) // de/dp
    out[i] = out[i - 1] + Math.sign(v) * Math.pow(Math.abs(v), power)
  }
  const start = out[0]
  const span = out[n - 1] - start
  if (Math.abs(span) < 1e-9) return lut
  for (let i = 0; i < n; i++) out[i] = (out[i] - start) / span
  out[n - 1] = 1
  return out
}

// Damping envelope: swings around the target shrink exponentially, so a
// 1:3 "bounce" settles into place instead of returning all the way to the
// start. e'(p) = 1 + (e(p) − 1)·exp(−k·p); endpoints preserved.
export function applyDecay(lut: Float32Array, decay: number): Float32Array {
  if (decay <= 0.001) return lut
  const k = decay * 6
  const n = lut.length
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1)
    out[i] = 1 + (lut[i] - 1) * Math.exp(-k * p)
  }
  out[0] = 0
  out[n - 1] = 1
  return out
}

// One entry point: figure → read → mirror → strength → decay.
// rawLut/rawSpeed are the pre-shaping source (post-mirror) so the UI can
// show the arc it came from next to the curve it became.
export function lissajousEasing(
  recipe: MotionRecipe,
  size = LUT_SIZE,
): CurveArcEasing & { speed?: Float32Array; rawLut: Float32Array; rawSpeed?: Float32Array } {
  const params = { frequencyX: recipe.ratioX, frequencyY: recipe.ratioY, phase: recipe.phase }
  const raw: CurveArcEasing & { speed?: Float32Array } =
    recipe.read === 'velocity' ? arcVelocityEasing(params, size) : curveArcEasing(params, size)

  let lut = raw.lut
  let tAtP = raw.tAtP
  let speed = raw.speed

  if (recipe.reverse) {
    const n = lut.length
    const rl = new Float32Array(n)
    const rt = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      rl[i] = 1 - lut[n - 1 - i]
      rt[i] = tAtP[n - 1 - i] // tracer runs the same arc backwards
    }
    lut = rl
    tAtP = rt
    if (speed) {
      const rs = new Float32Array(n)
      for (let i = 0; i < n; i++) rs[i] = speed[n - 1 - i]
      speed = rs
    }
  }

  const rawLut = lut
  const rawSpeed = speed

  const shaped = applyDecay(applyStrength(lut, recipe.strength ?? 0), recipe.decay ?? 0)
  if (shaped !== lut) {
    // speed display must match what actually plays
    speed = velocityOf(shaped)
    lut = shaped
  }

  return { lut, tAtP, arcUnit: raw.arcUnit, speed, rawLut, rawSpeed, frame: raw.frame }
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
