import {
  PROJECT_VERSION,
  type ArtboardPresetId,
  type ProjectState,
  type ShapeLayer,
  type ShapeLayerType,
} from './types'
import { META_ASPECT, META_PHASE } from '@/core/lissajous/equation'
import { BRAND_PALETTE } from '@/core/color/palette'

export const ARTBOARD_PRESETS: Record<ArtboardPresetId, { width: number; height: number; label: string }> = {
  portrait: { width: 1200, height: 1600, label: 'Portrait 3:4' },
  'a-series': { width: 1191, height: 1684, label: 'A Series' },
  square: { width: 1400, height: 1400, label: 'Square' },
  wide: { width: 1920, height: 1080, label: 'Wide 16:9' },
}

export const INK = '#141412'
export const PAPER = '#f4f2ed'

// ---------------------------------------------------------------------------
// Shape layer defaults. Each layer TYPE has a params default; layers are
// minted from these by createShapeLayer (panel ADD, autosave migration).

export const LAYER_TYPE_LABELS: Record<ShapeLayerType, string> = {
  organic: 'Organic',
  cloner: 'Cloner',
  tiles: 'Tiles',
  array: 'Array',
  clones: 'Contour',
  pattern: 'Pattern',
}

export const DEFAULT_LAYER_PARAMS = {
  clones: {
    sourceShapeIds: [] as string[],
    count: 7,
    spacing: 0.045,
    growth: 1.35,
    weight: 1.5,
    step: 0,
    random: 0,
    depth: 0,
  },
  pattern: {
    sourceShapeIds: [] as string[],
    cells: 32,
    size: 0.55,
    range: 1.6,
    mode: 'lattice' as const,
  },
  // the merged cloner opens as an EXACT grid: one shape, clean rows,
  // zero jitter — randomness/noise/depth are dials, not the default
  cloner: {
    sourceShapeIds: [] as string[],
    mode: 'grid' as const,
    shape: 'circle' as const,
    layout: 'grid' as const,
    countX: 8,
    countY: 10,
    countZ: 1,
    size: 0.5,
    depth: 0,
    random: 0,
    noise: 0,
    strokeMix: 0,
    curve: 0,
    boxX: 0,
    boxY: 0,
    boxW: 1,
    boxH: 1,
    count: 12,
    stampSize: 0.08,
    originX: 0.5,
    originY: 0.5,
    stepX: 0.05,
    stepY: 0.035,
    radius: 0.28,
    span: Math.PI * 2,
    rotate: 0,
    scaleStep: 1,
    fade: 0,
    stroked: false,
  },
  // the coded-poster register: figure-driven out of the box
  tiles: {
    sourceShapeIds: [] as string[],
    style: 'checker' as const,
    seed: 7,
    cols: 14,
    density: 0.55,
    levels: 3,
    rings: 6,
    curve: 0.6,
    duo: 0.35,
    weight: 0.35,
  },
  array: {
    sourceShapeIds: [] as string[],
    imageId: null,
    cells: 48,
    size: 0.7,
    threshold: 0.72,
    blend: 0,
    invert: false,
  },
  organic: {
    sourceShapeIds: [] as string[],
    seed: 4021,
    distribution: 'poisson' as const,
    count: 900,
    spacing: 0.022,
    protos: ['blob', 'circle'] as ('blob' | 'circle')[],
    size: 0.02,
    sizeRange: 0.6,
    sizeField: 0.6,
    curvePull: 0.7,
    focalStrength: 0,
    focalX: 0.5,
    focalY: 0.5,
    noiseScale: 2.2,
    noiseAmount: 0.5,
    rotation: 'flow' as const,
    rotationJitter: 0.3,
    colorField: 0.5,
    opacityRange: 0.25,
    goo: 0.35,
    soft: 0.25,
    grain: 0.2,
  },
}

let layerCounter = 0

export function createShapeLayer(
  type: ShapeLayerType,
  existing: ShapeLayer[] = [],
): ShapeLayer {
  const n = existing.filter((l) => l.type === type).length + 1
  const base = {
    id: `ly-${Date.now().toString(36)}-${layerCounter++}`,
    name: n > 1 ? `${LAYER_TYPE_LABELS[type]} ${n}` : LAYER_TYPE_LABELS[type],
    visible: true,
    opacity: 1,
    blend: 'normal' as const,
    color: 'paper' as const,
    texture: 'solid' as const,
    texDensity: 0.5,
  }
  // fresh sourceShapeIds per layer — the default array must never be a
  // shared reference an accidental mutation could thread between layers
  switch (type) {
    case 'clones':
      return { ...base, type, params: { ...DEFAULT_LAYER_PARAMS.clones, sourceShapeIds: [] } }
    case 'pattern':
      return { ...base, type, params: { ...DEFAULT_LAYER_PARAMS.pattern, sourceShapeIds: [] } }
    case 'cloner':
      return { ...base, type, params: { ...DEFAULT_LAYER_PARAMS.cloner, sourceShapeIds: [] } }
    case 'tiles':
      return { ...base, type, params: { ...DEFAULT_LAYER_PARAMS.tiles, sourceShapeIds: [] } }
    case 'array':
      return { ...base, type, params: { ...DEFAULT_LAYER_PARAMS.array, sourceShapeIds: [] } }
    case 'organic':
      return {
        ...base,
        type,
        params: {
          ...DEFAULT_LAYER_PARAMS.organic,
          protos: [...DEFAULT_LAYER_PARAMS.organic.protos],
          sourceShapeIds: [],
        },
      }
  }
}

