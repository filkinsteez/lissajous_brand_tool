import { takeDesignHandoff } from '@/core/lab/handoff'
import { getDerived } from '@/core/pipeline'
import { useStore } from '@/core/state/store'

// "Send to Design" landing, called once on editor mount.
//
// Two cases: the handoff carries the id of the design block the lab was
// editing (entered via EDIT IN LAB) — then the send REPLACES that
// block's pixels in place, same size and position, which is what a
// round trip means. Without an id (a lab-first composition), the render
// lands as a centered FREE block sized to its own aspect ratio, because
// blocks cover-fit their rect and any aspect mismatch would crop away
// the composition's edges. Either way: one undoable entry, selected.
export function consumeDesignHandoff(): void {
  const handoff = takeDesignHandoff()
  if (!handoff) return
  const st = useStore.getState()
  const target = handoff.imageId
    ? st.project.images.find((im) => im.id === handoff.imageId)
    : undefined

  if (target) {
    st.apply({
      images: st.project.images.map((im) =>
        im.id === target.id ? { ...im, src: handoff.src } : im,
      ),
    })
    st.setUi({
      selectedImageIds: [target.id],
      selectedBlockId: undefined,
      selectedBlockIds: [],
      selectedShapeIds: [],
    })
    return
  }

  const img = new Image()
  img.onload = () => {
    const live = useStore.getState()
    const { width: artW, height: artH } = live.project.artboard
    const iw = Math.max(1, img.naturalWidth)
    const ih = Math.max(1, img.naturalHeight)
    const k = Math.min((artW * 0.62) / iw, (artH * 0.62) / ih)
    const w = iw * k
    const h = ih * k
    const grid = getDerived(live.project).grid
    const nCols = grid.columnBoundaries.length - 1
    const nRows = grid.rowBoundaries.length - 1
    const colSpan = Math.max(1, Math.min(2, nCols))
    const rowSpan = Math.max(1, Math.min(3, nRows))
    const id = `img-${Date.now().toString(36)}`
    live.apply({
      images: [
        ...live.project.images,
        {
          id,
          src: handoff.src,
          // anchor is the fallback identity if the user later snaps it
          // to the grid; the free rect is what renders
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
    live.setUi({
      selectedImageIds: [id],
      selectedBlockId: undefined,
      selectedBlockIds: [],
      selectedShapeIds: [],
    })
  }
  img.src = handoff.src
}
