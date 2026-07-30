import type { CurveKind } from '@/core/lissajous/equation'
import type { ColorRole } from '@/core/color/palette'

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
  curve?: CurveKind // undefined = classic Lissajous; 'meta' = the ∞ mark
  presetId?: string
}

// legacy field: extraction is always the disciplined (strict) grid now;
// kept so old recipes and share links keep loading
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
  // styling (all optional so old recipes keep loading): fill color,
  // text outline, and a color plate behind the block
  color?: string
  strokeWidth?: number // px, 0/absent = no stroke
  strokeColor?: string
  background?: string // absent = no plate
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

export type BackgroundMode = 'flat' | 'field'

export type BackgroundState = {
  mode: BackgroundMode
  paletteId: string
  roles: ColorRole[]
  lockedRoles: ColorRole[]
  ground: ColorRole
  seed: number
  layers: number
  width: number
  fieldScale: number // 0.5..4 — zooms the whole figure event (fields + geometry)
  fieldOffsetX: number // -1..1 — pans the figure, fraction of artboard width
  fieldOffsetY: number // -1..1 — fraction of artboard height
  form: number // 0..1 — how legibly the figure reads: 0 = abstract field,
  // 1 = the curve's lobes as filled shapes with a rim fringe
  softness: number
  arcSpread: number
  warp: number
  drift: number
  grain: number
  contrast: number
  presetId?: string
}

// The cloner register: the curve duplicated as nested hairline contour
// offsets — field lines around the mark, drawn over the background.
// STEP / RANDOM / DEPTH are C4D-style effectors: per-clone modulation by
// index (step), by seeded jitter (random), and by a 2.5D stacked-plane
// parallax (depth).
export type ClonerState = {
  enabled: boolean
  count: number // 1..14 contour levels
  spacing: number // 0.01..0.16 of the artboard's short edge — first offset
  growth: number // 1..2.2 — offset progression exponent (1 = even rings)
  weight: number // 0.5..4 — hairline stroke, artboard px
  tone: 'paper' | 'ink' // hairline color
  step: number // 0..1 — progressive fade + thinning across the family
  random: number // 0..1 — seeded per-clone position/rotation jitter
  depth: number // 0..1 — 2.5D parallax: per-clone scale + drift, far fades
}

// The lattice register: a grid of primitive shapes whose STATE changes
// where the curve passes — the Provencher plates / Das Fest read. The
// lattice runs edge to edge; the figure appears by substitution.
export type PatternState = {
  enabled: boolean
  cells: number // 12..64 — columns; rows follow the artboard ratio
  size: number // 0.2..1 — primitive size relative to the cell
  range: number // 0.5..4 — how far (in cells) the curve's influence reaches
  mode: 'lattice' | 'trace' // full grid with highlights vs curve cells only
  tone: 'paper' | 'ink'
}

// Post-MVP; reserved so recipes stay forward-compatible.
export type ImageState = {
  transform: { x: number; y: number; scale: number }
  opacity: number
}

// Imported poster images: grid-snapped blocks, one of which can be
// promoted to the full-bleed background. Sources are downscaled data
// URLs — kept in autosave, STRIPPED from share links (URL size).
export type ImageItem = {
  id: string
  src: string
  anchor: { col: number; row: number; colSpan: number; rowSpan: number }
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
  // the figure design space: smooth warps where classic Lissajous and the
  // Meta infinity are just two points. All zero at classic.
  waist: number // 0..1 — narrows the crossover
  fullness: number // 0..1 — fuller loops, flatter arcs
  bias: number // −1..1 — pulls both extrema toward/away from the crossing
  lean: number // −1..1 — the same pull, top half only (hump lean)
  cross: number // −1..1 — lifts/drops the crossing; caps stay pinned
  morph: number // 0..1 — blends the base wave from pure sine to the Meta profile
  aspect: number // 0.4..1 — display height/width of the figure drawing
  durationMs: number
  presetId?: string
  // reserved (path-following text was cut from the lab UI; recipes keep loading)
  pathShape: PathShape
  pathText: string
  pathTextSize: number
  pathSpeed: number
  pathEased: boolean
}

// The PATH lab: advert-style brand animation — objects riding the curve.
// FLOW is a text marquee along the figure, ORBIT a ring of image tiles,
// ASSEMBLE a Cavalry-style headline whose characters fly in from the
// path using the MOTION tab's easing, REVEAL types the line along the
// figure with a camera tracking the pen. One figure family drives it all.
export type PathScene = 'flow' | 'orbit' | 'assemble' | 'reveal'

export type PathLabState = {
  scene: PathScene
  ratioX: number // the path figure, 1..8
  ratioY: number
  phase: number // radians
  curve?: CurveKind // undefined = classic Lissajous; 'meta' = the ∞ mark
  text: string
  textSize: number // px in stage units
  speed: number // revolutions per second along the path (flow)
  count: number // orbit tile count
  groups: number // orbit flocks: tiles clump into this many groups
  spacing: number // orbit: arc px between tiles within a flock
  lapMs: number // orbit: one eased lap takes this long
  durationMs: number // assemble in-out duration
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
  background: BackgroundState
  cloner: ClonerState
  pattern: PatternState
  motionLab: MotionLabState
  pathLab: PathLabState
  images: ImageItem[]
  bgImageId: string | null
  image?: ImageState
  export: ExportState
}
