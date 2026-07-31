import type { EditorialGrid } from '@/core/grid/types'
import { mulberry32, type Rng } from '@/core/math/random'
import { shuffleLayout } from '@/core/typography/layoutShuffle'
import { BRAND_ROLE_ORDER, type ColorRole } from '@/core/color/palette'
import type { ProjectState } from './types'

// SHUFFLE: one gesture that re-deals the whole composition — the grid
// structure, the type layout on it, the image blocks, and the shader's
// seed, palette order and expression.
//
// Ranges are deliberately narrower than the sliders' full travel. The
// extremes are reachable by hand and some of them (warp cranked, drift
// cranked) render as mud; a shuffle must always hand back something
// worth looking at, so it explores the good part of the space.

const lerp = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo)
const pick = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1))

function dealImageAnchor(rng: Rng, nCols: number, nRows: number) {
  const colSpan = 1 + Math.floor(rng() * Math.min(3, nCols))
  const col = Math.floor(rng() * Math.max(1, nCols - colSpan + 1))
  const rowSpan = 2 + Math.floor(rng() * 3)
  const row = Math.floor(rng() * Math.max(1, nRows - rowSpan))
  return { col, row, colSpan, rowSpan }
}

// Locked roles keep their slots (that is what locking means); everything
// else is re-dealt, so the field leads with a different color family.
export function shuffleRoles(roles: ColorRole[], locked: ColorRole[], rng: Rng): ColorRole[] {
  const lockedSet = new Set(locked)
  const source = roles.length ? roles : BRAND_ROLE_ORDER
  const free = source.filter((r) => !lockedSet.has(r))
  for (let i = free.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[free[i], free[j]] = [free[j], free[i]]
  }
  let f = 0
  return source.map((role) => (lockedSet.has(role) ? role : free[f++]))
}

export type ShufflePatch = Pick<
  ProjectState,
  'layoutSeed' | 'typeBlocks' | 'images' | 'grid' | 'background'
>

export function shuffleProject(
  project: ProjectState,
  grid: EditorialGrid,
  shuffleSeed: number,
): ShufflePatch {
  const rng = mulberry32((project.seed ^ 0x2f6b1d3) + shuffleSeed * 7919)
  const nCols = grid.columnBoundaries.length - 1
  const nRows = grid.rowBoundaries.length - 1

  // the grid itself moves: different column/row counts and margins are
  // what make two shuffles read as different posters rather than the
  // same poster with the text moved
  const nextGrid: ProjectState['grid'] = {
    ...project.grid,
    columnBias: pick(rng, 4, 8),
    rowBias: pick(rng, 6, 12),
    marginRestraint: lerp(rng, 0.3, 0.7),
    gutterScale: lerp(rng, 0.7, 1.4),
  }

  const bg = project.background
  const nextBackground: ProjectState['background'] = {
    ...bg,
    mode: 'field',
    seed: Math.floor(rng() * 1_000_000),
    roles: shuffleRoles(bg.roles, bg.lockedRoles, rng),
    width: lerp(rng, 0.28, 0.5),
    fieldScale: lerp(rng, 0.8, 1.8),
    fieldOffsetX: lerp(rng, -0.22, 0.22),
    fieldOffsetY: lerp(rng, -0.22, 0.22),
    form: lerp(rng, 0, 0.85),
    softness: lerp(rng, 0.6, 1),
    layers: pick(rng, 4, 8),
    arcSpread: lerp(rng, 1, 2.2),
    warp: lerp(rng, 0.3, 0.85),
    drift: lerp(rng, 0.05, 0.45),
    grain: lerp(rng, 0.05, 0.22),
    contrast: lerp(rng, 1.1, 1.6),
    presetId: undefined,
  }

  // the type layout is re-dealt against the CURRENT grid: the new grid's
  // boundaries are derived downstream, and the layout engine clamps to
  // whatever it lands on
  const layoutSeed = project.layoutSeed + 1
  return {
    layoutSeed,
    typeBlocks: shuffleLayout(project, grid, layoutSeed),
    images: project.images.map((im) => ({ ...im, anchor: dealImageAnchor(rng, nCols, nRows) })),
    grid: nextGrid,
    background: nextBackground,
  }
}
