// Separable box blur, three passes ≈ gaussian. Deterministic across
// browsers (unlike ctx.filter = 'blur(...)'), which matters because the
// pressure mask feeds deterministic exports.
export function boxBlur(
  data: Float32Array,
  width: number,
  height: number,
  radius: number,
  passes = 3,
): Float32Array {
  let src = data
  let dst = new Float32Array(data.length)
  const r = Math.max(1, Math.round(radius))
  const norm = 1 / (2 * r + 1)

  for (let p = 0; p < passes; p++) {
    // horizontal
    for (let y = 0; y < height; y++) {
      const row = y * width
      let acc = 0
      for (let x = -r; x <= r; x++) acc += src[row + Math.max(0, Math.min(width - 1, x))]
      for (let x = 0; x < width; x++) {
        dst[row + x] = acc * norm
        const out = Math.max(0, Math.min(width - 1, x - r))
        const inn = Math.max(0, Math.min(width - 1, x + r + 1))
        acc += src[row + inn] - src[row + out]
      }
    }
    // vertical
    for (let x = 0; x < width; x++) {
      let acc = 0
      for (let y = -r; y <= r; y++) acc += dst[Math.max(0, Math.min(height - 1, y)) * width + x]
      for (let y = 0; y < height; y++) {
        src[y * width + x] = acc * norm
        const out = Math.max(0, Math.min(height - 1, y - r))
        const inn = Math.max(0, Math.min(height - 1, y + r + 1))
        acc += dst[inn * width + x] - dst[out * width + x]
      }
    }
  }
  return src
}
