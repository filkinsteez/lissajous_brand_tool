'use client'

import { useStore } from '@/core/state/store'

// Layer stack per PRD §13. Layers land here phase by phase:
// L1 material canvas, L3 glyph field canvas, L4 DOM type, L5 curve overlay.
export function Artboard() {
  const background = useStore((s) => s.project.artboard.background)

  return (
    <div className="artboard" style={{ background }}>
      {/* L1 MaterialLayer (Phase 4) */}
      {/* L3 GlyphFieldLayer (Phase 3) */}
      {/* L4 TypeLayer (Phase 2) */}
      {/* L5 LissajousOverlay (Phase 1, setup mode only) */}
    </div>
  )
}
