import { takeDesignHandoff } from '@/core/lab/handoff'
import { getDerived } from '@/core/pipeline'
import { imageRect } from '@/core/grid/types'
import { useStore } from '@/core/state/store'

// Reshape a rect to `aspect` keeping its centre and its area — the
// block occupies the same visual weight in the same place, but now
// matches the image inside it, so cover-fit crops nothing.
export function refitToAspect(
  rect: { x: number; y: number; w: number; h: number },
  aspect: number,
): { x: number; y: number; w: number; h: number } {
  const area = Math.max(1, rect.w * rect.h)
  const a = Math.max(0.01, aspect)
  const h = Math.sqrt(area / a)
  const w = h * a
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h }
}

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
    // Replace in place. The lab composed at this block's aspect, so the
    // rect normally stays untouched. If it does NOT match (the output
    // dims were changed by hand in the lab), keep the block's centre and
    // area but take the image's aspect — a mismatched rect would
    // cover-crop the composition's edges away, which reads as "my edit
    // did not come through".
    const rect = imageRect(getDerived(st.project).grid, target.anchor, target.free)
    const probe = new Image()
    probe.onload = () => {
      const live = useStore.getState()
      const block = live.project.images.find((im) => im.id === target.id)
      if (!block) return
      const imgAspect = Math.max(1, probe.naturalWidth) / Math.max(1, probe.naturalHeight)
      const rectAspect = rect.w / Math.max(1, rect.h)
      const matches = Math.abs(imgAspect - rectAspect) / rectAspect < 0.01
      const free = matches ? block.free : refitToAspect(rect, imgAspect)
      live.apply({
        images: live.project.images.map((im) =>
          im.id === target.id ? { ...im, src: handoff.src, free } : im,
        ),
      })
      live.setUi({
        selectedImageIds: [target.id],
        selectedBlockId: undefined,
        selectedBlockIds: [],
        selectedShapeIds: [],
      })
    }
    probe.src = handoff.src
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
