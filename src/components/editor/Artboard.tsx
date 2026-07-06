'use client'

import { useStore } from '@/core/state/store'
import { LissajousOverlay } from './LissajousOverlay'

// Layer stack per PRD §13. Layers land here phase by phase:
// L1 material canvas, L3 glyph field canvas, L4 DOM type, L5 curve overlay.
export function Artboard() {
  const background = useStore((s) => s.project.artboard.background)
  const mode = useStore((s) => s.ui.mode)
  const showGuides = useStore((s) => s.ui.showGuides)

  return (
    <div className="artboard" style={{ background }}>
      {/* L1 MaterialLayer (Phase 4) */}
      {/* L3 GlyphFieldLayer (Phase 3) */}
      {/* L4 TypeLayer (Phase 2) */}
      {mode === 'setup' || showGuides ? <LissajousOverlay /> : null}
    </div>
  )
}
