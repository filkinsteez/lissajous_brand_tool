'use client'

import type { ComponentType } from 'react'
import { useStore, type PanelId } from '@/core/state/store'
import { LissajousPanel } from './panels/LissajousPanel'
import { GridPanel } from './panels/GridPanel'
import { TypePanel } from './panels/TypePanel'
import { GlyphFieldPanel } from './panels/GlyphFieldPanel'
import { MaterialPanel } from './panels/MaterialPanel'

const PANELS: { id: PanelId; label: string }[] = [
  { id: 'lissajous', label: 'LISSAJOUS' },
  { id: 'grid', label: 'GRID' },
  { id: 'type', label: 'TYPE' },
  { id: 'glyphField', label: 'GLYPH FIELD' },
  { id: 'material', label: 'MATERIAL' },
  { id: 'export', label: 'EXPORT' },
]

// Panel bodies register here as phases land.
const PANEL_BODIES: Partial<Record<PanelId, ComponentType>> = {
  lissajous: LissajousPanel,
  grid: GridPanel,
  type: TypePanel,
  glyphField: GlyphFieldPanel,
  material: MaterialPanel,
}

export function Inspector() {
  const activePanel = useStore((s) => s.ui.activePanel)
  const setUi = useStore((s) => s.setUi)
  const Body = PANEL_BODIES[activePanel]

  return (
    <div className="inspector">
      <nav className="inspector-tabs">
        {PANELS.map((p) => (
          <button
            key={p.id}
            className={activePanel === p.id ? 'inspector-tab active' : 'inspector-tab'}
            onClick={() => setUi({ activePanel: p.id })}
          >
            {p.label}
          </button>
        ))}
      </nav>
      <div className="inspector-body">{Body ? <Body /> : <div className="inspector-empty" />}</div>
    </div>
  )
}
