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
  // content inset within cells (the cell-side counterpart of margin);
  // 0 = flush on the boundary lines, the historical contract
  paddingScale?: number // 0..2
  baselineRhythm: number // multiplier on base leading
  selectedNodeIds: number[]
  snapStrength: number // 0..1 — schema kept for old recipes; no consumers
}

export type TypeRole = 'headline' | 'caption' | 'metadata'
// one typeface: Optimistic
export type FontFamilyId = 'optimistic'
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
  // free artboard-px position + width, set by dragging with SNAP OFF;
  // snap-ON gestures and layout shuffles clear it back to the anchor
  free?: { x: number; y: number; w: number }
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
  typeCalm: boolean // pigment thins where type sits (couples field to text layout)
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

// The contour register: the curve duplicated as nested hairline contour
// offsets — field lines around the mark, drawn over the background.
// STEP / RANDOM / DEPTH are C4D-style effectors: per-clone modulation by
// index (step), by seeded jitter (random), and by a 2.5D stacked-plane
// parallax (depth). With bound shapes it stamps them along the rings.
export type ContourState = {
  // Every effector can bind drawn shapes (project.shapes ids): bound
  // shapes become the geometry it distributes; empty = built-in glyphs.
  sourceShapeIds: string[]
  count: number // 1..14 contour levels
  spacing: number // 0.01..0.16 of the artboard's short edge — first offset
  growth: number // 1..2.2 — offset progression exponent (1 = even rings)
  weight: number // 0.5..4 — hairline stroke, artboard px
  step: number // 0..1 — progressive fade + thinning across the family
  random: number // 0..1 — seeded per-clone position/rotation jitter
  depth: number // 0..1 — 2.5D parallax: per-clone scale + drift, far fades
}

// The sheet register: a C4D/Cavalry-style GRID CLONER. A real shape
// vocabulary (incl. truchet-style halves and quarters, and the meta
// mark) cloned on a uniform or recursively PACKED grid, stacked in Z as
// 2.5D depth layers. Variation comes from two distinct sources:
//   RANDOM — per-clone white jitter (position, tilt, size)
//   NOISE  — a smooth field over the sheet: size, stroke/fill choice and
//            shape selection vary in coherent PATCHES, not salt
export type SheetShape =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'half'
  | 'quarter'
  | 'cross'
  | 'meta'
  | 'mixed'

export type SheetState = {
  sourceShapeIds: string[] // bound drawn shapes; empty = built-in vocabulary
  // BOUNDS: the sheet lays its grid inside this fractional rect of the
  // artboard. Absent (old saves) = full bleed. Edited as the on-canvas
  // dashed frame while the sheet is the selected effector.
  boxX?: number
  boxY?: number
  boxW?: number
  boxH?: number
  shape: SheetShape
  layout: 'grid' | 'packed' // packed = recursive subdivision, mixed cell sizes
  countX: number // 2..64 — columns (packed: base columns before subdivision)
  countY: number // 2..80
  countZ: number // 1..3 — depth layers (2.5D stack)
  size: number // 0.1..0.9 of a cell
  depth: number // 0..1 — layer separation: scale + drift + fade per layer
  random: number // 0..1 — seeded per-clone white jitter
  noise: number // 0..1 — smooth-field modulation strength
  strokeMix: number // 0..1 — fraction of the population drawn as outlines
  curve: number // 0..1 — CURVE effector: clones swell near the figure and
  // flip to filled inside its lobes — the mark emerges through the sheet
}

// The repeater register: one seed shape echoed N times with an
// ACCUMULATING per-step transform — C4D/Cavalry repeater semantics.
// LINEAR steps offset+rotation+scale per copy (cascades, echo trails);
// RADIAL places copies on an arc around the origin (fans, rosettes),
// each oriented along its spoke; GRID lays countX×countY copies around
// the origin with the accumulation sweeping in reading order.
// The merged CLONER: one instrument, four layouts. GRID runs the sheet
// engine (bounds box, packing, noise fields); RADIAL and LINEAR run the
// accumulating repeat engine; CURVE stamps along the figure itself at
// equal arc spacing. SheetState/RepeaterState remain the engine-facing
// shapes — ClonerState is structurally a superset of SheetState, and
// the repeat engine gets an adapted view at the call site.
export type ClonerMode = 'grid' | 'radial' | 'linear' | 'curve'

