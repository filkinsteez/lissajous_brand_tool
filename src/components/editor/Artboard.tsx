'use client'

import { useStore } from '@/core/state/store'
import type { ShapeLayer } from '@/core/state/types'
import { BackgroundLayer } from './BackgroundLayer'
import { ClonesLayer } from './ClonesLayer'
import { PatternLayer } from './PatternLayer'
import { SheetLayer } from './SheetLayer'
import { ArrayLayer } from './ArrayLayer'
import { OrganicLayer } from './OrganicLayer'
import { RepeaterLayer } from './RepeaterLayer'
import { LissajousOverlay } from './LissajousOverlay'
import { TypeLayer } from './TypeLayer'
import { ImagesLayer } from './ImagesLayer'
import { ShapeItemsLayer } from './ShapeItemsLayer'
import { SheetBoundsLayer } from './SheetBoundsLayer'
import { TilesLayer } from './TilesLayer'

function ShapeLayerView({ layer }: { layer: ShapeLayer }) {
  switch (layer.type) {
    case 'clones':
      return <ClonesLayer layer={layer} />
    case 'pattern':
      return <PatternLayer layer={layer} />
    case 'cloner':
      // GRID runs the sheet engine; the other modes are the repeat engine
      return layer.params.mode === 'grid' ? (
        <SheetLayer layer={layer} />
      ) : (
        <RepeaterLayer layer={layer} />
      )
    case 'array':
      return <ArrayLayer layer={layer} />
    case 'organic':
      return <OrganicLayer layer={layer} />
    case 'tiles':
      return <TilesLayer layer={layer} />
  }
}

// Stack: background field, then the shape layer stack in project order
// (index 0 = bottom), then images, DOM type, curve overlay.
export function Artboard() {
  const background = useStore((s) => s.project.artboard.background)
  const layers = useStore((s) => s.project.layers)
  const mode = useStore((s) => s.ui.mode)
  const tool = useStore((s) => s.ui.tool)
  const isolateLayerId = useStore((s) => s.ui.isolateLayerId)
  const isolating = layers.some(
    (l) => l.id === isolateLayerId && l.params.sourceShapeIds.length > 0,
  )
  const showGuides = useStore((s) => s.ui.showGuides)
  const dragging = useStore((s) => s.ui.dragging)
  const systemAdjusting = useStore((s) => s.ui.systemAdjusting)

  return (
    <div
      className="artboard"
      style={{ background }}
      data-tool={tool}
      data-isolating={isolating || undefined}
    >
      <BackgroundLayer />
      {layers.map((l) => (l.visible ? <ShapeLayerView key={l.id} layer={l} /> : null))}
      <ImagesLayer />
      <ShapeItemsLayer />
      <TypeLayer />
      {mode === 'compose' ? <SheetBoundsLayer /> : null}
      {mode === 'setup' || showGuides || dragging || systemAdjusting ? <LissajousOverlay /> : null}
    </div>
  )
}
