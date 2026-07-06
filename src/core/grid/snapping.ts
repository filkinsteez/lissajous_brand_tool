import type { EditorialGrid } from './types'

// Snap a point to the nearest grid anchor. Strength scales the capture
// radius; 0 disables snapping entirely.
export function snapPoint(
  grid: EditorialGrid,
  x: number,
  y: number,
  strength: number,
): { x: number; y: number; snapped: boolean } {
  if (strength <= 0) return { x, y, snapped: false }
  const radius = 12 + strength * 36
  let best = radius * radius
  let bx = x
  let by = y
  let snapped = false
  for (const a of grid.anchors) {
    const dx = a.x - x
    const dy = a.y - y
    const d = dx * dx + dy * dy
    if (d < best) {
      best = d
      bx = a.x
      by = a.y
      snapped = true
    }
  }
  return { x: bx, y: by, snapped }
}
