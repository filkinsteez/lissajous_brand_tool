import type { ProjectState, TypeAlign, TypeBlockState } from '@/core/state/types'
import type { EditorialGrid } from '@/core/grid/types'
import { layoutTypeBlock } from './textBlocks'
import { mulberry32, rngPick, type Rng } from '@/core/math/random'

type Placement = {
  col: number
  row: number
  colSpan: number
  baselineOffset: number
  align: TypeAlign
}

type LayoutPlan = Record<'headline' | 'caption' | 'metadata', Placement>

// Editorial layout archetypes. Each is a function of the grid dimensions so
// the same archetype adapts to any column/row bias. The point is variety
// with intent: mixed keylines, mixed corners — never three blocks stacked
// on one edge, never uniform scatter.
type Archetype = (nCols: number, nRows: number, rng: Rng) => LayoutPlan

const ARCHETYPES: Archetype[] = [
  // poster classic: big headline low-left, caption high-right, meta top-left
  (nCols, nRows) => ({
    headline: { col: 0, row: nRows - 3, colSpan: nCols, baselineOffset: 0, align: 'left' },
    caption: { col: nCols - 2, row: 1, colSpan: 2, baselineOffset: 0, align: 'left' },
    metadata: { col: 0, row: 0, colSpan: 3, baselineOffset: 0, align: 'left' },
  }),
  // inverted: headline at the top, caption low-left, meta bottom-right
  (nCols, nRows) => ({
    headline: { col: 0, row: 1, colSpan: nCols, baselineOffset: 0, align: 'left' },
    caption: { col: 0, row: nRows - 2, colSpan: 2, baselineOffset: 0, align: 'left' },
    metadata: { col: nCols - 3, row: nRows, colSpan: 3, baselineOffset: -1, align: 'right' },
  }),
  // right-ragged: everything hangs off the right keyline
  (nCols, nRows) => ({
    headline: { col: 1, row: nRows - 3, colSpan: nCols - 1, baselineOffset: 0, align: 'right' },
    caption: { col: nCols - 2, row: 1, colSpan: 2, baselineOffset: 0, align: 'right' },
    metadata: { col: nCols - 3, row: 0, colSpan: 3, baselineOffset: 0, align: 'right' },
  }),
  // midfield: headline floats mid-left, caption in the upper-left corner
  (nCols, nRows, rng) => ({
    headline: {
      col: 0,
      row: Math.max(2, Math.round(nRows * 0.45)),
      colSpan: Math.max(3, nCols - 2),
      baselineOffset: rng() < 0.5 ? 0 : 2,
      align: 'left',
    },
    caption: { col: 0, row: 0, colSpan: 2, baselineOffset: 1, align: 'left' },
    metadata: { col: nCols - 3, row: nRows, colSpan: 3, baselineOffset: -1, align: 'right' },
  }),
  // split field: headline mid-right, caption low-left, meta top-center
  (nCols, nRows) => ({
    headline: {
      col: Math.max(1, Math.floor(nCols / 3)),
      row: Math.max(2, Math.round(nRows * 0.35)),
      colSpan: nCols - Math.max(1, Math.floor(nCols / 3)),
      baselineOffset: 0,
      align: 'right',
    },
    caption: { col: 0, row: nRows - 2, colSpan: 2, baselineOffset: 0, align: 'left' },
    metadata: { col: Math.floor(nCols / 3), row: 0, colSpan: 3, baselineOffset: 0, align: 'left' },
  }),
  // canyon: headline bottom full-width, caption + meta paired at the top edge
  (nCols, nRows) => ({
    headline: { col: 0, row: nRows - 2, colSpan: nCols, baselineOffset: -2, align: 'left' },
    caption: { col: 0, row: 0, colSpan: 2, baselineOffset: 1, align: 'left' },
    metadata: { col: nCols - 3, row: 0, colSpan: 3, baselineOffset: 0, align: 'right' },
  }),
]

function overlaps(
  a: { x: number; y: number; w: number; estH: number },
  b: { x: number; y: number; w: number; estH: number },
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.estH && b.y < a.y + a.estH
}

// Deterministic layout for a given shuffle seed: pick an archetype, jitter
// columns/offsets a step where safe, then resolve headline/caption overlap
// by walking the caption to the opposite side or nudging it a row.
export function shuffleLayout(
  project: ProjectState,
  grid: EditorialGrid,
  layoutSeed: number,
): TypeBlockState[] {
  const rng = mulberry32((project.seed ^ 0x51ed2701) + layoutSeed * 6151)
  const nCols = grid.columnBoundaries.length - 1
  const nRows = grid.rowBoundaries.length - 1

  const plan = rngPick(rng, ARCHETYPES)(nCols, nRows, rng)

  // jitter: shift a block by one column / one baseline where it stays legal
  for (const role of ['caption', 'metadata'] as const) {
    const p = plan[role]
    if (rng() < 0.4) p.col = Math.max(0, Math.min(nCols - p.colSpan, p.col + (rng() < 0.5 ? -1 : 1)))
    if (rng() < 0.4) p.baselineOffset += rng() < 0.5 ? 1 : 2
  }
  if (rng() < 0.35 && plan.headline.colSpan > 3) {
    plan.headline.colSpan -= 1
    if (plan.headline.align === 'right') plan.headline.col += 1
  }

  const applied = project.typeBlocks.map((b) => {
    const p = plan[b.role as keyof LayoutPlan]
    if (!p) return b
    return {
      ...b,
      align: p.align,
      anchor: {
        col: Math.max(0, Math.min(nCols - 1, p.col)),
        row: Math.max(0, Math.min(nRows, p.row)),
        colSpan: Math.max(1, Math.min(nCols, p.colSpan)),
        baselineOffset: p.baselineOffset,
      },
    }
  })

  // overlap resolution: caption yields to the headline
  const headline = applied.find((b) => b.role === 'headline')
  const caption = applied.find((b) => b.role === 'caption')
  if (headline && caption) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const hBox = layoutTypeBlock(headline, grid)
      const cBox = layoutTypeBlock(caption, grid)
      if (!overlaps(hBox, cBox)) break
      // walk the caption up a row, wrapping to the far column once
      if (attempt === 0) {
        caption.anchor.col = caption.anchor.col >= nCols / 2 ? 0 : Math.max(0, nCols - caption.anchor.colSpan)
      } else {
        caption.anchor.row = Math.max(0, caption.anchor.row - 1)
        caption.anchor.baselineOffset = 0
      }
    }
  }

  return applied
}
