'use client'

import { useStore } from '@/core/state/store'
import { getDerived } from '@/core/pipeline'
import { columnSpanRect } from '@/core/grid/types'

// L2: imported images. One can be the full-bleed background; the rest
// sit as grid-snapped blocks. Everything renders grayscale — the poster
// is an ink-and-paper system, and photographs join it in mono.
export function ImagesLayer() {
  const project = useStore((s) => s.project)
  if (!project.images.length) return null
  return <ImagesLayerInner />
}

function ImagesLayerInner() {
  const project = useStore((s) => s.project)
  const grid = getDerived(project).grid
  const bg = project.images.find((im) => im.id === project.bgImageId) ?? null
  const blocks = project.images.filter((im) => im.id !== project.bgImageId)
  const rows = grid.rowBoundaries
  const nRows = rows.length - 1

  return (
    <div className="artboard-layer images-layer">
      {bg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bg.src} alt="" className="bg-image" />
      ) : null}
      {blocks.map((im) => {
        const { x, w } = columnSpanRect(grid, im.anchor.col, im.anchor.colSpan)
        const r0 = Math.max(0, Math.min(nRows - 1, im.anchor.row))
        const r1 = Math.max(r0 + 1, Math.min(nRows, r0 + im.anchor.rowSpan))
        const y = rows[r0].pos
        const h = rows[r1].pos - y
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={im.id}
            src={im.src}
            alt=""
            className="image-block"
            style={{ left: x, top: y, width: w, height: h }}
          />
        )
      })}
    </div>
  )
}
