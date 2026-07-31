'use client'

import { useStore } from '@/core/state/store'
import type { ShapeLayer } from '@/core/state/types'
import { BackgroundLayer } from './BackgroundLayer'
import { ClonesLayer } from './ClonesLayer'
import { PatternLayer } from './PatternLayer'
import { SheetLayer } from './SheetLayer'
import { ArrayLayer } from './ArrayLayer'
import { RepeaterLayer } from './RepeaterLayer'
import { LissajousOverlay } from './LissajousOverlay'
import { TypeLayer } from './TypeLayer'
import { ImagesLayer } from './ImagesLayer'

function ShapeLayerView({ layer }: { layer: ShapeLayer }) {
  switch (layer.type) {
    case 'clones':
      return <ClonesLayer layer={layer} />
    case 'pattern':
      return <PatternLayer layer={layer} />
    case 'sheet':
      return <SheetLayer layer={layer} />
    case 'array':
      return <ArrayLayer layer={layer} />
    case 'repeater':
      return <RepeaterLayer layer={layer} />
  }
}

// Stack: background field, then the shape layer stack in project order
// (index 0 = bottom), then images, DOM type, curve overlay.
export function Artboard() {
  const background = useStore((s) => s.project.artboard.background)
  const layers = useStore((s) => s.project.layers)
  const mode = useStore((s) => s.ui.mode)
  const showGuides = useStore((s) => s.ui.showGuides)
  const dragging = useStore((s) => s.ui.dragging)
  const systemAdjusting = useStore((s) => s.ui.systemAdjusting)

  return (
    <div className="artboard" style={{ background }}>
      <BackgroundLayer />
      {layers.map((l) => (l.visible ? <ShapeLayerView key={l.id} layer={l} /> : null))}
      <ImagesLayer />
      <TypeLayer />
      {mode === 'setup' || showGuides || dragging || systemAdjusting ? <LissajousOverlay /> : null}
    </div>
  )
}
