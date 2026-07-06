'use client'

import type { ComponentType } from 'react'
import { useStore, type PanelId } from '@/core/state/store'
import { SystemPanel } from './panels/SystemPanel'
import { TypePanel } from './panels/TypePanel'
import { GlyphFieldPanel } from './panels/GlyphFieldPanel'
import { MaterialPanel } from './panels/MaterialPanel'
import { MotionPanel } from './panels/MotionPanel'
import { ExportPanel } from './panels/ExportPanel'

const PANELS: { id: PanelId; label: string }[] = [
  { id: 'system', label: 'SYSTEM' },
  { id: 'type', label: 'TYPE' },
  { id: 'glyphField', label: 'GLYPH FIELD' },
  { id: 'material', label: 'MATERIAL' },
  { id: 'motion', label: 'MOTION' },
  { id: 'export', label: 'EXPORT' },
]

const PANEL_BODIES: Partial<Record<PanelId, ComponentType>> = {
  system: SystemPanel,
  type: TypePanel,
  glyphField: GlyphFieldPanel,
  material: MaterialPanel,
  motion: MotionPanel,
  export: ExportPanel,
}

export function Inspector() {
  const activePanel = useStore((s) => s.ui.activePanel)
  const setUi = useStore((s) => s.setUi)
  const Body = PANEL_BODIES[activePanel]

  // Tabs drive the stage too: MOTION opens the lab, anything else returns
  // to the poster; leaving SYSTEM exits setup view.
  const selectTab = (id: PanelId) => {
    const mode = useStore.getState().ui.mode
    if (id === 'motion') {
      setUi({ activePanel: id, mode: 'motion' })
    } else if (mode === 'motion' || (mode === 'setup' && id !== 'system')) {
      setUi({ activePanel: id, mode: 'compose' })
    } else {
      setUi({ activePanel: id })
    }
  }

  return (
    <div className="inspector">
      <nav className="inspector-tabs">
        {PANELS.map((p) => (
          <button
            key={p.id}
            className={activePanel === p.id ? 'inspector-tab active' : 'inspector-tab'}
            onClick={() => selectTab(p.id)}
          >
            {p.label}
          </button>
        ))}
      </nav>
      <div className="inspector-body">{Body ? <Body /> : <div className="inspector-empty" />}</div>
    </div>
  )
}
