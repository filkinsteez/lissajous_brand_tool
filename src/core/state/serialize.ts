import { PROJECT_VERSION, type ProjectState } from './types'
import { createDefaultProject } from './defaults'
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
    const raw = JSON.parse(json) as DeepPartial<ProjectState> & { version?: number }
    if (!raw || typeof raw !== 'object') return null
    if (raw.version !== PROJECT_VERSION) return null
    const seed = typeof raw.seed === 'number' ? raw.seed : undefined
    const merged = mergeDeep(createDefaultProject(seed), raw)
    return normalizeBackground(merged)
  } catch {
    return null
  }
}

function asRoles(value: unknown): ColorRole[] {
  if (!Array.isArray(value)) return []
  const valid = new Set<ColorRole>(BRAND_ROLE_ORDER)
  return value.filter((role): role is ColorRole => typeof role === 'string' && valid.has(role as ColorRole))
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
