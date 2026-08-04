import { boxBlur } from '@/core/math/blur'

// Image analysis for the lab: the source becomes a spatial control
// surface. Everything here is pure typed-array in/out — no DOM, no
// canvas — so it runs under the node test environment and could move to
// a worker without changes. Maps live at a capped analysis resolution
// (~1MP), never at export resolution; studies sample them bilinearly.

export type AnalysisMaps = {
  w: number
  h: number
  // original pixels kept for color sampling at paint time
  rgba: Uint8ClampedArray
  lum: Float32Array // 0..1 perceptual luminance
  alpha: Float32Array // 0..1
  edge: Float32Array // 0..1 normalized gradient magnitude
  // edge ORIENTATION as a doubled-angle vector weighted by magnitude —
  // the same sign-free representation the smear shader uses, so nearby
  // orientations average instead of cancelling. Recover the mark angle
  // with 0.5 * atan2(orientY, orientX).
  orientX: Float32Array
  orientY: Float32Array
  detailFine: Float32Array // 0..1 local texture, small window
  detailCoarse: Float32Array // 0..1 local texture, large window
}

export function analyzeRGBA(rgba: Uint8ClampedArray, w: number, h: number): AnalysisMaps {
  const n = w * h
  const lum = new Float32Array(n)
  const alpha = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const o = i * 4
    const a = rgba[o + 3] / 255
    // Rec. 709 luma; transparent pixels read as paper (lum 1) so they
    // carry no tone instead of reading as black
    const l = (0.2126 * rgba[o] + 0.7152 * rgba[o + 1] + 0.0722 * rgba[o + 2]) / 255
    lum[i] = l * a + (1 - a)
    alpha[i] = a
  }

  // Sobel over a lightly blurred copy — raw sensor noise otherwise
  // dominates the orientation field
  const lumS = boxBlur(Float32Array.from(lum), w, h, 1, 1)
  const edge = new Float32Array(n)
  const orientX = new Float32Array(n)
  const orientY = new Float32Array(n)
  const at = (x: number, y: number) =>
    lumS[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))]
  let maxMag = 1e-6
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1), tc = at(x, y - 1), tr = at(x + 1, y - 1)
      const ml = at(x - 1, y), mr = at(x + 1, y)
      const bl = at(x - 1, y + 1), bc = at(x, y + 1), br = at(x + 1, y + 1)
      const gx = tr + 2 * mr + br - (tl + 2 * ml + bl)
      const gy = bl + 2 * bc + br - (tl + 2 * tc + tr)
      const m2 = gx * gx + gy * gy
      const i = y * w + x
      edge[i] = Math.sqrt(m2)
      if (edge[i] > maxMag) maxMag = edge[i]
      if (m2 > 1e-12) {
        // doubled angle of the EDGE LINE (perpendicular to the
        // gradient): 2(φ+π/2) flips the sign of the gradient's
        // doubled-angle vector
        orientX[i] = (-(gx * gx - gy * gy) / m2) * edge[i]
        orientY[i] = (-(2 * gx * gy) / m2) * edge[i]
      }
    }
  }
  const invMax = 1 / maxMag
  for (let i = 0; i < n; i++) edge[i] *= invMax
  // smooth the orientation field so marks in a neighborhood agree —
  // magnitude-weighted vectors mean strong edges dominate the average
  boxBlur(orientX, w, h, 2, 2)
  boxBlur(orientY, w, h, 2, 2)

  return {
    w,
    h,
    rgba,
    lum,
    alpha,
    edge,
    orientX,
    orientY,
    detailFine: detailMap(lum, w, h, 3),
    detailCoarse: detailMap(lum, w, h, 10),
  }
}

// local texture = |lum − local mean|, smoothed and normalized. High in
// busy areas, ~0 in flat fields regardless of their tone.
function detailMap(lum: Float32Array, w: number, h: number, radius: number): Float32Array {
  const mean = boxBlur(Float32Array.from(lum), w, h, radius, 2)
  const d = new Float32Array(lum.length)
  let max = 1e-6
  for (let i = 0; i < d.length; i++) {
    d[i] = Math.abs(lum[i] - mean[i])
    if (d[i] > max) max = d[i]
  }
  boxBlur(d, w, h, Math.max(1, radius >> 1), 1)
  // renormalize after the smoothing pass
  max = 1e-6
  for (let i = 0; i < d.length; i++) if (d[i] > max) max = d[i]
  const inv = 1 / max
  for (let i = 0; i < d.length; i++) d[i] *= inv
  return d
}

// bilinear sample at pixel coords, edge-clamped
export function sampleMap(
  map: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number,
): number {
  const cx = Math.max(0, Math.min(w - 1.001, x))
  const cy = Math.max(0, Math.min(h - 1.001, y))
  const x0 = Math.floor(cx)
  const y0 = Math.floor(cy)
  const fx = cx - x0
  const fy = cy - y0
  const i = y0 * w + x0
  const top = map[i] * (1 - fx) + map[i + 1] * fx
  const bot = map[i + w] * (1 - fx) + map[i + w + 1] * fx
  return top * (1 - fy) + bot * fy
}

// nearest-neighbor color read from the kept source pixels
export function sampleRGB(
  maps: AnalysisMaps,
  x: number,
  y: number,
): [number, number, number] {
  const xi = Math.max(0, Math.min(maps.w - 1, Math.round(x)))
  const yi = Math.max(0, Math.min(maps.h - 1, Math.round(y)))
  const o = (yi * maps.w + xi) * 4
  return [maps.rgba[o], maps.rgba[o + 1], maps.rgba[o + 2]]
}
