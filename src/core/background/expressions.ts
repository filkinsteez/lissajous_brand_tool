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
      lockedRoles: [],
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
]
