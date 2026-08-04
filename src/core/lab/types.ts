// Research-lab state. A LabState IS the recipe: everything needed to
// regenerate a study except the source pixels themselves, which are
// matched back by contentHash when a recipe is restored. Bitmaps and
// analysis rasters never enter this state — history snapshots are
// JSON.stringify of it, so it stays a few KB. (The painted mask is the
// one raster that DOES live here: it is authored state, capped at a
// 128-wide byte grid ≈ 10KB base64.)
export const LAB_VERSION = 1

export type LabFit = 'contain' | 'cover'

export type LabSourceMeta = {
  filename?: string
  width: number // source pixels
  height: number
  contentHash?: string
  fit: LabFit
}

// ---------------------------------------------------------------------------
// Territory: WHERE different laws apply. A stack of masking fields —
// the brand curve's distance field, gradients, a painted mask, image
// signals — composes into one scalar territory, which quantizes into
// BANDS. Each band owns a treatment; the boundary decides how bands
// hand off (hard grid steps, ordered dither, porous noise).

export type FieldSourceKind = 'curve' | 'linear' | 'radial' | 'tone' | 'detail' | 'paint'
export type CombineMode = 'add' | 'subtract' | 'multiply' | 'max'

// snapshot of the editor curve taken when the source is added, so a
// recipe reproduces without the editor's autosave present
export type CurveSnapshot = {
  frequencyX: number
  frequencyY: number
  phase: number
  amplitudeX: number
  amplitudeY: number
  rotation: number
  offsetX: number
  offsetY: number
  curve?: 'meta'
}

export type FieldSourceState = {
  id: string
  kind: FieldSourceKind
  enabled: boolean
  weight: number // 0..1
  invert: boolean
  combine: CombineMode
  // linear: direction + midpoint position along it; softness = ramp width
  angle: number // radians
  offset: number // 0..1
  softness: number // 0..1 — also the curve band width and radial falloff
  // radial
  centerX: number // 0..1 of output width
  centerY: number
  radius: number // 0..1 of output min dimension
  curve?: CurveSnapshot
}

export type TreatmentId = 'empty' | 'flat' | 'mosaic' | 'photo' | 'marks' | 'contours'

export const TREATMENTS: { id: TreatmentId; label: string }[] = [
  { id: 'empty', label: 'Empty' },
  { id: 'flat', label: 'Flat ink' },
  { id: 'mosaic', label: 'Mosaic' },
  { id: 'photo', label: 'Photo' },
  { id: 'marks', label: 'Marks' },
  { id: 'contours', label: 'Contours' },
]

export type BoundaryMode = 'hard' | 'dither' | 'porous'

export type TerritoryState = {
  sources: FieldSourceState[]
  bands: TreatmentId[] // band 0 = territory 0 (far), last = territory 1 (near)
  boundary: BoundaryMode
}

// the multiscale carrier: base cells that subdivide where image detail
// (scaled by SUBDIVIDE) demands finer resolution
export type StructureState = {
  baseCell: number // output px
  maxLevels: 0 | 1 | 2
  subdivide: number // 0..1 eagerness
}

// painted mask, output-space, stored as raw bytes in base64
export type PaintState = {
  w: number
  h: number
  data: string
}

export type MarkBankId = 'dots' | 'geo' | 'brand'
export type MarkColorMode = 'ink' | 'tint' | 'source'

export type MarkParams = {
  bank: MarkBankId
  evidenceMix: number // 0 tone chooses the mark, 1 structure chooses it
  occupancy: number
  minScale: number
  maxScale: number
  rotationInfluence: number // edge direction rotates marks
  flow: number // 0 image edges orient marks .. 1 the curve's tangent does
  coherenceScale: number
  colorMode: MarkColorMode
}

export type LabState = {
  version: number
  studyId: 'territory'
  seed: number
  output: { width: number; height: number; transparent: boolean }
  source: LabSourceMeta | null
  territory: TerritoryState
  structure: StructureState
  mark: MarkParams
  paint: PaintState | null
  sourceVisibility: number // 0..1 alpha of the source under everything
  // the two inks: marks/flat/contours draw in INK, the ground is PAPER
  colors: { ink: string; paper: string }
}

// Views are ui, not recipe: composite plus the intermediate maps that
// explain the outcome (the brief's "maps as creative evidence").
export type LabView =
  | 'composite'
  | 'source'
  | 'territory'
  | 'bands'
  | 'cells'
  | 'lum'
  | 'edge'
  | 'orient'

export const LAB_VIEWS: { id: LabView; label: string }[] = [
  { id: 'composite', label: 'Composite' },
  { id: 'source', label: 'Source' },
  { id: 'territory', label: 'Territory' },
  { id: 'bands', label: 'Bands' },
  { id: 'cells', label: 'Cells' },
  { id: 'lum', label: 'Tone' },
  { id: 'edge', label: 'Edges' },
  { id: 'orient', label: 'Direction' },
]
