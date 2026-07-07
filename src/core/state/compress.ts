import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { ProjectState } from './types'
import { deserializeProject, serializeProject } from './serialize'

// Share URLs carry the whole project in the hash fragment: it never hits
// the server, has no practical length limit, and works identically in
// dev, on Vercel, and in static export.
export function encodeShareHash(project: ProjectState): string {
  // uploaded image data URLs would blow the URL into the megabytes — share
  // links keep only path-based srcs (the built-in backgrounds)
  const images = project.images.filter((im) => im.src.startsWith('/'))
  const bgImageId = images.some((im) => im.id === project.bgImageId) ? project.bgImageId : null
  return 's=' + compressToEncodedURIComponent(
    serializeProject({ ...project, images, bgImageId }),
  )
}

export function decodeShareHash(hash: string): ProjectState | null {
  const m = hash.match(/s=([A-Za-z0-9+\-$_]+)/)
  if (!m) return null
  const json = decompressFromEncodedURIComponent(m[1])
  return deserializeProject(json)
}
