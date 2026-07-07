import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { ProjectState } from './types'
import { deserializeProject, serializeProject } from './serialize'

// Share URLs carry the whole project in the hash fragment: it never hits
// the server, has no practical length limit, and works identically in
// dev, on Vercel, and in static export.
export function encodeShareHash(project: ProjectState): string {
  // imported image data URLs would blow the URL into the megabytes —
  // share links carry everything EXCEPT the images themselves
  return 's=' + compressToEncodedURIComponent(
    serializeProject({ ...project, images: [], bgImageId: null }),
  )
}

export function decodeShareHash(hash: string): ProjectState | null {
  const m = hash.match(/s=([A-Za-z0-9+\-$_]+)/)
  if (!m) return null
  const json = decompressFromEncodedURIComponent(m[1])
  return deserializeProject(json)
}
