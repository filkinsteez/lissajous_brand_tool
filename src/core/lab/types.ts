// Research-lab state. A LabState IS the recipe: everything needed to
// regenerate a study except the source pixels themselves, which are
// matched back by contentHash when a recipe is restored. Bitmaps and
// analysis rasters never enter this state — history snapshots are
// JSON.stringify of it, so it stays a few KB.
export const LAB_VERSION = 1

export type LabFit = 'contain' | 'cover'

export type LabSourceMeta = {
  filename?: string
  width: number // source pixels
  height: number
  contentHash?: string
  fit: LabFit
}

export type MarkBankId = 'dots' | 'geo' | 'brand'
export type MarkColorMode = 'ink' | 'tint' | 'source'

// Study 1 — Mark Translation. Can a source image be translated through
// the brand-shape vocabulary in a way that feels more specific than
// generic ASCII / halftone / dot conversion?
export type MarkTranslationParams = {
  cellSize: number // output px per cell
  bank: MarkBankId
  // 0 = tone chooses the mark, 1 = structure (edges + detail) chooses it
  evidenceMix: number
  occupancy: number // 0..1 presence budget
  minScale: number // mark size as a fraction of the cell, at tone 0
  maxScale: number // at tone 1
  rotationInfluence: number // 0..1 — edge direction rotates marks
  // 0 = every cell decides alone, 1 = broad neighborhoods share behavior
  coherenceScale: number
  sourceVisibility: number // 0..1 alpha of the source under the marks
  colorMode: MarkColorMode
}

export type LabState = {
  version: number
  studyId: 'mark-translation'
  seed: number
  output: { width: number; height: number; transparent: boolean }
  source: LabSourceMeta | null
  mark: MarkTranslationParams
}

// Views are ui, not recipe: composite plus the intermediate maps that
// explain the outcome (the brief's "maps as creative evidence").
export type LabView =
  | 'composite'
  | 'source'
  | 'marks'
  | 'lum'
  | 'edge'
  | 'orient'
  | 'region'

export const LAB_VIEWS: { id: LabView; label: string }[] = [
  { id: 'composite', label: 'Composite' },
  { id: 'source', label: 'Source' },
  { id: 'marks', label: 'Marks' },
  { id: 'lum', label: 'Tone' },
  { id: 'edge', label: 'Edges' },
  { id: 'orient', label: 'Direction' },
  { id: 'region', label: 'Regions' },
]
