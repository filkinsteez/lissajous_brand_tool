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
  sheet: 'SHEET',
  repeater: 'REPEATER',
  array: 'ARRAY',
  clones: 'CLONES',
  pattern: 'PATTERN',
}

export const DEFAULT_LAYER_PARAMS = {
  clones: {
    count: 7,
    spacing: 0.045,
    growth: 1.35,
    weight: 1.5,
    step: 0,
    random: 0,
    depth: 0,
  },
  pattern: {
    cells: 32,
    size: 0.55,
    range: 1.6,
    mode: 'lattice' as const,
  },
  sheet: {
    shape: 'mixed' as const,
    layout: 'grid' as const,
    countX: 8,
    countY: 10,
    countZ: 1,
    size: 0.5,
    depth: 0.35,
    random: 0.15,
    noise: 0.6,
    strokeMix: 0.35,
    curve: 0,
  },
  repeater: {
    shape: 'half' as const,
    mode: 'radial' as const,
    count: 12,
    countX: 5,
    countY: 4,
    size: 0.08,
    originX: 0.5,
    originY: 0.5,
    stepX: 0.05,
    stepY: 0.035,
    radius: 0.28,
    span: Math.PI * 2,
    rotate: 0,
    scaleStep: 1,
    fade: 0.2,
    stroked: false,
  },
  array: {
    imageId: null,
    cells: 48,
    size: 0.7,
    threshold: 0.72,
    blend: 0,
    invert: false,
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
  switch (type) {
    case 'clones':
      return { ...base, type, params: { ...DEFAULT_LAYER_PARAMS.clones } }
    case 'pattern':
      return { ...base, type, params: { ...DEFAULT_LAYER_PARAMS.pattern } }
    case 'sheet':
      return { ...base, type, params: { ...DEFAULT_LAYER_PARAMS.sheet } }
    case 'repeater':
      return { ...base, type, params: { ...DEFAULT_LAYER_PARAMS.repeater } }
    case 'array':
      return { ...base, type, params: { ...DEFAULT_LAYER_PARAMS.array } }
  }
}

export const DEFAULT_BACKGROUND_STATE: ProjectState['background'] = {
  mode: 'field',
  paletteId: BRAND_PALETTE.id,
  roles: ['blue', 'cyan', 'magenta', 'orange', 'yellow', 'green', 'violet', 'neutral', 'ink'],
  lockedRoles: ['blue', 'cyan', 'magenta'],
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
    artboard: { preset: 'portrait', ...ARTBOARD_PRESETS.portrait, background: PAPER },
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
      baselineRhythm: 1,
      selectedNodeIds: [],
      snapStrength: 0.8,
    },
    typeBlocks: [
      {
        id: 'headline',
        role: 'headline',
        text: 'META ∞',
        fontFamily: 'flex',
        size: 120,
        weight: 640,
        width: 118,
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
        text: 'The grid on this poster is built from the crossings of the Meta ∞ curve. Adjust it in the System section.',
        fontFamily: 'flex',
        size: 24,
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
        fontFamily: 'mono',
        size: 16,
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
      sourceText: 'LISSAJOUS',
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
    bgImageId: null,
    export: { scale: 2 },
  }
}
