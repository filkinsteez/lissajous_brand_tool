export type Rng = () => number

// Deterministic seeded RNG. Every random decision in the app must flow
// through one of these — never Math.random() — so a recipe reproduces exactly.
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function rngRange(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng()
}

export function rngPick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length]
}

// Approximate gaussian in [-1, 1], cheap and deterministic.
export function rngGauss(rng: Rng): number {
  return (rng() + rng() + rng() - 1.5) / 1.5
}
