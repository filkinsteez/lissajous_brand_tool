import { PROJECT_VERSION, type ProjectState } from './types'
import { createDefaultProject } from './defaults'
import { mergeDeep, type DeepPartial } from './store'

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
    return mergeDeep(createDefaultProject(seed), raw)
  } catch {
    return null
  }
}
