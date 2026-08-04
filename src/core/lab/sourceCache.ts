import type { AnalysisMaps } from './analysis'
import { analyzeRGBA } from './analysis'
import { labContentHash } from './recipe'

// The source bitmap and its analysis live HERE, outside the store —
// history snapshots and autosave are JSON of LabState, and raster data
// in state would make every commit O(image bytes). The store keeps only
// metadata plus a nonce that bumps when this cache changes.
//
// Full resolution is kept for compositing (unlike the editor's
// importImageFile, which downscales to lossy 1600px JPEG — fine for
// layout blocks, wrong for a study source). Analysis runs once per
// load at a capped ~1MP and is sampled bilinearly from there.

const ANALYSIS_MAX = 1024

export type LabSource = {
  image: HTMLImageElement
  url: string // object URL, revoked on replace
  fullW: number
  fullH: number
  maps: AnalysisMaps
  hash: string
  filename: string
}

let current: LabSource | null = null

export function getLabSource(): LabSource | null {
  return current
}

export function clearLabSource(): void {
  if (current) URL.revokeObjectURL(current.url)
  current = null
}

// decode WITHOUT committing — the caller decides whether this decode
// still wins (a slow large file must not overwrite a later small one)
export async function decodeLabSourceFile(file: File): Promise<LabSource> {
  const url = URL.createObjectURL(file)
  const image = new Image()
  image.src = url
  try {
    await image.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new Error(`Could not decode "${file.name}" — PNG, JPEG, or WebP only.`)
  }
  const fullW = image.naturalWidth
  const fullH = image.naturalHeight
  if (!fullW || !fullH) {
    URL.revokeObjectURL(url)
    throw new Error(`"${file.name}" decoded to zero size.`)
  }

  // analysis raster: capped long edge, aspect preserved
  const k = Math.min(1, ANALYSIS_MAX / Math.max(fullW, fullH))
  const aw = Math.max(8, Math.round(fullW * k))
  const ah = Math.max(8, Math.round(fullH * k))
  const scratch = document.createElement('canvas')
  scratch.width = aw
  scratch.height = ah
  const ctx = scratch.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    URL.revokeObjectURL(url)
    throw new Error('2D context unavailable.')
  }
  ctx.drawImage(image, 0, 0, aw, ah)
  const data = ctx.getImageData(0, 0, aw, ah)

  return {
    image,
    url,
    fullW,
    fullH,
    maps: analyzeRGBA(data.data, aw, ah),
    hash: labContentHash(data.data, aw, ah),
    filename: file.name,
  }
}

export function commitLabSource(src: LabSource): void {
  if (current && current !== src) URL.revokeObjectURL(current.url)
  current = src
}

export function discardLabSource(src: LabSource): void {
  if (src !== current) URL.revokeObjectURL(src.url)
}
