// Seed-channel randomness, per the raster-first spec: every random
// choice reads hash(recipeSeed, stablePointId, namedChannel), so editing
// one operator never reshuffles unrelated decisions — a point keeps its
// blob shape when only the color deal changes.

const FNV_OFFSET = 0x811c9dc5

function fnv(h: number, v: number): number {
  h ^= v
  h = Math.imul(h, 0x01000193)
  return h >>> 0
}

function channelId(name: string): number {
  let h = FNV_OFFSET
  for (let i = 0; i < name.length; i++) h = fnv(h, name.charCodeAt(i))
  return h
}

const channelCache = new Map<string, number>()

// one uniform sample in [0, 1) for (seed, pointId, channel)
export function chan(seed: number, id: number, channel: string): number {
  let c = channelCache.get(channel)
  if (c === undefined) {
    c = channelId(channel)
    channelCache.set(channel, c)
  }
  let h = fnv(fnv(fnv(FNV_OFFSET, seed >>> 0), id >>> 0), c)
  // final avalanche (xorshift-multiply) so nearby ids decorrelate.
  // every XOR must be re-coerced unsigned — in JS, ^ yields a SIGNED
  // 32-bit int, and a negative hash here once returned negative samples
  h = (h ^ (h >>> 15)) >>> 0
  h = Math.imul(h, 0x2c1b3c6d) >>> 0
  h = (h ^ (h >>> 12)) >>> 0
  h = Math.imul(h, 0x297a2d39) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  return h / 0x100000000
}

// gaussian-ish sample (sum of three channels, Irwin-Hall) in ~[-1, 1]
export function chanGauss(seed: number, id: number, channel: string): number {
  return (
    (chan(seed, id, channel + '.g0') + chan(seed, id, channel + '.g1') + chan(seed, id, channel + '.g2')) /
      1.5 -
    1
  )
}
