export const PROJECT_VERSION = 1

export type ArtboardPresetId = 'portrait' | 'a-series' | 'square' | 'wide'

export type ArtboardState = {
  preset: ArtboardPresetId
  width: number
  height: number
  background: string
}

export type LissajousState = {
  frequencyX: number
  frequencyY: number
  phase: number // radians
  amplitudeX: number // 0..1 of artboard half-extent
  amplitudeY: number
  rotation: number // radians
  offsetX: number // -1..1, normalized to half-extent
  offsetY: number
  sampleDensity: number // live sample count; export uses a higher ladder
  presetId?: string
}

export type GridMode = 'strict' | 'projection'

export type GridState = {
  mode: GridMode
  marginRestraint: number // 0..1
  columnBias: number // target column count 2..8
  rowBias: number // target row count 2..12
  gutterScale: number // 0..2
  baselineRhythm: number // multiplier on base leading
  selectedNodeIds: number[]
  snapStrength: number // 0..1
}

export type TypeRole = 'headline' | 'caption' | 'metadata'
export type FontFamilyId = 'flex' | 'fraunces' | 'mono'
export type TypeCase = 'none' | 'upper' | 'lower'
export type TypeAlign = 'left' | 'center' | 'right'

export type TypeBlockState = {
  id: string
  role: TypeRole
  text: string
  fontFamily: FontFamilyId
  size: number // px in artboard space
  weight: number // wght 100..1000
  width: number // wdth 25..151 (Roboto Flex range)
  opticalSize: number // opsz
  lineHeight: number // multiplier
  tracking: number // em
  textCase: TypeCase
  align: TypeAlign
  // col/row index into the grid boundaries; baselineOffset shifts the block
  // down from its row boundary in baseline-rhythm steps (drag snapping)
  anchor: { col: number; row: number; colSpan: number; baselineOffset?: number }
  materialInfluence: number // 0..1, weight in the pressure mask
}

export type GlyphFieldMode = 'sparse' | 'dense' | 'verticalStream' | 'fieldContour'
export type GlyphOrientation = 'grid' | 'tangent' | 'normal' | 'vertical' | 'mixed'

export type GlyphFieldState = {
  enabled: boolean
  sourceText: string
  charset: string // '' = use sourceText order
  mode: GlyphFieldMode
  density: number // 0..1
  contrast: number // 0..1 — bimodal shaping: hot zones pack, quiet zones empty
  scale: number // base glyph size, px in artboard space
  sizeLevels: number // 1..3 quantized size steps (scale × 0.62 / 1 / 1.7)
  tracking: number // em
  lineRhythm: number // leading multiplier
  orientation: GlyphOrientation
  overprint: boolean
  pressureResponse: number // 0..1, how strongly type pressure clears glyphs
  randomness: number // 0..1
  seedOffset: number
}

export type MaterialState = {
  enabled: boolean
  preset: string
  pressure: number // 0..1
  density: number // 0..1
  grainSize: number // 0..1
  drift: number // 0..1
  fold: number // 0..1
  ring: number // 0..1
  contrast: number // 0..1
  voidStrength: number // 0..1
  motion: number // 0..1
  ink: string
  paper: string
}

// Post-MVP; reserved so recipes stay forward-compatible.
export type ImageState = {
  transform: { x: number; y: number; scale: number }
  opacity: number
}

export type PathShape = 'circle' | 'oval' | 'eight' | 'system'

// The motion system IS the Lissajous family: an easing is one arc of a
// ratio:ratio figure read as a graph. 1:1 is linear, 2:1 an ease, 1:3 the
// S-wave, higher ratios go elastic — same two controls as the grid.
export type MotionLabState = {
  ratioX: number // 1..8
  ratioY: number // 1..8
  phase: number // radians
  read: 'position' | 'velocity' // value graph vs speed graph (AE's two editors)
  reverse: boolean // time-mirror (ease-out ↔ ease-in)
  strength: number // 0..1 influence: powers the speed profile
  decay: number // 0..1 damping: oscillations settle instead of returning
  lobe: number // which lobe of the figure to harvest; -1 = auto-pick
  half: 'full' | 'rise' | 'fall' // whole arch, or one side split at its peak
  durationMs: number
  presetId?: string
  // reserved (path-following text was cut from the lab UI; recipes keep loading)
  pathShape: PathShape
  pathText: string
  pathTextSize: number
  pathSpeed: number
  pathEased: boolean
}

export type ExportState = { scale: 1 | 2 | 4 }

export type ProjectState = {
  version: typeof PROJECT_VERSION
  seed: number
  layoutSeed: number // drives the type-layout shuffle; anchors store the result
  artboard: ArtboardState
  lissajous: LissajousState
  grid: GridState
  typeBlocks: TypeBlockState[]
  glyphField: GlyphFieldState
  material: MaterialState
  motionLab: MotionLabState
  image?: ImageState
  export: ExportState
}
