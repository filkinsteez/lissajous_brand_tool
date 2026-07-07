'use client'

import { useStore } from '@/core/state/store'
import { LissajousOverlay } from './LissajousOverlay'
import { TypeLayer } from './TypeLayer'
import { GlyphFieldLayer } from './GlyphFieldLayer'

// Layer stack: L3 glyph field canvas, L4 DOM type, L5 curve overlay.
// (The L1 grain material was cut — the poster is clean paper now.)
export function Artboard() {
  const background = useStore((s) => s.project.artboard.background)
  const mode = useStore((s) => s.ui.mode)
  const showGuides = useStore((s) => s.ui.showGuides)
  const dragging = useStore((s) => s.ui.dragging)
  const systemAdjusting = useStore((s) => s.ui.systemAdjusting)

  return (
    <div className="artboard" style={{ background }}>
      <GlyphFieldLayer />
      <TypeLayer />
      {mode === 'setup' || showGuides || dragging || systemAdjusting ? <LissajousOverlay /> : null}
    </div>
  )
}
