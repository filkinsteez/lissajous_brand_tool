// Seeded coherent value noise + fbm — the spatial-correlation engine.
// Deterministic per seed; no wall-clock anywhere (spec rule).

function latticeHash(seed: number, ix: number, iy: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (ix * 0x27d4eb2d), 0x165667b1) >>> 0
  h = Math.imul(h ^ (iy * 0x85ebca6b), 0xc2b2ae35) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0x27d4eb2d) >>> 0
  h ^= h >>> 15
  return h / 0x100000000
}

const smooth = (t: number) => t * t * (3 - 2 * t)

// value noise in [0, 1]
export function valueNoise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smooth(x - ix)
  const fy = smooth(y - iy)
  const a = latticeHash(seed, ix, iy)
  const b = latticeHash(seed, ix + 1, iy)
  const c = latticeHash(seed, ix, iy + 1)
  const d = latticeHash(seed, ix + 1, iy + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

// three-octave fbm in [0, 1], rotated per octave so axes never print
export function fbm(seed: number, x: number, y: number): number {
  let sum = 0
  let amp = 0.5
  let fx = x
  let fy = y
  for (let o = 0; o < 3; o++) {
    sum += valueNoise(seed + o * 131, fx, fy) * amp
    const nx = fx * 1.6 - fy * 1.2
    const ny = fx * 1.2 + fy * 1.6
    fx = nx + 31.7
    fy = ny - 17.3
    amp *= 0.5
  }
  return Math.min(1, sum / 0.875)
}
