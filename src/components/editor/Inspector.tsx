'use client'

import { useStore, type PanelId } from '@/core/state/store'
import { SystemPanel } from './panels/SystemPanel'
import { TypePanel } from './panels/TypePanel'
import { MotionPanel } from './panels/MotionPanel'
import { ExportPanel } from './panels/ExportPanel'

const PANELS: { id: PanelId; label: string }[] = [
  { id: 'compose', label: 'LAYOUT' },
  { id: 'motion', label: 'MOTION' },
]

// LAYOUT holds the whole poster: the system (curve + grid), the type it
// carries, and its export. MOTION holds the lab and its export.
function ComposeBody() {
  return (
    <>
      <div className="panel-divider">SYSTEM</div>
      <SystemPanel />
      <div className="panel-divider">TYPE</div>
      <TypePanel />
      <div className="panel-divider">EXPORT</div>
      <ExportPanel />
    </>
  )
}

function MotionBody() {
  return (
    <>
      <MotionPanel />
      <div className="panel-divider">EXPORT</div>
      <ExportPanel variant="motion" />
    </>
  )
}

export function Inspector() {
  const activePanel = useStore((s) => s.ui.activePanel)
  const setUi = useStore((s) => s.setUi)

  // Tabs drive the stage too: MOTION opens the lab, LAYOUT the poster.
  const selectTab = (id: PanelId) => {
    if (id === 'motion') setUi({ activePanel: id, mode: 'motion' })
    else setUi({ activePanel: id, mode: 'compose' })
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
      <div className="inspector-body">
        {activePanel === 'motion' ? <MotionBody /> : <ComposeBody />}
      </div>
    </div>
  )
}
