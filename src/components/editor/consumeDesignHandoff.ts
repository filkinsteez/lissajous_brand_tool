import { takeDesignHandoff } from '@/core/lab/handoff'
import { getDerived } from '@/core/pipeline'
import { importImageDataUrl } from '@/core/images'
import { useStore } from '@/core/state/store'

// "Send to Design" landing, called once on editor mount.
//
// Two cases: the handoff carries the id of the design block the lab was
// editing (entered via EDIT IN LAB) — then the send REPLACES that
// block's pixels, and NOTHING else: same anchor, same free rect, same
// cover-crop rules as every other image on the canvas. The result looks
// right on arrival because the lab composed at the block's shape, and
// from then on it is an ordinary image — a special never-crop mode for
// lab images made them behave differently from every other block, which
// read as a bug. Without an id (a lab-first composition), the render
// lands as a centred FREE block sized to its own aspect.
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
    // raw multi-megabyte lab PNG here breaks persistence outright.
    // importImageDataUrl falls back to the original src on any failure —
    // the handoff channel is read-and-clear, so a silent drop here would
    // lose the render with no way to retry.
    const { src, aspect } = await importImageDataUrl(handoff.src)
    const live = useStore.getState()

    const target = targetId ? live.project.images.find((im) => im.id === targetId) : undefined
    if (target) {
      live.apply({
        images: live.project.images.map((im) =>
          im.id === target.id ? { ...im, src } : im,
        ),
      })
      select(target.id)
      return
    }

    // lab-first composition: a centred free block at its own aspect
    const grid = getDerived(live.project).grid
    const { width: artW, height: artH } = live.project.artboard
    const nCols = grid.columnBoundaries.length - 1
    const nRows = grid.rowBoundaries.length - 1
    const colSpan = Math.max(1, Math.min(2, nCols))
    const rowSpan = Math.max(1, Math.min(3, nRows))
    const a = aspect > 0 ? aspect : artW / artH
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
        },
      ],
    })
    select(id)
  })()
}
