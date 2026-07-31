'use client'

import { useStore } from '@/core/state/store'
import { BackgroundLayer } from './BackgroundLayer'
import { ClonesLayer } from './ClonesLayer'
import { PatternLayer } from './PatternLayer'
import { SheetLayer } from './SheetLayer'
import { ArrayLayer } from './ArrayLayer'
import { RepeaterLayer } from './RepeaterLayer'
import { LissajousOverlay } from './LissajousOverlay'
import { TypeLayer } from './TypeLayer'
import { ImagesLayer } from './ImagesLayer'

// Layer stack: L1 background field, L1.5 curve clones, L2 images,
// L4 DOM type, L5 curve overlay.
export function Artboard() {
  const background = useStore((s) => s.project.artboard.background)
  const mode = useStore((s) => s.ui.mode)
  const showGuides = useStore((s) => s.ui.showGuides)
  const dragging = useStore((s) => s.ui.dragging)
  const systemAdjusting = useStore((s) => s.ui.systemAdjusting)

  return (
    <div className="artboard" style={{ background }}>
      <BackgroundLayer />
      <ClonesLayer />
      <PatternLayer />
      <SheetLayer />
      <ArrayLayer />
      <RepeaterLayer />
      <ImagesLayer />
      <TypeLayer />
      {mode === 'setup' || showGuides || dragging || systemAdjusting ? <LissajousOverlay /> : null}
    </div>
  )
}
