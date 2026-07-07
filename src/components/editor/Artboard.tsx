'use client'

import { useStore } from '@/core/state/store'
import { LissajousOverlay } from './LissajousOverlay'
import { TypeLayer } from './TypeLayer'
import { ImagesLayer } from './ImagesLayer'

// Layer stack: L2 images, L4 DOM type, L5 curve overlay — paper, grid,
// photographs in mono, type. (The grain material and glyph field were cut.)
export function Artboard() {
  const background = useStore((s) => s.project.artboard.background)
  const mode = useStore((s) => s.ui.mode)
  const showGuides = useStore((s) => s.ui.showGuides)
  const dragging = useStore((s) => s.ui.dragging)
  const systemAdjusting = useStore((s) => s.ui.systemAdjusting)

  return (
    <div className="artboard" style={{ background }}>
      <ImagesLayer />
      <TypeLayer />
      {mode === 'setup' || showGuides || dragging || systemAdjusting ? <LissajousOverlay /> : null}
    </div>
  )
}
