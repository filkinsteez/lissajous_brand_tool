import { BRAND_ROLE_ORDER, type ColorRole } from '@/core/color/palette'
import type { BackgroundState } from '@/core/state/types'

export type BackgroundExpression = {
  id: string
  name: string
  background: BackgroundState
}

export const BACKGROUND_EXPRESSIONS_STORAGE_KEY = 'lbs-background-expressions-v1'

function withRoles(roles: ColorRole[]): ColorRole[] {
  const out = [...roles]
  for (const role of BRAND_ROLE_ORDER) {
    if (!out.includes(role)) out.push(role)
  }
  return out
}

export const CURATED_BACKGROUND_EXPRESSIONS: BackgroundExpression[] = [
  {
    id: 'mb-transform',
    name: 'MB Transform',
    background: {
      mode: 'field',
      paletteId: 'brand-v1',
      roles: withRoles(['blue', 'cyan', 'magenta', 'orange', 'yellow', 'green', 'violet', 'neutral', 'ink']),
      lockedRoles: ['blue', 'cyan', 'magenta'],
      ground: 'blue',
      seed: 6508,
      layers: 6,
      width: 0.46,
      fieldScale: 1,
      fieldOffsetX: 0,
      fieldOffsetY: 0,
      typeCalm: false,
      form: 0.65,
      softness: 0.96,
      arcSpread: 1.52,
      warp: 0.64,
      drift: 0.18,
      grain: 0.1,
      contrast: 1.56,
      presetId: 'mb-transform',
    },
  },
  {
    id: 'fangor-halo',
    name: 'Fangor Halo',
    background: {
      mode: 'field',
      paletteId: 'brand-v1',
      roles: withRoles(['green', 'violet', 'orange', 'yellow', 'cyan', 'magenta', 'blue', 'neutral', 'ink']),
      lockedRoles: ['green', 'violet', 'orange'],
      ground: 'blue',
      seed: 1729,
      layers: 6,
      width: 0.48,
      fieldScale: 1.4,
      fieldOffsetX: 0,
      fieldOffsetY: 0,
      typeCalm: false,
      form: 0.45,
      softness: 1,
      arcSpread: 0.82,
      warp: 0.36,
      drift: 0.16,
      grain: 0.1,
      contrast: 1.34,
      presetId: 'fangor-halo',
    },
  },
  {
    id: 'spectral-smear',
    name: 'Spectral Smear',
    background: {
      mode: 'field',
      paletteId: 'brand-v1',
      roles: withRoles(['magenta', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'neutral', 'ink']),
      lockedRoles: ['magenta', 'orange', 'yellow'],
      ground: 'blue',
      seed: 5117,
      layers: 5,
      width: 0.5,
      fieldScale: 1,
      fieldOffsetX: 0,
      fieldOffsetY: 0,
      typeCalm: false,
      form: 0.25,
      softness: 0.88,
      arcSpread: 1.86,
      warp: 0.58,
      drift: 0.18,
      grain: 0.14,
      contrast: 1.54,
      presetId: 'spectral-smear',
    },
  },
  {
    id: 'paper-veil',
    name: 'Paper Veil',
    background: {
      mode: 'field',
      paletteId: 'brand-v1',
      roles: withRoles(['neutral', 'green', 'cyan', 'yellow', 'magenta', 'orange', 'blue', 'violet', 'ink']),
      lockedRoles: ['neutral', 'green', 'cyan'],
      ground: 'blue',
      seed: 9011,
      layers: 4,
      width: 0.44,
      fieldScale: 1,
      fieldOffsetX: 0,
      fieldOffsetY: 0,
      typeCalm: false,
      form: 0.1,
      softness: 0.98,
      arcSpread: 1.28,
      warp: 0.42,
      drift: 0.12,
      grain: 0.18,
      contrast: 1.22,
      presetId: 'paper-veil',
    },
  },
]