export type ClonerState = {
  sourceShapeIds: string[]
  mode: ClonerMode
  shape: SheetShape
  // GRID — the sheet machinery
  layout: 'grid' | 'packed'
  countX: number
  countY: number
  countZ: number
  size: number // grid: fraction of a cell
  depth: number
  random: number
  noise: number
  strokeMix: number
  curve: number
  boxX?: number
  boxY?: number
  boxW?: number
  boxH?: number
  // RADIAL / LINEAR / CURVE — the repeat machinery
  count: number
  stampSize: number // fraction of the short edge
  originX: number
  originY: number
  stepX: number
  stepY: number
  radius: number
  span: number
  rotate: number
  scaleStep: number
  fade: number
  stroked: boolean
}

export type RepeaterState = {
  sourceShapeIds: string[] // bound drawn shapes; empty = built-in vocabulary
  shape: SheetShape
  mode: 'linear' | 'radial' | 'grid'
  count: number // linear/radial: 2..48 copies
  countX: number // grid: 2..12 columns
  countY: number // grid: 2..12 rows
  size: number // seed half-size, fraction of the short edge (0.02..0.3)
  originX: number // 0..1 of artboard width
  originY: number // 0..1 of artboard height
  stepX: number // linear: per-step offset; grid: cell spacing (of width)
  stepY: number
  radius: number // radial: ring radius, fraction of the short edge
  span: number // radial: total arc in radians (up to 2π)
  rotate: number // per-step rotation, radians
  scaleStep: number // per-step scale multiplier (0.7..1.3)
  fade: number // 0..1 — opacity falloff across the family
  stroked: boolean // the whole family as outlines
}

// The array register: an uploaded image re-drawn as a glyph array —
// per-cell luminance picks a glyph tier (dark = heavy marks, light =
// faint lattice), glyph color deals from the brand palette, and BLEND
// pulls each glyph toward the image's own sampled color, from pure
// graphic array to image mosaic.
export type ImageArrayState = {
  sourceShapeIds: string[] // bound drawn shapes; empty = built-in glyph tiers
  imageId: string | null // which upload drives the array
  cells: number // 16..96 — columns; rows follow the artboard ratio
  size: number // 0.2..1 — glyph size relative to the cell
  threshold: number // 0..1 — luminance cutoff: lighter cells fall to lattice
  blend: number // 0..1 — palette deal -> sampled image color
  invert: boolean // read light-on-dark images
}

// The lattice register: a grid of primitive shapes whose STATE changes
// where the curve passes — the Provencher plates / Das Fest read. The
// lattice runs edge to edge; the figure appears by substitution.
export type PatternState = {
  sourceShapeIds: string[] // bound drawn shapes; empty = built-in tiers
  cells: number // 12..64 — columns; rows follow the artboard ratio
  size: number // 0.2..1 — primitive size relative to the cell
  range: number // 0.5..4 — how far (in cells) the curve's influence reaches
  mode: 'lattice' | 'trace' // full grid with highlights vs curve cells only
}

// The tiles register: flush, edge-to-edge modular tile systems — the
// coded-poster language (Sagmeister pixel checkers, quarter-ring
// truchet windows). Cells fill their bounds completely, so adjacent
// tiles CONNECT; the composition is per-cell STATE, not floating
// glyphs. The curve drives where cells subdivide or cohere.
export type TileStyle = 'checker' | 'rings'

export type TilesState = {
  sourceShapeIds: string[] // present for the shared tree machinery; tiles use their own vocabulary
  style: TileStyle
  seed: number
  cols: number // 4..32 — columns; rows follow the artboard ratio
  density: number // 0..1 — fraction of cells that carry a tile at all
  levels: number // checker: max subdivision depth (1 = solid blocks only)
  rings: number // rings: concentric quarter-arcs per tile
  curve: number // 0..1 — the figure's influence: subdivision depth / rotation coherence
  duo: number // 0..1 — how much of the population deals to the second color
  weight: number // 0..1 — lattice stroke weight (checker draws its own grid)
  colorB?: LayerColor // the counter ink (absent = INK) — 'sampled' not offered
}

// The organic register: the raster-first procedural composition engine.
// One recipe = distribution -> fields -> per-point attribute mapping ->
// prototype stamping -> raster finish. Deterministic per seed; every
// random choice reads its own channel keyed by stable point id, so one
// dial never reshuffles unrelated points.
export type OrganicDistribution = 'poisson' | 'phyllo' | 'hex' | 'curve' | 'cluster'
export type OrganicProto = 'blob' | 'super' | 'capsule' | 'star' | 'ribbon' | 'circle' | 'meta'
export type OrganicRotationMode = 'flow' | 'tangent' | 'random' | 'fixed'

