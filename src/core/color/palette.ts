export type ColorRole =
  | 'cyan'
  | 'magenta'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'violet'
  | 'neutral'
  | 'ink'

export type Oklab = { l: number; a: number; b: number }
export type Srgb = { r: number; g: number; b: number }

export type PaletteSwatch = {
  base: string
  tint: string
  shade: string
}

export type Palette = {
  id: string
  label: string
  roles: Record<ColorRole, PaletteSwatch>
}

export const BRAND_ROLE_ORDER: ColorRole[] = [
  'cyan',
  'magenta',
  'orange',
  'yellow',
  'green',
  'blue',
  'violet',
  'neutral',
  'ink',
]

export const BRAND_PALETTE: Palette = {
  id: 'brand-v1',
  label: 'Lissajous Brand',
  roles: {
    cyan: { base: '#00d8ff', tint: '#b9f4ff', shade: '#0078c8' },
    magenta: { base: '#ff2aa3', tint: '#ff9ad4', shade: '#a30f72' },
    orange: { base: '#ff5a2f', tint: '#ffb08f', shade: '#b93218' },
    yellow: { base: '#f8ff4d', tint: '#fbffc0', shade: '#b3bd18' },
    green: { base: '#46f436', tint: '#bcffad', shade: '#218b25' },
    blue: { base: '#1649ff', tint: '#9fb8ff', shade: '#071b9a' },
    violet: { base: '#7237ff', tint: '#c4a8ff', shade: '#3915a6' },
    neutral: { base: '#eee7d6', tint: '#fbf7ea', shade: '#bcb49f' },
    ink: { base: '#0d1010', tint: '#242827', shade: '#030505' },
  },
}

export const PALETTES: Record<string, Palette> = {
  [BRAND_PALETTE.id]: BRAND_PALETTE,
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function hexByte(pair: string): number {
  return Number.parseInt(pair, 16)
}

export function hexToSrgb(hex: string): Srgb {
  const clean = hex.trim().replace('#', '')
  if (clean.length !== 6) throw new Error(`Invalid hex color "${hex}"`)
  return {
    r: hexByte(clean.slice(0, 2)) / 255,
    g: hexByte(clean.slice(2, 4)) / 255,
    b: hexByte(clean.slice(4, 6)) / 255,
  }
}

function srgbToLinear(v: number): number {
  if (v <= 0.04045) return v / 12.92
  return Math.pow((v + 0.055) / 1.055, 2.4)
}

function linearToSrgb(v: number): number {
  if (v <= 0.0031308) return 12.92 * v
  return 1.055 * Math.pow(v, 1 / 2.4) - 0.055
}

export function srgbToOklab({ r, g, b }: Srgb): Oklab {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)

  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb

  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)

  return {
    l: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  }
}

export function oklabToSrgb({ l, a, b }: Oklab): Srgb {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b

  const l3 = l_ * l_ * l_
  const m3 = m_ * m_ * m_
  const s3 = s_ * s_ * s_

  const lr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
  const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
  const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3

  return {
    r: clamp01(linearToSrgb(lr)),
    g: clamp01(linearToSrgb(lg)),
    b: clamp01(linearToSrgb(lb)),
  }
}

export function lerpOklab(a: Oklab, b: Oklab, t: number): Oklab {
  return {
    l: a.l + (b.l - a.l) * t,
    a: a.a + (b.a - a.a) * t,
    b: a.b + (b.b - a.b) * t,
  }
}

function toByte(v: number): number {
  return Math.round(clamp01(v) * 255)
}

function normalizeRoles(roles: readonly ColorRole[], locked: readonly ColorRole[]): ColorRole[] {
  const targetLen = Math.max(2, roles.length || BRAND_ROLE_ORDER.length)
  const out: ColorRole[] = new Array(targetLen)
  const lockedSet = new Set(locked)
  const used = new Set<ColorRole>()

  for (let i = 0; i < Math.min(targetLen, roles.length); i++) {
    const role = roles[i]
    if (lockedSet.has(role) && !used.has(role)) {
      out[i] = role
      used.add(role)
    }
  }

  const queue = [...roles, ...BRAND_ROLE_ORDER]
  let q = 0
  for (let i = 0; i < targetLen; i++) {
    if (out[i]) continue
    while (q < queue.length && used.has(queue[q])) q++
    out[i] = q < queue.length ? queue[q] : BRAND_ROLE_ORDER[i % BRAND_ROLE_ORDER.length]
    used.add(out[i])
  }
  return out
}

function roleHexForStop(palette: Palette, role: ColorRole, stopIndex: number): string {
  const sw = palette.roles[role]
  if (stopIndex === 0) return sw.shade
  if (stopIndex % 2 === 1) return sw.tint
  return sw.base
}

export type PaletteLUT = {
  width: 256
  height: 1
  order: ColorRole[]
  data: Uint8Array
}

export function buildPaletteLUT(
  roles: readonly ColorRole[],
  palette: Palette = BRAND_PALETTE,
  locked: readonly ColorRole[] = [],
): PaletteLUT {
  const order = normalizeRoles(roles, locked)
  const stops = order.map((role, i) => srgbToOklab(hexToSrgb(roleHexForStop(palette, role, i))))
  const width = 256 as const
  const out = new Uint8Array(width * 4)
  const segments = Math.max(1, stops.length - 1)

  for (let i = 0; i < width; i++) {
    const u = i / (width - 1)
    const p = u * segments
    const j = Math.min(segments - 1, Math.floor(p))
    const t = p - j
    const rgb = oklabToSrgb(lerpOklab(stops[j], stops[j + 1], t))
    const o = i * 4
    out[o] = toByte(rgb.r)
    out[o + 1] = toByte(rgb.g)
    out[o + 2] = toByte(rgb.b)
    out[o + 3] = 255
  }

  return { width, height: 1, order, data: out }
}
