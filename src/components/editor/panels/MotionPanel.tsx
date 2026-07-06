'use client'

import { useStore } from '@/core/state/store'

// Placeholder until the Motion Lab lands (Phase C fills this in).
export function MotionPanel() {
  const setUi = useStore((s) => s.setUi)
  return (
    <div className="panel">
      <div className="panel-section">
        <button className="ctl-action primary" onClick={() => setUi({ mode: 'motion' })}>
          OPEN MOTION LAB
        </button>
      </div>
    </div>
  )
}