export const DEFAULT_BACKGROUND_STATE: ProjectState['background'] = {
  mode: 'field',
  paletteId: BRAND_PALETTE.id,
  roles: ['blue', 'cyan', 'magenta', 'orange', 'yellow', 'green', 'violet', 'neutral', 'ink'],
  // nothing is pinned by default: SHUFFLE re-deals the palette order, and
  // locking has no UI to release it again
  lockedRoles: [],
  ground: 'blue',
  seed: 6508,
  layers: 6,
  width: 0.46,
  fieldScale: 1,
  fieldOffsetX: 0,
  fieldOffsetY: 0,
  typeCalm: false,
  form: 0.6,
  softness: 0.96,
  arcSpread: 1.52,
  warp: 0.64,
  drift: 0.18,
  grain: 0.1,
  contrast: 1.56,
}

export function createDefaultProject(seed?: number): ProjectState {
  const projectSeed = seed ?? 1913
  const backgroundSeed = seed ?? DEFAULT_BACKGROUND_STATE.seed
  return {
    version: PROJECT_VERSION,
    seed: projectSeed,
    layoutSeed: 0,
    artboard: { preset: 'wide', ...ARTBOARD_PRESETS.wide, background: PAPER },
    lissajous: {
      frequencyX: 1,
      frequencyY: 2,
      phase: META_PHASE,
      amplitudeX: 0.92,
      amplitudeY: 0.92,
      rotation: 0,
      offsetX: 0,
      offsetY: 0,
      sampleDensity: 2048,
      curve: 'meta',
      presetId: 'meta',
    },
    grid: {
      mode: 'strict',
      marginRestraint: 0.5,
      columnBias: 6,
      rowBias: 8,
      gutterScale: 1,
      paddingScale: 0,
      baselineRhythm: 1,
      selectedNodeIds: [],
      snapStrength: 0.8,
    },
    typeBlocks: [
      {
        id: 'headline',
        role: 'headline',
        text: 'Meta',
        fontFamily: 'optimistic',
        // sized for the 1920-wide default artboard
        size: 190,
        weight: 640,
        width: 100,
        opticalSize: 144,
        lineHeight: 0.98,
        tracking: -0.015,
        textCase: 'none',
        align: 'left',
        anchor: { col: 0, row: 5, colSpan: 6 },
        materialInfluence: 1,
      },
      {
        id: 'caption',
        role: 'caption',
        text: 'The color, layout, and design are built from the same mathematical formula that creates the Meta symbol – creating an infinitely scalable and modular brand system.',
        fontFamily: 'optimistic',
        size: 27,
        weight: 460,
        width: 100,
        opticalSize: 14,
        lineHeight: 1.4,
        tracking: 0,
        textCase: 'none',
        align: 'left',
        anchor: { col: 4, row: 1, colSpan: 2 },
        materialInfluence: 0.6,
      },
      {
        id: 'metadata',
        role: 'metadata',
        text: 'LBS 001 — META ∞ — PHASE 109°',
        fontFamily: 'optimistic',
        size: 18,
        weight: 400,
        width: 100,
        opticalSize: 14,
        lineHeight: 1.2,
        tracking: 0.08,
        textCase: 'none',
        align: 'left',
        anchor: { col: 0, row: 0, colSpan: 3 },
        materialInfluence: 0.4,
      },
    ],
    glyphField: {
      enabled: false,
      sourceText: 'Lissajous',
      charset: '',
      mode: 'dense',
      density: 0.55,
      contrast: 0.55,
      scale: 20,
      sizeLevels: 2,
      tracking: 0.1,
      lineRhythm: 1,
      orientation: 'grid',
      overprint: false,
      pressureResponse: 0.8,
      randomness: 0,
      seedOffset: 0,
    },
    material: {
      enabled: false,
      preset: 'grain-01',
      pressure: 0.7,
      density: 0.5,
      grainSize: 0.35,
      drift: 0.2,
      fold: 0.3,
      ring: 0.4,
      contrast: 0.65,
      voidStrength: 0.5,
      motion: 0,
      ink: INK,
      paper: PAPER,
    },
    background: {
      ...DEFAULT_BACKGROUND_STATE,
      seed: backgroundSeed,
    },
    layers: [],
    motionLab: {
      ratioX: 1,
      ratioY: 2,
      phase: META_PHASE,
      read: 'velocity',
      reverse: false,
      strength: 0,
      decay: 0,
      lobe: -1,
      half: 'full',
      waist: 0,
      fullness: 0,
      bias: 0,
      lean: 0,
      cross: 0,
      morph: 1,
      aspect: META_ASPECT,
      durationMs: 900,
      pathShape: 'circle',
      pathText: 'LISSAJOUS — ',
      pathTextSize: 46,
      pathSpeed: 0.25,
      pathEased: false,
    },
    pathLab: {
      scene: 'flow',
      ratioX: 1,
      ratioY: 2,
      phase: Math.PI / 2,
      text: 'LISSAJOUS BRAND SYSTEM — RATIO 1:2 — ',
      textSize: 44,
      speed: 0.05,
      count: 8,
      groups: 2,
      spacing: 130,
      lapMs: 9000,
      durationMs: 2600,
    },
    images: [],
    shapes: [],
    bgImageId: null,
    // 1× — the artboard's own pixels. Scaling up is a deliberate act
    export: { scale: 1 },
  }
}
