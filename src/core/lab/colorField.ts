import { chan } from '@/core/organic/random'
import type { Field } from './field'

// The generated COLOR FIELD — the content the fill treatments sample
// when there is no photograph (and the aurora under the mosaic even
// when there is). Every palette color claims territory: color k is
// happiest where T ≈ (k+0.5)/K, so the palette ORDERS itself along the
// composition — near-curve colors vs far colors — then smooth seeded
// noise breaks the banding into weather. Quantize it coarsely and the
// pixel-gradient reference appears; sample it per column and the
// stripe references appear.

export type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const v = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export function rgbCss([r, g, b]: RGB): string {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`
}

export type ColorField = (x: number, y: number) => RGB

// smooth seeded scalar per palette slot, cosine-eased bilinear lattice
function slotNoise(seed: number, k: number, cellPx: number): Field {
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const inv = 1 / Math.max(16, cellPx)
  const channel = `lab.cf${k}`
  return (x, y) => {
    const u = x * inv
    const v = y * inv
    const i0 = Math.floor(u)
    const j0 = Math.floor(v)
    const fu = smooth(u - i0)
    const fv = smooth(v - j0)
    const val = (i: number, j: number) =>
      chan(seed, ((j & 1023) + 512) * 4096 + ((i & 1023) + 512), channel)
    const top = val(i0, j0) * (1 - fu) + val(i0 + 1, j0) * fu
    const bot = val(i0, j0 + 1) * (1 - fu) + val(i0 + 1, j0 + 1) * fu
    return top * (1 - fv) + bot * fv
  }
}

export function buildColorField(opts: {
  palette: string[]
  seed: number
  T: Field
  outW: number
  outH: number
}): ColorField {
  const { palette, seed, T, outW, outH } = opts
  const colors = (palette.length ? palette : ['#141412', '#f4f2ed']).map(hexToRgb)
  const K = colors.length
  const minDim = Math.min(outW, outH)
  const noises = colors.map((_, k) => slotNoise(seed, k, minDim * 0.3))
  const sigma = 1.1 / K
  return (x, y) => {
    const t = T(x, y)
    let r = 0
    let g = 0
    let b = 0
    let sum = 0
    for (let k = 0; k < K; k++) {
      const mu = (k + 0.5) / K
      const d = (t - mu) / sigma
      // noise sampled anisotropically — features run taller than wide,
      // the vertical light-shaft read of the reference gradients. The
      // territory T stays in true output space.
      const w = Math.exp(-d * d) * (0.35 + 0.65 * noises[k](x * 1.5, y * 0.65))
      r += colors[k][0] * w
      g += colors[k][1] * w
      b += colors[k][2] * w
      sum += w
    }
    if (sum < 1e-9) return colors[0]
    return [r / sum, g / sum, b / sum]
  }
}

// curated palettes distilled from the reference sheet — one click each
export const PALETTES: { id: string; label: string; ground: string; ink: string; colors: string[] }[] = [
  {
    id: 'bold',
    label: 'Bold',
    ground: '#ffffff',
    ink: '#1d1b1c',
    colors: ['#00a651', '#ed1c24', '#0089cf', '#ec008c', '#fff200', '#f26522', '#1d1b1c', '#6cc5f0'],
  },
  {
    id: 'perler',
    label: 'Perler',
    ground: '#e6ddd0',
    ink: '#7b2d26',
    colors: ['#f473b4', '#f26522', '#3a7d44', '#808c1c', '#2a5cab', '#9bc7e4', '#f0b32b', '#7b2d26'],
  },
  {
    id: 'aurora',
    label: 'Aurora',
    ground: '#101014',
    ink: '#f4f2ed',
    colors: ['#101014', '#5d4a8a', '#c47ab8', '#ff9fb0', '#ffe0b5', '#8fd4c8', '#3a6ea5', '#16161c'],
  },
  {
    id: 'blues',
    label: 'Blues',
    ground: '#f0efe9',
    ink: '#2b3cdb',
    colors: ['#2b3cdb', '#5c6cf0', '#9aa6ff', '#dfe4ff', '#f0efe9'],
  },
  {
    id: 'fluoro',
    label: 'Fluoro',
    ground: '#c8c8c8',
    ink: '#2a5cab',
    colors: ['#ff4fa3', '#e8f000', '#2a5cab', '#c8c8c8'],
  },
  {
    id: 'sunset',
    label: 'Sunset',
    ground: '#efe6dc',
    ink: '#ff3d00',
    colors: ['#ff3d00', '#ff5b1f', '#ff8c42', '#ffc09f', '#efe6dc'],
  },
]
