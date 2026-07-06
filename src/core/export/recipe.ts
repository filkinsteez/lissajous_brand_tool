import type { ProjectState } from '@/core/state/types'
import { deserializeProject, serializeProject } from '@/core/state/serialize'

export function downloadRecipe(project: ProjectState): void {
  const blob = new Blob([serializeProject(project)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lissajous-recipe-${project.lissajous.frequencyX}-${project.lissajous.frequencyY}-${project.seed}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function readRecipeFile(file: File): Promise<ProjectState | null> {
  return file.text().then(deserializeProject)
}
