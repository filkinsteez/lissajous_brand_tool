import type { TypeBlockState } from '@/core/state/types'

// Canvas selection logic, kept pure so the pointer plumbing in the
// TypeLayer stays thin and the behavior stays testable. Conventions
// follow the Figma-class standard: marquee intersects, shift toggles,
// arrows nudge on the grid's own units.

export type Rect = { x: number; y: number; w: number; h: number }

export function normalizeRect(x0: number, y0: number, x1: number, y1: number): Rect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  }
}

const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

// Marquee semantics: everything the rubber band TOUCHES is selected
// (Figma's model — no need to fully enclose). Additive keeps the
// existing selection and unions the hits.
export function marqueeHits(
  blocks: { id: string; rect: Rect }[],
  marquee: Rect,
  additive: string[] = [],
): string[] {
  const hits = blocks.filter((b) => intersects(b.rect, marquee)).map((b) => b.id)
  if (!additive.length) return hits
  return [...additive, ...hits.filter((id) => !additive.includes(id))]
}

export function toggleId(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]
}

// Overlap resolution: repeated clicks on the same spot walk DOWN the
// stack (topmost first, wrapping) — the Illustrator/Sketch cycle, no
// modifier key to learn. `stack` is ordered top to bottom.
export function cycleHit(stack: string[], currentId?: string): string | undefined {
  if (!stack.length) return undefined
  const i = currentId ? stack.indexOf(currentId) : -1
  return i < 0 ? stack[0] : stack[(i + 1) % stack.length]
}

// Reorder an object among its siblings (paint order): dir +1 paints
// later = in front, -1 behind. Non-member entries (background image,
// array assets) hold their positions; only members trade places.
export function moveAmong<T>(
  arr: T[],
  isMember: (t: T) => boolean,
  match: (t: T) => boolean,
  dir: 1 | -1,
): T[] {
  const memberIdx = arr.map((t, i) => (isMember(t) ? i : -1)).filter((i) => i >= 0)
  const at = arr.findIndex(match)
  const pos = memberIdx.indexOf(at)
  if (at < 0 || pos < 0) return arr
  const swapWith = memberIdx[pos + dir]
  if (swapWith === undefined) return arr
  const out = [...arr]
  ;[out[at], out[swapWith]] = [out[swapWith], out[at]]
  return out
}

export type NudgeDir = 'left' | 'right' | 'up' | 'down'

// Nudge on the system's own units: columns horizontally, baseline steps
// vertically (big = 4 baselines, the Figma big-nudge idea translated to
// a grid-locked canvas). Rows stay put — vertical travel lives in
// baselineOffset so a nudge is always one reversible step.
export function nudgeAnchor(
  anchor: TypeBlockState['anchor'],
  dir: NudgeDir,
  nCols: number,
  big = false,
): TypeBlockState['anchor'] {
  const stepY = big ? 4 : 1
  switch (dir) {
    case 'left':
      return { ...anchor, col: Math.max(0, anchor.col - 1) }
    case 'right':
      return { ...anchor, col: Math.min(Math.max(0, nCols - 1), anchor.col + 1) }
    case 'up':
      return { ...anchor, baselineOffset: (anchor.baselineOffset ?? 0) - stepY }
    default:
      return { ...anchor, baselineOffset: (anchor.baselineOffset ?? 0) + stepY }
  }
}
