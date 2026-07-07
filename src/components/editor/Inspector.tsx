'use client'

import { useStore } from '@/core/state/store'
import { SystemPanel } from './panels/SystemPanel'
import { TypePanel } from './panels/TypePanel'
import { MotionPanel } from './panels/MotionPanel'
import { ExportPanel } from './panels/ExportPanel'

// The mode switcher in the top bar decides what the inspector shows —
// LAYOUT gets the poster controls (system, type, export), MOTION the lab.
export function Inspector() {
  const mode = useStore((s) => s.ui.mode)

  return (
    <div className="inspector">
      <div className="inspector-body">
        {mode === 'motion' ? (
          <>
            <MotionPanel />
            <div className="panel-divider">EXPORT</div>
            <ExportPanel variant="motion" />
          </>
        ) : (
          <>
            <div className="panel-divider">SYSTEM</div>
            <SystemPanel />
            <div className="panel-divider">TYPE</div>
            <TypePanel />
            <div className="panel-divider">EXPORT</div>
            <ExportPanel />
          </>
        )}
      </div>
    </div>
  )
}
