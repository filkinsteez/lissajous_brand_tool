import { PROJECT_VERSION, type ProjectState, type ShapeLayer, type ShapeLayerType } from './types'
import { createDefaultProject, createShapeLayer, DEFAULT_LAYER_PARAMS } from './defaults'
import { mergeDeep, type DeepPartial } from './store'
import { BRAND_PALETTE, BRAND_ROLE_ORDER, PALETTES, type ColorRole } from '@/core/color/palette'

// A recipe is just serialized ProjectState. Partial recipes are valid:
// missing fields fill from defaults, which keeps old recipes loading as
// the schema grows (version gates breaking migrations).
export function serializeProject(project: ProjectState): string {
  return JSON.stringify(project)
}

export function deserializeProject(json: string | null | undefined): ProjectState | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as Record<string, unknown> & DeepPartial<ProjectState>
    if (!raw || typeof raw !== 'object') return null
    if (raw.version !== PROJECT_VERSION) return null
    migrateRegistersToLayers(raw)
    const seed = typeof raw.seed === 'number' ? raw.seed : undefined
    const merged = mergeDeep(createDefaultProject(seed), raw)
    return normalizeType(normalizeBackground(normalizeLayers(merged)))
  } catch {
    return null
  }
}

// The sheet and repeater types merged into ONE 'cloner' (modes grid /
// radial / linear / curve). Old layers convert here: sheet params slot
// straight into grid mode; repeater's `size` (fraction of the short
// edge) becomes `stampSize` so it can't collide with grid's per-cell
// size dial.
function migrateClonerType(l: { type?: string; params?: Record<string, unknown> }): {
  type?: string
  params?: Record<string, unknown>
} {
  if (l.type === 'sheet') {
    return { ...l, type: 'cloner', params: { ...(l.params ?? {}), mode: 'grid' } }
  }
  if (l.type === 'repeater') {
    const { size, mode, ...rest } = l.params ?? {}
    return {
      ...l,
      type: 'cloner',
      params: {
        ...rest,
        mode: mode === 'linear' ? 'linear' : mode === 'grid' ? 'grid' : 'radial',
        ...(typeof size === 'number' ? { stampSize: size } : {}),
      },
    }
  }
  return l
}

// Saves from before the layer stack carried five singleton registers
// (cloner/pattern/sheet/repeater/imageArray), each with an `enabled`
// flag. Enabled ones become layers in the old fixed z-order; the old
// keys are dropped so they don't ghost through the merge. The historic
// 'cloner' register key is the CONTOUR layer ('clones') — the merged
// cloner type reuses the name, the register key predates it.
const LEGACY_ORDER: { key: string; legacyType: string }[] = [
  { key: 'cloner', legacyType: 'clones' },
  { key: 'pattern', legacyType: 'pattern' },
  { key: 'sheet', legacyType: 'sheet' },
  { key: 'imageArray', legacyType: 'array' },
  { key: 'repeater', legacyType: 'repeater' },
]

function migrateRegistersToLayers(raw: Record<string, unknown>): void {
  const hasLegacy = LEGACY_ORDER.some((r) => raw[r.key] !== undefined)
  if (!hasLegacy) return
  if (raw.layers === undefined) {
    const layers: ShapeLayer[] = []
    for (const { key, legacyType } of LEGACY_ORDER) {
      const reg = raw[key]
      if (!reg || typeof reg !== 'object') continue
      const { enabled, tone, ...params } = reg as Record<string, unknown> & {
        enabled?: boolean
        tone?: string
      }
      void tone
      if (!enabled) continue
      const converted = migrateClonerType({ type: legacyType, params })
      const type = converted.type as ShapeLayerType
      const layer = createShapeLayer(type, layers)
      layers.push({
        ...layer,
        params: { ...DEFAULT_LAYER_PARAMS[type], ...(converted.params ?? {}) },
      } as ShapeLayer)
    }
    raw.layers = layers
  }
  for (const { key } of LEGACY_ORDER) delete raw[key]
}

// Layers arriving from saves may be partial or malformed — fill each
// from a freshly minted layer of its type and drop unknown types.
function normalizeLayers(project: ProjectState): ProjectState {
  const valid = new Set<ShapeLayerType>(['clones', 'pattern', 'cloner', 'array', 'organic', 'tiles'])
  const layers = (Array.isArray(project.layers) ? project.layers : [])
    .map((l) => migrateClonerType(l as { type?: string; params?: Record<string, unknown> }))
    .filter((l): l is ShapeLayer => !!l && typeof l === 'object' && valid.has((l as ShapeLayer).type))
    .map((l) => {
      const fresh = createShapeLayer(l.type, [])
      return {
        ...fresh,
        ...l,
        params: { ...DEFAULT_LAYER_PARAMS[l.type], ...(l.params ?? {}) },
      } as ShapeLayer
    })
  return { ...project, layers }
}

function asRoles(value: unknown): ColorRole[] {
  if (!Array.isArray(value)) return []
  const valid = new Set<ColorRole>(BRAND_ROLE_ORDER)
  return value.filter((role): role is ColorRole => typeof role === 'string' && valid.has(role as ColorRole))
}

// Optimistic replaced the three-family system, so saves carrying
// 'flex' / 'fraunces' / 'mono' land on the one family, and weight and
// width clamp into the axes it actually has.
function normalizeType(project: ProjectState): ProjectState {
  return {
    ...project,
    typeBlocks: project.typeBlocks.map((b) => ({
      ...b,
      fontFamily: 'optimistic' as const,
      weight: Math.max(300, Math.min(800, b.weight)),
      width: Math.max(80, Math.min(100, b.width)),
    })),
  }
}

function normalizeBackground(project: ProjectState): ProjectState {
  const fallback = createDefaultProject(project.seed).background
  const paletteId = PALETTES[project.background.paletteId] ? project.background.paletteId : BRAND_PALETTE.id
  const roles = asRoles(project.background.roles)
  const lockedRoles = asRoles(project.background.lockedRoles)
  return {
    ...project,
    background: {
      ...fallback,
      ...project.background,
      paletteId,
      roles: roles.length ? roles : [...fallback.roles],
      lockedRoles,
      // the ground is always the brand blue now — the INK/NEUTRAL options
      // were cut, and older saves would otherwise be stuck on them
      ground: 'blue',
    },
  }
}