export type OrganicState = {
  sourceShapeIds: string[] // bound drawn shapes; empty = protos vocabulary
  seed: number
  distribution: OrganicDistribution
  count: number // 40..2400 target points (pre-cull)
  spacing: number // 0.01..0.09 of the short edge — poisson radius / lattice pitch
  protos: OrganicProto[] // the enabled shape vocabulary
  size: number // 0.008..0.1 of the short edge — base half-size
  sizeRange: number // 0..1 — per-point size spread
  sizeField: number // -1..1 — density field drives size (sign flips direction)
  curvePull: number // 0..1 — density gathers toward the Lissajous figure
  focalStrength: number // 0..1 — radial focal density
  focalX: number // 0..1 of width
  focalY: number // 0..1 of height
  noiseScale: number // 0.5..6 — field noise frequency
  noiseAmount: number // 0..1 — noise contribution to density
  rotation: OrganicRotationMode
  rotationJitter: number // 0..1
  colorField: number // 0..1 — palette pick follows the field vs the deal
  opacityRange: number // 0..1 — per-point opacity spread
  goo: number // 0..1 — blur-threshold merge (metaball finish)
  soft: number // 0..1 — edge feather width
  grain: number // 0..1 — raster grain in the finish
}

// ---------------------------------------------------------------------------
// The shape layer stack. The five registers stopped being singletons:
// each is a layer TYPE, instantiable any number of times, stacked in
// z-order (index 0 = bottom), each with its own opacity, blend mode,
// color and fill texture. Live rendering uses CSS mix-blend-mode; the
// PNG export replicates it with globalCompositeOperation — the mode
// names are shared by both.
export type ShapeLayerType = 'clones' | 'pattern' | 'cloner' | 'array' | 'organic' | 'tiles'
export type LayerBlend = 'normal' | 'multiply' | 'screen' | 'overlay'
// r0..r2 are the palette's three leading roles; 'sampled' reads the
// gradient field's color underneath each clone (sheet/repeater only)
export type LayerColor = 'paper' | 'ink' | 'r0' | 'r1' | 'r2' | 'sampled'
// subtexture: filled shapes carry micro-texture instead of flat paint
export type LayerTexture = 'solid' | 'dither' | 'hatch' | 'dots'

export type ShapeLayerBase = {
  id: string
  name: string
  visible: boolean
  opacity: number // 0..1 — applied to the flattened layer, not per shape
  blend: LayerBlend
  color: LayerColor
  texture: LayerTexture
  texDensity: number // 0..1 — how heavy the micro-texture weave runs
}

export type ShapeLayer = ShapeLayerBase &
  (
    | { type: 'clones'; params: ContourState }
    | { type: 'pattern'; params: PatternState }
    | { type: 'cloner'; params: ClonerState }
    | { type: 'array'; params: ImageArrayState }
    | { type: 'organic'; params: OrganicState }
    | { type: 'tiles'; params: TilesState }
  )

// Drawn primitives — Cavalry-style direct drawing on the canvas. Free
// positioned (artboard px), one flat list painted above the procedural
// layers and images, below type. Array order is paint order.
export type ShapeItemKind = 'rect' | 'ellipse' | 'poly' | 'star' | 'line' | 'blob'

export type ShapeItem = {
  id: string
  kind: ShapeItemKind
  x: number // top-left, artboard px
  y: number
  w: number
  h: number
  fill: string // hex
  opacity: number // 0..1
  seed: number // star irregularity / blob harmonics
  flip?: boolean // line: which diagonal of the box
  stroke?: string // hex; absent = no stroke
  strokeWidth?: number // artboard px
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
  // free artboard-px rect, set by dragging with SNAP OFF. Present = the
  // image is a free object; absent = a grid tenant laid out by anchor.
  // Dragging or resizing with snap ON clears it (re-anchors).
  free?: { x: number; y: number; w: number; h: number }
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
  layers: ShapeLayer[]
  motionLab: MotionLabState
  pathLab: PathLabState
  images: ImageItem[]
  shapes: ShapeItem[]
  bgImageId: string | null
  image?: ImageState
  export: ExportState
}
