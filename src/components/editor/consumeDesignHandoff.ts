import { takeDesignHandoff } from '@/core/lab/handoff'
import { getDerived } from '@/core/pipeline'
import { imageRect } from '@/core/grid/types'
import { importImageDataUrl } from '@/core/images'
import { useStore } from '@/core/state/store'

// Reshape a rect to `aspect` keeping its centre and its area — the
// block occupies the same visual weight in the same place, but now
// matches the image inside it, so cover-fit crops nothing.
export function refitToAspect(
  rect: { x: number; y: number; w: number; h: number },
  aspect: number,
): { x: number; y: number; w: number; h: number } {
  // non-finite or non-positive input must still yield a usable rect
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 1
  const w0 = Number.isFinite(rect.w) ? Math.abs(rect.w) : 1
  const h0 = Number.isFinite(rect.h) ? Math.abs(rect.h) : 1
  const area = w0 * h0 || 1
  const h = Math.sqrt(area / a)
  const w = h * a
  const x = Number.isFinite(rect.x) ? rect.x : 0
  const y = Number.isFinite(rect.y) ? rect.y : 0
  return { x: x + (w0 - w) / 2, y: y + (h0 - h) / 2, w, h }
}

// keep a rect on the page: a refit that preserves area can push a block
// past the artboard edge, and the artboard clips in canvas and export
export function clampToArtboard(
  rect: { x: number; y: number; w: number; h: number },
  artW: number,
  artH: number,
): { x: number; y: number; w: number; h: number } {
  // shrink to fit first (keeping aspect), then bring it back on-page
  const k = Math.min(1, artW / Math.max(1, rect.w), artH / Math.max(1, rect.h))
  const w = rect.w * k
  const h = rect.h * k
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  return {
    x: Math.max(0, Math.min(artW - w, cx - w / 2)),
    y: Math.max(0, Math.min(artH - h, cy - h / 2)),
    w,
    h,
  }
}

// "Send to Design" landing, called once on editor mount.
//
// Two cases: the handoff carries the id of the design block the lab was
// editing (entered via EDIT IN LAB) — then the send REPLACES that
// block's pixels in place, same size and position, which is what a
// round trip means. Without an id (a lab-first composition), the render
// lands as a centred FREE block sized to its own aspect.
//
// Either way the block records the composition's `aspect`, which is the
// DURABLE half of the guarantee: image blocks cover-fit, so a block
// whose shape drifts from its image crops it, and a grid cell's shape
// changes whenever the curve, columns, rows, margin or gutter change.
// imageRect inscribes the recorded aspect in whatever cell the block
// occupies, so the composition survives those changes, shuffles, and
// re-anchoring with the magnet — not just the moment it landed.
export function consumeDesignHandoff(): void {
  const handoff = takeDesignHandoff()
  if (!handoff) return
  const targetId = handoff.imageId

  const select = (id: string) =>
    useStore.getState().setUi({
      selectedImageIds: [id],
      selectedBlockId: undefined,
      selectedBlockIds: [],
      selectedShapeIds: [],
    })

  void (async () => {
    // downscale before it enters project state: undo history snapshots
    // the project on every edit and the autosave has a ~5MB quota, so a
    // raw multi-megabyte lab PNG here breaks persistence outright
    const { src, aspect: decoded } = await importImageDataUrl(handoff.src)
    const aspect = decoded > 0 ? decoded : undefined
    const live = useStore.getState()
    const grid = getDerived(live.project).grid
    const { width: artW, height: artH } = live.project.artboard
    const target = targetId ? live.project.images.find((im) => im.id === targetId) : undefined

    if (target) {
      // a block positioned freely keeps its free rect, refit to the new
      // aspect and clamped on-page; an anchored one keeps its anchor and
      // lets `aspect` inscribe it in the cell
      const rect = imageRect(grid, target.anchor, target.free, target.aspect)
      const free =
        target.free && aspect
          ? clampToArtboard(refitToAspect(rect, aspect), artW, artH)
          : target.free
      live.apply({
        images: live.project.images.map((im) =>
          im.id === target.id ? { ...im, src, free, aspect } : im,
        ),
      })
      select(target.id)
      return
    }

    // lab-first composition: a centred free block at its own aspect
    const nCols = grid.columnBoundaries.length - 1
    const nRows = grid.rowBoundaries.length - 1
    const colSpan = Math.max(1, Math.min(2, nCols))
    const rowSpan = Math.max(1, Math.min(3, nRows))
    const a = aspect ?? artW / artH
    const k = Math.min((artW * 0.62) / a, artH * 0.62)
    const w = k * a
    const h = k
    const id = `img-${Date.now().toString(36)}`
    live.apply({
      images: [
        ...live.project.images,
        {
          id,
          src,
          // anchor is the identity the block falls back to if it is
          // later snapped to the grid; the free rect is what renders
          anchor: {
            col: Math.max(0, Math.floor((nCols - colSpan) / 2)),
            row: Math.max(0, Math.floor((nRows - rowSpan) / 2)),
            colSpan,
            rowSpan,
          },
          free: { x: (artW - w) / 2, y: (artH - h) / 2, w, h },
          aspect,
        },
      ],
    })
    select(id)
  })()
}
